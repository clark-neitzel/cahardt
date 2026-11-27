// Usuário-agente com token de API (cah_ag_...) — authMiddleware, allowlist e gestão (/api/agentes).
// Não toca banco real: Prisma é mockado em memória antes dos módulos serem carregados.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['middlewares/authMiddleware.js', 'services/agenteTokenService.js', 'routes/agenteRoutes.js',
    'routes/agenteApiV1Routes.js', 'config/agenteAcesso.js', 'controllers/appAuthController.js'];

const JWT_SECRET = process.env.JWT_SECRET;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

// ---------- banco em memória ----------
function memoria() {
    const vendedores = new Map();
    const tokens = new Map();
    const audits = [];
    const updates = [];
    const db = {
        vendedores, tokens, audits, updates,
        consultasHash: 0,
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, maxDescontoFlex: 100, login: null, senha: null, ...v }); },
        addToken(t) { const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, expiraEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, limitePorMinuto: 120, criadoEm: new Date(), criadoPorId: 'adm', nome: 't', ...t }; tokens.set(row.id, row); return row; },
    };
    const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findFirst: async ({ where }) => [...vendedores.values()].find((v) => v.login && v.login.toLowerCase() === where.login.equals.toLowerCase()) || null,
            create: async ({ data, select }) => {
                if (data.login) throw new Error('teste: agente não deve ter login');
                const v = { ativo: true, createdAt: new Date(), maxDescontoFlex: 100, ...data };
                vendedores.set(v.id, v); return pick(v, select);
            },
            findMany: async ({ where, select }) => [...vendedores.values()].filter((v) => v.agente === where.agente).map((v) => ({
                ...pick(v, { ...select, agenteTokens: undefined }),
                agenteTokens: [...tokens.values()].filter((t) => t.vendedorId === v.id).map((t) => pick(t, select.agenteTokens.select)),
            })),
        },
        agenteToken: {
            findUnique: async ({ where, include, select }) => {
                if (where.hash) db.consultasHash += 1;
                const t = where.hash ? [...tokens.values()].find((x) => x.hash === where.hash) : tokens.get(where.id);
                if (!t) return null;
                if (select) return pick(t, select);
                return include ? { ...t, vendedor: vendedores.get(t.vendedorId) ? pick(vendedores.get(t.vendedorId), include.vendedor.select) : null } : { ...t };
            },
            findFirst: async ({ where, select }) => { const t = [...tokens.values()].find((x) => x.id === where.id && x.vendedorId === where.vendedorId); return t ? pick(t, select) : null; },
            create: async ({ data, select }) => { const row = db.addToken(data); return pick(row, select); },
            update: async ({ where, data, select }) => {
                updates.push({ id: where.id, data });
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

// ---------- app ----------
async function subir(db0) {
    const { db, prisma } = db0 || memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    const authMiddleware = require('../middlewares/authMiddleware');
    const agenteRoutes = require('../routes/agenteRoutes');
    const agenteApi = require('../routes/agenteApiV1Routes');
    const appAuth = require('../controllers/appAuthController');
    restaurar();

    const app = express();
    app.use(express.json());
    app.get('/api/auth/me', authMiddleware, (req, res) => res.json({ id: req.user.id, nome: req.user.nome, agente: req.user.agente || false }));
    app.get('/api/auth/midia-token', authMiddleware, (req, res) => res.json({ token: 'x' }));
    app.post('/api/auth/me', authMiddleware, (req, res) => res.json({ ok: true }));
    app.post('/api/auth/app-login', appAuth.login);
    app.use('/api/agentes', agenteRoutes);
    app.use('/api/agente/v1', authMiddleware, agenteApi);
    // rotas "normais" do sistema (stubs): o agente NÃO pode alcançar nenhuma
    for (const base of ['/api/vendedores', '/api/config', '/api/contas-pagar', '/api/pedidos']) {
        app.use(base, authMiddleware, (req, res) => res.json({ ok: true, user: req.user }));
    }
    app.use('/api/admin-exec', authMiddleware, (req, res) => res.json({ ok: true }));
    app.use((err, req, res, _n) => { console.error(err); res.status(500).json({ error: 'erro' }); });
    const srv = await startTestServer(app);
    return { db, srv, svc: require('../services/agenteTokenService') };
}

function jwtDe(id, extra = {}) { return jwt.sign({ id, nome: 'x', ...extra }, JWT_SECRET, { expiresIn: '1h' }); }
const bearer = (t) => ({ authorization: `Bearer ${t}` });
function crua(baseUrl, caminho, token) {
    const { port } = new URL(baseUrl);
    return new Promise((resolve, reject) => {
        const rq = require('http').request({ host: '127.0.0.1', port, path: caminho, method: 'GET', headers: { authorization: `Bearer ${token}` } }, (res) => {
            let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, texto: t }));
        });
        rq.on('error', reject); rq.end();
    });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Cenário padrão: agente "luke" com token válido.
function cenario(db, { vendedor = {}, token = {} } = {}) {
    const claro = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    db.addVendedor({ id: 'luke', nome: 'Luke', agente: true, acessoExterno: true, permissoes: { Pode_Ver_X: true }, ...vendedor });
    const row = db.addToken({ vendedorId: 'luke', hash: hash(claro), prefixo: claro.slice(7, 15), ...token });
    return { claro, row };
}

test('token válido: passa e monta req.user (agente, permissões vivas do banco)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer(claro) });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body, { id: 'luke', nome: 'Luke', agente: true });
        const m = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
        assert.equal(m.status, 200);
        assert.equal(m.body.agente, true);
        assert.deepEqual(m.body.permissoes, { Pode_Ver_X: true });
        assert.ok(m.body.caminhosPermitidos.length >= 2);
        // permissão muda no banco → vale na próxima chamada (sem cache)
        db.vendedores.get('luke').permissoes = { Pode_Ver_Y: true };
        const m2 = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
        assert.deepEqual(m2.body.permissoes, { Pode_Ver_Y: true });
        assert.ok(row);
    } finally { await srv.close(); }
});

test('revogado → 401 na hora (mesmo token que funcionava um segundo antes)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
        row.revogadoEm = new Date();
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer(claro) });
        assert.equal(r.status, 401);
        assert.equal(r.body.codigo, 'AGENTE_TOKEN_INVALIDO');
    } finally { await srv.close(); }
});

test('expirado → 401', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db, { token: { expiraEm: new Date(Date.now() - 1000) } });
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 401);
    } finally { await srv.close(); }
});

test('hash errado / token inventado / formato estranho → 401', async () => {
    const { db, srv } = await subir();
    try {
        cenario(db);
        for (const t of ['cah_ag_' + crypto.randomBytes(32).toString('base64url'), 'cah_ag_', 'cah_ag_' + 'a'.repeat(500)]) {
            const r = await srv.request('GET', '/api/auth/me', { headers: bearer(t) });
            assert.equal(r.status, 401, t.slice(0, 20));
        }
    } finally { await srv.close(); }
});

test('vendedor com agente=false e token válido → 401', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db, { vendedor: { agente: false } });
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 401);
    } finally { await srv.close(); }
});

test('vendedor inativo → 401', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db, { vendedor: { ativo: false } });
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 401);
    } finally { await srv.close(); }
});

test('permissoes.admin = true → token recusado (agente nunca é admin)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db, { vendedor: { permissoes: { admin: true } } });
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer(claro) });
        assert.equal(r.status, 403);
        assert.equal(r.body.codigo, 'AGENTE_ADMIN_PROIBIDO');
    } finally { await srv.close(); }
});

test('token na query string → 400 (sem ecoar o valor)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        for (const q of [`?token=${claro}`, `?access_token=${encodeURIComponent(claro)}`, `?x=1&k=${claro}`]) {
            const r = await srv.request('GET', '/api/auth/me' + q, { headers: bearer(claro) });
            assert.equal(r.status, 400, q);
            assert.equal(r.body.codigo, 'TOKEN_NA_URL');
            assert.ok(!r.texto.includes(claro));
        }
        // e também sem header nenhum
        assert.equal((await srv.request('GET', `/api/auth/me?token=${claro}`)).status, 400);
    } finally { await srv.close(); }
});

test('limite por minuto → 429 com retryAfterSeg', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db, { token: { limitePorMinuto: 3 } });
        for (let i = 0; i < 3; i++) assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer(claro) });
        assert.equal(r.status, 429);
        assert.ok(r.body.retryAfterSeg >= 1 && r.body.retryAfterSeg <= 60);
        assert.ok(r.headers.get('retry-after'));
    } finally { await srv.close(); }
});

test('uso registrado no máximo 1x por minuto por token', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, row } = cenario(db);
        for (let i = 0; i < 5; i++) await srv.request('GET', '/api/auth/me', { headers: bearer(claro) });
        await esperar(50);
        assert.equal(db.updates.length, 1);
        assert.equal(row.totalUsos, 1);
        assert.ok(row.ultimoUsoEm instanceof Date);
    } finally { await srv.close(); }
});

test('allowlist: agente em rotas fora da lista → 403 AGENTE_BLOQUEADO', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const alvos = [
            ['GET', '/api/vendedores'], ['POST', '/api/vendedores'], ['GET', '/api/config'], ['GET', '/api/contas-pagar'],
            ['GET', '/api/admin-exec/qualquer'], ['GET', '/api/agentes'], ['POST', '/api/agentes'], ['POST', '/api/agentes/luke/tokens'],
            ['DELETE', '/api/agentes/luke/tokens/tk-1'], ['GET', '/api/pedidos'],
            ['GET', '/api/auth/midia-token'], ['POST', '/api/auth/me'],
        ];
        for (const [m, u] of alvos) {
            const r = await srv.request(m, u, { headers: bearer(claro), body: m === 'GET' || m === 'DELETE' ? undefined : {} });
            assert.equal(r.status, 403, `${m} ${u} → ${r.status}`);
            assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO', `${m} ${u}`);
        }
        // truques de caminho: o fetch normaliza '..', então manda a linha de requisição CRUA
        const crus = ['/api/agente/v1/../vendedores', '/api/agente/v1/%2e%2e/vendedores', '/api/agente/v1//x', '/api/agente/v1/%2F..%2Fvendedores'];
        for (const u of crus) {
            const r = await crua(srv.baseUrl, u, claro);
            assert.equal(r.status, 403, `${u} → ${r.status} ${r.texto}`);
            assert.match(r.texto, /AGENTE_BLOQUEADO/);
        }
    } finally { await srv.close(); }
});

test('agentePodeAcessar: defesas de caminho', () => {
    const { agentePodeAcessar } = require('../config/agenteAcesso');
    assert.equal(agentePodeAcessar('GET', '/api/auth/me'), true);
    assert.equal(agentePodeAcessar('GET', '/api/auth/me?x=1'), true);
    assert.equal(agentePodeAcessar('GET', '/api/agente/v1/meu-acesso'), true);
    assert.equal(agentePodeAcessar('POST', '/api/agente/v1/meu-acesso'), false);
    for (const u of ['/api/agente/v1/../x', '/api/agente/v1//x', '/api/agente/v1\\x', '/api/agente/v1/%2E%2E/x', '/api/agente/v1/%2f', '/api/agente/v1/%5c', '/api/agente/v1/%00', '/api/vendedores', '/api/agentes', '', undefined]) {
        assert.equal(agentePodeAcessar('GET', u), false, String(u));
    }
});

test('JWT de vendedor-agente → 401 (agente só entra por token)', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'luke', nome: 'Luke', agente: true, permissoes: {} });
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer(jwtDe('luke')) });
        assert.equal(r.status, 401);
    } finally { await srv.close(); }
});

test('login do agente → 401 (mensagem genérica)', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'luke', nome: 'Luke', agente: true, login: 'luke', senha: 'x' });
        const r = await srv.request('POST', '/api/auth/app-login', { body: { login: 'luke', senha: 'qualquer' } });
        assert.equal(r.status, 401);
        assert.match(r.body.error, /credenciais inválidas/i);
    } finally { await srv.close(); }
});

test('regressão: usuário comum e admin (JWT) funcionam como antes; externo continua restrito', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'u1', nome: 'Vend', permissoes: { Pode_Ver_X: true } });
        db.addVendedor({ id: 'adm', nome: 'Adm', permissoes: { admin: true } });
        db.addVendedor({ id: 'ext', nome: 'Contador', permissoes: { Usuario_Externo: true } });
        let r = await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('u1')) });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.id, 'u1');
        assert.deepEqual(r.body.user.permissoes, { Pode_Ver_X: true });
        assert.equal(r.body.user.agente, undefined);
        r = await srv.request('GET', '/api/vendedores', { headers: bearer(jwtDe('adm')) });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.permissoes.admin, true);
        r = await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('ext')) });
        assert.equal(r.status, 403);
        assert.equal(r.body.codigo, 'USUARIO_EXTERNO');
        r = await srv.request('GET', '/api/pedidos', { headers: bearer('lixo') });
        assert.equal(r.status, 401);
        r = await srv.request('GET', '/api/pedidos');
        assert.equal(r.status, 401);
        r = await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('naoexiste')) });
        assert.equal(r.status, 401);
    } finally { await srv.close(); }
});

test('gestão: admin cria agente, gera token (claro uma vez), lista sem segredo, revoga; auditoria sem segredo', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'adm', nome: 'Adm', permissoes: { admin: true } });
        db.addVendedor({ id: 'u1', nome: 'Vend', permissoes: { Pode_Ver_X: true } });
        const H = bearer(jwtDe('adm', { nome: 'Adm' }));

        let r = await srv.request('POST', '/api/agentes', { headers: H, body: { nome: ' Luke ' } });
        assert.equal(r.status, 201);
        const id = r.body.id;
        const v = db.vendedores.get(id);
        assert.equal(v.agente, true); assert.equal(v.acessoExterno, true);
        assert.equal(v.login, null); assert.equal(v.senha, null); assert.deepEqual(v.permissoes, {});
        assert.equal(v.nome, 'Luke');

        r = await srv.request('POST', `/api/agentes/${id}/tokens`, { headers: H, body: { nome: 'prod' } });
        assert.equal(r.status, 201);
        const claro = r.body.token;
        assert.match(claro, /^cah_ag_[A-Za-z0-9_-]{43}$/);
        assert.equal(r.body.prefixo, claro.slice(7, 15));
        assert.equal(r.body.hash, undefined);
        const dias = (new Date(r.body.expiraEm) - Date.now()) / 86400000;
        assert.ok(dias > 89.9 && dias < 90.1);
        assert.equal(r.body.limitePorMinuto, 120);
        const tid = r.body.id;
        assert.equal(db.tokens.get(tid).hash, hash(claro)); // no banco só o hash

        r = await srv.request('GET', '/api/agentes', { headers: H });
        assert.equal(r.status, 200);
        assert.ok(!r.texto.includes(claro));
        assert.ok(!r.texto.includes(hash(claro)));
        assert.ok(!/"hash"|"senha"/.test(r.texto));
        assert.equal(r.body[0].agenteTokens[0].prefixo, claro.slice(7, 15));

        // o token funciona...
        assert.equal((await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) })).status, 200);
        // ...e o agente NÃO consegue gerir agentes
        r = await srv.request('GET', '/api/agentes', { headers: bearer(claro) });
        assert.equal(r.status, 403); assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO');
        r = await srv.request('POST', `/api/agentes/${id}/tokens`, { headers: bearer(claro), body: {} });
        assert.equal(r.status, 403);

        // revoga → 401 imediato
        r = await srv.request('DELETE', `/api/agentes/${id}/tokens/${tid}`, { headers: H });
        assert.equal(r.status, 200); assert.ok(r.body.revogadoEm);
        assert.equal((await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) })).status, 401);
        // revogar de novo é idempotente e não duplica auditoria
        r = await srv.request('DELETE', `/api/agentes/${id}/tokens/${tid}`, { headers: H });
        assert.equal(r.status, 200); assert.equal(r.body.jaRevogado, true);

        const acoes = db.audits.map((a) => a.acao);
        assert.deepEqual(acoes, ['AGENTE_CRIADO', 'AGENTE_TOKEN_CRIADO', 'AGENTE_TOKEN_REVOGADO']);
        const textoAudit = JSON.stringify(db.audits);
        assert.ok(!textoAudit.includes(claro) && !textoAudit.includes(hash(claro)));
        assert.ok(db.audits.every((a) => a.usuarioId === 'adm' && a.usuarioNome === 'Adm'));

        // validações
        assert.equal((await srv.request('POST', '/api/agentes', { headers: H, body: { nome: '  ' } })).status, 400);
        assert.equal((await srv.request('POST', '/api/agentes/naoexiste/tokens', { headers: H, body: {} })).status, 404);
        assert.equal((await srv.request('POST', `/api/agentes/${id}/tokens`, { headers: H, body: { validadeDias: 9999 } })).status, 400);
        // não-agente não vira alvo de token
        assert.equal((await srv.request('POST', '/api/agentes/u1/tokens', { headers: H, body: {} })).status, 404);
    } finally { await srv.close(); }
});

test('gestão: usuário comum (não admin) → 403 em todas as rotas /api/agentes', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'u1', nome: 'Vend', permissoes: { Pode_Ver_X: true } });
        const H = bearer(jwtDe('u1'));
        for (const [m, u] of [['GET', '/api/agentes'], ['POST', '/api/agentes'], ['POST', '/api/agentes/x/tokens'], ['DELETE', '/api/agentes/x/tokens/y']]) {
            assert.equal((await srv.request(m, u, { headers: H, body: m === 'POST' ? {} : undefined })).status, 403, `${m} ${u}`);
        }
        assert.equal((await srv.request('GET', '/api/agentes')).status, 401);
    } finally { await srv.close(); }
});

test('freio de falhas por IP: 30 tokens cah_ag_ inválidos → 429 SEM consultar o banco; JWT e token já em uso não são afetados', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        db.addVendedor({ id: 'u1', nome: 'Vend', permissoes: { Pode_Ver_X: true } });
        // o agente legítimo usa a API uma vez (passa a ser "conhecido")
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
        for (let i = 0; i < 30; i++) {
            const r = await srv.request('GET', '/api/auth/me', { headers: bearer('cah_ag_' + crypto.randomBytes(32).toString('base64url')) });
            assert.equal(r.status, 401, `tentativa ${i + 1}`);
        }
        const antes = db.consultasHash;
        const r = await srv.request('GET', '/api/auth/me', { headers: bearer('cah_ag_' + crypto.randomBytes(32).toString('base64url')) });
        assert.equal(r.status, 429);
        assert.equal(r.body.codigo, 'LIMITE');
        assert.equal(db.consultasHash, antes, 'não pode ir ao banco quando o IP já estourou');
        // JWT de usuário comum, do mesmo IP, segue normal
        assert.equal((await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('u1')) })).status, 200);
        // token válido que já autenticava continua passando (e continua indo ao banco: revogação imediata)
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
        assert.equal(db.consultasHash, antes + 1);
    } finally { await srv.close(); }
});

test('falhas de JWT e de token não-agente não alimentam o freio de IP', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        for (let i = 0; i < 40; i++) await srv.request('GET', '/api/pedidos', { headers: bearer('lixo' + i) });
        for (let i = 0; i < 40; i++) await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('naoexiste')) });
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
    } finally { await srv.close(); }
});

test('cabeçalhos estranhos: bearer minúsculo, Bearer vazio, Bearer cah_ag_ vazio → 401', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        for (const h of [`bearer ${claro}`, 'Bearer', 'Bearer ', 'Bearer cah_ag_', `Bearer  ${claro}`, claro, `Basic ${claro}`]) {
            const r = await srv.request('GET', '/api/auth/me', { headers: { authorization: h } });
            assert.equal(r.status, 401, JSON.stringify(h));
        }
    } finally { await srv.close(); }
});

test('HEAD e OPTIONS com token de agente → 403 AGENTE_BLOQUEADO (allowlist é só GET)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        for (const m of ['HEAD', 'OPTIONS']) {
            const r = await srv.request(m, '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
            assert.equal(r.status, 403, m);
        }
        const o = await srv.request('OPTIONS', '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
        assert.equal(o.body && o.body.codigo, 'AGENTE_BLOQUEADO');
    } finally { await srv.close(); }
});

test('JWT de mídia (tipo: midia) nunca vale como login; token de agente não vale em /uploads protegidos', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'u1', nome: 'Vend', permissoes: {} });
        const r = await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('u1', { tipo: 'midia', uid: 'u1' })) });
        assert.equal(r.status, 401);
        // token de agente não é JWT: jwt.verify (usado pelos portais públicos/uploads) rejeita
        const { claro } = cenario(db);
        assert.throws(() => jwt.verify(claro, JWT_SECRET));
    } finally { await srv.close(); }
});

test('mascararUrlLog: token de agente e mt= nunca vão ao log', () => {
    const { mascararUrlLog } = require('../utils/mascararUrlLog');
    const tok = 'cah_ag_AbC-123_xyzXYZ0123456789abcdefghijklmnopqr';
    const casos = [
        `/api/x?token=${tok}`,
        `/api/x?k=cah%5Fag%5FY${tok.slice(7)}`,
        `/api/x?k=cah%5fag%5fY${tok.slice(7)}`,
        `/api/x?x=CAH_AG_Z${tok.slice(7)}`,
        `/api/x?a=1&b=${encodeURIComponent(tok)}&c=2`,
        `/api/x?k=%63ah_ag_Q${tok.slice(7)}`,
        `/api/${tok}/y`,
        `/api/x?k=%E0%A4%A&t=${tok}`, // % malformado: decodificação falha e mesmo assim mascara
        `/api/x?k=cah%5Fag%5F${tok.slice(7)}%E0%A4%A`,
    ];
    for (const c of casos) {
        const m = mascararUrlLog(c);
        assert.ok(!/cah_ag_[A-Za-z0-9_-]/i.test(m), `vazou: ${m}`);
        assert.ok(/cah_ag_\*\*\*/i.test(m), `sem máscara: ${m}`);
        assert.ok(!m.includes('xyzXYZ'), `vazou resto: ${m}`);
    }
    assert.equal(mascararUrlLog('/uploads/f.png?mt=SEGREDO123&a=1'), '/uploads/f.png?mt=***&a=1');
    assert.equal(mascararUrlLog('/api/pedidos?status=ABERTO'), '/api/pedidos?status=ABERTO');
    assert.equal(mascararUrlLog(undefined), '');
});

test('mascararUrlLog: dupla codificação, %zz + %63ah_ag_, m%74=, sem quebra de linha forjada, nunca lança', () => {
    const { mascararUrlLog } = require('../utils/mascararUrlLog');
    const resto = 'SEGREDOxyz0123456789abcdefghijklmnopqrstuvw';
    const vazou = (m) => /cah_ag_[A-Za-z0-9_-]/i.test(m) || m.includes('SEGREDOxyz');
    for (const c of [
        `/a?t=cah%255Fag%255F${resto}`,                 // dupla codificação
        `/a?t=cah%25255Fag%25255F${resto}`,             // tripla
        `/a?x=%zz&t=%63ah_ag_${resto}`,                 // %zz derruba decodeURIComponent: cai no tolerante
        `/a?x=%E0%A4%A&t=%63ah%5Fag%5F${resto}`,
        `/a?t=%43AH_AG_${resto}`,
    ]) {
        const m = mascararUrlLog(c);
        assert.ok(!vazou(m), `vazou: ${m}`);
        assert.ok(m.includes('cah_ag_***'), `sem máscara: ${m}`);
    }
    // `m%74=` (mt codificado) e mt duplamente codificado
    assert.equal(mascararUrlLog('/a?m%74=SEGREDO'), '/a?mt=***');
    assert.equal(mascararUrlLog('/a?b=1&m%2574=SEGREDO'), '/a?b=1&mt=***');
    assert.equal(mascararUrlLog('/a?MT=SEGREDO'), '/a?MT=***');
    // log injection: nenhum caractere de controle sobrevive
    for (const c of ['/a?t=cah_%0Aag_ABC', '/a?t=x%0d%0a[2026] GET /falso', '/a?t=%00%1b[31m', '/a\r\nGET /x']) {
        const m = mascararUrlLog(c);
        assert.ok(!/[\r\n\u0000-\u001f\u007f]/.test(m), JSON.stringify(m));
    }
    assert.equal(mascararUrlLog('/a?t=x%0Ay'), '/a?t=x?y');
    assert.equal(mascararUrlLog('/a?t=cah_%0Aag_SEGREDOc'), '/a?t=cah_ag_***');
    // nunca lança
    for (const v of [undefined, null, '', 0, {}, [], '%', '%%%', '%E0%A4%A', 'x'.repeat(40 * 1024), '%25'.repeat(20000)]) {
        assert.doesNotThrow(() => mascararUrlLog(v), String(v).slice(0, 20));
        assert.equal(typeof mascararUrlLog(v), 'string');
    }
    assert.ok(mascararUrlLog('x'.repeat(40 * 1024)).length <= 2001);
    // URL normal fica igual
    assert.equal(mascararUrlLog('/api/pedidos?status=ABERTO&q=a%20b'), '/api/pedidos?status=ABERTO&q=a b');
});

test('token na URL com dupla codificação ou %zz antes → 400 TOKEN_NA_URL', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const resto = claro.slice(7);
        for (const q of [`?t=cah%255Fag%255F${resto}`, `?x=%zz&t=%63ah_ag_${resto}`, `?x=%E0%A4%A&t=CAH%5FAG%5F${resto}`]) {
            const r = await srv.request('GET', '/api/auth/me' + q, { headers: bearer(claro) });
            assert.equal(r.status, 400, q);
            assert.equal(r.body.codigo, 'TOKEN_NA_URL');
            assert.ok(!r.texto.includes(resto));
        }
        // consulta normal com % malformado e sem token continua passando
        assert.equal((await srv.request('GET', '/api/auth/me?x=%zz', { headers: bearer(claro) })).status, 200);
    } finally { await srv.close(); }
});
