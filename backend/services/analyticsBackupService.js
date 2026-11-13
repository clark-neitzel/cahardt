// Download do banco para o agente Luke (GET /api/analytics/v1/backup).
//
// pg_dump em formato custom (-Fc), só leitura. O formato custom precisa
// voltar no arquivo e reescrever o índice (seek) — não dá para ir num pipe.
// Por isso o dump cai num arquivo temporário e, só depois do pg_dump sair
// com código 0, esse arquivo é enviado em stream. O Node não carrega o
// dump inteiro na memória. O temporário é apagado no fim.
//
// A senha NÃO vai na linha de comando (apareceria no `ps` e em alguns
// erros) — vai em PGPASSWORD, num ambiente mínimo, sem DATABASE_URL herdada.
//
// Um dump por vez, na mesma trava do backup automático (backupLock).

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream');
const { spawn, execFile } = require('child_process');
const prisma = require('../config/database');
const lock = require('./backupLock');

const QUEM = 'luke';
const TIMEOUT_PADRAO_MS = 20 * 60 * 1000;
const JA_REGISTRADO = new Set(['BACKUP_FALHOU', 'PG_DUMP_INDISPONIVEL', 'BACKUP_TIMEOUT', 'INTERROMPIDO']);
const ARGS = ['--format=custom', '--no-owner', '--no-privileges', '--no-password'];

let runtime = {
    spawn,
    execFile,
    agora: () => new Date(),
    timeoutMs: TIMEOUT_PADRAO_MS,
};

function configurarParaTeste(parcial) {
    runtime = { ...runtime, ...parcial };
}

function resetarParaTeste() {
    lock.liberar(QUEM);
    lock.liberar('automatico');
    runtime = { spawn, execFile, agora: () => new Date(), timeoutMs: TIMEOUT_PADRAO_MS };
}

function httpErro(status, message, codigo) {
    const e = new Error(message);
    e.status = status;
    e.codigo = codigo;
    return e;
}

function scrub(texto, segredos) {
    let s = String(texto == null ? '' : texto);
    const lista = [...(segredos || [])].filter((x) => typeof x === 'string' && x.length >= 3);
    lista.sort((a, b) => b.length - a.length);
    for (const seg of lista) s = s.split(seg).join('[redigido]');
    s = s.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redigido]');
    s = s.replace(/PGPASSWORD=\S+/gi, 'PGPASSWORD=[redigido]');
    return s.slice(0, 500);
}

function nomeArquivo(date) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).reduce((a, x) => {
        a[x.type] = x.value;
        return a;
    }, {});
    const hora = p.hour === '24' ? '00' : p.hour;
    return `hardt-banco-${p.year}-${p.month}-${p.day}-${hora}${p.minute}.dump`;
}

function majorDe(texto) {
    const m = String(texto || '').match(/(\d+)\.(\d+)/);
    return m ? Number(m[1]) : null;
}

function parseConexao(databaseUrl) {
    if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
        throw httpErro(503, 'Banco não configurado.', 'BANCO_NAO_CONFIGURADO');
    }
    let url;
    try { url = new URL(databaseUrl); }
    catch { throw httpErro(503, 'Banco não configurado.', 'BANCO_NAO_CONFIGURADO'); }
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
        throw httpErro(503, 'Banco não configurado.', 'BANCO_NAO_CONFIGURADO');
    }
    let database;
    let user;
    let password;
    try {
        database = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
        user = decodeURIComponent(url.username || '');
        password = decodeURIComponent(url.password || '');
    } catch {
        // URIError cita o trecho malformado — não pode ir para a resposta nem para o log.
        throw httpErro(503, 'Banco não configurado.', 'BANCO_NAO_CONFIGURADO');
    }
    if (!url.hostname || !database || !user) {
        throw httpErro(503, 'Banco não configurado.', 'BANCO_NAO_CONFIGURADO');
    }
    const env = {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: user,
        PGDATABASE: database,
        PGPASSWORD: password,
    };
    const sslmode = url.searchParams.get('sslmode');
    if (sslmode) env.PGSSLMODE = sslmode;
    // Senha vazia não entra: ''.split('') explode o texto. Qualquer outra entra,
    // mesmo curta — senão um pedaço dela sobra no log.
    const segredos = [password, databaseUrl].filter((x) => typeof x === 'string' && x.length >= 1);
    return { env, segredos };
}

function versaoPgDump() {
    return new Promise((resolve, reject) => {
        runtime.execFile('pg_dump', ['--version'], { timeout: 10000 }, (err, stdout) => {
            if (err) {
                reject(httpErro(503, 'pg_dump não está disponível nesta imagem.', 'PG_DUMP_INDISPONIVEL'));
                return;
            }
            const major = majorDe(stdout);
            if (!major) {
                reject(httpErro(503, 'Não foi possível ler a versão do pg_dump.', 'PG_DUMP_INDISPONIVEL'));
                return;
            }
            resolve(major);
        });
    });
}

async function versaoServidor() {
    let rows;
    try {
        rows = await prisma.$queryRaw`SELECT current_setting('server_version_num') AS v`;
    } catch {
        throw httpErro(503, 'Não foi possível ler a versão do Postgres.', 'BANCO_INDISPONIVEL');
    }
    const bruto = rows && rows[0] && rows[0].v;
    const major = Math.floor(Number(bruto) / 10000);
    if (!Number.isFinite(major) || major < 1) {
        throw httpErro(503, 'Não foi possível ler a versão do Postgres.', 'BANCO_INDISPONIVEL');
    }
    return major;
}

async function verificarCompatibilidade() {
    const [dumpMajor, servidorMajor] = await Promise.all([versaoPgDump(), versaoServidor()]);
    if (dumpMajor < servidorMajor) {
        throw httpErro(
            503,
            `pg_dump ${dumpMajor} não lê o Postgres ${servidorMajor}. A imagem do backend precisa do client PostgreSQL ${servidorMajor} ou mais novo.`,
            'VERSAO_INCOMPATIVEL',
        );
    }
    return { dumpMajor, servidorMajor };
}

function classificar(bruto) {
    const erro = String(bruto || '');
    if (erro.startsWith('PG_DUMP_INDISPONIVEL')) {
        return { status: 503, codigo: 'PG_DUMP_INDISPONIVEL', mensagem: 'pg_dump não está disponível nesta imagem.' };
    }
    if (erro.startsWith('BACKUP_TIMEOUT')) {
        return { status: 504, codigo: 'BACKUP_TIMEOUT', mensagem: 'O backup passou do tempo limite e foi interrompido.' };
    }
    if (erro.startsWith('INTERROMPIDO')) {
        return { status: 499, codigo: 'INTERROMPIDO', mensagem: 'O download foi interrompido.' };
    }
    return { status: 500, codigo: 'BACKUP_FALHOU', mensagem: 'Não foi possível gerar o backup.' };
}

function abrirProcesso(conexao, arquivoTmp) {
    const env = {
        PATH: process.env.PATH || '/usr/bin:/bin',
        LANG: 'C',
        LC_ALL: 'C',
        PGHOST: conexao.env.PGHOST,
        PGPORT: conexao.env.PGPORT,
        PGUSER: conexao.env.PGUSER,
        PGDATABASE: conexao.env.PGDATABASE,
        PGPASSWORD: conexao.env.PGPASSWORD,
    };
    if (conexao.env.PGSSLMODE) env.PGSSLMODE = conexao.env.PGSSLMODE;
    return runtime.spawn('pg_dump', [...ARGS, '--file', arquivoTmp], {
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: false,
    });
}

function apagarTmp(arquivoTmp) {
    try { fs.unlinkSync(arquivoTmp); } catch { /* já foi, ou nunca chegou a existir */ }
}

function prepararHeaders(res, arquivo, tamanho) {
    res.status(200);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.setHeader('Content-Length', String(tamanho));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Backup-Formato', 'pg_dump-custom');
    res.setHeader('Cache-Control', 'no-store');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function falhaAntes(arquivo, erroBruto) {
    const classe = classificar(erroBruto);
    return {
        ok: false, started: false, bytes: 0, arquivo, duracaoSeg: 0,
        erro: erroBruto, ...classe,
    };
}

function transmitir(req, res, { conexao, arquivo, soltar }) {
    return new Promise((resolve) => {
        const inicio = Date.now();
        const tmp = path.join(os.tmpdir(), `hardt-backup-${crypto.randomBytes(8).toString('hex')}.dump`);
        let child;
        try {
            fs.writeFileSync(tmp, Buffer.alloc(0), { mode: 0o600 });
            child = abrirProcesso(conexao, tmp);
        } catch {
            apagarTmp(tmp);
            soltar();
            resolve(falhaAntes(arquivo, 'PG_DUMP_INDISPONIVEL'));
            return;
        }
        if (!child || typeof child.on !== 'function') {
            apagarTmp(tmp);
            soltar();
            resolve(falhaAntes(arquivo, 'PG_DUMP_INDISPONIVEL'));
            return;
        }

        let bytes = 0;
        let started = false;
        let stderr = '';
        let terminou = false;
        let motivoAbort = null;
        let falhaSemDados = null;
        let reforco = null;
        let leitura = null;

        // SIGTERM primeiro. Se o pg_dump não sair, SIGKILL — senão a trava
        // fica presa e o próximo backup responde 409 para sempre.
        function matar() {
            try { child.kill('SIGTERM'); } catch { /* já morreu */ }
            if (reforco) return;
            reforco = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch { /* já morreu */ }
            }, 5000);
            if (typeof reforco.unref === 'function') reforco.unref();
        }

        const timer = setTimeout(() => {
            if (terminou) return;
            motivoAbort = motivoAbort || 'BACKUP_TIMEOUT';
            matar();
        }, runtime.timeoutMs);

        function resultado(ok, erroBruto) {
            if (terminou) return;
            terminou = true;
            clearTimeout(timer);
            clearTimeout(reforco);
            soltar();
            const erro = erroBruto ? scrub(erroBruto, conexao.segredos) : null;
            const classe = ok ? { status: 200, codigo: null, mensagem: null } : classificar(erro);
            resolve({
                ok,
                started,
                bytes,
                arquivo,
                duracaoSeg: Math.round((Date.now() - inicio) / 1000),
                erro,
                status: classe.status,
                codigo: classe.codigo,
                mensagem: classe.mensagem,
            });
        }

        // 'close' da resposta também dispara no fim normal. 'aborted' só
        // quando o cliente derruba a conexão — é o que mata o pg_dump.
        req.on('aborted', () => {
            if (terminou || motivoAbort) return;
            motivoAbort = 'INTERROMPIDO';
            matar();
            if (leitura) leitura.destroy();
        });

        child.on('error', (err) => {
            const codigo = err && err.code === 'ENOENT' ? 'PG_DUMP_INDISPONIVEL' : 'BACKUP_FALHOU';
            falhaSemDados = falhaSemDados || codigo;
            setImmediate(() => {
                if (!terminou) {
                    apagarTmp(tmp);
                    resultado(false, falhaSemDados);
                }
            });
        });

        if (child.stderr && typeof child.stderr.on === 'function') {
            child.stderr.on('data', (chunk) => {
                stderr += chunk.toString('utf8');
                if (stderr.length > 4000) stderr = stderr.slice(-4000);
            });
        }

        function enviarArquivo() {
            let tamanho;
            try {
                fs.chmodSync(tmp, 0o600);
                tamanho = fs.statSync(tmp).size;
            } catch {
                apagarTmp(tmp);
                resultado(false, 'BACKUP_FALHOU');
                return;
            }
            if (!tamanho) {
                apagarTmp(tmp);
                resultado(false, 'BACKUP_FALHOU');
                return;
            }
            started = true;
            bytes = tamanho;
            prepararHeaders(res, arquivo, tamanho);
            leitura = fs.createReadStream(tmp);
            let enviados = 0;
            leitura.on('data', (chunk) => { enviados += chunk.length; });
            pipeline(leitura, res, (err) => {
                bytes = enviados || tamanho;
                apagarTmp(tmp);
                if (terminou) return;
                if (err || motivoAbort) resultado(false, motivoAbort || 'BACKUP_FALHOU');
                else resultado(true, null);
            });
        }

        child.on('close', (code) => {
            if (terminou) return;
            if (motivoAbort || code !== 0 || falhaSemDados) {
                apagarTmp(tmp);
                const motivo = motivoAbort || falhaSemDados || 'BACKUP_FALHOU';
                const extra = stderr ? `: ${stderr}` : '';
                resultado(false, motivo + extra);
                return;
            }
            enviarArquivo();
        });
    });
}

async function registrar(r, segredos) {
    const erro = r.erro ? scrub(r.erro, segredos) : '';
    const linha = scrub(
        `[Analytics][Backup] ${r.ok ? 'ok' : 'falhou'} agente=luke quando=${new Date().toISOString()} arquivo=${r.arquivo} bytes=${r.bytes} duracaoSeg=${r.duracaoSeg}${erro ? ` erro=${erro}` : ''}`,
        segredos,
    );
    if (r.ok) console.log(linha);
    else console.error(linha);
    try {
        const detalhes = scrub(JSON.stringify({
            ok: !!r.ok,
            bytes: r.bytes,
            duracaoSeg: r.duracaoSeg,
            formato: 'custom',
            erro: erro ? erro.slice(0, 300) : null,
        }), segredos);
        await prisma.auditLog.create({
            data: {
                acao: 'BACKUP_BANCO',
                entidade: 'backup',
                entidadeId: String(r.arquivo || '-').slice(0, 80),
                detalhes: detalhes.slice(0, 8000),
                usuarioId: 'agente:luke',
                usuarioNome: 'luke',
            },
        });
    } catch (e) {
        console.error('[Analytics][Backup] falha ao gravar AuditLog:', scrub(e && e.message, segredos));
    }
}

async function executar(req, res) {
    const conexao = parseConexao(process.env.DATABASE_URL);
    const arquivo = nomeArquivo(runtime.agora());
    if (!lock.tentar(QUEM)) {
        throw httpErro(409, 'Já existe um backup em andamento. Espere ele terminar.', 'BACKUP_EM_ANDAMENTO');
    }
    let segurou = true;
    const soltar = () => {
        if (!segurou) return;
        segurou = false;
        lock.liberar(QUEM);
    };
    try {
        console.log(`[Analytics][Backup] inicio agente=luke quando=${new Date().toISOString()} arquivo=${arquivo}`);
        await verificarCompatibilidade();
        const r = await transmitir(req, res, { conexao, arquivo, soltar });
        await registrar(r, conexao.segredos);
        if (!r.started && !res.destroyed && !res.writableEnded) {
            throw httpErro(r.status, r.mensagem, r.codigo);
        }
        return r;
    } catch (e) {
        soltar();
        // Falha antes do pg_dump (versão, banco). O resultado do dump em si
        // já foi registrado dentro do try — não repetir.
        const ja = e && JA_REGISTRADO.has(e.codigo);
        if (!ja) {
            await registrar({
                ok: false, bytes: 0, arquivo, duracaoSeg: 0, erro: (e && e.codigo) || 'ERRO',
            }, conexao.segredos);
        }
        throw e;
    }
}

module.exports = {
    executar,
    parseConexao,
    scrub,
    nomeArquivo,
    majorDe,
    configurarParaTeste,
    resetarParaTeste,
    ARGS,
};
