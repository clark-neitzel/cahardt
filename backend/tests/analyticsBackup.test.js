// GET /api/analytics/v1/backup — dump em stream, sem banco real e sem pg_dump de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js',
    'services/analyticsBackupService.js',
    'services/backupLock.js',
    'middlewares/analyticsAuth.js',
    'middlewares/analyticsBackupAuth.js',
];

const CHAVE = 'chave-teste-analytics-agentes';
const BACKUP = 'chave-teste-backup-luke';
const SENHA = 'senha-super-secreta';
const URL_BANCO = `postgres://hardt:${SENHA}@db.interno:5432/hardtapp?sslmode=disable&connection_limit=5`;
const HEADERS = {
    'x-analytics-key': CHAVE,
    'x-backup-key': BACKUP,
    'x-analytics-agent': 'luke',
};

const ENV_ANTES = {
    ANALYTICS_API_KEY: process.env.ANALYTICS_API_KEY,
    BACKUP_API_KEY: process.env.BACKUP_API_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
};

let cauda = Promise.resolve();
function serie(nome, fn) {
    test(nome, () => {
        const executar = cauda.then(() => fn());
        cauda = executar.then(() => {}, () => {});
        return executar;
    });
}

function restaurarEnv() {
    for (const [k, v] of Object.entries(ENV_ANTES)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    }
}

function aplicarEnvPadrao() {
    process.env.ANALYTICS_API_KEY = CHAVE;
    process.env.BACKUP_API_KEY = BACKUP;
    process.env.DATABASE_URL = URL_BANCO;
}

function execFileVersao(stdout, falha = false) {
    return (cmd, args, opts, cb) => {
        const callback = typeof opts === 'function' ? opts : cb;
        assert.equal(cmd, 'pg_dump');
        assert.deepEqual(args, ['--version']);
        process.nextTick(() => {
            if (falha) callback(Object.assign(new Error('nao achei'), { code: 'ENOENT' }));
            else callback(null, stdout, '');
        });
    };
}

function processo({ escrever = null, codigo = 0, stderr = '', manual = false } = {}) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.pausado = false;
    const pausaReal = child.stdout.pause.bind(child.stdout);
    child.stdout.pause = () => {
        child.pausado = true;
        return pausaReal();
    };
    child.kill = (sig) => {
        if (child.killed) return;
        child.killed = true;
        child.signal = sig;
        process.nextTick(() => child.emit('close', null, sig || 'SIGTERM'));
    };
    if (!manual) {
        process.nextTick(() => {
            if (child.killed) return;
            if (stderr) child.stderr.write(stderr);
            if (escrever != null) child.stdout.write(escrever);
            child.stdout.end();
            child.emit('close', codigo, null);
        });
    }
    return child;
}

function capturarConsole() {
    const linhas = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    const guarda = (...args) => linhas.push(args.map((x) => String(x)).join(' '));
    console.log = guarda;
    console.error = guarda;
    console.warn = guarda;
    return {
        linhas,
        texto: () => linhas.join('\n'),
        restaurar() {
            console.log = orig.log;
            console.error = orig.error;
            console.warn = orig.warn;
        },
    };
}

function semSegredo(texto) {
    assert.equal(String(texto).includes(SENHA), false);
    assert.equal(String(texto).includes(URL_BANCO), false);
    assert.equal(String(texto).includes('PGPASSWORD='), false);
}

async function subir({
    escrever = 'PGDMP-teste',
    codigo = 0,
    stderr = '',
    versaoDump = 'pg_dump (PostgreSQL) 17.6\n',
    dumpIndisponivel = false,
    versaoServidor = '170005',
    spawn = null,
    timeoutMs = 20000,
    agora = () => new Date('2026-11-13T15:30:00.000Z'),
    queryRaw = null,
} = {}) {
    aplicarEnvPadrao();
    const audits = [];
    let spawns = 0;
    const vistos = [];
    const mock = makeMockPrisma({
        $queryRaw: queryRaw || (async () => [{ v: versaoServidor }]),
        auditLog: {
            create: async ({ data }) => {
                audits.push(data);
                return data;
            },
        },
    });
    const app = buildApp('/api/analytics', ROUTER, mock, CACHE);
    const backup = require('../services/analyticsBackupService');
    const lock = require('../services/backupLock');
    backup.resetarParaTeste();
    backup.configurarParaTeste({
        execFile: execFileVersao(versaoDump, dumpIndisponivel),
        timeoutMs,
        agora,
        spawn: spawn || ((cmd, args, opts) => {
            spawns += 1;
            vistos.push({ cmd, args, opts });
            const child = processo({ manual: true });
            const destino = args[args.indexOf('--file') + 1];
            process.nextTick(() => {
                if (child.killed) return;
                if (stderr && child.stderr) child.stderr.write(stderr);
                if (codigo === 0 && escrever != null && destino) fs.writeFileSync(destino, escrever);
                child.emit('close', codigo, null);
            });
            return child;
        }),
    });
    const servidor = await startTestServer(app);
    return {
        ...servidor,
        backup,
        lock,
        audits,
        vistos,
        get spawns() { return spawns; },
    };
}

async function esperarAuditoria(ctx, n) {
    // O arquivo termina de ir para o cliente antes do callback do stream
    // gravar a auditoria. setImmediate no mesmo turno não espera esse callback.
    const inicio = Date.now();
    while (ctx.audits.length < n && Date.now() - inicio < 1000) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

function conferirSpawn(visto) {
    assert.equal(visto.cmd, 'pg_dump');
    assert.deepEqual(visto.args.slice(0, 4), ['--format=custom', '--no-owner', '--no-privileges', '--no-password']);
    assert.equal(visto.args[4], '--file');
    assert.equal(String(visto.args[5]).includes(SENHA), false);
    assert.equal(visto.opts.stdio[1], 'ignore');
    assert.equal(visto.opts.shell, false);
    assert.equal(Object.prototype.hasOwnProperty.call(visto.opts.env, 'DATABASE_URL'), false);
    assert.equal(JSON.stringify(visto.args).includes(SENHA), false);
    assert.equal(visto.opts.env.PGPASSWORD, SENHA);
    assert.equal(visto.opts.env.PGHOST, 'db.interno');
    assert.equal(visto.opts.env.PGPORT, '5432');
    assert.equal(visto.opts.env.PGUSER, 'hardt');
    assert.equal(visto.opts.env.PGDATABASE, 'hardtapp');
    assert.equal(visto.opts.env.PGSSLMODE, 'disable');
    assert.equal(visto.opts.env.connection_limit, undefined);
}

serie('nome do arquivo usa o dia e a hora de São Paulo', () => {
    const { nomeArquivo } = require('../services/analyticsBackupService');
    assert.equal(nomeArquivo(new Date('2026-11-13T15:30:00.000Z')), 'hardt-banco-2026-11-13-1230.dump');
    assert.equal(nomeArquivo(new Date('2026-11-14T02:59:00.000Z')), 'hardt-banco-2026-11-13-2359.dump');
    assert.equal(nomeArquivo(new Date('2026-11-14T03:00:00.000Z')), 'hardt-banco-2026-11-14-0000.dump');
});

serie('a conexão vai para o pg_dump sem a senha na linha de comando', () => {
    const { parseConexao, scrub } = require('../services/analyticsBackupService');
    const c = parseConexao('postgres://us%40er:p%40ss@db.internal:5433/hardtapp?sslmode=disable&connection_limit=5');
    assert.equal(c.env.PGUSER, 'us@er');
    assert.equal(c.env.PGPASSWORD, 'p@ss');
    assert.equal(c.env.PGHOST, 'db.internal');
    assert.equal(c.env.PGPORT, '5433');
    assert.equal(c.env.PGDATABASE, 'hardtapp');
    assert.equal(c.env.PGSSLMODE, 'disable');
    assert.equal('connection_limit' in c.env, false);

    const sujo = `falhou postgres://us%40er:p%40ss@db.internal:5433/hardtapp senha p@ss`;
    const limpo = scrub(sujo, c.segredos);
    assert.equal(limpo.includes('p@ss'), false);
    assert.equal(limpo.includes('postgres://'), false);

    assert.throws(() => parseConexao('isso-nao-e-url'), (e) => {
        assert.equal(e.codigo, 'BANCO_NAO_CONFIGURADO');
        assert.equal(String(e.message).includes('isso-nao-e-url'), false);
        return true;
    });
    assert.throws(() => parseConexao('mysql://u:segredo@h/db'), (e) => e.codigo === 'BANCO_NAO_CONFIGURADO');
    assert.throws(() => parseConexao(''), (e) => e.codigo === 'BANCO_NAO_CONFIGURADO');
});

serie('a imagem instala o client 17 e o backup automático divide a trava', () => {
    const docker = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
    assert.match(docker, /postgresql17-client/);
    assert.equal(/postgresql16-client|postgresql15-client/.test(docker), false);

    const automatico = fs.readFileSync(path.join(__dirname, '../services/backupService.js'), 'utf8');
    assert.match(automatico, /backupLock/);
    assert.equal(automatico.includes('_rodandoBanco'), false);

    const src = fs.readFileSync(path.join(__dirname, '../services/analyticsBackupService.js'), 'utf8');
    assert.match(src, /PGPASSWORD/);
    assert.match(src, /createReadStream/);
    assert.equal(src.includes('readFileSync'), false);
    assert.equal(/shell:\s*true/.test(src), false);
    assert.equal(src.includes('queryRawUnsafe'), false);
});

serie('a trava é uma só para o dump do Luke e o backup automático', () => {
    const lock = require('../services/backupLock');
    lock.liberar('luke');
    lock.liberar('automatico');
    assert.equal(lock.tentar('automatico'), true);
    assert.equal(lock.tentar('luke'), false);
    assert.equal(lock.holderAtual(), 'automatico');
    lock.liberar('automatico');
    assert.equal(lock.tentar('luke'), true);
    lock.liberar('luke');
    assert.equal(lock.holderAtual(), null);
});

serie('GET /v1/backup devolve o dump em stream, com data no nome, e registra quem e o tamanho', async () => {
    const ctx = await subir();
    const log = capturarConsole();
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        await esperarAuditoria(ctx, 1);
        assert.equal(r.status, 200);
        assert.equal(r.texto, 'PGDMP-teste');
        assert.equal(r.headers.get('content-type'), 'application/octet-stream');
        assert.equal(r.headers.get('content-length'), String(Buffer.byteLength('PGDMP-teste')));
        assert.equal(r.headers.get('x-backup-formato'), 'pg_dump-custom');
        assert.match(r.headers.get('content-disposition'), /filename="hardt-banco-2026-11-13-1230\.dump"/);
        assert.equal(r.headers.get('cache-control'), 'no-store');
        assert.equal(ctx.spawns, 1);
        conferirSpawn(ctx.vistos[0]);
        assert.equal(ctx.audits.length, 1);
        assert.equal(ctx.audits[0].acao, 'BACKUP_BANCO');
        assert.equal(ctx.audits[0].usuarioNome, 'luke');
        assert.equal(ctx.audits[0].entidadeId, 'hardt-banco-2026-11-13-1230.dump');
        const detalhes = JSON.parse(ctx.audits[0].detalhes);
        assert.equal(detalhes.ok, true);
        assert.equal(detalhes.bytes, Buffer.byteLength('PGDMP-teste'));
        assert.equal(detalhes.formato, 'custom');
        semSegredo(log.texto());
        semSegredo(JSON.stringify(ctx.audits));
        semSegredo(r.texto);
        assert.match(log.texto(), /agente=luke/);
        assert.match(log.texto(), /bytes=11/);
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('Luke com maiúsculas passa; outro agente não, e o log da recusa não leva chave', async () => {
    const ctx = await subir();
    const log = capturarConsole();
    try {
        const ok = await ctx.request('GET', '/api/analytics/v1/backup', {
            headers: { ...HEADERS, 'x-analytics-agent': 'Luke' },
        });
        assert.equal(ok.status, 200);
        const ruim = await ctx.request('GET', '/api/analytics/v1/backup', {
            headers: { ...HEADERS, 'x-analytics-agent': 'carteira-manha' },
        });
        assert.equal(ruim.status, 403);
        assert.equal(ruim.body.codigo, 'AGENTE_NAO_AUTORIZADO');
        semSegredo(JSON.stringify(ruim.body));
        semSegredo(log.texto());
        assert.match(log.texto(), /AGENTE_NAO_AUTORIZADO/);
        assert.equal(log.texto().includes(BACKUP), false);
        assert.equal(log.texto().includes(CHAVE), false);
        const sem = await ctx.request('GET', '/api/analytics/v1/backup', {
            headers: { 'x-analytics-key': CHAVE, 'x-backup-key': BACKUP },
        });
        assert.equal(sem.status, 403);
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('sem a chave de backup, com a chave errada, ou com a chave na URL, não chama o pg_dump', async () => {
    const ctx = await subir();
    const log = capturarConsole();
    try {
        delete process.env.BACKUP_API_KEY;
        const off = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(off.status, 503);
        assert.equal(off.body.codigo, 'BACKUP_NAO_CONFIGURADO');
        assert.equal(ctx.spawns, 0);

        process.env.BACKUP_API_KEY = BACKUP;
        const errada = await ctx.request('GET', '/api/analytics/v1/backup', {
            headers: { ...HEADERS, 'x-backup-key': 'chave-backup-que-nao-pode-vazar' },
        });
        assert.equal(errada.status, 401);
        assert.equal(errada.body.codigo, 'BACKUP_CHAVE_INVALIDA');
        assert.equal(JSON.stringify(errada.body).includes('chave-backup-que-nao-pode-vazar'), false);
        assert.equal(JSON.stringify(errada.body).includes(BACKUP), false);

        const naUrl = await ctx.request('GET', `/api/analytics/v1/backup?x-backup-key=${BACKUP}`, { headers: HEADERS });
        assert.equal(naUrl.status, 400);
        assert.equal(naUrl.body.codigo, 'CHAVE_NA_URL');
        assert.equal(JSON.stringify(naUrl.body).includes(BACKUP), false);

        const semAnalytics = await ctx.request('GET', '/api/analytics/v1/backup', {
            headers: { 'x-backup-key': BACKUP, 'x-analytics-agent': 'luke' },
        });
        assert.equal(semAnalytics.status, 401);
        assert.equal(semAnalytics.body.codigo, 'CHAVE_INVALIDA');
        assert.equal(ctx.spawns, 0);
        semSegredo(log.texto());
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('pg_dump mais antigo que o servidor não chega a abrir o dump', async () => {
    const ctx = await subir({ versaoDump: 'pg_dump (PostgreSQL) 16.2\n' });
    const log = capturarConsole();
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 503);
        assert.equal(r.body.codigo, 'VERSAO_INCOMPATIVEL');
        assert.match(r.body.error, /16/);
        assert.match(r.body.error, /17/);
        assert.equal(ctx.spawns, 0);
        semSegredo(JSON.stringify(r.body));
        semSegredo(log.texto());
        semSegredo(JSON.stringify(ctx.audits));
        assert.equal(ctx.audits.length, 1);
        assert.equal(JSON.parse(ctx.audits[0].detalhes).ok, false);
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('sem pg_dump na imagem a resposta é 503 e não vaza o caminho', async () => {
    const ctx = await subir({ dumpIndisponivel: true });
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 503);
        assert.equal(r.body.codigo, 'PG_DUMP_INDISPONIVEL');
        assert.equal(ctx.spawns, 0);
        semSegredo(JSON.stringify(r.body));
    } finally {
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('falha do pg_dump antes de enviar bytes não devolve a senha e libera a trava', async () => {
    let vez = 0;
    const ctx = await subir({
        spawn(cmd, args) {
            vez += 1;
            const destino = args[args.indexOf('--file') + 1];
            const child = processo({ manual: true });
            process.nextTick(() => {
                if (vez === 1) {
                    child.stderr.write(`password authentication failed for ${SENHA} ${URL_BANCO}`);
                    child.emit('close', 1, null);
                    return;
                }
                fs.writeFileSync(destino, 'PGDMP-teste');
                child.emit('close', 0, null);
            });
            return child;
        },
    });
    const log = capturarConsole();
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 500);
        assert.equal(r.body.codigo, 'BACKUP_FALHOU');
        assert.equal(r.body.error.includes(SENHA), false);
        assert.equal(r.body.error.includes('password authentication'), false);
        semSegredo(log.texto());
        semSegredo(JSON.stringify(ctx.audits));
        assert.match(log.texto(), /bytes=0/);
        assert.equal(JSON.parse(ctx.audits[0].detalhes).ok, false);

        const deNovo = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        await esperarAuditoria(ctx, 2);
        assert.equal(deNovo.status, 200);
        assert.equal(deNovo.texto, 'PGDMP-teste');
        assert.equal(JSON.parse(ctx.audits[1].detalhes).ok, true);
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('segunda chamada no meio do dump recebe 409 e não abre outro pg_dump', async () => {
    let soltar;
    const espera = new Promise((resolve) => { soltar = resolve; });
    let spawns = 0;
    let avisarSpawn;
    const nasceu = new Promise((resolve) => { avisarSpawn = resolve; });
    const ctx = await subir({
        spawn(cmd, args) {
            spawns += 1;
            const child = processo({ manual: true });
            const destino = args[args.indexOf('--file') + 1];
            espera.then(() => {
                if (child.killed) return;
                fs.writeFileSync(destino, 'PGDMP');
                child.emit('close', 0, null);
            });
            avisarSpawn();
            return child;
        },
    });
    try {
        const primeiro = ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        await Promise.race([
            nasceu,
            new Promise((_, reject) => setTimeout(() => reject(new Error('pg_dump não chegou a ser chamado')), 2000)),
        ]);
        const segundo = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(segundo.status, 409);
        assert.equal(segundo.body.codigo, 'BACKUP_EM_ANDAMENTO');
        assert.equal(spawns, 1);
        semSegredo(JSON.stringify(segundo.body));
        soltar();
        const r1 = await primeiro;
        await esperarAuditoria(ctx, 1);
        assert.equal(r1.status, 200);
        assert.equal(r1.texto, 'PGDMP');
        assert.equal(JSON.parse(ctx.audits[0].detalhes).ok, true);
    } finally {
        soltar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('o backup automático segurando a trava também responde 409', async () => {
    const ctx = await subir();
    try {
        assert.equal(ctx.lock.tentar('automatico'), true);
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 409);
        assert.equal(r.body.codigo, 'BACKUP_EM_ANDAMENTO');
        assert.equal(ctx.spawns, 0);
    } finally {
        ctx.lock.liberar('automatico');
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('estouro de tempo mata o pg_dump e não devolve arquivo', async () => {
    let matou = false;
    const ctx = await subir({
        timeoutMs: 40,
        spawn() {
            const child = processo({ manual: true });
            const matar = child.kill;
            child.kill = (sig) => {
                matou = true;
                matar(sig);
            };
            return child;
        },
    });
    const log = capturarConsole();
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 504);
        assert.equal(r.body.codigo, 'BACKUP_TIMEOUT');
        assert.equal(matou, true);
        semSegredo(JSON.stringify(r.body));
        semSegredo(log.texto());
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('sem DATABASE_URL não chama o pg_dump', async () => {
    const ctx = await subir();
    try {
        delete process.env.DATABASE_URL;
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 503);
        assert.equal(r.body.codigo, 'BANCO_NAO_CONFIGURADO');
        assert.equal(ctx.spawns, 0);
        semSegredo(JSON.stringify(r.body));
    } finally {
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('um arquivo grande passa inteiro, sem a senha, e o temporário some', async () => {
    const corpo = Buffer.alloc(256 * 1024, 7);
    const ctx = await subir({ escrever: corpo });
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        await esperarAuditoria(ctx, 1);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('content-length'), String(corpo.length));
        assert.equal(Buffer.from(r.texto, 'latin1').equals(corpo), true);
        assert.equal(r.texto.includes(SENHA), false);
        const detalhes = JSON.parse(ctx.audits[0].detalhes);
        assert.equal(detalhes.bytes, corpo.length);
        const sobrou = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('hardt-backup-'));
        assert.equal(sobrou.length, 0);
    } finally {
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('pg_dump que falha não envia o arquivo parcial e não revela a senha', async () => {
    const ctx = await subir({
        spawn(cmd, args) {
            const destino = args[args.indexOf('--file') + 1];
            const child = processo({ manual: true });
            process.nextTick(() => {
                fs.writeFileSync(destino, `PARCIAL ${SENHA}`);
                child.stderr.write(`falhou ${SENHA} ${URL_BANCO}`);
                child.emit('close', 1, null);
            });
            return child;
        },
    });
    const log = capturarConsole();
    try {
        const r = await ctx.request('GET', '/api/analytics/v1/backup', { headers: HEADERS });
        assert.equal(r.status, 500);
        assert.equal(r.body.codigo, 'BACKUP_FALHOU');
        assert.equal(r.texto.includes('PARCIAL'), false);
        semSegredo(r.texto);
        semSegredo(log.texto());
        semSegredo(JSON.stringify(ctx.audits));
        assert.equal(JSON.parse(ctx.audits[0].detalhes).bytes, 0);
        const sobrou = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('hardt-backup-'));
        assert.equal(sobrou.length, 0);
    } finally {
        log.restaurar();
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});

serie('muitas chaves de backup erradas no mesmo IP passam a 429', async () => {
    const ctx = await subir();
    try {
        const { LIMITE_FALHA } = require('../middlewares/analyticsBackupAuth');
        let ultimo;
        for (let i = 0; i < LIMITE_FALHA + 1; i += 1) {
            ultimo = await ctx.request('GET', '/api/analytics/v1/backup', {
                headers: { ...HEADERS, 'x-backup-key': `errada-${i}` },
            });
        }
        assert.equal(ultimo.status, 429);
        assert.equal(ultimo.body.codigo, 'LIMITE');
        assert.equal(JSON.stringify(ultimo.body).includes('errada-'), false);
        assert.equal(ctx.spawns, 0);
    } finally {
        ctx.backup.resetarParaTeste();
        restaurarEnv();
        await ctx.close();
    }
});
