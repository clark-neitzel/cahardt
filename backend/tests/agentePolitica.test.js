// Política do agente (PR-A): LIBERADO / PEDE / BLOQUEADO sobre o CATÁLOGO REAL de rotas do sistema.
// O catálogo vem de `scripts/dump-catalogo-agente.js` (carrega o index.js de verdade SEM subir servidor/banco);
// o app de teste registra um stub para cada rota real, atrás do authMiddleware verdadeiro. Prisma é mock em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');
const { modeloSolicitacoes, transacaoSolicitacoes } = require('./helpers/memSolicitacoes');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['middlewares/authMiddleware.js', 'services/agenteTokenService.js', 'routes/agenteRoutes.js',
    'routes/agenteApiV1Routes.js', 'config/agenteAcesso.js', 'controllers/appAuthController.js',
    'services/agentePoliticaService.js', 'services/agenteAuditoriaService.js', 'services/agenteCatalogoRotas.js',
    'config/agentePoliticaPadrao.js', 'utils/agenteContexto.js', 'services/agenteSolicitacaoService.js', 'config/agenteAntes.js', 'config/agenteTelas.js'];
const JWT_SECRET = process.env.JWT_SECRET;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const UUID = '3f2b8a1c-9d4e-4b7a-8c11-5e6f7a8b9c0d';

// ───────── catálogo real (uma vez por processo de teste) ─────────
let _catalogo;
function catalogoReal() {
    if (_catalogo) return _catalogo;
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/dump-catalogo-agente.js')], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x', CAH_SEM_LISTEN: '1' },
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(r.status, 0, `dump do catálogo falhou: ${r.stderr}`);
    _catalogo = JSON.parse(r.stdout);
    return _catalogo;
}

// ───────── banco em memória ─────────
function memoria() {
    const vendedores = new Map(); const tokens = new Map(); const audits = []; const politicas = [];
    const db = {
        vendedores, tokens, audits, politicas, consultasPolitica: 0,
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, maxDescontoFlex: 100, login: null, senha: null, ...v }); },
        addToken(t) { const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, expiraEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, limitePorMinuto: 100000, criadoEm: new Date(), criadoPorId: 'adm', nome: 't', ...t }; tokens.set(row.id, row); return row; },
        addPolitica(p) { politicas.push({ id: `pol-${politicas.length + 1}`, motivo: null, atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date(), ...p }); },
    };
    const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };
    const achar = (w) => politicas.find((p) => p.vendedorId === w.vendedorId && p.escopo === w.escopo && p.chave === w.chave);
    const solModelo = modeloSolicitacoes(db);
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
        },
        agenteToken: {
            findUnique: async ({ where, include, select }) => {
                const t = where.hash ? [...tokens.values()].find((x) => x.hash === where.hash) : tokens.get(where.id);
                if (!t) return null;
                if (select) return pick(t, select);
                return include ? { ...t, vendedor: vendedores.get(t.vendedorId) ? pick(vendedores.get(t.vendedorId), include.vendedor.select) : null } : { ...t };
            },
            update: async ({ where, data }) => { const t = tokens.get(where.id); if (data.totalUsos?.increment) { t.totalUsos += data.totalUsos.increment; delete data.totalUsos; } Object.assign(t, data); return t; },
        },
        agentePolitica: {
            findMany: async ({ where }) => { db.consultasPolitica += 1; if (db.falharPolitica) throw new Error('banco fora'); return politicas.filter((p) => p.vendedorId === where.vendedorId).map((p) => ({ ...p })); },
            findUnique: async ({ where, select }) => { const p = achar(where.vendedorId_escopo_chave); return p ? pick(p, select) : null; },
            upsert: async ({ where, create, update, select }) => {
                const w = where.vendedorId_escopo_chave; const p = achar(w);
                if (p) { Object.assign(p, update, { atualizadoEm: new Date() }); return pick(p, select); }
                db.addPolitica({ ...create }); return pick(achar(w), select);
            },
            delete: async ({ where }) => { const p = achar(where.vendedorId_escopo_chave); politicas.splice(politicas.indexOf(p), 1); return p; },
        },
        agenteSolicitacao: solModelo,
        $transaction: transacaoSolicitacoes(solModelo),
        auditLog: { create: async ({ data }) => { if (db.falharAudit) throw new Error('banco lento'); audits.push(data); return data; } },
        funcionario: { findFirst: async () => null },
    });
    return { db, prisma };
}

// ───────── app: um stub para cada rota REAL, atrás do authMiddleware verdadeiro ─────────
async function subir(db0) {
    const { db, prisma } = db0 || memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    const authMiddleware = require('../middlewares/authMiddleware');
    const agenteRoutes = require('../routes/agenteRoutes');
    const agenteApi = require('../routes/agenteApiV1Routes');
    const politicaSvc = require('../services/agentePoliticaService');
    const auditoria = require('../services/agenteAuditoriaService');
    restaurar();

    const app = express();
    app.use(express.json());
    const grupos = new Map();
    for (const e of catalogoReal()) {
        if (!e.exemplo.startsWith('/api/')) continue;
        const seg = e.exemplo.split('/')[2];
        if (seg === 'agentes' || seg === 'agente') continue; // routers de verdade logo abaixo
        if (!grupos.has(seg)) grupos.set(seg, []);
        grupos.get(seg).push(e);
    }
    for (const [seg, lista] of grupos) {
        const router = express.Router();
        if (seg === 'pedidos') { // rota de teste (ANTES dos stubs, senão `/:p` a captura): o contexto de agente chega ao handler
            const { assertNaoAgente } = require('../utils/agenteContexto');
            router.get('/teste-assert', (req, res) => {
                try { assertNaoAgente('WHATSAPP'); res.json({ ok: true }); } catch (err) { res.status(500).json({ codigo: err.codigo }); }
            });
        }
        for (const e of lista) {
            let n = 0;
            const resto = e.exemplo.split('/').slice(3).map((s) => (s === ':p' ? `:p${n++}` : s)).join('/');
            router[e.metodo.toLowerCase()]('/' + resto, (req, res) => res.json({ ok: true, user: req.user.id, agente: req.user.agente === true }));
        }
        app.use(`/api/${seg}`, authMiddleware, router);
    }
    app.use('/api/agentes', agenteRoutes);
    app.use('/api/agente/v1', authMiddleware, agenteApi);
    app.use((err, req, res, _n) => { console.error(err); res.status(500).json({ error: 'erro' }); });
    const srv = await startTestServer(app);
    return { db, srv, app, politicaSvc, auditoria };
}

const jwtDe = (id) => jwt.sign({ id, nome: 'x' }, JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => ({ authorization: `Bearer ${t}` });
function crua(baseUrl, caminho, token, metodo = 'GET') {
    const { port } = new URL(baseUrl);
    return new Promise((resolve, reject) => {
        const rq = require('http').request({ host: '127.0.0.1', port, path: caminho, method: metodo, headers: { authorization: `Bearer ${token}` } }, (res) => {
            let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, texto: t }));
        });
        rq.on('error', reject); rq.end();
    });
}
function cenario(db, { vendedor = {}, token = {} } = {}) {
    const claro = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    db.addVendedor({ id: 'luke', nome: 'Luke', agente: true, acessoExterno: true, permissoes: { Pode_Ver_X: true }, ...vendedor });
    const row = db.addToken({ vendedorId: 'luke', hash: hash(claro), prefixo: claro.slice(7, 15), ...token });
    db.addVendedor({ id: 'adm', nome: 'Dono', permissoes: { admin: true } });
    db.addVendedor({ id: 'vend', nome: 'Vendedor', permissoes: { Pode_Ver_X: true } });
    return { claro, row, adminJwt: jwtDe('adm'), vendJwt: jwtDe('vend') };
}
const url = (e) => e.exemplo.replace(/:p/g, UUID);
// carrega o serviço de política com Prisma mockado (nada de PrismaClient real nos testes puros)
function politicaComMock() {
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo('services/agentePoliticaService.js');
    const m = require('../services/agentePoliticaService');
    restaurar();
    return m;
}

// ───────── expectativa INDEPENDENTE do código sob teste (regras do pedido do dono, escritas à parte) ─────────
const FIXOS_PREFIXOS = ['/api/agentes', '/api/admin', '/api/vendedores', '/api/migrations', '/api/config', '/api/notas-fiscais', '/api/asaas',
    '/api/whatsapp-clientes', '/api/mensagens-agendadas', '/api/cobranca', '/api/impressao', '/api/copiloto', '/api/rh', '/api/ponto',
    '/api/curriculos', '/api/funcionarios', '/api/comissoes', '/api/ia-uso', '/api/ia-logs', '/api/visitors', '/api/diarios', '/api/gps-clientes'];
const SEED = ['/api/contas-pagar', '/api/anexos', '/api/contas-receber', '/api/fornecedores', '/api/notas-entrada', '/api/financeiro-gerencial',
    '/api/conciliacao-bancaria', '/api/contas-financeiras', '/api/categorias-estoque', '/api/pcp/itens', '/api/pcp/receitas', '/api/pcp/estoque',
    '/api/produtos', '/api/estoque', '/api/pedidos', '/api/clientes', '/api/indicadores-gestao', '/api/dashboards', '/api/caixa',
    '/api/embarques', '/api/entregas', '/api/contabilidade'];
const FORA_DO_SEED = ['GET /api/contabilidade/pacote-mes', 'GET /api/contabilidade/notas-entrada-zip', 'GET /api/caixa/resumo', 'GET /api/pedidos/:p/danfe',
    'GET /api/pedidos/:p/cobrancas-ca', 'GET /api/clientes/consulta-cnpj/:p', 'GET /api/clientes/:p/endereco-historico/:p/geocode',
    'GET /api/financeiro-gerencial/categorias-despesa', 'GET /api/financeiro-gerencial/grupos-dre',
    'GET /api/embarques/mapa', 'GET /api/pedidos/:p/nota-fiscal', 'GET /api/caixa/conferencia-dinheiro/config',
    'GET /api/caixa/conferencia-dinheiro/autorizadores', 'GET /api/caixa/audit-logs'];
const PREVIAS = ['POST /api/contas-pagar/avaliar-custo', 'POST /api/notas-entrada/:p/avaliar-custo'];
const SEFAZ = ['POST /api/notas-entrada/consultar-agora', 'POST /api/notas-entrada/buscar-chave', 'POST /api/notas-entrada/buscar-chave/agendar', 'POST /api/notas-entrada/:p/manifestar'];

function esperado(e) {
    const p = e.exemplo;
    if (e.chave === 'GET /api/agente/v1/solicitacoes/:p') return { status: 404 }; // liberada; o id de teste não existe -> 404 da própria rota
    if (e.chave === 'GET /api/auth/me' || p.startsWith('/api/agente/v1')) return { status: 200 };
    if (FIXOS_PREFIXOS.some((f) => p.startsWith(f)) || p.startsWith('/api/auth') || SEFAZ.includes(e.chave)) return { status: 403, codigo: 'AGENTE_BLOQUEADO', fixo: true };
    if (SEED.includes(e.familia)) {
        if (FORA_DO_SEED.includes(e.chave)) return { status: 403, codigo: 'AGENTE_BLOQUEADO', fixo: false };
        if (e.metodo === 'GET' || PREVIAS.includes(e.chave)) return { status: 200 };
        return { status: 202, codigo: 'AGENTE_PEDE_AUTORIZACAO' }; // PR-B: PEDE guarda o pedido (fila) e responde 202
    }
    return { status: 403, codigo: 'AGENTE_BLOQUEADO', fixo: false };
}

// ───────────────────────── catálogo ─────────────────────────
test('catálogo real: snapshot (contagem aproximada + chaves conhecidas) protege contra mudança interna do Express', () => {
    const cat = catalogoReal();
    assert.ok(cat.length >= 1100 && cat.length <= 1600, `catálogo com ${cat.length} rotas`);
    const chaves = new Set(cat.map((e) => e.chave));
    for (const k of ['GET /api/auth/me', 'GET /api/agente/v1/meu-acesso', 'GET /api/contas-pagar', 'GET /api/contas-pagar/:p/anexos', 'GET /api/anexos/:p/arquivo',
        'POST /api/contas-pagar/:p/parcelas/:p/baixar', 'POST /api/notas-entrada/:p/manifestar', 'POST /api/notas-entrada/consultar-agora',
        'GET /api/pcp/itens/:p', 'GET /api/pedidos/:p', 'PUT /api/agentes/:p/politicas', 'GET /api/agentes/:p/politicas/familias', 'POST /api/admin-exec/agente-criar',
        'POST /api/contas-pagar/avaliar-custo', 'POST /api/notas-entrada/:p/avaliar-custo', 'GET /api/contabilidade/pacote-mes']) {
        assert.ok(chaves.has(k), `faltou no catálogo: ${k}`);
    }
    // toda chave é MÉTODO + caminho minúsculo, sem barra final, parâmetro sempre `:p`
    for (const e of cat) {
        assert.match(e.chave, /^[A-Z]+ \//, e.chave);
        assert.equal(e.chave, `${e.metodo} ${e.exemplo}`);
        if (e.exemplo !== '/') assert.ok(!e.exemplo.endsWith('/') && e.exemplo === e.exemplo.toLowerCase(), e.chave);
        assert.ok(!/:(?!p(\/|\.|$))/.test(e.exemplo), e.chave);
    }
    assert.equal(new Set(cat.map((e) => e.chave)).size, cat.length, 'chave duplicada');
});

test('o catálogo do app de teste reproduz as chaves reais (extração de prefixo/params do Express)', async () => {
    const { srv, app } = await subir();
    try {
        const { construir } = require('../services/agenteCatalogoRotas');
        const doTeste = new Set(construir(app).rotas.map((e) => e.chave));
        for (const e of catalogoReal()) {
            if (!e.exemplo.startsWith('/api/')) continue;
            assert.ok(doTeste.has(e.chave), `não reproduziu: ${e.chave}`);
        }
    } finally { await srv.close(); }
});

test('catálogo: rota com regex no caminho entra marcada `complexa` e fica BLOQUEADA', () => {
    const app = express();
    const r = express.Router();
    r.get(/^\/regex-([a-z]+)$/, (q, s) => s.json({}));
    r.get('/opcional/:id?', (q, s) => s.json({}));
    r.get('/ok/:id', (q, s) => s.json({}));
    app.use('/api/pedidos', r);
    const { construir } = require('../services/agenteCatalogoRotas');
    const { resolverEntrada } = politicaComMock();
    const cat = construir(app);
    const ok = cat.rotas.find((e) => e.chave === 'GET /api/pedidos/ok/:p');
    assert.ok(ok && !ok.complexa);
    assert.equal(resolverEntrada(ok, null).nivel, 'LIBERADO');
    const complexas = cat.rotas.filter((e) => e.complexa);
    assert.equal(complexas.length, 2);
    for (const e of complexas) assert.equal(resolverEntrada(e, null).nivel, 'BLOQUEADO');
});

// ───────────────────────── matriz ─────────────────────────
test('matriz completa: TODA rota real responde conforme a política padrão (leitura liberada, escrita não, resto bloqueado)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const cat = catalogoReal().filter((e) => e.exemplo.startsWith('/api/') && !e.exemplo.startsWith('/api/agentes'));
        const falhas = [];
        db.semTeto = true; // o teto de 200 pendentes é testado à parte; aqui cada escrita vira uma solicitação
        const contagem = { 200: 0, PEDE: 0, BLOQ: 0, FIXO: 0 };
        for (let i = 0; i < cat.length; i += 25) {
            await Promise.all(cat.slice(i, i + 25).map(async (e) => {
                const r = await srv.request(e.metodo, url(e), { headers: bearer(claro), body: e.metodo === 'GET' ? undefined : {} });
                const x = esperado(e);
                const ok = r.status === x.status && (x.status === 200 || x.status === 404 || (x.status === 202
                    ? (r.body.codigo === x.codigo && r.body.status === 'PENDENTE' && typeof r.body.solicitacaoId === 'string' && typeof r.body.orientacao === 'string')
                    : (r.body.codigo === x.codigo && r.body.nivel === 'BLOQUEADO' && r.body.fixo === x.fixo && r.body.chave === e.chave && typeof r.body.orientacao === 'string')));
                if (!ok) falhas.push(`${e.chave}: esperado ${JSON.stringify(x)}, veio ${r.status} ${r.texto.slice(0, 160)}`);
                if (r.status === 200 || r.status === 404) contagem[200] += 1; else if (r.status === 202) contagem.PEDE += 1; else if (r.body?.fixo) contagem.FIXO += 1; else if (r.body?.codigo === 'AGENTE_PEDE_AUTORIZACAO') contagem.PEDE += 1; else contagem.BLOQ += 1;
            }));
        }
        assert.deepEqual(falhas, []);
        console.log(`[matriz] ${cat.length} rotas: ${contagem[200]} liberadas, ${contagem.PEDE} PEDE, ${contagem.BLOQ} bloqueadas, ${contagem.FIXO} bloqueio fixo`);
        assert.ok(contagem[200] > 100);
        // NENHUMA escrita é EXECUTADA: toda rota 200 é GET ou prévia conhecida; escrita é 403 (bloqueada) ou 202 (só guardada)
        for (const e of cat) {
            if (e.metodo === 'GET') continue;
            if (PREVIAS.includes(e.chave)) continue;
            const r = await srv.request(e.metodo, url(e), { headers: bearer(claro), body: {} });
            assert.ok(r.status === 403 || r.status === 202, `${e.chave} não pode executar (${r.status})`);
            assert.notEqual(r.body && r.body.user, 'luke', `${e.chave} executou a rota`);
        }
    } finally { await srv.close(); }
});

test('cada família do seed: GET liberado responde 200 e POST/PUT/PATCH/DELETE é PEDE (202: guardado na fila, NÃO executado)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const cat = catalogoReal();
        for (const fam of SEED) {
            const gets = cat.filter((e) => e.familia === fam && e.metodo === 'GET' && !FORA_DO_SEED.includes(e.chave) && !SEFAZ.includes(e.chave));
            assert.ok(gets.length > 0, `${fam} sem GET liberável`);
            const r = await srv.request('GET', url(gets[0]), { headers: bearer(claro) });
            assert.equal(r.status, 200, `${fam} → ${gets[0].chave} → ${r.status}`);
            const escrita = cat.find((e) => e.familia === fam && e.metodo !== 'GET' && !PREVIAS.includes(e.chave) && !SEFAZ.includes(e.chave));
            if (escrita) {
                const w = await srv.request(escrita.metodo, url(escrita), { headers: bearer(claro), body: {} });
                assert.equal(w.status, 202, escrita.chave);
                assert.equal(w.body.codigo, 'AGENTE_PEDE_AUTORIZACAO', escrita.chave);
                assert.equal(w.body.status, 'PENDENTE'); assert.equal(w.body.user, undefined, 'a rota não pode ter executado');
            }
        }
    } finally { await srv.close(); }
});

test('família que não é do seed (kitfesta, delivery, tarefas, checklists...) nasce BLOQUEADA, inclusive GET', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        for (const fam of ['/api/kitfesta', '/api/delivery', '/api/tarefas', '/api/checklists-veiculo', '/api/veiculos', '/api/leads', '/api/despesas', '/api/devolucoes', '/api/amostras', '/api/produtos-margem']) {
            const get = catalogoReal().find((e) => e.familia === fam && e.metodo === 'GET');
            assert.ok(get, fam);
            const r = await srv.request('GET', url(get), { headers: bearer(claro) });
            assert.equal(r.status, 403, `${get.chave}`);
            assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO');
            assert.equal(r.body.fixo, false);
        }
        // função NOVA (que o catálogo não conhece) → BLOQUEADA
        const r = await srv.request('GET', '/api/pedidos/funcao-que-nao-existe/outra', { headers: bearer(claro) });
        assert.equal(r.status, 403);
        assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO');
        // caminho sem nenhum router montado nem chega ao authMiddleware (404 do Express): também não é 200
        assert.equal((await srv.request('GET', '/api/rota-inexistente', { headers: bearer(claro) })).status, 404);
    } finally { await srv.close(); }
});

test('bloqueios fixos: 403 `fixo:true` mesmo com override LIBERADO inserido direto no banco; PUT recusa com 422', async () => {
    const { db, srv, politicaSvc } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        const alvos = [['GET', '/api/vendedores'], ['GET', '/api/config'], ['GET', '/api/admin-exec/ping'], ['GET', '/api/rh/funcionarios'], ['GET', '/api/ponto-publico/x'],
            ['GET', '/api/notas-fiscais'], ['GET', '/api/auth/midia-token'], ['POST', '/api/auth/app-login'], ['GET', '/api/asaas/x'], ['GET', '/api/copiloto/x'],
            ['POST', `/api/notas-entrada/${UUID}/manifestar`], ['POST', '/api/notas-entrada/consultar-agora'], ['POST', '/api/notas-entrada/buscar-chave'],
            ['POST', '/api/notas-entrada/buscar-chave/agendar'], ['GET', '/api/agentes'], ['GET', '/api/impressao/x'], ['GET', '/api/cobranca/x'], ['GET', '/api/config-notas']];
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/vendedores', nivel: 'LIBERADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/vendedores', nivel: 'LIBERADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'POST /api/notas-entrada/:p/manifestar', nivel: 'LIBERADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/config', nivel: 'LIBERADO' });
        politicaSvc.invalidar('luke');
        for (const [m, u] of alvos) {
            const r = await srv.request(m, u, { headers: bearer(claro), body: m === 'GET' ? undefined : {} });
            assert.equal(r.status, 403, `${m} ${u}`);
            assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO', `${m} ${u}`);
            assert.equal(r.body.fixo, true, `${m} ${u} deveria ser fixo`);
        }
        // a API de política também recusa
        for (const body of [{ escopo: 'FUNCAO', chave: 'GET /api/vendedores', nivel: 'LIBERADO' }, { escopo: 'FUNCAO', chave: 'POST /api/notas-entrada/:p/manifestar', nivel: 'PEDE' },
            { escopo: 'FAMILIA', chave: '/api/config', nivel: 'LIBERADO' }, { escopo: 'FAMILIA', chave: '/api/rh', nivel: 'PEDE' }, { escopo: 'FUNCAO', chave: 'GET /api/auth/me', nivel: 'BLOQUEADO' },
            { escopo: 'FUNCAO', chave: 'POST /api/notas-entrada/consultar-agora', nivel: 'LIBERADO' }]) {
            const r = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: bearer(adminJwt), body });
            assert.equal(r.status, 422, JSON.stringify(body) + ' → ' + r.texto);
        }
    } finally { await srv.close(); }
});

test('GET /api/auth/me e /api/agente/v1/** seguem SEMPRE liberados (sem tocar no banco de políticas)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: bearer(claro) })).status, 200);
        assert.equal((await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) })).status, 200);
        assert.equal(db.consultasPolitica, 1); // só o meu-acesso (resumo) consultou; o resolver de /auth/me e do próprio v1 não
        assert.equal((await srv.request('POST', '/api/agente/v1/meu-acesso', { headers: bearer(claro), body: {} })).status, 403);
    } finally { await srv.close(); }
});

// ───────────────────────── overrides do dono ─────────────────────────
test('override FUNCAO e FAMILIA mudam o resultado; PUT invalida o cache na hora; DELETE restaura o padrão', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        const H = bearer(claro);
        const A = bearer(adminJwt);
        // padrão
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}`, { headers: H })).status, 200);
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}/danfe`, { headers: H })).status, 403); // fora do seed (grava em disco)
        // FUNCAO LIBERADO numa função fora do seed
        let r = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FUNCAO', chave: 'GET /api/pedidos/:p/danfe', nivel: 'LIBERADO', motivo: 'teste' } });
        assert.equal(r.status, 200, r.texto);
        assert.equal(r.body.antes, null);
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}/danfe`, { headers: H })).status, 200); // vale NA HORA
        // FAMILIA BLOQUEADO derruba a leitura da família inteira
        r = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FAMILIA', chave: '/api/pedidos', nivel: 'BLOQUEADO' } });
        assert.equal(r.status, 200, r.texto);
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}`, { headers: H })).status, 403);
        // FUNCAO ganha da FAMILIA: o danfe liberado continua passando
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}/danfe`, { headers: H })).status, 200);
        // FAMILIA LIBERADO numa família fora do seed libera GET, mas NÃO libera escrita
        r = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FAMILIA', chave: '/api/kitfesta', nivel: 'LIBERADO' } });
        assert.equal(r.status, 200, r.texto);
        const kf = catalogoReal().filter((e) => e.familia === '/api/kitfesta');
        const kfGet = kf.find((e) => e.metodo === 'GET'); const kfPost = kf.find((e) => e.metodo === 'POST');
        assert.equal((await srv.request('GET', url(kfGet), { headers: H })).status, 200);
        assert.equal((await srv.request('POST', url(kfPost), { headers: H, body: {} })).status, 403);
        // família LIBERADA não abre exceção "grava/externo": caixa/resumo só por FUNCAO
        await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FAMILIA', chave: '/api/caixa', nivel: 'LIBERADO' } });
        assert.equal((await srv.request('GET', '/api/caixa/resumo', { headers: H })).status, 403);
        // PEDE é aceito e responde 202 AGENTE_PEDE_AUTORIZACAO (guardado na fila; a rota não roda)
        await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'PEDE' } });
        const pede = await srv.request('GET', '/api/produtos', { headers: H });
        assert.equal(pede.status, 202); assert.equal(pede.body.codigo, 'AGENTE_PEDE_AUTORIZACAO'); assert.equal(pede.body.status, 'PENDENTE'); assert.equal(pede.body.user, undefined);
        // DELETE restaura
        r = await srv.request('DELETE', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FAMILIA', chave: '/api/pedidos' } });
        assert.equal(r.status, 200); assert.equal(r.body.removido, true); assert.equal(r.body.antes, 'BLOQUEADO');
        assert.equal((await srv.request('GET', `/api/pedidos/${UUID}`, { headers: H })).status, 200);
        r = await srv.request('DELETE', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FAMILIA', chave: '/api/pedidos' } });
        assert.equal(r.body.removido, false);
    } finally { await srv.close(); }
});

test('cache dos overrides: mudança direta no banco só vale após o TTL/invalidação; token e permissões continuam vivos', async () => {
    const { db, srv, politicaSvc } = await subir();
    try {
        const { claro, row } = cenario(db);
        const H = bearer(claro);
        assert.equal((await srv.request('GET', '/api/produtos', { headers: H })).status, 200);
        const antes = db.consultasPolitica;
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'BLOQUEADO' });
        // dentro do TTL (15 s): ainda o cache; e NÃO consultou o banco de novo
        assert.equal((await srv.request('GET', '/api/produtos', { headers: H })).status, 200);
        assert.equal(db.consultasPolitica, antes);
        politicaSvc.invalidar('luke');
        assert.equal((await srv.request('GET', '/api/produtos', { headers: H })).status, 403);
        // revogação do token vale na hora, mesmo com política em cache
        row.revogadoEm = new Date();
        assert.equal((await srv.request('GET', '/api/pedidos', { headers: H })).status, 401);
        assert.equal(politicaSvc.TTL_MS, 15000);
    } finally { await srv.close(); }
});

test('linha de override inválida no banco é ignorada (nível estranho, LIBERADO em escrita)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'TALVEZ' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'POST /api/produtos', nivel: 'LIBERADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/produtos', nivel: 'LIBERADO' });
        assert.equal((await srv.request('GET', '/api/produtos', { headers: bearer(claro) })).status, 200);
        const w = await srv.request('POST', '/api/produtos', { headers: bearer(claro), body: {} });
        assert.equal(w.status, 202); assert.equal(w.body.codigo, 'AGENTE_PEDE_AUTORIZACAO');
    } finally { await srv.close(); }
});

test('URL que casa com vários padrões vale o MAIS RESTRITIVO', () => {
    const app2 = express();
    const r = express.Router();
    r.get('/:id', (q, s) => s.json({ ok: 1 }));
    r.get('/especial', (q, s) => s.json({ ok: 2 }));
    app2.use('/api/produtos', r);
    const { resolver } = require('../services/agenteCatalogoRotas');
    const { resolverEntrada } = politicaComMock();
    const entradas = resolver(app2, 'GET', '/api/produtos/especial').entradas;
    assert.equal(entradas.length, 2);
    const ov = { funcao: new Map([['GET /api/produtos/especial', 'BLOQUEADO']]), familia: new Map() };
    assert.deepEqual(entradas.map((e) => resolverEntrada(e, ov).nivel).sort(), ['BLOQUEADO', 'LIBERADO']);
    // URL que casa só com o curinga fica LIBERADA; URL desconhecida não casa com nada
    assert.equal(resolver(app2, 'GET', '/api/produtos/abc').entradas.length, 1);
    assert.equal(resolver(app2, 'GET', '/api/produtos/abc/def').entradas.length, 0);
});

// ───────────────────────── caminhos tortuosos ─────────────────────────
test('caminhos tortuosos nunca alcançam a rota: `..`, %2e, //, `/API/` e query com caminho', async () => {
    const { db, srv } = await subir();
    try {
        const { claro } = cenario(db);
        const tortos = ['/api/pedidos/../vendedores', '/api/pedidos/%2e%2e/vendedores', '/api/pedidos//x', '/api/pedidos/%2F..%2Fvendedores',
            '/api/pedidos/%5c..%5cvendedores', '/api/pedidos/x%00', '//api/pedidos', '/api/pedidos/%2E%2e/config'];
        for (const u of tortos) {
            const r = await crua(srv.baseUrl, u, claro);
            assert.ok(r.status === 403 || r.status === 404, `${u} → ${r.status}`);
            assert.ok(!/"ok":true/.test(r.texto), `${u} alcançou a rota: ${r.texto}`);
        }
        // `/API/VENDEDORES` (caixa alta) é normalizado e cai no bloqueio fixo
        const r1 = await crua(srv.baseUrl, '/API/VENDEDORES', claro);
        assert.equal(r1.status, 403);
        assert.match(r1.texto, /"fixo":true/);
        // `/API/PEDIDOS` é a MESMA função que `/api/pedidos` (Express ignora caixa): mesmo resultado, nenhuma brecha
        assert.equal((await crua(srv.baseUrl, '/API/PEDIDOS', claro)).status, 200);
        // `?` não muda a chave: query com caminho de outra rota não libera nem bloqueia
        assert.equal((await crua(srv.baseUrl, '/api/pedidos?x=/api/vendedores', claro)).status, 200);
        const r2 = await crua(srv.baseUrl, '/api/vendedores?x=/api/pedidos', claro);
        assert.equal(r2.status, 403);
        assert.match(r2.texto, /GET \/api\/vendedores/);
        // barra final e id numérico/uuid não escapam do catálogo
        assert.equal((await crua(srv.baseUrl, '/api/pedidos/', claro)).status, 200);
        assert.equal((await crua(srv.baseUrl, '/api/pedidos/12345', claro)).status, 200);
        // método HEAD/OPTIONS-like inventado não está no catálogo
        assert.equal((await crua(srv.baseUrl, '/api/pedidos', claro, 'HEAD')).status, 403);
        assert.equal((await crua(srv.baseUrl, '/api/pedidos', claro, 'TRACE')).status, 403);
    } finally { await srv.close(); }
});

// ───────────────────────── humano / JWT intactos ─────────────────────────
test('JWT humano, admin e usuário externo seguem exatamente como antes (política não os toca)', async () => {
    const { db, srv } = await subir();
    try {
        const { adminJwt, vendJwt } = cenario(db);
        db.addVendedor({ id: 'ctd', nome: 'Contador', permissoes: { Usuario_Externo: true } });
        db.addVendedor({ id: 'luke-jwt', nome: 'Agente com JWT', agente: true });
        for (const jwtTok of [adminJwt, vendJwt]) {
            for (const [m, u] of [['GET', '/api/vendedores'], ['POST', '/api/pedidos'], ['GET', url(catalogoReal().find((e) => e.familia === '/api/kitfesta' && e.metodo === 'GET'))], ['GET', `/api/pedidos/${UUID}/danfe`], ['GET', '/api/auth/midia-token']]) {
                const r = await srv.request(m, u, { headers: bearer(jwtTok), body: m === 'GET' ? undefined : {} });
                assert.equal(r.status, 200, `${m} ${u} → ${r.status}`);
                assert.equal(r.body.agente, false);
            }
        }
        const ext = bearer(jwtDe('ctd'));
        assert.equal((await srv.request('GET', '/api/contabilidade/relatorio-receber', { headers: ext })).status, 200);
        const bloq = await srv.request('GET', '/api/pedidos', { headers: ext });
        assert.equal(bloq.status, 403); assert.equal(bloq.body.codigo, 'USUARIO_EXTERNO');
        assert.equal((await srv.request('GET', '/api/pedidos', { headers: bearer(jwtDe('luke-jwt')) })).status, 401); // agente não entra por JWT
        assert.equal((await srv.request('GET', '/api/pedidos')).status, 401);
    } finally { await srv.close(); }
});

// ───────────────────────── contexto de agente ─────────────────────────
test('assertNaoAgente: dentro de rodarComoAgente lança; fora não faz nada (inclusive após await)', async () => {
    const { rodarComoAgente, assertNaoAgente, contextoAgente } = require('../utils/agenteContexto');
    for (const acao of ['WHATSAPP', 'NFE', 'SEFAZ']) {
        assert.doesNotThrow(() => assertNaoAgente(acao));
        assert.throws(() => rodarComoAgente({ vendedorId: 'luke' }, () => assertNaoAgente(acao)), (e) => e.codigo === 'AGENTE_ACAO_PROIBIDA' && e.status === 403 && e.message.includes(acao));
    }
    await rodarComoAgente({ vendedorId: 'luke' }, async () => {
        await esperar(5);
        await new Promise((r) => setImmediate(r));
        assert.equal(contextoAgente().vendedorId, 'luke');
        assert.throws(() => assertNaoAgente('NFE'), /NFE/);
    });
    assert.equal(contextoAgente(), null);
    assert.doesNotThrow(() => assertNaoAgente('WHATSAPP'));
});

test('as funções reais de envio/emissão/SEFAZ recusam dentro do contexto de agente (e não recusam fora)', async () => {
    const { rodarComoAgente } = require('../utils/agenteContexto');
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo('services/botWhatsappService.js', 'services/focusNfeEmissaoService.js', 'services/focusNfeService.js', 'services/sefazDfeService.js', 'services/consultaCnpjService.js');
    const bot = require('../services/botWhatsappService');
    const emissao = require('../services/focusNfeEmissaoService');
    const focus = require('../services/focusNfeService');
    const sefaz = require('../services/sefazDfeService');
    restaurar();
    const proibida = (e) => e && e.codigo === 'AGENTE_ACAO_PROIBIDA';
    const dentro = (fn) => rodarComoAgente({ vendedorId: 'luke' }, fn);
    await assert.rejects(dentro(() => bot.enviar({ telefone: '48999999999', texto: 'oi', tipo: 'interno', origem: 't', referencia: 'r' })), proibida);
    await assert.rejects(dentro(() => bot.enviarEmPartes({ telefone: '48999999999', partes: ['a'], tipo: 'interno', origem: 't', referenciaBase: 'r' })), proibida);
    await assert.rejects(dentro(() => emissao.emitirVenda('p1')), proibida);
    await assert.rejects(dentro(() => emissao.emitirDevolucao('d1')), proibida);
    assert.throws(() => dentro(() => focus.emitir('ref', {})), proibida);
    assert.throws(() => dentro(() => focus.cancelar('ref', 'justificativa longa o bastante')), proibida);
    await assert.rejects(dentro(() => sefaz.manifestar({ notaId: 'n', tipo: 'CIENCIA' })), proibida);
    await assert.rejects(dentro(() => sefaz.executarCiclo({ manual: true })), proibida);
    await assert.rejects(dentro(() => sefaz.buscarPorChave('1'.repeat(44))), proibida);
    // fora do contexto o assert não interfere: o erro (se houver) é o de sempre (mock sem stub), nunca o do agente
    for (const chamada of [() => bot.enviar({ telefone: '48999999999', texto: 'oi', tipo: 'interno', origem: 't', referencia: 'r' }), () => emissao.emitirVenda('p1'), () => sefaz.buscarPorChave('curta')]) {
        try { await chamada(); } catch (e) { assert.ok(!proibida(e), 'recusou fora do contexto de agente'); }
    }
});

test('o contexto de agente chega ao handler da rota (authMiddleware -> AsyncLocalStorage); humano não tem contexto', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        const a = await srv.request('GET', '/api/pedidos/teste-assert', { headers: bearer(claro) });
        assert.equal(a.status, 500);
        assert.equal(a.body.codigo, 'AGENTE_ACAO_PROIBIDA');
        const h = await srv.request('GET', '/api/pedidos/teste-assert', { headers: bearer(adminJwt) });
        assert.equal(h.status, 200);
    } finally { await srv.close(); }
});

// ───────────────────────── auditoria ─────────────────────────
test('auditoria AGENTE_REQUISICAO: grava negação (sem segredo), dedupe 60 s com contador, e NÃO grava leitura liberada', async () => {
    const { db, srv, auditoria } = await subir();
    try {
        const { claro, row } = cenario(db);
        const H = bearer(claro);
        for (let i = 0; i < 3; i++) await srv.request('GET', '/api/pedidos', { headers: H }); // liberado: não audita
        await esperar(30);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').length, 0);
        const r = await srv.request('GET', '/api/vendedores?token=naovaleste&x=1', { headers: H }); // query com "token" mas não é cah_ag_
        assert.equal(r.status, 403);
        const reqId = r.headers.get('x-request-id');
        assert.match(reqId, /^[0-9a-f-]{36}$/);
        await esperar(30);
        let linhas = db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO');
        assert.equal(linhas.length, 1);
        const d = JSON.parse(linhas[0].detalhes);
        assert.equal(d.reqId, reqId); assert.equal(d.metodo, 'GET'); assert.equal(d.caminho, '/api/vendedores');
        assert.equal(d.chave, 'GET /api/vendedores'); assert.equal(d.nivel, 'BLOQUEADO'); assert.equal(d.status, 403);
        assert.equal(d.tokenPrefixo, row.prefixo); assert.equal(typeof d.ms, 'number'); assert.ok(d.ip);
        assert.equal(linhas[0].usuarioId, 'luke'); assert.equal(linhas[0].entidade, 'Agente');
        const bruto = JSON.stringify(linhas);
        assert.ok(!bruto.includes(claro) && !bruto.includes(row.hash) && !bruto.includes('naovaleste') && !bruto.includes('authorization'));
        // repetidas: 4 iguais na janela → continua 1 linha; o resumo traz repeticoes = 4
        for (let i = 0; i < 4; i++) await srv.request('GET', '/api/vendedores', { headers: H });
        await esperar(30);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').length, 1);
        auditoria.varrer(true);
        await esperar(30);
        linhas = db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO');
        assert.equal(linhas.length, 2);
        assert.deepEqual([JSON.parse(linhas[1].detalhes).resumo, JSON.parse(linhas[1].detalhes).repeticoes], [true, 4]);
        // outra chave / outro status NÃO é deduplicado
        await srv.request('POST', '/api/pedidos', { headers: H, body: {} });
        await srv.request('GET', '/api/config', { headers: H });
        await esperar(30);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').length, 4);
    } finally { await srv.close(); }
});

test('falha ao gravar a auditoria nunca derruba nem atrasa a resposta', async () => {
    const mem = memoria();
    mem.db.falharAudit = true; // (o mock é um Proxy: atribuir método nele não pega — por isso a flag)
    const { srv } = await subir(mem);
    try {
        const { claro } = cenario(mem.db);
        const r = await srv.request('GET', '/api/vendedores', { headers: bearer(claro) });
        assert.equal(r.status, 403);
        await esperar(30);
    } finally { await srv.close(); }
});

// ───────────────────────── API da política ─────────────────────────
test('API da política: só admin humano (agente 403, não-admin 403, sem token 401)', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, vendJwt, adminJwt } = cenario(db);
        for (const [m, u, b] of [['GET', '/api/agentes/luke/politicas'], ['GET', '/api/agentes/luke/politicas/familias'],
            ['PUT', '/api/agentes/luke/politicas', { escopo: 'FAMILIA', chave: '/api/produtos', nivel: 'BLOQUEADO' }], ['DELETE', '/api/agentes/luke/politicas', { escopo: 'FAMILIA', chave: '/api/produtos' }]]) {
            const ag = await srv.request(m, u, { headers: bearer(claro), body: b });
            assert.equal(ag.status, 403, `agente ${m} ${u}`); assert.equal(ag.body.codigo, 'AGENTE_BLOQUEADO'); assert.equal(ag.body.fixo, true);
            const nv = await srv.request(m, u, { headers: bearer(vendJwt), body: b });
            assert.equal(nv.status, 403, `não-admin ${m} ${u}`);
            assert.equal((await srv.request(m, u, { body: b })).status, 401);
        }
        assert.equal(db.politicas.length, 0);
        assert.equal((await srv.request('GET', '/api/agentes/luke/politicas', { headers: bearer(adminJwt) })).status, 200);
        assert.equal((await srv.request('GET', '/api/agentes/naoexiste/politicas', { headers: bearer(adminJwt) })).status, 404);
    } finally { await srv.close(); }
});

test('API da política: lista mesclada (filtros/paginação), famílias, validações e AuditLog antes→depois', async () => {
    const { db, srv } = await subir();
    try {
        const { adminJwt } = cenario(db);
        const A = bearer(adminJwt);
        let r = await srv.request('GET', '/api/agentes/luke/politicas?familia=/api/pedidos&porPagina=100', { headers: A });
        assert.equal(r.status, 200);
        assert.equal(r.body.agente.nome, 'Luke');
        assert.ok(r.body.total >= 30 && r.body.itens.length === r.body.total);
        const it = r.body.itens.find((i) => i.chave === 'GET /api/pedidos/:p');
        assert.deepEqual([it.nivelEfetivo, it.origem, it.fixo, it.familia, it.exemplo], ['LIBERADO', 'seed', false, '/api/pedidos', '/api/pedidos/:p']);
        assert.ok(r.body.itens.every((i) => ['LIBERADO', 'PEDE', 'BLOQUEADO'].includes(i.nivelEfetivo)));
        r = await srv.request('GET', '/api/agentes/luke/politicas?nivel=LIBERADO&porPagina=10&pagina=2', { headers: A });
        assert.equal(r.body.itens.length, 10); assert.equal(r.body.pagina, 2);
        assert.ok(r.body.itens.every((i) => i.nivelEfetivo === 'LIBERADO'));
        r = await srv.request('GET', '/api/agentes/luke/politicas?familia=/api/vendedores', { headers: A });
        assert.ok(r.body.itens.every((i) => i.fixo === true && i.origem === 'fixo' && i.nivelEfetivo === 'BLOQUEADO'));
        // semRegra: sem fixo e sem override
        await srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'BLOQUEADO', motivo: 'm' } });
        r = await srv.request('GET', '/api/agentes/luke/politicas?familia=/api/produtos&semRegra=1&porPagina=100', { headers: A });
        assert.ok(!r.body.itens.some((i) => i.chave === 'GET /api/produtos'));
        r = await srv.request('GET', '/api/agentes/luke/politicas?q=produtos&porPagina=200', { headers: A });
        const ov = r.body.itens.find((i) => i.chave === 'GET /api/produtos');
        assert.deepEqual([ov.origem, ov.nivelEfetivo, ov.motivo, ov.atualizadoPorNome], ['override', 'BLOQUEADO', 'm', 'x']);
        r = await srv.request('GET', '/api/agentes/luke/politicas/familias', { headers: A });
        const fam = r.body.familias.find((f) => f.familia === '/api/produtos');
        assert.equal(fam.comOverride, 1); assert.equal(fam.total, fam.liberado + fam.pede + fam.bloqueado);
        const fixo = r.body.familias.find((f) => f.familia === '/api/vendedores');
        assert.equal(fixo.bloqueado, fixo.total);
        // validações
        const put = (body) => srv.request('PUT', '/api/agentes/luke/politicas', { headers: A, body });
        assert.equal((await put({ escopo: 'X', chave: 'GET /api/produtos', nivel: 'PEDE' })).status, 400);
        assert.equal((await put({ escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'TALVEZ' })).status, 400);
        assert.equal((await put({ escopo: 'FUNCAO', chave: 'GET /api/nao-existe', nivel: 'PEDE' })).status, 422);
        assert.equal((await put({ escopo: 'FAMILIA', chave: '/api/nao-existe', nivel: 'PEDE' })).status, 422);
        const esc = await put({ escopo: 'FUNCAO', chave: 'POST /api/produtos', nivel: 'LIBERADO' });
        assert.equal(esc.status, 422); assert.match(esc.body.error, /escrita/i);
        assert.equal((await put({ escopo: 'FUNCAO', chave: 'POST /api/produtos', nivel: 'BLOQUEADO' })).status, 200);
        assert.equal((await put({ escopo: 'FUNCAO', chave: 'GET /api/produtos/:ID', nivel: 'PEDE' })).status, 200); // normaliza :ID -> :p
        assert.equal((await put({ escopo: 'FUNCAO', chave: 'POST /api/contas-pagar/avaliar-custo', nivel: 'LIBERADO' })).status, 200); // prévia é leitura
        // auditoria antes→depois
        await put({ escopo: 'FUNCAO', chave: 'GET /api/produtos', nivel: 'LIBERADO', motivo: 'voltou' });
        await srv.request('DELETE', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'FUNCAO', chave: 'GET /api/produtos' } });
        const alt = db.audits.filter((a) => a.acao === 'AGENTE_POLITICA_ALTERADA').map((a) => JSON.parse(a.detalhes));
        const g = alt.filter((d) => d.chave === 'GET /api/produtos');
        assert.deepEqual(g.map((d) => [d.antes, d.depois]), [[null, 'BLOQUEADO'], ['BLOQUEADO', 'LIBERADO'], ['LIBERADO', 'PADRAO']]);
        assert.equal(g[0].motivo, 'm');
        assert.ok(!db.audits.some((a) => a.acao === 'AGENTE_POLITICA_ALTERADA' && a.usuarioId !== 'adm'));
        // DELETE sem corpo válido
        assert.equal((await srv.request('DELETE', '/api/agentes/luke/politicas', { headers: A, body: { escopo: 'Z', chave: 'x' } })).status, 400);
    } finally { await srv.close(); }
});

// ───────────────────────── meu-acesso ─────────────────────────
test('meu-acesso: mantém TODOS os campos antigos e acrescenta `politica` + `observacao`', async () => {
    const { db, srv, politicaSvc } = await subir();
    try {
        const { claro, row } = cenario(db);
        const m = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
        assert.equal(m.status, 200);
        for (const k of ['id', 'nome', 'agente', 'permissoes', 'caminhosPermitidos', 'token']) assert.ok(k in m.body, k);
        assert.equal(m.body.id, 'luke'); assert.equal(m.body.agente, true);
        assert.deepEqual(m.body.permissoes, { Pode_Ver_X: true });
        assert.ok(m.body.caminhosPermitidos.length >= 2);
        assert.equal(m.body.token.prefixo, row.prefixo);
        const p = m.body.politica;
        assert.ok(p.liberado > 100 && p.bloqueado > 500 && p.pede > 100);
        assert.ok(Array.isArray(p.familias) && p.familias.length > 50);
        assert.ok(p.familias.every((f) => 'familia' in f && 'liberado' in f && 'bloqueado' in f));
        assert.deepEqual(Object.keys(p).sort(), ['bloqueado', 'familias', 'liberado', 'pede']);
        assert.equal(typeof m.body.observacao, 'string');
        assert.ok(JSON.stringify(m.body).length < 20000, 'resumo não pode listar as rotas');
        // refletindo o override do dono
        assert.ok(p.familias.find((f) => f.familia === '/api/pedidos').liberado > 0);
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/pedidos', nivel: 'BLOQUEADO' });
        politicaSvc.invalidar('luke');
        const m2 = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: bearer(claro) });
        assert.equal(m2.body.politica.familias.find((f) => f.familia === '/api/pedidos').liberado, 0);
        assert.ok(m2.body.politica.liberado < p.liberado);
    } finally { await srv.close(); }
});

test('shim config/agenteAcesso: agentePodeAcessar segue cobrindo só o sempre-liberado (compat dos testes antigos)', () => {
    const { agentePodeAcessar, caminhosPermitidos } = require('../config/agenteAcesso');
    assert.equal(agentePodeAcessar('GET', '/api/auth/me'), true);
    assert.equal(agentePodeAcessar('GET', '/api/pedidos'), false);
    assert.equal(agentePodeAcessar('GET', '/api/agente/v1/../vendedores'), false);
    assert.ok(caminhosPermitidos().length >= 2);
});

test('política padrão: nenhuma família do seed colide com bloqueio fixo; nenhum seed libera escrita', () => {
    const padrao = require('../config/agentePoliticaPadrao');
    for (const f of padrao.FAMILIAS_LEITURA) assert.equal(padrao.ehBloqueioFixo('GET', f), false, f);
    for (const k of Object.keys(padrao.EXCECOES_LEITURA)) assert.ok(k.startsWith('GET '), k);
    for (const e of catalogoReal()) {
        if (e.metodo === 'GET') continue;
        const s = padrao.nivelSeed(e);
        if (s.nivel === 'LIBERADO') assert.ok(padrao.POST_LEITURA.has(e.chave), `${e.chave} liberada no seed`);
    }
});

// ═══════════════ Correções pós-revisão/QA ═══════════════

// D1 — rotas que chamam o authMiddleware com `res` FALSO (Como Fazer) não podem dar 500 para token de agente
async function subirComoFazer(db0) {
    const { db, prisma } = db0 || memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE, 'services/comoFazerAuthService.js', 'services/setoresService.js');
    const { comoFazerAuth } = require('../services/comoFazerAuthService');
    restaurar();
    const app = express();
    app.use(express.json());
    const r = express.Router();
    r.get('/admin/conteudos', (req, res) => res.json({ ok: true, cf: !!req.cf }));
    r.post('/admin/conteudos', (req, res) => res.json({ ok: true }));
    app.use('/api/como-fazer', comoFazerAuth, r);
    app.use((err, req, res, _n) => { console.error(err); res.status(500).json({ error: 'erro' }); });
    return { db, srv: await startTestServer(app) };
}

test('D1: token de agente em rota com authMiddleware via `res` falso (Como Fazer) → 403 (nunca 500) + auditoria; humano e lixo inalterados', async () => {
    const { db, srv } = await subirComoFazer();
    try {
        const { claro, vendJwt } = cenario(db);
        const H = bearer(claro);
        for (const [m, u] of [['GET', '/api/como-fazer/admin/conteudos'], ['POST', '/api/como-fazer/admin/conteudos'], ['GET', '/api/como-fazer/admin/conteudos?x=1']]) {
            const r = await srv.request(m, u, { headers: H, body: m === 'GET' ? undefined : {} });
            assert.equal(r.status, 403, `${m} ${u} → ${r.status} ${r.texto}`);
            assert.equal(r.body.codigo, 'NAO_AUTENTICADO'); // formato do módulo (proxy traduz {error} → {erro,codigo})
            assert.ok(r.headers.get('x-request-id'), 'o X-Request-Id passa pelo proxy');
        }
        await esperar(40);
        const aud = db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO');
        assert.ok(aud.length >= 2, 'negação auditada');
        assert.equal(JSON.parse(aud[0].detalhes).status, 403);
        assert.ok(!JSON.stringify(aud).includes(claro));
        // humano com JWT: passa como antes; `Bearer lixo`: 401 como antes; sem token: 401
        const h = await srv.request('GET', '/api/como-fazer/admin/conteudos', { headers: bearer(vendJwt) });
        assert.equal(h.status, 200); assert.equal(h.body.cf, true);
        const lixo = await srv.request('GET', '/api/como-fazer/admin/conteudos', { headers: bearer('lixo') });
        assert.equal(lixo.status, 401); assert.equal(lixo.body.codigo, 'NAO_AUTENTICADO');
        assert.equal((await srv.request('GET', '/api/como-fazer/admin/conteudos')).status, 401);
    } finally { await srv.close(); }
});

test('D1: limite por minuto (Retry-After) também não quebra com `res` falso → 429, nunca 500', async () => {
    const { db, srv } = await subirComoFazer();
    try {
        const { claro } = cenario(db, { token: { limitePorMinuto: 2 } });
        await srv.request('GET', '/api/como-fazer/admin/conteudos', { headers: bearer(claro) });
        await srv.request('GET', '/api/como-fazer/admin/conteudos', { headers: bearer(claro) });
        const r = await srv.request('GET', '/api/como-fazer/admin/conteudos', { headers: bearer(claro) });
        assert.equal(r.status, 429, r.texto);
        assert.ok(r.headers.get('retry-after'));
    } finally { await srv.close(); }
});

test('D1: setHeaderSeguro nunca lança, com res mock sem set/setHeader, com set que lança, ou nulo', () => {
    const { setHeaderSeguro } = require('../middlewares/authMiddleware');
    assert.doesNotThrow(() => setHeaderSeguro({ status() {}, json() {} }, 'X-Request-Id', 'a'));
    assert.doesNotThrow(() => setHeaderSeguro({ set() { throw new Error('x'); } }, 'X', 'y'));
    assert.doesNotThrow(() => setHeaderSeguro(null, 'X', 'y'));
    const visto = [];
    setHeaderSeguro({ setHeader: (n, v) => visto.push([n, v]) }, 'A', 'b');
    setHeaderSeguro({ set: (n, v) => visto.push([n, v]) }, 'C', 'd');
    assert.deepEqual(visto, [['A', 'b'], ['C', 'd']]);
});

test('D1: nenhum outro lugar chama o authMiddleware com `res` falso (varredura do código)', () => {
    const fs = require('fs');
    const { execSync } = require('child_process');
    const arquivos = execSync(`grep -rl "middlewares/authMiddleware" routes services controllers middlewares index.js`, { cwd: RAIZ, encoding: 'utf8' }).split('\n').filter(Boolean);
    const chamadores = [];
    for (const f of arquivos) {
        const src = fs.readFileSync(path.join(RAIZ, f), 'utf8');
        const m = src.match(/(?:const|let|var)\s+\{?\s*(\w+)\s*\}?\s*=\s*require\('[./]*\/middlewares\/authMiddleware'\)/);
        if (!m) continue;
        const uso = new RegExp(`\\b${m[1]}\\(`).test(src.replace(new RegExp(`require\\('[./]*/middlewares/authMiddleware'\\)`), ''));
        if (uso) chamadores.push(f);
    }
    assert.deepEqual(chamadores, ['services/comoFazerAuthService.js']);
});

// D2 — token no CAMINHO da URL também é 400 TOKEN_NA_URL (sem ecoar)
test('D2: token cah_ag_ em segmento de caminho (cru, codificado, em maiúsculas) → 400 TOKEN_NA_URL sem ecoar', async () => {
    const { db, srv } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        const sufixo = claro.slice(7);
        const alvos = [`/api/pedidos/${claro}`, `/api/pedidos/cah%5Fag%5F${sufixo}`, `/api/pedidos/%63ah_ag_${sufixo}`, `/api/pedidos/cah%255Fag%255F${sufixo}`,
            `/api/pedidos/${claro.toUpperCase()}`, `/api/pedidos/${claro}/danfe`, `/api/pedidos?x=${claro}`, `/api/pedidos/cah_%0Aag_${sufixo}`];
        for (const u of alvos) {
            for (const tok of [claro, adminJwt, 'lixo']) {
                const r = await crua(srv.baseUrl, u, tok);
                assert.equal(r.status, 400, `${u.slice(0, 40)} com ${tok.slice(0, 6)} → ${r.status}`);
                assert.match(r.texto, /TOKEN_NA_URL/);
                assert.ok(!r.texto.includes(sufixo), 'não ecoa o token');
            }
        }
        // URL sem token segue normal
        assert.equal((await crua(srv.baseUrl, '/api/pedidos/abc', claro)).status, 200);
        assert.equal((await crua(srv.baseUrl, '/api/pedidos/cah_x', claro)).status, 200);
    } finally { await srv.close(); }
});

// M1/M2/B1 — exceções novas e fixos novos (a matriz já cobre; aqui o nível e o motivo explícitos)
test('exceções do revisor: embarques/mapa, nota-fiscal, caixa config/autorizadores/audit-logs ficam fora do seed (só FUNCAO libera)', async () => {
    const padrao = require('../config/agentePoliticaPadrao');
    const novas = { 'GET /api/embarques/mapa': 'externo', 'GET /api/pedidos/:p/nota-fiscal': 'externo', 'GET /api/caixa/conferencia-dinheiro/config': 'grava',
        'GET /api/caixa/conferencia-dinheiro/autorizadores': 'grava', 'GET /api/caixa/audit-logs': 'sensivel' };
    for (const [k, motivo] of Object.entries(novas)) assert.equal(padrao.EXCECOES_LEITURA[k], motivo, k);
    const { db, srv } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        for (const k of Object.keys(novas)) {
            const e = catalogoReal().find((x) => x.chave === k);
            assert.ok(e, `${k} existe no catálogo`);
            const r = await srv.request('GET', url(e), { headers: bearer(claro) });
            assert.equal(r.status, 403, k); assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO'); assert.equal(r.body.fixo, false);
            // override de FAMILIA=LIBERADO não abre
            await srv.request('PUT', '/api/agentes/luke/politicas', { headers: bearer(adminJwt), body: { escopo: 'FAMILIA', chave: e.familia, nivel: 'LIBERADO' } });
            assert.equal((await srv.request('GET', url(e), { headers: bearer(claro) })).status, 403, `${k} com família liberada`);
            // override FUNCAO abre
            await srv.request('PUT', '/api/agentes/luke/politicas', { headers: bearer(adminJwt), body: { escopo: 'FUNCAO', chave: k, nivel: 'LIBERADO' } });
            assert.equal((await srv.request('GET', url(e), { headers: bearer(claro) })).status, 200, `${k} com FUNCAO liberada`);
        }
        // leituras do Conta Azul "iguais à tela humana" continuam liberadas
        for (const k of ['GET /api/financeiro-gerencial/por-conta', 'GET /api/financeiro-gerencial/dashboard', 'GET /api/contas-pagar/categorias', 'GET /api/contas-pagar/opcoes-baixa', 'GET /api/contas-receber/contas-financeiras', 'GET /api/conciliacao-bancaria/opcoes-despesa']) {
            assert.equal(padrao.EXCECOES_LEITURA[k], undefined, k);
        }
    } finally { await srv.close(); }
});

test('fixos novos: comissoes, ia-uso, ia-logs, visitors, diarios, gps-clientes → fixo mesmo com override FAMILIA/FUNCAO LIBERADO e a API recusa 422', async () => {
    const { db, srv, politicaSvc } = await subir();
    try {
        const { claro, adminJwt } = cenario(db);
        const fams = ['/api/comissoes', '/api/ia-uso', '/api/ia-logs', '/api/visitors', '/api/diarios', '/api/gps-clientes'];
        for (const f of fams) {
            db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: f, nivel: 'LIBERADO' });
            const gets = catalogoReal().filter((e) => e.familia === f && e.metodo === 'GET');
            assert.ok(gets.length, f);
            politicaSvc.invalidar('luke');
            for (const e of gets) {
                const r = await srv.request('GET', url(e), { headers: bearer(claro) });
                assert.equal(r.status, 403, e.chave); assert.equal(r.body.fixo, true, e.chave);
            }
            const put = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: bearer(adminJwt), body: { escopo: 'FAMILIA', chave: f, nivel: 'LIBERADO' } });
            assert.equal(put.status, 422, f);
        }
    } finally { await srv.close(); }
});

// B2 — limites do resolver e da auditoria
test('B2: caminho > 300 caracteres → BLOQUEADO antes do memo; memo é LRU parcial (não zera tudo)', async () => {
    const cat = require('../services/agenteCatalogoRotas');
    const app2 = express(); const r = express.Router(); r.get('/:id', (q, s) => s.json({})); app2.use('/api/produtos', r);
    const longa = '/api/produtos/' + 'a'.repeat(400);
    const res = cat.resolver(app2, 'GET', longa);
    assert.equal(res.tortuosa, true); assert.equal(res.entradas.length, 0);
    assert.equal(cat.catalogoDe(app2).memo.size, 0, 'não memoizou');
    assert.ok(cat.normalizarUrl('GET', '/api/produtos/' + 'a'.repeat(250)));
    // LRU parcial: enche o memo; o mais antigo sai, o recente fica; nunca zera
    const memo = cat.catalogoDe(app2).memo;
    for (let i = 0; i < cat.MEMO_MAX; i++) cat.resolver(app2, 'GET', `/api/produtos/id-${i}`);
    assert.equal(memo.size, cat.MEMO_MAX);
    cat.resolver(app2, 'GET', '/api/produtos/id-0'); // acesso recente protege da limpeza
    cat.resolver(app2, 'GET', '/api/produtos/novo-a'); // dispara a limpeza parcial
    assert.ok(memo.size > cat.MEMO_MAX * 0.85 && memo.size <= cat.MEMO_MAX, `memo.size=${memo.size}`);
    assert.ok(memo.has('GET /api/produtos/id-0'), 'o recém-usado sobrevive');
    assert.ok(!memo.has('GET /api/produtos/id-1'), 'o mais antigo saiu');
});

test('B2: auditoria deduplica por método+família (URLs diferentes) e respeita o teto por agente por minuto com 1 linha-resumo', async () => {
    const { db, srv, auditoria } = await subir();
    try {
        const { claro } = cenario(db);
        const H = bearer(claro);
        // 20 URLs diferentes da MESMA família/método → 1 linha (o resto vira repetição)
        for (let i = 0; i < 20; i++) await srv.request('GET', `/api/kitfesta/pedidos/x${i}`, { headers: H });
        await esperar(30);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').length, 1);
        auditoria.varrer(true); await esperar(30);
        const res1 = db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').map((a) => JSON.parse(a.detalhes)).filter((d) => d.resumo);
        assert.equal(res1.length, 1); assert.equal(res1[0].repeticoes, 19);
        // teto: famílias/métodos distintos além do teto → só TETO linhas + 1 resumo da janela
        db.audits.length = 0; auditoria.limpar();
        const fams = catalogoReal().filter((e) => e.metodo === 'GET' && e.exemplo.startsWith('/api/') && !SEED.includes(e.familia) && !['/api/auth', '/api/agente'].includes(e.familia) && !FIXOS_PREFIXOS.some((f) => e.exemplo.startsWith(f))).reduce((m, e) => (m.has(e.familia) ? m : m.set(e.familia, e)), new Map());
        assert.ok(fams.size > auditoria.TETO_POR_MINUTO + 5, `famílias distintas: ${fams.size}`);
        let negadas = 0;
        for (const e of fams.values()) { const rr = await srv.request('GET', url(e), { headers: H }); if (rr.status === 403) negadas += 1; }
        assert.equal(negadas, fams.size, 'toda família fora do seed é negada');
        await esperar(40);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_REQUISICAO').length, auditoria.TETO_POR_MINUTO);
        auditoria.varrer(true); await esperar(40);
        const resumos = db.audits.map((a) => JSON.parse(a.detalhes)).filter((d) => d.motivo === 'teto_por_minuto');
        assert.equal(resumos.length, 1); assert.equal(resumos[0].suprimidas, fams.size - auditoria.TETO_POR_MINUTO);
    } finally { await srv.close(); }
});

// B3 — cache stale vale no máximo 5 min
test('B3: banco de políticas fora → usa o último cache por até 5 min; depois 503 fail-closed (sempre-liberado segue)', async () => {
    const mem = memoria();
    const { db, srv, politicaSvc } = await subir(mem);
    const realNow = Date.now;
    try {
        const { claro } = cenario(db);
        const H = bearer(claro);
        assert.equal((await srv.request('GET', '/api/produtos', { headers: H })).status, 200); // carrega o cache
        mem.db.falharPolitica = true;
        const t0 = realNow();
        Date.now = () => t0 + politicaSvc.TTL_MS + 1000; // cache vencido, banco fora, ainda dentro de 5 min
        assert.equal((await srv.request('GET', '/api/produtos', { headers: H })).status, 200);
        Date.now = () => t0 + politicaSvc.STALE_MAX_MS + politicaSvc.TTL_MS + 5000; // além de 5 min
        const r = await srv.request('GET', '/api/produtos', { headers: H });
        assert.equal(r.status, 503); assert.equal(r.body.codigo, 'AGENTE_POLITICA_INDISPONIVEL');
        assert.equal((await srv.request('GET', '/api/auth/me', { headers: H })).status, 200); // não depende do banco de políticas
        assert.equal((await srv.request('GET', '/api/vendedores', { headers: H })).status, 403); // fixo também não
    } finally { Date.now = realNow; await srv.close(); }
});

// B4 — rota complexa: URL que casa com o prefixo → BLOQUEADO
test('B4: URL sob o prefixo de uma rota com regex no caminho é BLOQUEADA (fail-safe)', async () => {
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({ agentePolitica: { findMany: async () => [] } }));
    limparCacheContendo('services/agentePoliticaService.js');
    const pol = require('../services/agentePoliticaService');
    restaurar();
    const app2 = express();
    const r = express.Router();
    r.get('/opcional/:id?', (q, s) => s.json({}));      // complexa com prefixo literal /api/pedidos/opcional
    r.get('/livre/:id', (q, s) => s.json({}));           // normal
    r.get('/livre/abc/outra', (q, s) => s.json({}));
    app2.use('/api/pedidos', r);
    const d1 = await pol.avaliar(app2, 'luke', 'GET', '/api/pedidos/opcional/123');
    assert.equal(d1.nivel, 'BLOQUEADO'); assert.equal(d1.motivo, 'rota_complexa');
    assert.equal((await pol.avaliar(app2, 'luke', 'GET', '/api/pedidos/opcional')).nivel, 'BLOQUEADO');
    assert.equal((await pol.avaliar(app2, 'luke', 'GET', '/api/pedidos/livre/1')).nivel, 'LIBERADO');
    assert.equal((await pol.avaliar(app2, 'luke', 'GET', '/api/pedidos/livre/abc/outra')).nivel, 'LIBERADO');
    // regex de verdade: bloqueia o que vem do mount
    const app3 = express(); const r3 = express.Router();
    r3.get(/^\/x-(\d+)$/, (q, s) => s.json({})); r3.get('/ok', (q, s) => s.json({}));
    app3.use('/api/produtos', r3);
    assert.equal((await pol.avaliar(app3, 'luke', 'GET', '/api/produtos/ok')).nivel, 'BLOQUEADO');
});

// B5 — saídas ao mundo
test('B5: outras funções de saída (NF-e carta/e-mail, e-mail, WhatsApp fila, Asaas, agenda, Drive, SEFAZ agendada) recusam dentro do contexto de agente', async () => {
    const { rodarComoAgente } = require('../utils/agenteContexto');
    const restaurar = stubModule(DATABASE_MODULE, makeMockPrisma({}));
    limparCacheContendo('services/focusNfeService.js', 'services/emailService.js', 'services/botWhatsappService.js', 'services/asaasService.js', 'services/googleCalendarService.js', 'services/googleDriveService.js', 'services/sefazDfeService.js');
    const focus = require('../services/focusNfeService');
    const email = require('../services/emailService');
    const bot = require('../services/botWhatsappService');
    const asaas = require('../services/asaasService');
    const gcal = require('../services/googleCalendarService');
    const drive = require('../services/googleDriveService');
    const sefaz = require('../services/sefazDfeService');
    restaurar();
    const proib = (e) => e && e.codigo === 'AGENTE_ACAO_PROIBIDA';
    const dentro = (fn) => rodarComoAgente({ vendedorId: 'luke' }, fn);
    assert.throws(() => dentro(() => focus.cartaCorrecao('r', 'x'.repeat(20))), proib);
    assert.throws(() => dentro(() => focus.enviarEmail('r', ['a@b.com'])), proib);
    await assert.rejects(dentro(() => email.enviar('a@b.com', 'a', '<p>x</p>')), proib);
    await assert.rejects(dentro(() => bot.processarFila()), proib);
    await assert.rejects(dentro(() => bot.enviarEmPartes({ telefone: '1', partes: ['a'], tipo: 'interno', origem: 't', referenciaBase: 'r' })), proib);
    for (const fn of ['ensureCustomer', 'cancelarCobranca', 'cancelarCobrancasDoPedido', 'cancelarCobrancasDaParcela', 'marcarRecebida', 'criarBoletoParcela', 'registrarWebhook', 'salvarConfig']) {
        await assert.rejects(dentro(() => asaas[fn]('x', {})), proib, fn);
    }
    for (const fn of ['criarEvento', 'atualizarEvento', 'removerEvento']) await assert.rejects(dentro(() => gcal[fn]('x', {})), proib, fn);
    await assert.rejects(dentro(() => drive.salvarXmlNota({}, '/x')), proib);
    await assert.rejects(dentro(() => sefaz.processarBuscasAgendadas()), proib);
});
