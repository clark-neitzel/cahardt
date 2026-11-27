// Fila de SOLICITAÇÕES do agente (PR-B): PEDE -> 202 (NÃO executa) -> dono autoriza/recusa -> execução por loopback com ticket.
// Usa o authMiddleware, o agenteRoutes e o agenteApiV1Routes VERDADEIROS; as rotas de negócio são stubs com contador
// (para provar que a rota roda UMA vez, ou nenhuma). Prisma é mock em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');
const { modeloSolicitacoes, transacaoSolicitacoes } = require('./helpers/memSolicitacoes');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['middlewares/authMiddleware.js', 'services/agenteTokenService.js', 'routes/agenteRoutes.js', 'routes/agenteApiV1Routes.js',
    'config/agenteAcesso.js', 'services/agentePoliticaService.js', 'services/agenteAuditoriaService.js', 'services/agenteCatalogoRotas.js',
    'config/agentePoliticaPadrao.js', 'utils/agenteContexto.js', 'services/agenteSolicitacaoService.js', 'config/agenteAntes.js', 'config/agenteTelas.js'];
const JWT_SECRET = process.env.JWT_SECRET;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const UUID = '3f2b8a1c-9d4e-4b7a-8c11-5e6f7a8b9c0d';
const UUID2 = '4a2b8a1c-9d4e-4b7a-8c11-5e6f7a8b9c0e';

function memoria() {
    const vendedores = new Map(); const tokens = new Map(); const audits = []; const politicas = []; const contas = new Map();
    const db = {
        vendedores, tokens, audits, politicas, contas, solicitacoes: [],
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, maxDescontoFlex: 100, login: null, senha: null, ...v }); },
        addToken(t) { const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, expiraEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, limitePorMinuto: 100000, criadoEm: new Date(), criadoPorId: 'adm', nome: 't', ...t }; tokens.set(row.id, row); return row; },
    };
    const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };
    const solModelo = modeloSolicitacoes(db);
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findMany: async ({ where, select }) => [...vendedores.values()].filter((v) => v.agente === where.agente).map((v) => pick(v, select)),
        },
        agenteToken: {
            findUnique: async ({ where, include, select }) => {
                if (where.id) { const t = tokens.get(where.id); return t ? (select ? pick(t, select) : { ...t }) : null; }
                const t = [...tokens.values()].find((x) => x.hash === where.hash);
                if (!t) return null;
                return { ...t, vendedor: vendedores.get(t.vendedorId) ? pick(vendedores.get(t.vendedorId), include.vendedor.select) : null };
            },
            update: async ({ where, data, select }) => { const t = tokens.get(where.id); if (data.totalUsos?.increment) { t.totalUsos += data.totalUsos.increment; delete data.totalUsos; } Object.assign(t, data); return select ? pick(t, select) : t; },
            create: async ({ data, select }) => { const row = db.addToken({ ...data }); return select ? pick(row, select) : row; },
            findFirst: async ({ where, select }) => { const t = [...tokens.values()].find((x) => x.id === where.id && x.vendedorId === where.vendedorId); return t ? pick(t, select) : null; },
            findMany: async ({ where, select }) => [...tokens.values()].filter((x) => x.vendedorId === where.vendedorId).map((t) => pick(t, select)),
        },
        agentePolitica: { findMany: async ({ where }) => politicas.filter((p) => p.vendedorId === where.vendedorId).map((p) => ({ ...p })) },
        auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
        agenteSolicitacao: solModelo,
        $transaction: transacaoSolicitacoes(solModelo),
        contaPagar: { findUnique: async ({ where, select }) => { const c = contas.get(where.id); return c ? pick(c, select) : null; } },
        parcelaPagar: { findUnique: async () => null },
    });
    return { db, prisma };
}

// ───────── app: authMiddleware + routers REAIS da fila; rotas de negócio = stubs com contador ─────────
async function subir() {
    const { db, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    const authMiddleware = require('../middlewares/authMiddleware');
    const agenteRoutes = require('../routes/agenteRoutes');
    const agenteApi = require('../routes/agenteApiV1Routes');
    const politicaSvc = require('../services/agentePoliticaService');
    const solSvc = require('../services/agenteSolicitacaoService');
    const { assertNaoAgente } = require('../utils/agenteContexto');
    restaurar();

    const espia = { execucoes: 0, chamadas: [], tickets: [], snaps: [], falhaProxima: false, segurar: null };
    const app = express();
    app.use(express.json({ limit: '1mb' }));
    const cp = express.Router();
    cp.post('/', authMiddleware, async (req, res) => {
        espia.execucoes += 1;
        espia.chamadas.push({ rota: 'POST /', user: req.user.id, nome: req.user.nome, agente: req.user.agente === true, sol: req.user.agenteSolicitacaoId || null, idem: req.headers['idempotency-key'], hdrSol: req.headers['x-agente-solicitacao'], auth: req.headers.authorization, body: req.body });
        if (req.headers.authorization) espia.tickets.push(req.headers.authorization.split(' ')[1]);
        if (espia.segurar) await espia.segurar;
        const id = `conta-${espia.execucoes}`;
        db.contas.set(id, { id, status: 'ABERTO', valorTotal: 10, descricao: req.body && req.body.descricao, atualizadoEm: new Date(), criadoPorId: req.user.id });
        res.status(201).json({ id, numero: espia.execucoes, conta: { id, fornecedorId: 'f1', parcelas: [{ id: 'p1' }] }, criadoPor: req.user.id });
    });
    cp.post('/dupla', authMiddleware, authMiddleware, (req, res) => { // montada DUAS vezes: o ticket de uso único não pode falhar no 2º authMiddleware
        espia.execucoes += 1;
        res.json({ id: 'dupla-ok', quem: req.user.id, sol: req.user.agenteSolicitacaoId || null });
    });
    cp.post('/queda', authMiddleware, (req, res) => {
        espia.execucoes += 1;
        const row = db.solicitacoes.find((x) => x.id === req.headers['x-agente-solicitacao']);
        espia.snaps.push(row ? { resultado: row.resultado, ids: row.idsResultado, rs: row.resultadoStatus, repetidoPorNome: row.repetidoPorNome } : null);
        espia.chamadas.push({ rota: 'queda', idem: req.headers['idempotency-key'], auth: req.headers.authorization });
        if (espia.falhaProxima) { espia.falhaProxima = false; req.socket.destroy(); return; }
        res.json({ id: 'ok-depois' });
    });
    cp.post('/perm', authMiddleware, (req, res) => {
        espia.execucoes += 1;
        if (!req.user.permissoes.Pode_Baixar_Contas_Pagar) return res.status(403).json({ error: 'Sem permissão para alterar contas a pagar.' });
        res.json({ id: 'ok' });
    });
    cp.post('/explode', authMiddleware, (req, res) => { espia.execucoes += 1; res.status(500).json({ error: 'Erro ao criar conta a pagar.' }); });
    cp.post('/grande', authMiddleware, (req, res) => { espia.execucoes += 1; res.json({ id: 'g1', lixo: Array.from({ length: 300 }, (_, i) => `item-${i}-${'x'.repeat(90)}`) }); });
    cp.post('/:id/cancelar', authMiddleware, (req, res) => {
        espia.execucoes += 1;
        const c = db.contas.get(req.params.id);
        if (!c) return res.status(404).json({ error: 'Conta não encontrada.' });
        c.status = 'CANCELADO'; res.json({ ok: true, id: c.id });
    });
    app.use('/api/contas-pagar', cp);
    const ped = express.Router();
    ped.post('/zap', authMiddleware, (req, res) => {
        espia.execucoes += 1;
        try { assertNaoAgente('WHATSAPP'); res.json({ id: 'enviou' }); } catch (e) { res.status(e.status || 500).json({ error: e.message, codigo: e.codigo }); }
    });
    app.use('/api/pedidos', ped);
    const prod = express.Router();
    prod.get('/', authMiddleware, (req, res) => { espia.execucoes += 1; res.json({ id: 'lista', itens: [] }); });
    app.use('/api/produtos', prod);
    const vend = express.Router();
    vend.post('/', authMiddleware, (req, res) => { espia.execucoes += 1; res.json({ id: 'v' }); });
    app.use('/api/vendedores', vend);
    app.use('/api/agentes', agenteRoutes);
    app.use('/api/agente/v1', authMiddleware, agenteApi);
    app.use((err, req, res, _n) => { console.error('erro-teste', err && err.message); res.status(500).json({ error: 'erro' }); });
    const srv = await startTestServer(app);
    return { db, srv, espia, politicaSvc, solSvc, app };
}

const jwtDe = (id, nome = 'x') => jwt.sign({ id, nome }, JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

function cenario(db, { permissoes = { Pode_Baixar_Contas_Pagar: true }, extra = {} } = {}) {
    const claro = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true, acessoExterno: true, permissoes, ...extra });
    db.addToken({ vendedorId: 'luke', hash: hash(claro), prefixo: claro.slice(7, 15) });
    db.addVendedor({ id: 'adm', nome: 'Dono', permissoes: { admin: true } });
    db.addVendedor({ id: 'vend', nome: 'Vendedor', permissoes: { Pode_Ver_X: true } });
    return { claro, H: bearer(claro), A: bearer(jwtDe('adm', 'Dono')), V: bearer(jwtDe('vend')) };
}

async function pedir(srv, H, caminho = '/api/contas-pagar', body = { descricao: 'Conta do Luke', valor: 10 }, metodo = 'POST') {
    return srv.request(metodo, caminho, { headers: H, body });
}

// ───────────────────────── criação ─────────────────────────
test('PEDE: responde 202, guarda a solicitação e a rota NÃO executa (nada criado)', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H } = cenario(db);
        const r = await pedir(srv, H);
        assert.equal(r.status, 202, r.texto);
        assert.equal(r.body.codigo, 'AGENTE_PEDE_AUTORIZACAO'); assert.equal(r.body.status, 'PENDENTE'); assert.equal(r.body.duplicada, false);
        assert.equal(typeof r.body.solicitacaoId, 'string'); assert.equal(r.body.consulta, `/api/agente/v1/solicitacoes/${r.body.solicitacaoId}`);
        assert.ok(r.body.expiraEm); assert.match(r.body.resumo, /Criar conta a pagar/); assert.match(r.body.resumo, /Conta do Luke/); assert.ok(r.body.orientacao);
        assert.equal(espia.execucoes, 0, 'a rota executou');
        assert.equal(db.contas.size, 0);
        assert.equal(db.solicitacoes.length, 1);
        const s = db.solicitacoes[0];
        assert.equal(s.status, 'PENDENTE'); assert.equal(s.metodo, 'POST'); assert.equal(s.caminho, '/api/contas-pagar'); assert.equal(s.chave, 'POST /api/contas-pagar');
        assert.deepEqual(s.body, { descricao: 'Conta do Luke', valor: 10 }); assert.equal(s.agenteNome, 'Luke (agente)'); assert.equal(s.idempotencyKey, `sol-${s.id}`);
        assert.ok(Math.abs(s.expiraEm.getTime() - Date.now() - 72 * 3600 * 1000) < 5000, 'expira em 72 h');
        await new Promise((x) => setTimeout(x, 30));
        const acoes = db.audits.map((a) => a.acao);
        assert.ok(acoes.includes('AGENTE_SOLICITACAO_CRIADA')); assert.ok(acoes.includes('AGENTE_REQUISICAO'));
    } finally { await srv.close(); }
});

test('pedido idêntico PENDENTE devolve a mesma solicitação com duplicada:true; corpo diferente cria outra', async () => {
    const { db, srv } = await subir();
    try {
        const { H } = cenario(db);
        const a = await pedir(srv, H); const b = await pedir(srv, H, undefined, { valor: 10, descricao: 'Conta do Luke' }); // ordem das chaves não muda o hash
        assert.equal(b.status, 202); assert.equal(b.body.duplicada, true); assert.equal(b.body.solicitacaoId, a.body.solicitacaoId);
        assert.equal(db.solicitacoes.length, 1);
        const c = await pedir(srv, H, undefined, { descricao: 'Outra' });
        assert.equal(c.body.duplicada, false); assert.notEqual(c.body.solicitacaoId, a.body.solicitacaoId); assert.equal(db.solicitacoes.length, 2);
    } finally { await srv.close(); }
});

test('multipart, corpo > 100 KB, token no corpo e corpo não-JSON → 422 AGENTE_SOLICITACAO_INVALIDA (nada guardado, nada executado)', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, claro } = cenario(db);
        const mp = await srv.request('POST', '/api/contas-pagar', { headers: { ...H, 'Content-Type': 'multipart/form-data; boundary=x' }, body: undefined });
        assert.equal(mp.status, 422); assert.equal(mp.body.codigo, 'AGENTE_SOLICITACAO_INVALIDA'); assert.match(mp.body.error, /multipart/);
        const grande = await pedir(srv, H, undefined, { descricao: 'x'.repeat(110 * 1024) });
        assert.equal(grande.status, 422); assert.equal(grande.body.codigo, 'AGENTE_SOLICITACAO_INVALIDA'); assert.match(grande.body.error, /100 KB/);
        const comToken = await pedir(srv, H, undefined, { descricao: `oi ${claro}` });
        assert.equal(comToken.status, 422); assert.ok(!comToken.texto.includes(claro));
        const texto = await srv.request('POST', '/api/contas-pagar', { headers: { ...H, 'Content-Type': 'text/plain' }, body: 'texto solto' });
        assert.equal(texto.status, 422, texto.texto);
        assert.equal(db.solicitacoes.length, 0); assert.equal(espia.execucoes, 0);
    } finally { await srv.close(); }
});

test('teto de 200 PENDENTES por agente → 429 AGENTE_SOLICITACOES_EXCESSO', async () => {
    const { db, srv } = await subir();
    try {
        const { H } = cenario(db);
        const agora = Date.now();
        for (let i = 0; i < 200; i++) db.solicitacoes.push({ id: `x${i}`, agenteId: 'luke', status: 'PENDENTE', expiraEm: new Date(agora + 3600000), chave: 'POST /api/contas-pagar', caminho: '/api/contas-pagar', query: '', corpoHash: `h${i}`, createdAt: new Date() });
        const r = await pedir(srv, H, undefined, { descricao: 'a mais' });
        assert.equal(r.status, 429); assert.equal(r.body.codigo, 'AGENTE_SOLICITACOES_EXCESSO');
        assert.equal(db.solicitacoes.length, 200);
    } finally { await srv.close(); }
});

// ───────────────────────── autorizar ─────────────────────────
test('AUTORIZAR executa a rota UMA vez COMO o agente; duplo clique → 409; resultado e ids guardados; rota diz Luke (agente)', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        const p = await pedir(srv, H);
        const id = p.body.solicitacaoId;
        const [r1, r2] = await Promise.all([
            srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} }),
            srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} }),
        ]);
        const oks = [r1, r2].filter((r) => r.status === 200); const dups = [r1, r2].filter((r) => r.status === 409);
        assert.equal(oks.length, 1, `${r1.texto} | ${r2.texto}`); assert.equal(dups.length, 1); assert.equal(dups[0].body.codigo, 'SOLICITACAO_JA_DECIDIDA');
        assert.equal(espia.execucoes, 1, 'a rota rodou mais de uma vez');
        const ex = espia.chamadas[0];
        assert.equal(ex.user, 'luke'); assert.equal(ex.nome, 'Luke (agente)'); assert.equal(ex.agente, true); assert.equal(ex.sol, id);
        assert.equal(ex.idem, `sol-${id}`); assert.equal(ex.hdrSol, id); assert.deepEqual(ex.body, { descricao: 'Conta do Luke', valor: 10 });
        assert.equal(db.contas.get('conta-1').criadoPorId, 'luke');
        const item = oks[0].body;
        assert.equal(item.status, 'AUTORIZADA'); assert.equal(item.resultadoStatus, 201); assert.equal(item.decididoPorNome, 'Dono');
        assert.equal(item.resultado.id, 'conta-1'); assert.equal(item.idsResultado.id, 'conta-1'); assert.equal(item.idsResultado.numero, 1); assert.equal(item.idsResultado['conta.id'], 'conta-1');
        assert.equal(item.telaDestino.rota, '/contas-pagar'); assert.equal(item.rotulo, 'Criar conta a pagar');
        // repetir o autorizar depois → 409; o agente enxerga o resultado
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} })).status, 409);
        const lido = await srv.request('GET', `/api/agente/v1/solicitacoes/${id}`, { headers: H });
        assert.equal(lido.status, 200); assert.equal(lido.body.status, 'AUTORIZADA'); assert.equal(lido.body.idsResultado.id, 'conta-1'); assert.equal(lido.body.decididoPorNome, 'Dono'); assert.equal(lido.body.resultadoStatus, 201);
        const s = db.solicitacoes[0]; assert.equal(s.execHash, null);
        assert.equal(espia.execucoes, 1);
        const acoes = db.audits.map((a) => a.acao);
        assert.ok(acoes.includes('AGENTE_SOLICITACAO_DECIDIDA')); assert.ok(acoes.includes('AGENTE_SOLICITACAO_EXECUTADA'));
    } finally { await srv.close(); }
});

test('TICKET: uso único, só para o método+caminho+query guardados, expira em 2 min, só de loopback', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        // solicitação executada de verdade -> o ticket real que a rota recebeu NÃO serve de novo
        const p = await pedir(srv, H);
        const ok = await srv.request('POST', `/api/agentes/solicitacoes/${p.body.solicitacaoId}/autorizar`, { headers: A, body: {} });
        assert.equal(ok.status, 200);
        const ticketUsado = espia.tickets[0];
        assert.match(ticketUsado, /^cah_ag_exec_/);
        const reuso = await srv.request('POST', '/api/contas-pagar', { headers: bearer(ticketUsado), body: { descricao: 'Conta do Luke', valor: 10 } });
        assert.equal(reuso.status, 401); assert.equal(reuso.body.codigo, 'AGENTE_TICKET_INVALIDO');
        assert.equal(espia.execucoes, 1);
        // ticket "vivo" montado à mão: outro caminho / outro método → 401 e NÃO consome; o caminho certo passa uma vez
        const ticket = `cah_ag_exec_${crypto.randomBytes(32).toString('base64url')}`;
        db.solicitacoes.push({ id: 'sol-x', agenteId: 'luke', agenteNome: 'Luke (agente)', metodo: 'POST', caminho: '/api/contas-pagar', query: 'a=1', chave: 'POST /api/contas-pagar', status: 'EXECUTANDO', execHash: hash(ticket), execComecouEm: new Date(), body: {}, createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        const T = bearer(ticket);
        assert.equal((await srv.request('POST', '/api/pedidos/zap?a=1', { headers: T, body: {} })).status, 401); // outro caminho
        assert.equal((await srv.request('POST', '/api/contas-pagar', { headers: T, body: {} })).status, 401);      // sem a query guardada
        assert.equal((await srv.request('POST', '/api/contas-pagar/queda?a=1', { headers: T, body: {} })).status, 401);
        assert.equal(db.solicitacoes.find((s) => s.id === 'sol-x').execHash, hash(ticket), 'tentativa errada não pode consumir o ticket');
        assert.equal((await srv.request('POST', '/api/contas-pagar?a=1', { headers: T, body: { descricao: 'z' } })).status, 201);
        assert.equal((await srv.request('POST', '/api/contas-pagar?a=1', { headers: T, body: { descricao: 'z' } })).status, 401); // 2º uso
        assert.equal(db.solicitacoes.find((s) => s.id === 'sol-x').execHash, null);
        // ticket expirado (emitido há 3 min) → 401
        const velho = `cah_ag_exec_${crypto.randomBytes(32).toString('base64url')}`;
        db.solicitacoes.push({ id: 'sol-y', agenteId: 'luke', metodo: 'POST', caminho: '/api/contas-pagar', query: '', chave: 'POST /api/contas-pagar', status: 'EXECUTANDO', execHash: hash(velho), execComecouEm: new Date(Date.now() - 3 * 60 * 1000), createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        const antes = espia.execucoes;
        assert.equal((await srv.request('POST', '/api/contas-pagar', { headers: bearer(velho), body: {} })).status, 401);
        // solicitação que já não está EXECUTANDO (ex.: recusada) → 401
        const rec = `cah_ag_exec_${crypto.randomBytes(32).toString('base64url')}`;
        db.solicitacoes.push({ id: 'sol-z', agenteId: 'luke', metodo: 'POST', caminho: '/api/contas-pagar', query: '', chave: 'POST /api/contas-pagar', status: 'RECUSADA', execHash: hash(rec), execComecouEm: new Date(), createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        assert.equal((await srv.request('POST', '/api/contas-pagar', { headers: bearer(rec), body: {} })).status, 401);
        assert.equal(espia.execucoes, antes);
        // lixo com o prefixo do ticket
        assert.equal((await srv.request('POST', '/api/contas-pagar', { headers: bearer('cah_ag_exec_lixo'), body: {} })).status, 401);
        // não-loopback nunca vale (unidade)
        assert.equal(require('../services/agenteSolicitacaoService').ehLoopback({ socket: { remoteAddress: '172.18.0.5' } }), false);
        assert.equal(require('../services/agenteSolicitacaoService').ehLoopback({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
    } finally { await srv.close(); }
});

test('ticket NÃO passa por bloqueio fixo: solicitação guardada para /api/vendedores → 403 AGENTE_BLOQUEADO', async () => {
    const { db, srv, espia } = await subir();
    try {
        cenario(db);
        const ticket = `cah_ag_exec_${crypto.randomBytes(32).toString('base64url')}`;
        db.solicitacoes.push({ id: 'sol-v', agenteId: 'luke', metodo: 'POST', caminho: '/api/vendedores', query: '', chave: 'POST /api/vendedores', status: 'EXECUTANDO', execHash: hash(ticket), execComecouEm: new Date(), body: {}, createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        const r = await srv.request('POST', '/api/vendedores', { headers: bearer(ticket), body: {} });
        assert.equal(r.status, 403); assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO'); assert.equal(r.body.fixo, true);
        assert.equal(espia.execucoes, 0);
    } finally { await srv.close(); }
});

test('RECUSAR não executa; observacao > 500 → 400; recusada não pode ser autorizada', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H)).body.solicitacaoId;
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/recusar`, { headers: A, body: { observacao: 'x'.repeat(501) } })).status, 400);
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/recusar`, { headers: A, body: { observacao: 'não é para pagar' } });
        assert.equal(r.status, 200); assert.equal(r.body.status, 'RECUSADA'); assert.equal(r.body.decididoPorNome, 'Dono'); assert.equal(r.body.observacaoDecisao, 'não é para pagar');
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} })).status, 409);
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/recusar`, { headers: A, body: {} })).status, 409);
        assert.equal(espia.execucoes, 0); assert.equal(db.contas.size, 0);
        const ag = await srv.request('GET', `/api/agente/v1/solicitacoes/${id}`, { headers: H });
        assert.equal(ag.body.status, 'RECUSADA'); assert.equal(ag.body.observacaoDecisao, 'não é para pagar');
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_SOLICITACAO_DECIDIDA' && JSON.parse(a.detalhes).decisao === 'RECUSAR'));
    } finally { await srv.close(); }
});

test('solicitação EXPIRADA (72 h) não executa; leitura e varredura expiram; EXECUTANDO esquecida vira ERRO_INDETERMINADO', async () => {
    const { db, srv, espia, solSvc } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H)).body.solicitacaoId;
        db.solicitacoes[0].expiraEm = new Date(Date.now() - 1000);
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 409); assert.equal(espia.execucoes, 0);
        assert.equal(db.solicitacoes[0].status, 'EXPIRADA');
        const lido = await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A });
        assert.equal(lido.body.status, 'EXPIRADA');
        // varredura
        db.solicitacoes.push({ id: 'p-velha', agenteId: 'luke', status: 'PENDENTE', expiraEm: new Date(Date.now() - 5000), createdAt: new Date() });
        db.solicitacoes.push({ id: 'e-presa', agenteId: 'luke', status: 'EXECUTANDO', execHash: 'h', execComecouEm: new Date(Date.now() - 6 * 60 * 1000), createdAt: new Date() });
        db.solicitacoes.push({ id: 'e-viva', agenteId: 'luke', status: 'EXECUTANDO', execHash: 'h2', execComecouEm: new Date(Date.now() - 60 * 1000), createdAt: new Date() });
        const v = await solSvc.varredura();
        assert.equal(v.expiradas, 1); assert.equal(v.indeterminadas, 1);
        const por = Object.fromEntries(db.solicitacoes.map((s) => [s.id, s.status]));
        assert.equal(por['p-velha'], 'EXPIRADA'); assert.equal(por['e-presa'], 'ERRO_INDETERMINADO'); assert.equal(por['e-viva'], 'EXECUTANDO');
        assert.equal(db.solicitacoes.find((s) => s.id === 'e-presa').execHash, null);
        assert.equal(espia.execucoes, 0);
    } finally { await srv.close(); }
});

test('política virou BLOQUEADA depois do pedido → não executa; solicitação RECUSADA automaticamente', async () => {
    const { db, srv, espia, politicaSvc } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H)).body.solicitacaoId;
        db.politicas.push({ id: 'pol-1', vendedorId: 'luke', escopo: 'FUNCAO', chave: 'POST /api/contas-pagar', nivel: 'BLOQUEADO', atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date() });
        politicaSvc.invalidar('luke');
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 409); assert.equal(r.body.codigo, 'AGENTE_POLITICA_BLOQUEADA');
        assert.equal(db.solicitacoes[0].status, 'RECUSADA'); assert.equal(espia.execucoes, 0);
    } finally { await srv.close(); }
});

test('permissão do vendedor-agente negada: a ROTA decide (403) → solicitação ERRO com a mensagem; agente corrige e pede de novo', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db, { permissoes: {} });
        const id = (await pedir(srv, H, '/api/contas-pagar/perm', { x: 1 })).body.solicitacaoId;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 200); assert.equal(r.body.status, 'ERRO'); assert.equal(r.body.resultadoStatus, 403);
        assert.match(r.body.mensagemErro, /Sem permissão/); assert.equal(espia.execucoes, 1);
        const ag = await srv.request('GET', `/api/agente/v1/solicitacoes/${id}`, { headers: H });
        assert.equal(ag.body.status, 'ERRO'); assert.match(ag.body.resultado.error, /Sem permissão/);
        // ERRO não é repetível pelo dono (só ERRO_INDETERMINADO)
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: {} })).status, 409);
    } finally { await srv.close(); }
});

test('assertNaoAgente continua valendo na execução: WhatsApp dentro da rota recusa (ERRO 403 AGENTE_ACAO_PROIBIDA)', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H, '/api/pedidos/zap', { texto: 'oi' })).body.solicitacaoId;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 200); assert.equal(r.body.status, 'ERRO'); assert.equal(r.body.resultadoStatus, 403); assert.equal(r.body.resultado.codigo, 'AGENTE_ACAO_PROIBIDA');
    } finally { await srv.close(); }
});

test('"antes": mudou desde o pedido exige confirmarMudanca; sem mudança não exige', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        db.contas.set(UUID, { id: UUID, status: 'ABERTO', valorTotal: 50, descricao: 'Luz', atualizadoEm: new Date('2026-11-01T10:00:00Z') });
        const id = (await pedir(srv, H, `/api/contas-pagar/${UUID}/cancelar`, { motivo: 'duplicada' })).body.solicitacaoId;
        const s = db.solicitacoes[0];
        assert.equal(s.antes.status, 'ABERTO'); assert.equal(s.antes.valor, 50);
        let it = await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A });
        assert.equal(it.body.mudouDesdePedido, false); assert.equal(it.body.antes.status, 'ABERTO');
        // alguém mexeu na conta
        db.contas.get(UUID).valorTotal = 75; db.contas.get(UUID).atualizadoEm = new Date('2026-11-02T10:00:00Z');
        it = await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A });
        assert.equal(it.body.mudouDesdePedido, true); assert.equal(it.body.agora.valor, 75);
        const lista = await srv.request('GET', '/api/agentes/solicitacoes?status=PENDENTE', { headers: A });
        assert.equal(lista.body.data[0].mudouDesdePedido, true);
        const sem = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(sem.status, 409); assert.equal(sem.body.mudouDesdePedido, true); assert.equal(sem.body.antes.valor, 50); assert.equal(sem.body.depois.valor, 75);
        assert.equal(espia.execucoes, 0); assert.equal(db.solicitacoes[0].status, 'PENDENTE', 'continua pendente para o dono decidir');
        const com = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: { confirmarMudanca: true } });
        assert.equal(com.status, 200); assert.equal(com.body.status, 'AUTORIZADA'); assert.equal(espia.execucoes, 1); assert.equal(db.contas.get(UUID).status, 'CANCELADO');
    } finally { await srv.close(); }
});

test('queda no meio → ERRO_INDETERMINADO; REPETIR exige ≥ 5 min + confirmarRepeticao; mesma Idempotency-Key, ticket novo, resultado limpo, quem repetiu registrado', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A, V } = cenario(db);
        const id = (await pedir(srv, H, '/api/contas-pagar/queda', { n: 1 })).body.solicitacaoId;
        espia.falhaProxima = true;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 200, r.texto); assert.equal(r.body.status, 'ERRO_INDETERMINADO'); assert.match(r.body.mensagemErro, /indeterminado/i);
        assert.equal(espia.execucoes, 1);
        assert.equal(r.body.repetirLiberaEm, new Date(db.solicitacoes[0].execComecouEm.getTime() + 5 * 60 * 1000).toISOString(), 'repetirLiberaEm = início + 5 min');
        assert.equal((await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A })).body.repetirLiberaEm, r.body.repetirLiberaEm);
        assert.equal((await srv.request('GET', '/api/agentes/solicitacoes?status=ERRO_INDETERMINADO', { headers: A })).body.data[0].repetirLiberaEm, r.body.repetirLiberaEm);
        await new Promise((x) => setTimeout(x, 100));
        assert.equal(espia.execucoes, 1, 'não pode reexecutar sozinho');
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: V, body: { confirmarRepeticao: true } })).status, 403);
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: H, body: { confirmarRepeticao: true } })).status, 403);
        // cedo demais (a 1ª execução pode ainda estar rodando): mesmo confirmando
        const cedo = await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: { confirmarRepeticao: true } });
        assert.equal(cedo.status, 409); assert.equal(cedo.body.codigo, 'REPETIR_MUITO_CEDO'); assert.match(cedo.body.aviso, /Idempotency-Key/); assert.match(cedo.body.aviso, /duplicar/);
        const liberaEm = new Date(cedo.body.liberaEm).getTime();
        assert.ok(Math.abs(liberaEm - (db.solicitacoes[0].execComecouEm.getTime() + 5 * 60 * 1000)) < 1000, 'liberaEm = início + 5 min');
        assert.equal(espia.execucoes, 1);
        // passou o prazo, mas sem confirmar
        db.solicitacoes[0].execComecouEm = new Date(Date.now() - 6 * 60 * 1000);
        db.solicitacoes[0].resultado = { error: 'resto da tentativa anterior' }; db.solicitacoes[0].idsResultado = { id: 'velho' }; db.solicitacoes[0].resultadoStatus = 500;
        const sem = await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: {} });
        assert.equal(sem.status, 409); assert.equal(sem.body.codigo, 'CONFIRMAR_REPETICAO'); assert.match(sem.body.aviso, /duplicar/);
        assert.deepEqual(sem.body.destino, { rota: '/contas-pagar', rotulo: 'Contas a Pagar' }); assert.ok('antes' in sem.body);
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: { confirmarRepeticao: 'true' } })).status, 409, 'só o booleano true vale');
        assert.equal(espia.execucoes, 1);
        const rep = await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: { confirmarRepeticao: true } });
        assert.equal(rep.status, 200, rep.texto); assert.equal(rep.body.status, 'AUTORIZADA'); assert.equal(rep.body.idsResultado.id, 'ok-depois');
        assert.equal(rep.body.repetidoPorNome, 'Dono'); assert.ok(rep.body.repetidoEm); assert.equal(rep.body.decididoPorNome, 'Dono');
        assert.equal(espia.execucoes, 2);
        assert.deepEqual(espia.snaps[1], { resultado: null, ids: null, rs: null, repetidoPorNome: 'Dono' }, 'resultado/ids/status da tentativa anterior limpos ao reivindicar');
        assert.equal(espia.chamadas[0].idem, `sol-${id}`); assert.equal(espia.chamadas[1].idem, `sol-${id}`);
        assert.notEqual(espia.chamadas[0].auth, espia.chamadas[1].auth, 'ticket novo');
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id}/repetir`, { headers: A, body: { confirmarRepeticao: true } })).status, 409); // já AUTORIZADA
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_SOLICITACAO_DECIDIDA' && JSON.parse(a.detalhes).decisao === 'REPETIR' && JSON.parse(a.detalhes).repetidoPor === 'Dono'));
        const dec = JSON.parse(db.audits.find((a) => a.acao === 'AGENTE_SOLICITACAO_DECIDIDA' && JSON.parse(a.detalhes).decisao === 'REPETIR').detalhes);
        assert.equal(dec.mensagemAnterior, 'resto da tentativa anterior', 'a auditoria guarda o texto da tentativa indeterminada');
        assert.equal(rep.body.repetirLiberaEm, null, 'fora de ERRO_INDETERMINADO é null');
    } finally { await srv.close(); }
});

test('GET em PEDE (override do dono) também é guardado e, autorizado, executa o GET', async () => {
    const { db, srv, espia, politicaSvc } = await subir();
    try {
        const { H, A } = cenario(db);
        db.politicas.push({ id: 'pol-2', vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'PEDE', atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date() });
        politicaSvc.invalidar('luke');
        const p = await srv.request('GET', '/api/produtos?limit=5', { headers: H });
        assert.equal(p.status, 202); assert.equal(espia.execucoes, 0);
        assert.equal(db.solicitacoes[0].query, 'limit=5');
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${p.body.solicitacaoId}/autorizar`, { headers: A, body: {} });
        assert.equal(r.body.status, 'AUTORIZADA'); assert.equal(r.body.resultadoStatus, 200); assert.equal(espia.execucoes, 1);
    } finally { await srv.close(); }
});

test('resultado grande (> 16 KB) é truncado, mas os ids são guardados', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H, '/api/contas-pagar/grande', { n: 1 })).body.solicitacaoId;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.body.status, 'AUTORIZADA'); assert.equal(r.body.resultado.truncado, true); assert.equal(r.body.idsResultado.id, 'g1');
    } finally { await srv.close(); }
});

// ───────────────────────── permissões da fila ─────────────────────────
test('só admin humano decide: agente → 403, JWT não-admin → 403, sem token → 401; nada executa', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, V } = cenario(db);
        const id = (await pedir(srv, H)).body.solicitacaoId;
        for (const [m, u] of [['GET', '/api/agentes/solicitacoes'], ['GET', '/api/agentes/solicitacoes/contagem'], ['GET', `/api/agentes/solicitacoes/${id}`], ['POST', `/api/agentes/solicitacoes/${id}/autorizar`], ['POST', `/api/agentes/solicitacoes/${id}/recusar`], ['POST', `/api/agentes/solicitacoes/${id}/repetir`]]) {
            const ag = await srv.request(m, u, { headers: H, body: m === 'POST' ? {} : undefined });
            assert.equal(ag.status, 403, `agente ${m} ${u}`); assert.equal(ag.body.codigo, 'AGENTE_BLOQUEADO'); assert.equal(ag.body.fixo, true);
            const nv = await srv.request(m, u, { headers: V, body: m === 'POST' ? {} : undefined });
            assert.equal(nv.status, 403, `não-admin ${m} ${u}`);
            const sem = await srv.request(m, u, { body: m === 'POST' ? {} : undefined });
            assert.equal(sem.status, 401, `sem token ${m} ${u}`);
        }
        assert.equal(espia.execucoes, 0); assert.equal(db.solicitacoes[0].status, 'PENDENTE');
    } finally { await srv.close(); }
});

test('rotas da fila estão declaradas ANTES das rotas /:id do router de agentes; listagem e contagem funcionam', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const router = require('../routes/agenteRoutes');
        const idx = (p, m) => router.stack.findIndex((l) => l.route && l.route.path === p && l.route.methods[m]);
        const primeiraId = router.stack.findIndex((l) => l.route && /^\/:id/.test(l.route.path));
        for (const [p, m] of [['/solicitacoes', 'get'], ['/solicitacoes/contagem', 'get'], ['/solicitacoes/:id', 'get'], ['/solicitacoes/:id/autorizar', 'post'], ['/solicitacoes/:id/recusar', 'post'], ['/solicitacoes/:id/repetir', 'post']]) {
            const i = idx(p, m); assert.ok(i >= 0, p); assert.ok(i < primeiraId, `${p} deve vir antes de /:id`);
        }
        assert.ok(idx('/solicitacoes/contagem', 'get') < idx('/solicitacoes/:id', 'get'));
        await pedir(srv, H); await pedir(srv, H, undefined, { descricao: 'b' });
        db.solicitacoes.push({ id: 'er', agenteId: 'luke', status: 'ERRO_INDETERMINADO', createdAt: new Date(), updatedAt: new Date(), expiraEm: new Date() });
        const c = await srv.request('GET', '/api/agentes/solicitacoes/contagem', { headers: A });
        assert.deepEqual(c.body, { pendentes: 2, comErro: 1 });
        const l = await srv.request('GET', '/api/agentes/solicitacoes?status=PENDENTE&page=1&limit=1', { headers: A });
        assert.equal(l.status, 200); assert.equal(l.body.page, 1); assert.equal(l.body.limit, 1); assert.equal(l.body.total, 2); assert.equal(l.body.data.length, 1);
        const campos = ['id', 'agenteId', 'agenteNome', 'metodo', 'caminho', 'chave', 'rotulo', 'resumo', 'body', 'status', 'expiraEm', 'createdAt', 'decididoPorNome', 'decididoEm', 'observacaoDecisao', 'resultadoStatus', 'resultado', 'idsResultado', 'telaDestino', 'antes', 'mudouDesdePedido'];
        for (const k of campos) assert.ok(k in l.body.data[0], `item sem ${k}`);
        assert.equal((await srv.request('GET', '/api/agentes/solicitacoes?status=XPTO', { headers: A })).status, 400);
        assert.equal((await srv.request('GET', '/api/agentes/solicitacoes/nao-existe', { headers: A })).status, 404);
        assert.equal((await srv.request('GET', `/api/agentes/solicitacoes?agenteId=outro`, { headers: A })).body.total, 0);
    } finally { await srv.close(); }
});

test('o agente lê SÓ as próprias solicitações; meu-acesso ganha solicitacoes.pendentes e mantém os campos antigos', async () => {
    const { db, srv } = await subir();
    try {
        const { H } = cenario(db);
        const claro2 = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
        db.addVendedor({ id: 'outro', nome: 'Outro agente', agente: true, permissoes: {} });
        db.addToken({ vendedorId: 'outro', hash: hash(claro2), prefixo: claro2.slice(7, 15) });
        const meu = (await pedir(srv, H)).body.solicitacaoId;
        const alheio = (await pedir(srv, bearer(claro2), undefined, { descricao: 'dele' })).body.solicitacaoId;
        const lista = await srv.request('GET', '/api/agente/v1/solicitacoes', { headers: H });
        assert.equal(lista.body.total, 1); assert.equal(lista.body.data[0].id, meu);
        assert.equal((await srv.request('GET', `/api/agente/v1/solicitacoes/${alheio}`, { headers: H })).status, 404);
        assert.equal((await srv.request('GET', `/api/agente/v1/solicitacoes/${meu}`, { headers: H })).status, 200);
        assert.equal((await srv.request('GET', '/api/agente/v1/solicitacoes?status=RECUSADA', { headers: H })).body.total, 0);
        const ma = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: H });
        assert.equal(ma.body.solicitacoes.pendentes, 1);
        for (const k of ['id', 'nome', 'agente', 'permissoes', 'caminhosPermitidos', 'token', 'politica', 'observacao']) assert.ok(k in ma.body, k);
        const so = (await srv.request('GET', `/api/agente/v1/solicitacoes/${meu}`, { headers: H })).body;
        for (const k of ['status', 'resultadoStatus', 'resultado', 'idsResultado', 'decididoPorNome', 'observacaoDecisao', 'createdAt', 'expiraEm']) assert.ok(k in so, k);
        assert.ok(!('body' in so), 'o agente não recebe o corpo');
    } finally { await srv.close(); }
});

// ───────────────────────── segredos ─────────────────────────
test('corpo REDIGIDO no item (original só na execução); token, ticket e hashes nunca em auditoria, log, resposta ou banco', async () => {
    const logs = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); };
    const { db, srv, espia } = await subir();
    try {
        const { H, A, claro } = cenario(db);
        const corpo = { descricao: 'Com segredo', senha: 'abc-secreta', aninhado: { apiKey: 'k-123', token: 't-456', ok: 'visivel' }, lista: [{ authorization: 'Bearer zzz' }] };
        const id = (await pedir(srv, H, undefined, corpo)).body.solicitacaoId;
        assert.equal(db.solicitacoes[0].body.senha, 'abc-secreta', 'o original fica guardado para a execução');
        const it = await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A });
        assert.equal(it.body.body.senha, '[oculto]'); assert.equal(it.body.body.aninhado.apiKey, '[oculto]'); assert.equal(it.body.body.aninhado.token, '[oculto]'); assert.equal(it.body.body.aninhado.ok, 'visivel');
        assert.equal(it.body.body.lista[0].authorization, '[oculto]');
        for (const s of ['abc-secreta', 'k-123', 't-456', 'zzz']) assert.ok(!it.texto.includes(s), `item vazou ${s}`);
        const aut = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(espia.chamadas[0].body.senha, 'abc-secreta', 'a rota recebeu o corpo original');
        const ticket = espia.tickets[0];
        await new Promise((x) => setTimeout(x, 50));
        for (const [nome, v] of [['token', claro], ['ticket', ticket], ['hash do token', hash(claro)], ['hash do ticket', hash(ticket)], ['senha', 'abc-secreta']]) {
            const onde = db.solicitacoes.map((s) => JSON.stringify({ ...s, body: undefined })).join('') + JSON.stringify(db.audits) + logs.join('\n') + aut.texto + it.texto;
            assert.ok(!onde.includes(v), `${nome} apareceu em auditoria/log/resposta/linha`);
        }
        assert.equal(db.solicitacoes[0].execHash, null);
    } finally { Object.assign(console, orig); await srv.close(); }
});

// ───────────────────────── unidades ─────────────────────────
test('unidades: redigir, extrairIds (id/*Id/numero, 2 níveis, máx 20), resumoDe, lerPedido', () => {
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo(...CACHE);
    const svc = require('../services/agenteSolicitacaoService');
    restaurar();
    assert.deepEqual(svc.redigir({ senha: 'x', Password: 'y', a: { b: { c: { clientSecret: 'z', d: 1 } } } }), { senha: '[oculto]', Password: '[oculto]', a: { b: { c: { clientSecret: '[oculto]', d: 1 } } } });
    assert.equal(svc.redigir('tem cah_ag_xxx aqui'), '[oculto]');
    assert.deepEqual(svc.extrairIds({ id: 'a', numero: 7, nome: 'n', fornecedorId: 'f', c: { id: 'c1', x: { id: 'fundo', y: { id: 'fundíssimo' } } } }), { id: 'a', numero: 7, fornecedorId: 'f', 'c.id': 'c1', 'c.x.id': 'fundo' });
    const muitos = {}; for (let i = 0; i < 40; i++) muitos[`k${i}Id`] = i;
    assert.equal(Object.keys(svc.extrairIds(muitos)).length, 20);
    assert.equal(svc.resumoDe('POST /api/contas-pagar', 'POST', '/api/contas-pagar', { descricao: 'Luz', valor: 12.5, senha: 'nao' }), 'Criar conta a pagar — descrição: Luz · valor: 12.5');
    assert.equal(svc.resumoDe('POST /api/x/:p', 'POST', '/api/x/1', {}), 'POST /api/x/1');
    const req = (o) => ({ method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '10' }, originalUrl: '/api/x?a=1', body: { a: 1 }, ...o });
    assert.equal(svc.lerPedido(req({})).query, 'a=1');
    assert.equal(svc.lerPedido(req({ method: 'TRACE' })).ok, false);
    assert.equal(svc.lerPedido(req({ body: undefined })).ok, false);
    assert.equal(svc.lerPedido(req({ headers: {}, body: {} })).body, null);
});

test('humano intacto: admin com JWT chama a rota de negócio direto (sem fila, sem 202)', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { A } = cenario(db);
        const r = await srv.request('POST', '/api/contas-pagar', { headers: A, body: { descricao: 'humano' } });
        assert.equal(r.status, 201); assert.equal(espia.execucoes, 1); assert.equal(db.solicitacoes.length, 0);
        assert.equal(espia.chamadas[0].agente, false);
    } finally { await srv.close(); }
});

// ───────────────────────── correções pós-revisão/QA ─────────────────────────
test('rota montada DUAS vezes com authMiddleware: o ticket de uso único não falha no 2º e a rota roda uma vez', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H, '/api/contas-pagar/dupla', { n: 1 })).body.solicitacaoId;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.status, 200, r.texto); assert.equal(r.body.status, 'AUTORIZADA', r.texto); assert.equal(r.body.resultado.quem, 'luke'); assert.equal(r.body.resultado.sol, id);
        assert.equal(espia.execucoes, 1);
    } finally { await srv.close(); }
});

test('status HTTP >= 500 da rota → ERRO com aviso explícito de execução parcial; 4xx sem o aviso', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H, '/api/contas-pagar/explode', { n: 1 })).body.solicitacaoId;
        const r = await srv.request('POST', `/api/agentes/solicitacoes/${id}/autorizar`, { headers: A, body: {} });
        assert.equal(r.body.status, 'ERRO'); assert.equal(r.body.resultadoStatus, 500);
        assert.match(r.body.mensagemErro, /a rota pode ter executado parcialmente: confira a tela de destino antes de pedir de novo/);
        const { H: _h } = { H };
        const id2 = (await pedir(srv, _h, '/api/contas-pagar/perm', { n: 1 })).body.solicitacaoId;
        db.vendedores.get('luke').permissoes = {};
        const r2 = await srv.request('POST', `/api/agentes/solicitacoes/${id2}/autorizar`, { headers: A, body: {} });
        assert.equal(r2.body.resultadoStatus, 403); assert.ok(!/parcialmente/.test(r2.body.mensagemErro));
    } finally { await srv.close(); }
});

test('query REDIGIDA no item (sem "?", senha/token ocultos) e no resumo; query crua só na execução; sem query → null', async () => {
    const { db, srv, espia, politicaSvc } = await subir();
    try {
        const { H, A } = cenario(db);
        db.politicas.push({ id: 'pol-q', vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'PEDE', atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date() });
        politicaSvc.invalidar('luke');
        const p = await srv.request('GET', '/api/produtos?limit=5&token=abc123&senha=xyz&busca=pao', { headers: H });
        assert.equal(p.status, 202); assert.match(p.body.resumo, /consulta: limit=5&token=\[oculto\]&senha=\[oculto\]&busca=pao/);
        assert.ok(!p.texto.includes('abc123') && !p.texto.includes('xyz'));
        const it = await srv.request('GET', `/api/agentes/solicitacoes/${p.body.solicitacaoId}`, { headers: A });
        assert.equal(it.body.query, 'limit=5&token=[oculto]&senha=[oculto]&busca=pao'); assert.ok(!it.texto.includes('abc123') && !it.texto.includes('xyz'));
        assert.equal(db.solicitacoes[0].query, 'limit=5&token=abc123&senha=xyz&busca=pao', 'a execução usa a query original');
        const outro = await pedir(srv, H); // POST sem query
        const it2 = await srv.request('GET', `/api/agentes/solicitacoes/${outro.body.solicitacaoId}`, { headers: A });
        assert.equal(it2.body.query, null); assert.ok(!/consulta:/.test(it2.body.resumo));
        assert.equal(espia.execucoes, 0);
    } finally { await srv.close(); }
});

test('DEDUPE sem corrida: 6 pedidos idênticos SIMULTÂNEOS → 1 solicitação (5 duplicadas); teto de pendentes não estoura por corrida', async () => {
    const { db, srv } = await subir();
    try {
        const { H } = cenario(db);
        const rs = await Promise.all(Array.from({ length: 6 }, () => pedir(srv, H, undefined, { descricao: 'corrida', valor: 1 })));
        assert.ok(rs.every((r) => r.status === 202), rs.map((r) => r.status).join());
        assert.equal(db.solicitacoes.length, 1);
        assert.equal(rs.filter((r) => r.body.duplicada === false).length, 1); assert.equal(new Set(rs.map((r) => r.body.solicitacaoId)).size, 1);
        // 12 pedidos DIFERENTES em paralelo com 195 já pendentes: no máximo até o teto de 200
        const agora = Date.now();
        for (let i = 0; i < 195; i++) db.solicitacoes.push({ id: `x${i}`, agenteId: 'luke', status: 'PENDENTE', expiraEm: new Date(agora + 3600000), chave: 'POST /api/contas-pagar', caminho: '/api/contas-pagar', query: '', corpoHash: `h${i}`, createdAt: new Date() });
        const rs2 = await Promise.all(Array.from({ length: 12 }, (_, i) => pedir(srv, H, undefined, { descricao: `dif ${i}` })));
        assert.equal(rs2.filter((r) => r.status === 202).length, 4); assert.equal(rs2.filter((r) => r.status === 429).length, 8);
        assert.equal(db.solicitacoes.filter((x) => x.status === 'PENDENTE').length, 200);
    } finally { await srv.close(); }
});

test('possivelDuplicata: outra idêntica PENDENTE ou AUTORIZADA nas últimas 24 h acende; AUTORIZADA antiga ou outro corpo não', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const corpo = { descricao: 'Luz', valor: 10 };
        const id1 = (await pedir(srv, H, '/api/contas-pagar', corpo)).body.solicitacaoId;
        let it = await srv.request('GET', `/api/agentes/solicitacoes/${id1}`, { headers: A });
        assert.equal(it.body.possivelDuplicata, false);
        assert.equal((await srv.request('POST', `/api/agentes/solicitacoes/${id1}/autorizar`, { headers: A, body: {} })).body.status, 'AUTORIZADA');
        const id2 = (await pedir(srv, H, '/api/contas-pagar', corpo)).body.solicitacaoId; // o agente "esqueceu" que já foi feito
        assert.notEqual(id2, id1);
        it = await srv.request('GET', `/api/agentes/solicitacoes/${id2}`, { headers: A });
        assert.equal(it.body.possivelDuplicata, true);
        const lista = await srv.request('GET', '/api/agentes/solicitacoes?status=PENDENTE', { headers: A });
        assert.equal(lista.body.data[0].possivelDuplicata, true);
        db.solicitacoes.find((x) => x.id === id1).updatedAt = new Date(Date.now() - 25 * 3600 * 1000);
        it = await srv.request('GET', `/api/agentes/solicitacoes/${id2}`, { headers: A });
        assert.equal(it.body.possivelDuplicata, false, 'AUTORIZADA há mais de 24 h não conta');
        const id3 = (await pedir(srv, H, '/api/contas-pagar', { descricao: 'Outra' })).body.solicitacaoId;
        assert.equal((await srv.request('GET', `/api/agentes/solicitacoes/${id3}`, { headers: A })).body.possivelDuplicata, false);
        // outra PENDENTE idêntica (mesma função/caminho/corpo, query diferente → o dedupe não junta, mas o aviso acende)
        db.politicas.push({ id: 'pol-d', vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'PEDE', atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date() });
        require('../services/agentePoliticaService').invalidar('luke');
        const a = (await srv.request('GET', '/api/produtos?x=1', { headers: H })).body.solicitacaoId;
        await srv.request('GET', '/api/produtos?x=2', { headers: H });
        assert.equal((await srv.request('GET', `/api/agentes/solicitacoes/${a}`, { headers: A })).body.possivelDuplicata, true);
    } finally { await srv.close(); }
});

test('exibição = execução: corpo além dos limites de redigir (500 itens, 500 campos, 2000 chars, 8 níveis) → 422; no limite passa e bodyTruncado:false', async () => {
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        const fundo = (n) => { let o = { fim: 1 }; for (let i = 0; i < n; i++) o = { n: o }; return o; };
        const campos = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, i]));
        for (const [nome, corpo] of [['lista 501', { itens: Array.from({ length: 501 }, (_, i) => i) }], ['501 campos', campos(501)], ['texto 2001', { descricao: 'x'.repeat(2001) }], ['9 níveis', fundo(9)]]) {
            const r = await pedir(srv, H, undefined, corpo);
            assert.equal(r.status, 422, nome); assert.equal(r.body.codigo, 'AGENTE_SOLICITACAO_INVALIDA', nome); assert.match(r.body.error, /grande demais para o dono revisar/i, nome);
        }
        assert.equal(db.solicitacoes.length, 0); assert.equal(espia.execucoes, 0);
        const ok = await pedir(srv, H, undefined, { itens: Array.from({ length: 500 }, (_, i) => i), descricao: 'x'.repeat(2000), ...campos(10) });
        assert.equal(ok.status, 202, ok.texto);
        const it = await srv.request('GET', `/api/agentes/solicitacoes/${ok.body.solicitacaoId}`, { headers: A });
        assert.equal(it.body.bodyTruncado, false); assert.equal(it.body.body.itens.length, 500); assert.equal(it.body.body.descricao.length, 2000);
        assert.ok(db.solicitacoes.every((x) => JSON.stringify(x.body).length > 0));
        assert.equal((await pedir(srv, H, undefined, { dados: fundo(6) })).status, 202, 'no limite de profundidade passa');
        assert.equal((await pedir(srv, H, undefined, { dados: fundo(7) })).status, 422, 'um nível a mais é recusado');
    } finally { await srv.close(); }
});

test('TICKET com X-Forwarded-For / Forwarded / X-Real-IP → 401 (não consome o ticket); sem esses cabeçalhos passa', async () => {
    const { db, srv, espia } = await subir();
    try {
        cenario(db);
        const ticket = `cah_ag_exec_${crypto.randomBytes(32).toString('base64url')}`;
        db.solicitacoes.push({ id: 'sol-xff', agenteId: 'luke', agenteNome: 'Luke (agente)', metodo: 'POST', caminho: '/api/contas-pagar', query: '', chave: 'POST /api/contas-pagar', status: 'EXECUTANDO', execHash: hash(ticket), execComecouEm: new Date(), body: {}, createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        for (const h of [{ 'X-Forwarded-For': '203.0.113.9' }, { Forwarded: 'for=203.0.113.9' }, { 'X-Real-IP': '203.0.113.9' }]) {
            const r = await srv.request('POST', '/api/contas-pagar', { headers: { ...bearer(ticket), ...h }, body: { descricao: 'x' } });
            assert.equal(r.status, 401, JSON.stringify(h)); assert.equal(r.body.codigo, 'AGENTE_TICKET_INVALIDO');
        }
        assert.equal(espia.execucoes, 0); assert.equal(db.solicitacoes[0].execHash, hash(ticket), 'tentativas com proxy não consomem');
        assert.equal((await srv.request('POST', '/api/contas-pagar', { headers: bearer(ticket), body: { descricao: 'x' } })).status, 201);
        const svc = require('../services/agenteSolicitacaoService');
        assert.equal(svc.ehLoopback({ headers: { 'x-forwarded-for': '1.1.1.1' }, socket: { remoteAddress: '127.0.0.1' } }), false);
        assert.equal(svc.ehLoopback({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), true);
    } finally { await srv.close(); }
});

test('REVOGAR token (JWT) recusa as PENDENTES do agente na hora; EXECUTANDO em andamento não é afetado; resposta traz recusadasAutomaticamente', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const tid = [...db.tokens.keys()][0];
        const outroId = (await pedir(srv, H, undefined, { descricao: 'a' })).body.solicitacaoId; await pedir(srv, H, undefined, { descricao: 'b' });
        db.solicitacoes.push({ id: 'em-andamento', agenteId: 'luke', status: 'EXECUTANDO', execHash: 'h', execComecouEm: new Date(), createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        db.solicitacoes.push({ id: 'de-outro', agenteId: 'outro', status: 'PENDENTE', createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        const r = await srv.request('DELETE', `/api/agentes/luke/tokens/${tid}`, { headers: A });
        assert.equal(r.status, 200, r.texto); assert.equal(r.body.recusadasAutomaticamente, 2); assert.equal(r.body.jaRevogado, false);
        const por = Object.fromEntries(db.solicitacoes.map((x) => [x.id, x.status]));
        assert.equal(por[outroId], 'RECUSADA'); assert.equal(por['em-andamento'], 'EXECUTANDO'); assert.equal(por['de-outro'], 'PENDENTE');
        const rec = db.solicitacoes.find((x) => x.id === outroId);
        assert.match(rec.observacaoDecisao, /Token do agente revogado\/rotacionado — todos os pedidos pendentes DO AGENTE foram recusados/); assert.ok(rec.decididoEm);
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_SOLICITACOES_RECUSADAS_AUTO' && JSON.parse(a.detalhes).quantidade === 2));
        // revogar de novo (já revogado) → 0
        const r2 = await srv.request('DELETE', `/api/agentes/luke/tokens/${tid}`, { headers: A });
        assert.equal(r2.body.jaRevogado, true); assert.equal(r2.body.recusadasAutomaticamente, 0);
    } finally { await srv.close(); }
});

test('admin-exec: agente-token-revogar e agente-token-rotacionar (confirmar) também recusam as PENDENTES; dry-run não', async () => {
    const { db: db2, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE, 'services/agenteTokenAdminService.js', 'services/agenteCriarService.js');
    const admin = require('../services/agenteTokenAdminService');
    const solSvc = require('../services/agenteSolicitacaoService');
    restaurar();
    cenario(db2);
    const pend = (id, ag = 'luke', st = 'PENDENTE') => db2.solicitacoes.push({ id, agenteId: ag, status: st, createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
    pend('p1'); pend('p2'); pend('exec', 'luke', 'EXECUTANDO');
    const dry = await admin.revogar({ agente: 'luke', tokens: 'todos' }, { confirmar: false });
    assert.equal(dry.dryRun, true); assert.equal(db2.solicitacoes.filter((x) => x.status === 'PENDENTE').length, 2);
    const r = await admin.revogar({ agente: 'luke', tokens: 'todos' }, { confirmar: true });
    assert.equal(r.ok, true); assert.equal(r.recusadasAutomaticamente, 2);
    assert.deepEqual(db2.solicitacoes.map((x) => x.status), ['RECUSADA', 'RECUSADA', 'EXECUTANDO']);
    // rotacionar: novo token + revoga anteriores → recusa as pendentes; sem revogar anteriores → não recusa
    db2.addToken({ vendedorId: 'luke', hash: hash('novo'), prefixo: 'abcdefgh' }); pend('p3'); pend('p4');
    const semRev = await admin.rotacionar({ agente: 'luke', revogarAnteriores: false }, { confirmar: true });
    assert.equal(semRev.recusadasAutomaticamente, 0); assert.equal(db2.solicitacoes.filter((x) => x.status === 'PENDENTE').length, 2);
    const rot = await admin.rotacionar({ agente: 'luke' }, { confirmar: true });
    assert.ok(rot.revogados.length >= 1); assert.equal(rot.recusadasAutomaticamente, 2); assert.ok(typeof rot.token === 'string');
    assert.ok(!JSON.stringify(db2.audits).includes(rot.token), 'token novo nunca na auditoria');
    assert.equal(db2.solicitacoes.find((x) => x.id === 'exec').status, 'EXECUTANDO');
    assert.equal(typeof solSvc.recusarPendentesDoAgente, 'function');
});

test('unidades (correções): redigirQuery e excedeLimitesDeExibicao', () => {
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo(...CACHE);
    const svc = require('../services/agenteSolicitacaoService');
    restaurar();
    assert.equal(svc.redigirQuery(''), null); assert.equal(svc.redigirQuery('?'), null); assert.equal(svc.redigirQuery(null), null);
    assert.equal(svc.redigirQuery('a=1&Authorization=Bearer%20x&api_key=k&x=cah_ag_zzz&solo'), 'a=1&Authorization=[oculto]&api_key=[oculto]&x=[oculto]&solo');
    assert.equal(svc.redigirQuery('pass%77ord=1'), 'pass%77ord=[oculto]');
    assert.equal(svc.excedeLimitesDeExibicao({ a: [1, 2], b: { c: 'x' } }), false);
    assert.equal(svc.excedeLimitesDeExibicao({ a: 'x'.repeat(2001) }), true);
    assert.equal(svc.excedeLimitesDeExibicao(Array.from({ length: 501 }, () => 1)), true);
});

test('repetirLiberaEm é null fora de ERRO_INDETERMINADO; mensagemAnterior da auditoria é truncada a 300', async () => {
    const { db, srv } = await subir();
    try {
        const { H, A } = cenario(db);
        const id = (await pedir(srv, H)).body.solicitacaoId;
        assert.equal((await srv.request('GET', `/api/agentes/solicitacoes/${id}`, { headers: A })).body.repetirLiberaEm, null);
        // linha indeterminada com mensagem enorme, apontando para a rota de queda (que responde ok)
        db.solicitacoes.push({ id: 'ind', agenteId: 'luke', agenteNome: 'Luke (agente)', metodo: 'POST', caminho: '/api/contas-pagar/queda', query: '', chave: 'POST /api/contas-pagar/queda', status: 'ERRO_INDETERMINADO',
            body: { n: 1 }, corpoHash: 'h', resumo: 'r', execComecouEm: new Date(Date.now() - 6 * 60 * 1000), resultado: { error: 'M'.repeat(900) }, idempotencyKey: 'sol-ind', createdAt: new Date(), expiraEm: new Date(Date.now() + 1e6) });
        const r = await srv.request('POST', '/api/agentes/solicitacoes/ind/repetir', { headers: A, body: { confirmarRepeticao: true } });
        assert.equal(r.status, 200, r.texto); assert.equal(r.body.status, 'AUTORIZADA');
        const dec = JSON.parse(db.audits.find((a) => a.acao === 'AGENTE_SOLICITACAO_DECIDIDA' && JSON.parse(a.detalhes).decisao === 'REPETIR').detalhes);
        assert.equal(dec.mensagemAnterior.length, 300);
    } finally { await srv.close(); }
});

test('redigir: chave __proto__ própria do corpo NÃO é engolida e NÃO altera protótipo; aparece no item e é executada como veio', async () => {
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo(...CACHE);
    const svc = require('../services/agenteSolicitacaoService');
    restaurar();
    const hostil = JSON.parse('{"descricao":"p","__proto__":{"admin":true,"senha":"s3"},"ok":1}');
    const r = svc.redigir(hostil);
    assert.equal(Object.getPrototypeOf(r), Object.prototype, 'protótipo intacto');
    assert.equal(r.admin, undefined, 'nada vazou para o objeto');
    assert.ok(Object.prototype.hasOwnProperty.call(r, '__proto__'), 'a chave continua visível para o dono');
    assert.deepEqual(Object.keys(r), ['descricao', '__proto__', 'ok']);
    assert.equal(r.__proto__.admin, true); assert.equal(r.__proto__.senha, '[oculto]');
    assert.equal(({}).admin, undefined); assert.equal(Object.prototype.admin, undefined);
    assert.ok(JSON.stringify(r).includes('"__proto__":{"admin":true,"senha":"[oculto]"}'));
    // ponta a ponta: o item mostra a chave; o corpo guardado/executado é o original
    const { db, srv, espia } = await subir();
    try {
        const { H, A } = cenario(db);
        const bruto = '{"descricao":"proto","__proto__":{"polluido":1}}';
        const rq = await fetch(`${srv.baseUrl}/api/contas-pagar`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: bruto });
        const j = await rq.json(); assert.equal(rq.status, 202);
        const it = await srv.request('GET', `/api/agentes/solicitacoes/${j.solicitacaoId}`, { headers: A });
        assert.ok(it.texto.includes('"__proto__":{"polluido":1}'), it.texto.slice(0, 400));
        assert.equal(({}).polluido, undefined);
        const aut = await srv.request('POST', `/api/agentes/solicitacoes/${j.solicitacaoId}/autorizar`, { headers: A, body: {} });
        assert.equal(aut.body.status, 'AUTORIZADA', aut.texto); assert.equal(espia.execucoes, 1);
    } finally { await srv.close(); }
});
