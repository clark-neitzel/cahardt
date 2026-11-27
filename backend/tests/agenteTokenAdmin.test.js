// POST /api/admin-exec/agente-token-revogar e /agente-token-rotacionar — interruptor de emergência e rotação.
// Prisma mockado em memória (nunca toca banco real).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
const SEGREDO = 'segredo-admin-de-teste-local';
process.env.ADMIN_SECRET = SEGREDO;

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['services/agenteCriarService.js', 'services/agenteTokenService.js', 'services/agenteTokenAdminService.js',
    'routes/adminExec.js', 'routes/agenteApiV1Routes.js', 'middlewares/authMiddleware.js', 'config/agenteAcesso.js'];

const hashDe = (t) => crypto.createHash('sha256').update(t).digest('hex');

function memoria() {
    const vendedores = new Map();
    const tokens = new Map();
    const audits = [];
    const db = {
        vendedores, tokens, audits, falhaCriar: false, falhaRevogar: null, esperaCriar: null,
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, maxDescontoFlex: 100, ...v }); },
        // cria um token "de verdade" (claro + hash) direto no banco fake
        addToken(vendedorId, extra = {}) {
            const claro = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
            const row = {
                id: `tk-${tokens.size + 1}`, vendedorId, nome: 'luke-bpo', prefixo: claro.slice(7, 15), hash: hashDe(claro),
                criadoPorId: 'x', criadoEm: new Date(), expiraEm: new Date(Date.now() + 90 * 864e5), revogadoEm: null,
                ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, limitePorMinuto: 120, ...extra,
            };
            tokens.set(row.id, row);
            return { claro, row };
        },
    };
    const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findMany: async ({ where, select }) => [...vendedores.values()].filter((v) => v.agente === where.agente).map((v) => pick(v, select)),
        },
        agenteToken: {
            create: async ({ data, select }) => {
                if (db.falhaCriar) throw new Error(`Invalid \`prisma.agenteToken.create()\` invocation: data: { hash: "${data.hash}", segredo: "cah_ag_${data.prefixo}XXXX" } — falha simulada do banco`);
                if (db.esperaCriar) await db.esperaCriar;
                const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, criadoEm: new Date(), ...data };
                tokens.set(row.id, row); return pick(row, select);
            },
            findMany: async ({ where, select }) => [...tokens.values()].filter((t) => t.vendedorId === where.vendedorId)
                .sort((a, b) => b.criadoEm - a.criadoEm).map((t) => pick(t, select)),
            findFirst: async ({ where, select }) => { const t = [...tokens.values()].find((x) => x.id === where.id && x.vendedorId === where.vendedorId); return t ? pick(t, select) : null; },
            findUnique: async ({ where, include, select }) => {
                const t = where.hash ? [...tokens.values()].find((x) => x.hash === where.hash) : tokens.get(where.id);
                if (!t) return null;
                if (select) return pick(t, select);
                return include ? { ...t, vendedor: vendedores.get(t.vendedorId) ? pick(vendedores.get(t.vendedorId), include.vendedor.select) : null } : { ...t };
            },
            update: async ({ where, data, select }) => {
                if (db.falhaRevogar === where.id) throw new Error(`falha simulada ao revogar cah_ag_SEGREDO hash ${'a'.repeat(64)}`);
                const t = tokens.get(where.id);
                if (data.totalUsos?.increment) { t.totalUsos += data.totalUsos.increment; delete data.totalUsos; }
                Object.assign(t, data);
                return pick(t, select);
            },
        },
        auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    });
    return { db, prisma };
}

async function subir() {
    const { db, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    require('../services/agenteTokenAdminService');
    const adminExec = require('../routes/adminExec');
    const authMiddleware = require('../middlewares/authMiddleware');
    const agenteApi = require('../routes/agenteApiV1Routes');
    require('../services/agenteTokenService').limparContadores();
    restaurar();
    const app = express();
    app.use(express.json());
    app.use('/api/admin-exec', adminExec);
    app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ id: req.user.id, nome: req.user.nome }));
    app.use('/api/agente/v1', authMiddleware, agenteApi);
    const srv = await startTestServer(app);
    return { db, srv };
}

const H = { 'x-admin-secret': SEGREDO };
const REV = '/api/admin-exec/agente-token-revogar';
const ROT = '/api/admin-exec/agente-token-rotacionar';
const url = (base, conf) => (conf === undefined ? base : `${base}?confirmar=${conf}`);
const rev = (srv, corpo, conf) => srv.request('POST', url(REV, conf), { headers: H, body: corpo });
const rot = (srv, corpo, conf) => srv.request('POST', url(ROT, conf), { headers: H, body: corpo });
const me = (srv, claro) => srv.request('GET', '/api/auth/me', { headers: { authorization: `Bearer ${claro}` } });
const ativos = (db) => [...db.tokens.values()].filter((t) => !t.revogadoEm);

function cenario(db) {
    db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true, acessoExterno: true, permissoes: { Pode_Ver_X: true } });
    return db.addToken('luke');
}

// captura console durante `fn`; devolve o texto
async function comLogs(fn) {
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
    try { await fn(); } finally { Object.assign(console, orig); }
    return logs.join('\n');
}

test('sem segredo: 401 nas duas rotas', async () => {
    const { srv } = await subir();
    try {
        assert.equal((await srv.request('POST', REV, { body: { agente: 'x', tokens: 'todos' } })).status, 401);
        assert.equal((await srv.request('POST', ROT, { body: { agente: 'x' } })).status, 401);
        assert.equal((await srv.request('POST', REV, { headers: { 'x-admin-secret': 'errado' }, body: {} })).status, 401);
    } finally { await srv.close(); }
});

test('sem ADMIN_SECRET no ambiente: 503 (fail-closed) e nada é gravado', async () => {
    const { db, srv } = await subir();
    const guardado = process.env.ADMIN_SECRET;
    const errOrig = console.error;
    console.error = () => {};
    try {
        const { claro } = cenario(db);
        delete process.env.ADMIN_SECRET;
        assert.equal((await rev(srv, { agente: 'Luke (agente)', tokens: 'todos' }, 1)).status, 503);
        assert.equal((await rot(srv, { agente: 'Luke (agente)' }, 1)).status, 503);
        assert.equal(ativos(db).length, 1);
        process.env.ADMIN_SECRET = guardado;
        assert.equal((await me(srv, claro)).status, 200);
    } finally { console.error = errOrig; process.env.ADMIN_SECRET = guardado; await srv.close(); }
});

test('revogar dry-run: lista tokens ativos sem hash/segredo e não grava nada', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        row.totalUsos = 7; row.ultimoUsoIp = '10.0.0.1';
        const r = await rev(srv, { agente: 'luke (AGENTE)', tokens: 'todos' });
        assert.equal(r.status, 200);
        assert.equal(r.body.dryRun, true);
        assert.match(r.headers.get('cache-control'), /no-store/);
        assert.deepEqual(r.body.agente, { id: 'luke', nome: 'Luke (agente)', ativo: true });
        assert.equal(r.body.tokensAtivos.length, 1);
        const t = r.body.tokensAtivos[0];
        assert.deepEqual(Object.keys(t).sort(), ['criadoEm', 'expiraEm', 'nome', 'prefixo', 'totalUsos', 'ultimoUsoEm', 'ultimoUsoIp'].sort());
        assert.equal(t.prefixo, row.prefixo);
        assert.equal(t.totalUsos, 7);
        assert.deepEqual(r.body.seriamRevogados, [row.prefixo]);
        assert.equal(r.texto.includes(claro), false);
        assert.equal(r.texto.includes(row.hash), false);
        assert.equal(r.texto.includes('cah_ag_'), false);
        assert.equal(ativos(db).length, 1);
        assert.equal(db.audits.length, 0);
        assert.equal((await me(srv, claro)).status, 200);
    } finally { await srv.close(); }
});

test('revogar por prefixo: só o escolhido cai; auditoria sem segredo; idempotente', async () => {
    const { db, srv } = await subir();
    try {
        const a = cenario(db);
        const b = db.addToken('luke', { nome: 'outro' });
        const r = await rev(srv, { agente: 'luke', tokens: [a.row.prefixo], motivo: 'vazou no chat' }, 1);
        assert.equal(r.status, 200, r.texto);
        assert.equal(r.body.ok, true);
        assert.deepEqual(r.body.revogados, [a.row.prefixo]);
        assert.equal((await me(srv, a.claro)).status, 401);
        assert.equal((await me(srv, b.claro)).status, 200);
        assert.equal(db.audits.length, 1);
        const au = db.audits[0];
        assert.equal(au.acao, 'AGENTE_TOKEN_REVOGADO');
        assert.equal(au.usuarioId, 'admin-exec');
        const det = JSON.parse(au.detalhes);
        assert.equal(det.agenteId, 'luke'); assert.equal(det.prefixo, a.row.prefixo); assert.equal(det.motivo, 'vazou no chat');
        const tudo = JSON.stringify(db.audits);
        for (const t of [a, b]) { assert.equal(tudo.includes(t.claro), false); assert.equal(tudo.includes(t.row.hash), false); }
        assert.equal(tudo.includes('cah_ag_'), false);
        // de novo: ignora com aviso, sem 2ª auditoria
        const r2 = await rev(srv, { agente: 'luke', tokens: [a.row.prefixo] }, 1);
        assert.equal(r2.status, 200);
        assert.deepEqual(r2.body.revogados, []);
        assert.deepEqual(r2.body.jaRevogados, [a.row.prefixo]);
        assert.ok(r2.body.avisos.some((x) => /já estava revogado/.test(x)));
        assert.equal(db.audits.length, 1);
    } finally { await srv.close(); }
});

test("revogar 'todos': derruba todos os ativos", async () => {
    const { db, srv } = await subir();
    try {
        const a = cenario(db);
        const b = db.addToken('luke');
        const r = await rev(srv, { agente: 'Luke (agente)', tokens: 'todos' }, 1);
        assert.equal(r.status, 200);
        assert.equal(r.body.revogados.length, 2);
        assert.equal((await me(srv, a.claro)).status, 401);
        assert.equal((await me(srv, b.claro)).status, 401);
        assert.equal(ativos(db).length, 0);
        assert.equal(db.audits.length, 2);
        const r2 = await rev(srv, { agente: 'Luke (agente)', tokens: 'todos' }, 1);
        assert.equal(r2.status, 200);
        assert.deepEqual(r2.body.revogados, []);
        assert.ok(r2.body.avisos.some((x) => /nenhum token ativo/.test(x)));
    } finally { await srv.close(); }
});

test('revogar: prefixo inexistente → 404 listando os válidos, nada é revogado (nem os outros da lista)', async () => {
    const { db, srv } = await subir();
    try {
        const a = cenario(db);
        const r = await rev(srv, { agente: 'luke', tokens: [a.row.prefixo, 'ZZZZZZZZ'] }, 1);
        assert.equal(r.status, 404);
        assert.match(r.body.error, /ZZZZZZZZ/);
        assert.deepEqual(r.body.prefixosAtivos, [a.row.prefixo]);
        assert.match(r.body.error, new RegExp(a.row.prefixo));
        assert.equal(ativos(db).length, 1);
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('revogar: agente inexistente 404, id de não-agente 404, nome duplicado 409, agente inativo AINDA revoga', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'h1', nome: 'Humano', permissoes: { admin: true } });
        db.addVendedor({ id: 'd1', nome: 'Dup', agente: true });
        db.addVendedor({ id: 'd2', nome: 'dup', agente: true });
        assert.equal((await rev(srv, { agente: 'Fantasma', tokens: 'todos' }, 1)).status, 404);
        assert.equal((await rev(srv, { agente: 'h1', tokens: 'todos' }, 1)).status, 404);
        const dup = await rev(srv, { agente: 'Dup', tokens: 'todos' }, 1);
        assert.equal(dup.status, 409);
        assert.match(dup.body.error, /d1/);
        db.addVendedor({ id: 'ina', nome: 'Inativo', agente: true, ativo: false });
        const t = db.addToken('ina');
        const r = await rev(srv, { agente: 'Inativo', tokens: 'todos' }, 1);
        assert.equal(r.status, 200);
        assert.equal(r.body.agente.ativo, false);
        assert.equal(r.body.revogados.length, 1);
        assert.ok(t.row.revogadoEm);
    } finally { await srv.close(); }
});

test('só ?confirmar=1 exato executa (true, 0, 2, vazio, repetido, caixa → dry-run)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const corpo = { agente: 'luke', tokens: 'todos' };
        for (const q of ['?confirmar=true', '?confirmar=0', '?confirmar=2', '?confirmar=', '?confirmar=1&confirmar=1', '?confirmar[]=1', '?CONFIRMAR=1', '?confirmar=%201']) {
            const r = await srv.request('POST', REV + q, { headers: H, body: corpo });
            assert.equal(r.status, 200, q);
            assert.equal(r.body.dryRun, true, q);
            const r2 = await srv.request('POST', ROT + q, { headers: H, body: { agente: 'luke' } });
            assert.equal(r2.body.dryRun, true, q);
        }
        assert.equal(ativos(db).length, 1);
        assert.equal(db.tokens.size, 1);
        assert.equal((await me(srv, claro)).status, 200);
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('validação do corpo (português, 400)', async () => {
    const { db, srv } = await subir();
    try {
        cenario(db);
        const ruins = [
            [REV, {}, /agente/], [REV, { agente: '' }, /agente/], [REV, { agente: 'luke' }, /tokens/],
            [REV, { agente: 'luke', tokens: 'alguns' }, /tokens/], [REV, { agente: 'luke', tokens: [] }, /tokens/],
            [REV, { agente: 'luke', tokens: ['curto'] }, /prefixo/], [REV, { agente: 'luke', tokens: [123] }, /prefixo/],
            [REV, { agente: 'luke', tokens: 'todos', motivo: 'x'.repeat(201) }, /motivo/], [REV, { agente: 'luke', tokens: 'todos', motivo: 5 }, /motivo/],
            [ROT, {}, /agente/], [ROT, { agente: 'luke', revogarAnteriores: 'sim' }, /revogarAnteriores/],
            [ROT, { agente: 'luke', validadeDias: 0 }, /validadeDias/], [ROT, { agente: 'luke', validadeDias: 366 }, /validadeDias/],
            [ROT, { agente: 'luke', validadeDias: 1.5 }, /validadeDias/], [ROT, { agente: 'luke', validadeDias: true }, /validadeDias/],
            [ROT, { agente: 'luke', tokenNome: 'x'.repeat(81) }, /tokenNome/], [ROT, { agente: 'luke', tokenNome: 7 }, /tokenNome/],
            [ROT, { agente: 'luke', limitePorMinuto: 0 }, /limitePorMinuto/], [ROT, { agente: 'luke', limitePorMinuto: 601 }, /limitePorMinuto/],
            [ROT, { agente: 'luke', limitePorMinuto: 2.5 }, /limitePorMinuto/],
        ];
        for (const [rota, corpo, re] of ruins) {
            for (const conf of [undefined, 1]) {
                const r = await srv.request('POST', url(rota, conf), { headers: H, body: corpo });
                assert.equal(r.status, 400, JSON.stringify(corpo));
                assert.match(r.body.error, re);
            }
        }
        assert.equal(ativos(db).length, 1);
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('rotacionar dry-run: mostra quem seria revogado e que 1 novo seria gerado; não grava nem vaza', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        const r = await rot(srv, { agente: 'Luke (agente)', validadeDias: 30, limitePorMinuto: 60 });
        assert.equal(r.status, 200);
        assert.equal(r.body.dryRun, true);
        assert.match(r.headers.get('cache-control'), /no-store/);
        assert.deepEqual(r.body.seriamRevogados, [row.prefixo]);
        assert.deepEqual(r.body.geraria, { quantidade: 1, tokenNome: 'luke-bpo', validadeDias: 30, limitePorMinuto: 60 });
        assert.equal(r.body.token, undefined);
        assert.equal(r.texto.includes(claro), false);
        assert.equal(r.texto.includes(row.hash), false);
        assert.equal(r.texto.includes('cah_ag_'), false);
        assert.equal(db.tokens.size, 1);
        assert.equal(ativos(db).length, 1);
        assert.equal(db.audits.length, 0);
        // revogarAnteriores:false → ninguém seria revogado e há aviso
        const r2 = await rot(srv, { agente: 'luke', revogarAnteriores: false });
        assert.deepEqual(r2.body.seriamRevogados, []);
        assert.ok(r2.body.avisos.some((x) => /CONTINUAM valendo/.test(x)));
    } finally { await srv.close(); }
});

test('rotacionar: revoga antes, cria depois; novo autentica, antigo → 401 AGENTE_TOKEN_INVALIDO; auditoria sem segredo', async () => {
    const { db, srv } = await subir();
    try {
        const antigo = cenario(db);
        // o antigo cai ANTES de o novo existir: observa o estado dentro do create
        let antigoJaRevogadoNoCriar = null;
        const criarOrig = db.tokens.set.bind(db.tokens);
        db.tokens.set = (k, v) => { if (v.nome === 'luke-bpo' && v.id !== antigo.row.id) antigoJaRevogadoNoCriar = !!antigo.row.revogadoEm; return criarOrig(k, v); };
        const r = await rot(srv, { agente: 'Luke (agente)' }, 1);
        assert.equal(r.status, 200, r.texto);
        assert.equal(antigoJaRevogadoNoCriar, true);
        assert.match(r.headers.get('cache-control'), /no-store/);
        assert.equal(r.body.ok, true);
        assert.deepEqual(r.body.agente, { id: 'luke', nome: 'Luke (agente)' });
        assert.deepEqual(r.body.revogados, [antigo.row.prefixo]);
        assert.match(r.body.token, /^cah_ag_[A-Za-z0-9_-]{40,}$/);
        assert.equal(r.body.tokenPrefixo, r.body.token.slice(7, 15));
        assert.ok(r.body.expiraEm);
        const dias = Math.round((new Date(r.body.expiraEm) - Date.now()) / 864e5);
        assert.equal(dias, 90);
        const ant = await me(srv, antigo.claro);
        assert.equal(ant.status, 401);
        assert.equal(ant.body.codigo, 'AGENTE_TOKEN_INVALIDO');
        const novo = await me(srv, r.body.token);
        assert.equal(novo.status, 200);
        assert.deepEqual(db.audits.map((a) => a.acao), ['AGENTE_TOKEN_REVOGADO', 'AGENTE_TOKEN_CRIADO']);
        for (const a of db.audits) assert.equal(a.usuarioId, 'admin-exec');
        const tudo = JSON.stringify(db.audits);
        for (const s of [antigo.claro, antigo.row.hash, r.body.token, hashDe(r.body.token)]) assert.equal(tudo.includes(s), false);
        assert.equal(tudo.includes('cah_ag_'), false);
        // o novo respeita a validade/limite pedidos
        const r2 = await rot(srv, { agente: 'luke', validadeDias: 10, limitePorMinuto: 30, tokenNome: 'outro-nome' }, 1);
        assert.equal(r2.status, 200);
        const tk = [...db.tokens.values()].find((t) => t.prefixo === r2.body.tokenPrefixo);
        assert.equal(tk.nome, 'outro-nome'); assert.equal(tk.limitePorMinuto, 30);
        assert.equal((await me(srv, r.body.token)).status, 401); // rotacionou de novo: o anterior caiu
        assert.equal((await me(srv, r2.body.token)).status, 200);
        assert.equal(ativos(db).length, 1);
    } finally { await srv.close(); }
});

test('rotacionar com revogarAnteriores:false mantém o antigo valendo', async () => {
    const { db, srv } = await subir();
    try {
        const antigo = cenario(db);
        const r = await rot(srv, { agente: 'luke', revogarAnteriores: false }, 1);
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.revogados, []);
        assert.equal((await me(srv, antigo.claro)).status, 200);
        assert.equal((await me(srv, r.body.token)).status, 200);
        assert.equal(ativos(db).length, 2);
    } finally { await srv.close(); }
});

test('rotacionar: agente inativo → 409 e nada muda; inexistente 404; não-agente 404', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'ina', nome: 'Inativo', agente: true, ativo: false });
        const t = db.addToken('ina');
        db.addVendedor({ id: 'h1', nome: 'Humano' });
        const r = await rot(srv, { agente: 'Inativo' }, 1);
        assert.equal(r.status, 409);
        assert.match(r.body.error, /INATIVO/);
        assert.equal(t.row.revogadoEm, null);
        assert.equal(db.tokens.size, 1);
        assert.equal((await rot(srv, { agente: 'Fantasma' }, 1)).status, 404);
        assert.equal((await rot(srv, { agente: 'h1' }, 1)).status, 404);
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('falha na criação: antigos já revogados, mensagem fixa SEM segredo do Prisma, log sem segredo; reexecutar gera 1 novo sem revogar de novo', async () => {
    const { db, srv } = await subir();
    try {
        const antigo = cenario(db);
        db.falhaCriar = true;
        let r;
        const log = await comLogs(async () => { r = await rot(srv, { agente: 'luke' }, 1); });
        assert.equal(r.status, 500);
        assert.match(r.body.error, /JÁ FORAM REVOGADOS/);
        assert.match(r.body.error, /NÃO foi gerado/);
        assert.match(r.body.error, /Repita a chamada/);
        assert.equal(/[0-9a-f]{64}/i.test(r.texto), false);
        assert.equal(r.texto.includes('cah_ag_'), false);
        assert.equal(r.texto.includes('falha simulada'), false);
        assert.deepEqual(r.body.revogados, [antigo.row.prefixo]);
        assert.equal(/[0-9a-f]{64}/i.test(log), false);
        assert.equal(/cah_ag_(?!\*\*\*)/.test(log), false);
        assert.ok(log.includes('falha ao gravar o token novo'));
        assert.equal((await me(srv, antigo.claro)).status, 401);
        assert.equal(ativos(db).length, 0);
        // reexecuta
        db.falhaCriar = false;
        const r2 = await rot(srv, { agente: 'luke' }, 1);
        assert.equal(r2.status, 200);
        assert.deepEqual(r2.body.revogados, []);
        assert.equal((await me(srv, r2.body.token)).status, 200);
        assert.equal(ativos(db).length, 1);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_TOKEN_REVOGADO').length, 1);
    } finally { await srv.close(); }
});

test('falha ao revogar um antigo: NENHUM token novo é gerado, erro sem segredo, reexecutar conclui', async () => {
    const { db, srv } = await subir();
    try {
        const a = cenario(db);
        const b = db.addToken('luke');
        db.falhaRevogar = b.row.id;
        let r;
        const log = await comLogs(async () => { r = await rot(srv, { agente: 'luke' }, 1); });
        assert.equal(r.status, 500);
        assert.match(r.body.error, /NENHUM token novo/);
        assert.equal(/[0-9a-f]{64}/i.test(r.texto) || r.texto.includes('cah_ag_') || r.texto.includes('SEGREDO'), false);
        assert.equal(/[0-9a-f]{64}/i.test(log) || /cah_ag_(?!\*\*\*)/.test(log), false);
        assert.equal(db.tokens.size, 2);
        assert.ok(a.row.revogadoEm); assert.equal(b.row.revogadoEm, null);
        db.falhaRevogar = null;
        const r2 = await rot(srv, { agente: 'luke' }, 1);
        assert.equal(r2.status, 200);
        assert.deepEqual(r2.body.revogados, [b.row.prefixo]);
        assert.equal(ativos(db).length, 1);
        // revogar (rota própria) também reporta falha sem segredo
        db.falhaRevogar = db.tokens.get(`tk-3`).id;
        let r3;
        await comLogs(async () => { r3 = await rev(srv, { agente: 'luke', tokens: 'todos' }, 1); });
        assert.equal(r3.status, 500);
        assert.equal(/[0-9a-f]{64}/i.test(r3.texto) || r3.texto.includes('cah_ag_'), false);
    } finally { await srv.close(); }
});

test('dois confirmar simultâneos de rotação: o 2º recebe 409 e só 1 token novo nasce', async () => {
    const { db, srv } = await subir();
    try {
        const antigo = cenario(db);
        let libera; db.esperaCriar = new Promise((res) => { libera = res; });
        const p1 = rot(srv, { agente: 'luke' }, 1);
        await new Promise((r) => setTimeout(r, 100));
        const r2 = await rot(srv, { agente: 'luke' }, 1);
        assert.equal(r2.status, 409);
        assert.match(r2.body.error, /em andamento/);
        libera();
        const r1 = await p1;
        assert.equal(r1.status, 200);
        assert.equal(ativos(db).length, 1);
        assert.equal(db.tokens.size, 2);
        assert.equal((await me(srv, antigo.claro)).status, 401);
        // a trava é liberada
        const r3 = await rot(srv, { agente: 'luke' }, 1);
        assert.equal(r3.status, 200);
    } finally { await srv.close(); }
});

test('o token novo nunca vai para console.* durante rotação, revogação e falhas', async () => {
    const { db, srv } = await subir();
    let tokens = [];
    const log = await comLogs(async () => {
        const a = cenario(db);
        tokens.push(a.claro);
        const r = await rot(srv, { agente: 'luke' }, 1);
        tokens.push(r.body.token);
        db.falhaCriar = true;
        await rot(srv, { agente: 'luke' }, 1);
        db.falhaCriar = false;
        await rev(srv, { agente: 'luke', tokens: 'todos' }, 1);
    });
    await srv.close();
    assert.equal(tokens.length, 2);
    for (const t of tokens) assert.equal(log.includes(t), false);
    assert.equal(/cah_ag_(?!\*\*\*)/.test(log), false);
});

test('GET /api/agente/v1/meu-acesso traz token { prefixo, expiraEm, diasRestantes } sem segredo e sem tirar campos', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        row.expiraEm = new Date(Date.now() + 10 * 864e5 - 3600e3); // ~9,96 dia → 10
        const m = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: { authorization: `Bearer ${claro}` } });
        assert.equal(m.status, 200);
        for (const k of ['id', 'nome', 'agente', 'permissoes', 'caminhosPermitidos']) assert.ok(k in m.body, k);
        assert.equal(m.body.token.prefixo, row.prefixo);
        assert.equal(m.body.token.diasRestantes, 10);
        assert.equal(new Date(m.body.token.expiraEm).getTime(), row.expiraEm.getTime());
        assert.deepEqual(Object.keys(m.body.token).sort(), ['diasRestantes', 'expiraEm', 'prefixo']);
        assert.equal(m.texto.includes(claro), false);
        assert.equal(m.texto.includes(row.hash), false);
    } finally { await srv.close(); }
});
