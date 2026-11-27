// Caixa: usuário externo (contador "KONTISA", agente de IA "Luke") NÃO tem caixa para fechar.
// Cobre o critério único (services/vendedorCaixa.js) e cada lista que o usava:
//   - pílulas do dia / pendências anteriores (GET /caixa/resumo-dia → resumoDoDia)
//   - seletor do caixa (GET /caixa/vendedores-do-dia)
//   - fila "a conferir" e "a fechar" da agenda
//   - worker: virada do dia e aviso de caixa parado
// Prisma mockado — nunca toca banco real.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const DATABASE = path.join(__dirname, '../config/database.js');
const R = (rel) => path.join(__dirname, '..', rel);
const CACHE = [
    'routes/caixa.js', 'services/caixaConferenciaService.js', 'services/caixaConferenciaWorker.js',
    'services/vendedorCaixa.js', 'config/caixaConferenciaConfig.js', 'middlewares/authMiddleware.js',
];

// ── Elenco ───────────────────────────────────────────────────────────────
const ADMIN = { id: 'admin1', nome: 'Dono', ativo: true, acessoExterno: false, permissoes: { admin: true } };
const MOTORISTA = { id: 'mot1', nome: 'Jociel', ativo: true, acessoExterno: false, permissoes: { Pode_Acessar_Caixa: true } };
const VENDEDOR_STR = { id: 'ven1', nome: 'Patrik', ativo: true, acessoExterno: false, permissoes: JSON.stringify({ Pode_Acessar_Caixa: true }) };
const SEM_PERMS = { id: 'ven2', nome: 'Sem Permissões', ativo: true, acessoExterno: false, permissoes: null }; // null NÃO pode virar "externo"
const LUKE = { id: 'luke', nome: 'Luke', ativo: true, acessoExterno: true, permissoes: {} };                     // agente de IA
const KONTISA = { id: 'kont', nome: 'KONTISA CONTABILIDADE', ativo: true, acessoExterno: true, permissoes: { Usuario_Externo: true, Isento_Ponto: true } };
const SO_PERMISSAO = { id: 'ext2', nome: 'Externo só por permissão', ativo: true, acessoExterno: false, permissoes: { Usuario_Externo: true } };
const ELENCO = [ADMIN, MOTORISTA, VENDEDOR_STR, SEM_PERMS, LUKE, KONTISA, SO_PERMISSAO];
const EXTERNOS = [LUKE, KONTISA, SO_PERMISSAO];
const NORMAIS = [MOTORISTA, VENDEDOR_STR, SEM_PERMS];

const DATA = '2026-11-25'; // quarta-feira
const HOJE = new Date();
const pad = (n) => String(n).padStart(2, '0');
const ontem = (() => { const d = new Date(HOJE); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();

const sel = (v, select) => {
    if (!select) return { ...v };
    const o = {};
    for (const k of Object.keys(select)) if (select[k] === true) o[k] = v[k];
    return o;
};

/** Prisma "permissivo": tudo devolve vazio, exceto o que o teste informa. */
function prismaFalso({ atendimentos = [], diarios = [], caixas = [], caixasPorDia = [] } = {}) {
    const vazio = { findMany: async () => [], findUnique: async () => null, findFirst: async () => null, count: async () => 0 };
    const modelos = {
        vendedor: {
            findUnique: async ({ where, select }) => {
                const v = ELENCO.find(x => x.id === where.id);
                return v ? sel(v, select) : null;
            },
            findMany: async ({ where = {}, select } = {}) => {
                let r = ELENCO;
                if (where.id?.in) r = r.filter(v => where.id.in.includes(v.id));
                if (where.ativo === true) r = r.filter(v => v.ativo);
                if (where.acessoExterno === false) r = r.filter(v => v.acessoExterno === false);
                return r.map(v => sel(v, select));
            },
        },
        atendimento: { ...vazio, findMany: async () => atendimentos },
        diarioVendedor: { ...vazio, findMany: async () => diarios },
        caixaDiario: {
            ...vazio,
            findMany: async ({ where = {}, include, select } = {}) => {
                let r = where.dataReferencia === DATA || typeof where.dataReferencia === 'string' ? caixas : (where.dataReferencia?.in ? caixasPorDia : caixas);
                if (where.status) r = r.filter(c => c.status === where.status);
                if (where.dinheiroConferido !== undefined) r = r.filter(c => !!c.dinheiroConferido === where.dinheiroConferido);
                if (where.enviadoConferenciaEm === null) r = r.filter(c => !c.enviadoConferenciaEm);
                if (where.enviadoConferenciaEm?.not === null) r = r.filter(c => !!c.enviadoConferenciaEm);
                return r.map(c => {
                    const v = ELENCO.find(x => x.id === c.vendedorId);
                    const out = { ...c };
                    const rel = include?.vendedor || select?.vendedor;
                    if (rel) out.vendedor = sel(v, rel.select || rel);
                    return out;
                });
            },
            findUnique: async ({ where } = {}) => {
                const k = where?.vendedorId_dataReferencia;
                return k ? (caixasPorDia.find(c => c.vendedorId === k.vendedorId && c.dataReferencia === k.dataReferencia) || null) : null;
            },
        },
        appConfig: { findUnique: async () => null, upsert: async () => ({}) },
        pedido: vazio, despesa: vazio, cobrancaRota: vazio, tabelaPreco: vazio, embarque: vazio,
        pagamentoParcela: { aggregate: async () => ({ _sum: { valor: 0 } }) },
        $queryRaw: async () => [],
    };
    return new Proxy(modelos, {
        get(alvo, nome) {
            if (nome === 'then') return undefined;
            if (nome in alvo) return alvo[nome];
            return vazio; // qualquer outro model usado por baixo: vazio
        },
    });
}

function carregar(prisma, ...arquivos) {
    const restaurar = stubModule(DATABASE, prisma);
    limparCacheContendo(...CACHE.map(c => R(c)));
    const mods = arquivos.map(a => require(R(a)));
    restaurar();
    return mods;
}

const cx = (vendedorId, extra = {}) => ({
    id: `cx-${vendedorId}`, vendedorId, dataReferencia: ontem, status: 'ABERTO',
    dinheiroConferido: false, enviadoConferenciaEm: null, ...extra,
});

// ── 1. Critério único ────────────────────────────────────────────────────
test('vendedorOperaCaixa: externo por acessoExterno, por permissoes.Usuario_Externo e agente ficam de fora; normal fica', () => {
    const [{ vendedorOperaCaixa, lerPermissoes }] = carregar(prismaFalso(), 'services/vendedorCaixa.js');
    assert.equal(vendedorOperaCaixa(LUKE), false, 'agente (acessoExterno=true, permissoes {})');
    assert.equal(vendedorOperaCaixa(KONTISA), false, 'contador (acessoExterno + Usuario_Externo)');
    assert.equal(vendedorOperaCaixa(SO_PERMISSAO), false, 'externo só pela permissão (acessoExterno=false)');
    assert.equal(vendedorOperaCaixa({ acessoExterno: false, permissoes: { Usuario_Externo: 'true' } }), true, 'só `true` booleano conta');
    assert.equal(vendedorOperaCaixa({ acessoExterno: false, permissoes: {}, agente: true }), false, 'coluna futura `agente`');
    assert.equal(vendedorOperaCaixa({ acessoExterno: true }), false, 'sem permissoes no objeto');
    assert.equal(vendedorOperaCaixa(null), false);
    for (const v of NORMAIS) assert.equal(vendedorOperaCaixa(v), true, v.nome);
    assert.equal(vendedorOperaCaixa(ADMIN), true);
    assert.equal(vendedorOperaCaixa({ acessoExterno: false, permissoes: { admin: true, Isento_Ponto: true } }), true, 'Isento_Ponto não é externo');
    assert.deepEqual(lerPermissoes({ permissoes: '{json quebrado' }), {}, 'JSON inválido não lança');
});

test('idsQueOperamCaixa: devolve só quem opera; id desconhecido sai', async () => {
    const [{ idsQueOperamCaixa }] = carregar(prismaFalso(), 'services/vendedorCaixa.js');
    const ids = await idsQueOperamCaixa([...ELENCO.map(v => v.id), 'fantasma', null]);
    assert.deepEqual([...ids].sort(), [ADMIN, MOTORISTA, VENDEDOR_STR, SEM_PERMS].map(v => v.id).sort());
    assert.equal((await idsQueOperamCaixa([])).size, 0);
});

// ── 2. Pílulas do dia ────────────────────────────────────────────────────
test('resumoDoDia: externo com atendimento/diário/linha de caixa NÃO ganha pílula; motorista e vendedores continuam', async () => {
    const prisma = prismaFalso({
        atendimentos: [
            { idVendedor: MOTORISTA.id, usuarioRegistroId: LUKE.id },   // Luke registrou atendimento do motorista
            { idVendedor: VENDEDOR_STR.id, usuarioRegistroId: KONTISA.id },
            { idVendedor: SEM_PERMS.id, usuarioRegistroId: SO_PERMISSAO.id },
        ],
        diarios: [{ vendedorId: LUKE.id }, { vendedorId: KONTISA.id }],
        caixas: [{ vendedorId: KONTISA.id }, { vendedorId: SO_PERMISSAO.id }],
    });
    const [svc] = carregar(prisma, 'services/caixaConferenciaService.js');
    const r = await svc.resumoDoDia(DATA, { usuario: { id: ADMIN.id }, podeVerOutros: true });
    const ids = r.caixas.map(c => c.vendedorId).sort();
    assert.deepEqual(ids, [ADMIN.id, MOTORISTA.id, VENDEDOR_STR.id, SEM_PERMS.id].sort());
    for (const e of EXTERNOS) assert.ok(!ids.includes(e.id), `${e.nome} não pode ter pílula`);
    const mot = r.caixas.find(c => c.vendedorId === MOTORISTA.id);
    assert.equal(mot.temAtividade, true);
});

test('resumoDoDia: pendências anteriores não contam caixa aberto de externo', async () => {
    const enviado = new Date();
    const prisma = prismaFalso({
        caixasPorDia: [
            cx(MOTORISTA.id, { enviadoConferenciaEm: enviado }),
            cx(LUKE.id, { enviadoConferenciaEm: enviado }),
            cx(KONTISA.id, { enviadoConferenciaEm: enviado }),
            cx(SO_PERMISSAO.id, { enviadoConferenciaEm: enviado }),
        ],
    });
    const [svc] = carregar(prisma, 'services/caixaConferenciaService.js');
    const r = await svc.resumoDoDia(DATA, { usuario: { id: ADMIN.id }, podeVerOutros: true });
    const total = r.pendenciasAnteriores.reduce((s, p) => s + p.qtd, 0);
    assert.equal(total, 1, 'só o caixa do motorista');
});

// ── 3. Filas da agenda ───────────────────────────────────────────────────
test('listarAConferir e listarAFechar: externo nunca aparece; normal continua', async () => {
    const enviado = new Date();
    const prisma = prismaFalso({
        caixas: [
            ...ELENCO.filter(v => v.id !== ADMIN.id).map(v => cx(v.id, { enviadoConferenciaEm: enviado })),
        ],
    });
    const [svc] = carregar(prisma, 'services/caixaConferenciaService.js');
    const aConferir = await svc.listarAConferir({ usuario: { id: ADMIN.id }, perms: { admin: true }, incluirHoje: true });
    assert.deepEqual(aConferir.map(f => f.vendedorId).sort(), NORMAIS.map(v => v.id).sort());

    const prismaFechar = prismaFalso({
        caixas: ELENCO.filter(v => v.id !== ADMIN.id).map(v => cx(v.id, {
            dinheiroConferido: true, dinheiroConferidoPorId: 'outro', valorEsperadoConferencia: 0, diferencaConferencia: 0,
        })),
    });
    const [svc2] = carregar(prismaFechar, 'services/caixaConferenciaService.js');
    const aFechar = await svc2.listarAFechar({ usuario: { id: ADMIN.id }, perms: { admin: true } });
    assert.deepEqual(aFechar.map(f => f.vendedorId).sort(), NORMAIS.map(v => v.id).sort());
});

// ── 4. Worker ────────────────────────────────────────────────────────────
test('worker virada do dia: externo não entra na fila de conferência; normal entra', async () => {
    const atualizados = [];
    const prisma = prismaFalso({ caixas: ELENCO.filter(v => v.id !== ADMIN.id).map(v => cx(v.id)) });
    prisma.caixaDiario.update = async ({ where }) => { atualizados.push(where.id); return {}; };
    const [svc, worker] = carregar(prisma, 'services/caixaConferenciaService.js', 'services/caixaConferenciaWorker.js');
    svc.calcularValorAPrestar = async () => ({ temMovimento: true, valorAPrestar: 10 });
    const r = await worker.enviarCaixasDaVirada();
    assert.deepEqual(atualizados.sort(), NORMAIS.map(v => `cx-${v.id}`).sort());
    assert.equal(r.enviados, NORMAIS.length);
});

test('worker aviso de atraso: caixa de externo não entra na mensagem', async () => {
    const enviado = new Date(Date.now() - 5 * 86400000);
    const prisma = prismaFalso({
        caixas: ELENCO.filter(v => v.id !== ADMIN.id).map(v => cx(v.id, { dataReferencia: '2026-01-02', enviadoConferenciaEm: enviado })),
    });
    // quem confere (recebe o aviso) — com telefone
    const conferente = { id: 'conf1', nome: 'Conferente', ativo: true, telefone: '5547999990000', permissoes: { admin: true } };
    const original = prisma.vendedor.findMany;
    prisma.vendedor.findMany = async (args) => (args?.where?.telefone ? [conferente] : original(args));
    const mensagens = [];
    const restauraBot = stubModule(R('services/botWhatsappService.js'), {
        enviar: async (m) => { mensagens.push(m); return { ok: true }; },
        referenciaUnica: (b) => b,
    });
    try {
        const [svc, worker] = carregar(prisma, 'services/caixaConferenciaService.js', 'services/caixaConferenciaWorker.js');
        svc.calcularValorAPrestar = async () => ({ temMovimento: true, valorAPrestar: 10 });
        const r = await worker.avisarCaixasAtrasados();
        assert.equal(r.caixas, NORMAIS.length);
        assert.equal(mensagens.length, 1);
        const texto = mensagens[0].texto;
        for (const e of EXTERNOS) assert.ok(!texto.includes(e.nome), `${e.nome} não pode estar no aviso`);
        for (const n of NORMAIS) assert.ok(texto.includes(n.nome), `${n.nome} deve estar no aviso`);
    } finally {
        restauraBot();
    }
});

// ── 5. Rota HTTP: seletor do caixa ───────────────────────────────────────
test('GET /caixa/vendedores-do-dia: externo não aparece nem como "inativo com movimento"', async () => {
    const prisma = prismaFalso({
        diarios: [{ vendedorId: LUKE.id }, { vendedorId: KONTISA.id }, { vendedorId: MOTORISTA.id }],
        caixas: [{ vendedorId: SO_PERMISSAO.id }],
    });
    // a rota usa estes dois: diario/caixa do dia, e vendedores
    prisma.caixaDiario.findMany = async () => [{ vendedorId: SO_PERMISSAO.id }, { vendedorId: KONTISA.id }];
    const [router] = carregar(prisma, 'routes/caixa.js');
    const app = express();
    app.use(express.json());
    app.use('/api/caixa', router);
    app.use((err, _q, res, _n) => { console.error(err); res.status(500).json({ error: 'erro de teste' }); });
    const srv = await startTestServer(app);
    try {
        const token = jwt.sign({ id: ADMIN.id }, process.env.JWT_SECRET);
        const resp = await fetch(`${srv.baseUrl}/api/caixa/vendedores-do-dia?data=${DATA}`, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(resp.status, 200);
        const lista = await resp.json();
        const ids = lista.map(v => v.id).sort();
        assert.deepEqual(ids, [ADMIN.id, MOTORISTA.id, VENDEDOR_STR.id, SEM_PERMS.id].sort());
        for (const e of EXTERNOS) assert.ok(!ids.includes(e.id), `${e.nome} fora do seletor`);
    } finally {
        await srv.close();
    }
});
