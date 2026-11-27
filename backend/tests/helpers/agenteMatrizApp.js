// App de teste da MATRIZ do agente: um stub para cada rota do CATÁLOGO REAL (scripts/dump-catalogo-agente.js),
// atrás do authMiddleware verdadeiro, com as rotas reais de /api/agentes, /api/agente/v1 e /api/admin-exec/agente-matriz-*.
// Prisma é um mock em memória (nunca toca banco). Cada stub conta as execuções (`db.execucoes`) — é assim que os
// testes provam que uma repetição idempotente NÃO roda a rota de novo.
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./mockPrisma');
const { startTestServer } = require('./httpServer');
const { modeloSolicitacoes } = require('./memSolicitacoes');

const RAIZ = path.join(__dirname, '../..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['middlewares/authMiddleware.js', 'services/agenteTokenService.js', 'routes/agenteRoutes.js',
    'routes/agenteApiV1Routes.js', 'config/agenteAcesso.js', 'controllers/appAuthController.js',
    'services/agentePoliticaService.js', 'services/agenteAuditoriaService.js', 'services/agenteCatalogoRotas.js',
    'config/agentePoliticaPadrao.js', 'utils/agenteContexto.js', 'services/agenteSolicitacaoService.js', 'config/agenteAntes.js', 'config/agenteTelas.js',
    'config/agenteModulos.js', 'config/agenteClassificacao.js', 'config/agenteGuardas.js', 'services/agenteMatrizService.js',
    'services/agenteMatrizSeedService.js', 'services/agenteIdempotenciaService.js', 'services/agenteCriarService.js',
    'services/agenteKitService.js', 'config/agenteExemplos.js'];
const JWT_SECRET = process.env.JWT_SECRET;
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const UUID = '3f2b8a1c-9d4e-4b7a-8c11-5e6f7a8b9c0d';

let _catalogo;
function catalogoReal() {
    if (_catalogo) return _catalogo;
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/dump-catalogo-agente.js')], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x', CAH_SEM_LISTEN: '1' },
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error(`dump do catálogo falhou: ${r.stderr}`);
    _catalogo = JSON.parse(r.stdout);
    return _catalogo;
}

const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };

/** Modelo `agenteIdempotencia` em memória (chave única por vendedorId+chave, como no banco). */
function modeloIdempotencia(db) {
    db.idem = db.idem || [];
    return {
        create: async ({ data, select }) => {
            if (db.idem.some((l) => l.vendedorId === data.vendedorId && l.chave === data.chave)) { const e = new Error('Unique constraint'); e.code = 'P2002'; throw e; }
            const l = { id: `idem-${db.idem.length + 1}-${crypto.randomBytes(3).toString('hex')}`, status: 'EM_ANDAMENTO', respostaStatus: null, resposta: null, criadoEm: new Date(), ...data };
            db.idem.push(l);
            return pick(l, select);
        },
        findUnique: async ({ where, select }) => {
            const w = where.vendedorId_chave;
            const l = w ? db.idem.find((x) => x.vendedorId === w.vendedorId && x.chave === w.chave) : db.idem.find((x) => x.id === where.id);
            return l ? pick(l, select) : null;
        },
        update: async ({ where, data }) => {
            if (db.falharIdemUpdate) throw new Error('banco lento');
            const l = db.idem.find((x) => x.id === where.id);
            if (!l) throw new Error('linha não existe');
            for (const [k, v] of Object.entries(data)) if (v !== undefined) l[k] = v;
            return { ...l };
        },
        deleteMany: async ({ where }) => {
            const antes = db.idem.length;
            db.idem = db.idem.filter((l) => {
                if (where.id !== undefined && l.id !== where.id) return true;
                if (where.status !== undefined && l.status !== where.status) return true;
                if (where.criadoEm && where.criadoEm.lt && !(l.criadoEm < where.criadoEm.lt)) return true;
                return false;
            });
            return { count: antes - db.idem.length };
        },
    };
}

function memoria() {
    const vendedores = new Map(); const tokens = new Map(); const audits = []; const politicas = []; const historico = [];
    const db = {
        vendedores, tokens, audits, politicas, historico, execucoes: {}, corpos: {},
        // o que as guardas "encontram" no banco (cada teste ajusta)
        guardas: { categorias: [], contaPagarIgual: null, fornecedorIgual: null, notaIgual: null, itemPcpIgual: null, falhar: false },
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, maxDescontoFlex: 100, login: null, senha: null, ...v }); },
        addToken(t) { const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, expiraEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, limitePorMinuto: 100000, criadoEm: new Date(), criadoPorId: 'adm', nome: 't', ...t }; tokens.set(row.id, row); return row; },
        addPolitica(p) { politicas.push({ id: `pol-${politicas.length + 1}`, motivo: null, atualizadoPorId: 'adm', atualizadoPorNome: 'Dono', atualizadoEm: new Date(), ...p }); },
    };
    const achar = (w) => politicas.find((p) => p.vendedorId === w.vendedorId && p.escopo === w.escopo && p.chave === w.chave);
    const modPolitica = {
        findMany: async ({ where }) => politicas.filter((p) => p.vendedorId === where.vendedorId).map((p) => ({ ...p })),
        findUnique: async ({ where, select }) => { const p = achar(where.vendedorId_escopo_chave); return p ? pick(p, select) : null; },
        upsert: async ({ where, create, update, select }) => {
            if (db.falharUpsertEm && db.falharUpsertEm === where.vendedorId_escopo_chave.chave) throw new Error('falha no meio do lote');
            const w = where.vendedorId_escopo_chave; const p = achar(w);
            if (p) { Object.assign(p, update, { atualizadoEm: new Date() }); return pick(p, select); }
            db.addPolitica({ ...create }); return pick(achar(w), select);
        },
        delete: async ({ where }) => { const p = achar(where.vendedorId_escopo_chave); politicas.splice(politicas.indexOf(p), 1); return p; },
        deleteMany: async ({ where }) => {
            let n = 0;
            for (let i = politicas.length - 1; i >= 0; i--) {
                const p = politicas[i];
                if (p.vendedorId === where.vendedorId && p.escopo === where.escopo && p.chave === where.chave) { politicas.splice(i, 1); n += 1; }
            }
            return { count: n };
        },
    };
    const solModelo = modeloSolicitacoes(db);
    // `$transaction` em memória: serializada e com ROLLBACK das políticas se o callback lançar (tudo ou nada, como no banco)
    let fila = Promise.resolve();
    const transacao = (fn, opcoes) => {
        db.ultimaOpcaoTransacao = opcoes || null;
        const rodar = fila.then(async () => {
            const copia = politicas.map((p) => ({ ...p }));
            try { return await fn({ $executeRaw: async () => 1, agenteSolicitacao: solModelo, agentePolitica: modPolitica }); }
            catch (e) { politicas.length = 0; politicas.push(...copia); throw e; }
        });
        fila = rodar.catch(() => {});
        return rodar;
    };
    const guarda = (campo) => async () => { if (db.guardas.falhar) throw new Error('banco fora'); return db.guardas[campo]; };
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findMany: async ({ where, select }) => [...vendedores.values()].filter((v) => (where && where.agente !== undefined ? v.agente === where.agente : true)).map((v) => pick(v, select)),
            create: async ({ data, select }) => {
                const v = { ativo: true, createdAt: new Date(), maxDescontoFlex: 100, ...data };
                vendedores.set(v.id, v);
                return pick(v, select);
            },
            update: async ({ where, data }) => { const v = vendedores.get(where.id); Object.assign(v, data); return { ...v }; },
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
        agentePolitica: modPolitica,
        agenteSolicitacao: solModelo,
        agenteIdempotencia: modeloIdempotencia(db),
        $transaction: transacao,
        auditLog: { create: async ({ data }) => { if (db.falharAudit) throw new Error('banco lento'); audits.push(data); return data; } },
        vendedorPermissoesHistorico: { create: async ({ data }) => { historico.push(data); return data; } },
        funcionario: { findFirst: async () => null },
        // leituras das guardas e do "antes"
        categoriaDespesa: { findMany: async ({ where }) => { if (db.guardas.falhar) throw new Error('banco fora'); return db.guardas.categorias.filter((c) => where.nome.in.includes(c.nome)); } },
        contaPagar: { findFirst: guarda('contaPagarIgual'), findUnique: async () => null },
        parcelaPagar: { findUnique: async () => null },
        parcela: { findUnique: async () => null },
        fornecedor: { findFirst: guarda('fornecedorIgual'), findUnique: async () => null },
        notaEntrada: { findFirst: guarda('notaIgual') },
        itemPcp: { findFirst: guarda('itemPcpIgual') },
    });
    return { db, prisma };
}

/**
 * Sobe o app. `opts.rotasExtras`: [{ metodo, caminho }] — rotas que NÃO existem no sistema (para simular "rota nova").
 * Devolve { db, srv, app, politicaSvc, matrizSvc, seedSvc, idemSvc }.
 */
async function subir(opts = {}) {
    const { db, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    const authMiddleware = require('../../middlewares/authMiddleware');
    const agenteRoutes = require('../../routes/agenteRoutes');
    const agenteApi = require('../../routes/agenteApiV1Routes');
    const politicaSvc = require('../../services/agentePoliticaService');
    const matrizSvc = require('../../services/agenteMatrizService');
    const seedSvc = require('../../services/agenteMatrizSeedService');
    const idemSvc = require('../../services/agenteIdempotenciaService');
    const guardas = require('../../config/agenteGuardas');
    require('../../services/agenteCriarService');
    restaurar();

    const app = express();
    app.use(express.json());
    // as duas rotas de manutenção (mesmo corpo de routes/adminExec.js, sem carregar o arquivo inteiro). Vêm ANTES dos
    // stubs: o catálogo real tem /api/admin-exec/*, e o stub dele (atrás do authMiddleware) capturaria a chamada.
    app.post('/api/admin-exec/agente-matriz-seed', async (req, res) => {
        try { res.json(await seedSvc.semear(req.app, { agenteId: req.query.agenteId || null, confirmar: req.query.confirmar === '1', sobrescrever: req.query.sobrescrever === '1' })); }
        catch (err) { res.status(err.status || 500).json({ error: err.message, ...(err.agentes ? { agentes: err.agentes } : {}), ...(err.extra || {}) }); }
    });
    app.post('/api/admin-exec/agente-matriz-desligar', async (req, res) => {
        try { res.json(await seedSvc.desligar({ agenteId: req.query.agenteId || null, confirmar: req.query.confirmar === '1' })); }
        catch (err) { res.status(err.status || 500).json({ error: err.message }); }
    });
    const grupos = new Map();
    const entradas = [...catalogoReal(), ...(opts.rotasExtras || []).map((r) => ({ metodo: r.metodo, exemplo: r.caminho, extra: true, responder: r.responder }))];
    for (const e of entradas) {
        if (!e.exemplo.startsWith('/api/')) continue;
        const seg = e.exemplo.split('/')[2];
        if (seg === 'agentes' || seg === 'agente') continue;
        if (!grupos.has(seg)) grupos.set(seg, []);
        // rotas extras vão na FRENTE (senão um `/:p` do catálogo as captura)
        if (e.extra) grupos.get(seg).unshift(e); else grupos.get(seg).push(e);
    }
    for (const [seg, lista] of grupos) {
        const router = express.Router();
        for (const e of lista) {
            let n = 0;
            const resto = e.exemplo.split('/').slice(3).map((s) => (s === ':p' ? `:p${n++}` : s)).join('/');
            const chave = `${e.metodo} ${e.exemplo}`;
            router[e.metodo.toLowerCase()]('/' + resto, (req, res) => {
                db.execucoes[chave] = (db.execucoes[chave] || 0) + 1;
                db.corpos[chave] = req.body;
                if (e.responder) return e.responder(req, res, db);
                const st = db.statusDe && db.statusDe[chave];
                if (st) return res.status(st).json({ error: `falha simulada ${st}` });
                if (db.respostaLista && db.respostaLista[chave]) return res.json([{ id: 1 }]);
                return res.status(e.metodo === 'POST' ? 201 : 200).json({ ok: true, id: `reg-${db.execucoes[chave]}`, user: req.user.id, agente: req.user.agente === true, sol: req.user.agenteSolicitacaoId || null });
            });
        }
        // authMiddleware DUAS vezes de propósito: no sistema real muitas rotas têm o do mount + o da própria rota
        app.use(`/api/${seg}`, authMiddleware, authMiddleware, router);
    }
    app.use('/api/agentes', agenteRoutes);
    app.use('/api/agente/v1', authMiddleware, agenteApi);
    app.use((err, req, res, _n) => { console.error(err); res.status(500).json({ error: 'erro' }); });
    const srv = await startTestServer(app);
    return { db, srv, app, politicaSvc, matrizSvc, seedSvc, idemSvc, guardas };
}

const jwtDe = (id) => jwt.sign({ id, nome: id === 'adm' ? 'Dono' : 'x' }, JWT_SECRET, { expiresIn: '1h' });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

/** Luke (agente) com token, o dono (admin) e um vendedor comum. */
function cenario(db, { permissoes } = {}) {
    const claro = `cah_ag_${crypto.randomBytes(32).toString('base64url')}`;
    db.addVendedor({ id: 'luke', nome: 'Luke', agente: true, acessoExterno: true, permissoes: permissoes || { Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true } });
    db.addToken({ vendedorId: 'luke', hash: hash(claro), prefixo: claro.slice(7, 15) });
    db.addVendedor({ id: 'adm', nome: 'Dono', permissoes: { admin: true, Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true, clientes: { view: true, edit: true }, Usuario_Externo: false } });
    db.addVendedor({ id: 'vend', nome: 'Vendedor', permissoes: { clientes: { view: true, edit: false } } });
    return { claro, luke: bearer(claro), admin: bearer(jwtDe('adm')), vend: bearer(jwtDe('vend')) };
}

module.exports = { subir, memoria, cenario, catalogoReal, modeloIdempotencia, bearer, jwtDe, UUID, RAIZ, DATABASE_MODULE, CACHE };
