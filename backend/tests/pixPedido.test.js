// Um QR PIX vivo por pedido (11/2026) — criarPixPedido, cancelamento com autoria,
// rotas novas e aviso de divergência. Sem rede e sem banco: axios.create e o Prisma
// são trocados por fakes em memória (NUNCA usa a chave Asaas de produção).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.ASAAS_API_KEY = '$aact_hmlg_chave_falsa_de_teste';
process.env.JWT_SECRET = 'segredo-teste-jwt-pix-0123456789abcdef';

const axios = require('axios');
const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const DB_MODULE = path.join(__dirname, '../config/database.js');
const AUTH_MODULE = path.join(__dirname, '../middlewares/authMiddleware.js');
const SERVICE = path.join(__dirname, '../services/asaasService.js');
const ROUTER = path.join(__dirname, '../routes/asaasRoutes.js');

// ── Asaas falso ──────────────────────────────────────────────────────
function criarAsaasFalso({ statusRemoto = {} } = {}) {
    const f = { posts: [], deletes: [], gets: [], seq: 0, statusRemoto };
    f.http = {
        post: async (url, body) => { f.posts.push({ url, body }); f.seq++; return { data: { id: `pay_${f.seq}`, invoiceUrl: `https://asaas/${f.seq}` } }; },
        get: async (url) => {
            f.gets.push(url);
            if (url.endsWith('/pixQrCode')) return { data: { payload: 'PAYLOAD', encodedImage: 'B64', expirationDate: '2099-01-01 00:00:00' } };
            const id = url.split('/').pop();
            return { data: { id, status: f.statusRemoto[id] || 'PENDING', value: 50 } };
        },
        delete: async (url) => { f.deletes.push(url); return { data: {} }; },
    };
    return f;
}

// ── Banco falso (só o que o fluxo toca) ──────────────────────────────
function criarBanco({ cobrancas = [], vendedores = {}, lockEncontraOutro = null } = {}) {
    const db = { cobrancas: [...cobrancas], seq: 0, transacoes: [], opcoesTx: [] };
    const bate = (c, where) => {
        for (const [k, v] of Object.entries(where || {})) {
            if (v && typeof v === 'object' && Array.isArray(v.in)) { if (!v.in.includes(c[k])) return false; }
            else if (c[k] !== v) return false;
        }
        return true;
    };
    const cobrancaAsaas = {
        findFirst: async ({ where }) => {
            const l = db.cobrancas.filter(c => bate(c, where)).sort((a, b) => b.createdAt - a.createdAt);
            return l[0] || null;
        },
        findUnique: async ({ where }) => db.cobrancas.find(c => c.id === where.id) || null,
        create: async ({ data }) => { const c = { id: `cob_${++db.seq}`, createdAt: new Date(Date.now() + db.seq), canceladoEm: null, canceladoPorId: null, canceladoPorNome: null, canceladoMotivo: null, ...data }; db.cobrancas.push(c); return c; },
        update: async ({ where, data }) => { const c = db.cobrancas.find(x => x.id === where.id); Object.assign(c, data); return c; },
    };
    db.prisma = {
        pedido: { findUnique: async () => ({ id: 'ped1', numero: 10, especial: false, bonificacao: false, cliente: { UUID: 'cli1', Nome: 'Cliente' }, contaReceber: { parcelas: [{ id: 'par1', numeroParcela: 1, status: 'PENDENTE', valor: 50, valorPago: 0, valorDescontoTotal: 0 }] } }) },
        clienteAsaas: { findUnique: async () => ({ asaasCustomerId: 'cus_1', ambiente: 'SANDBOX' }) },
        appConfig: { findUnique: async () => null },
        cobrancaAsaas,
        vendedor: { findUnique: async ({ where }) => ({ permissoes: vendedores[where.id] || {} }) },
        $transaction: async (fn, opts) => {
            db.opcoesTx.push(opts);
            const tx = {
                cobrancaAsaas: lockEncontraOutro
                    ? { ...cobrancaAsaas, findFirst: async () => lockEncontraOutro }
                    : cobrancaAsaas,
                $executeRaw: async () => 1,
            };
            return fn(tx);
        },
    };
    return db;
}

function carregarServico(db, asaas) {
    const restaurar = stubModule(DB_MODULE, db.prisma);
    limparCacheContendo(SERVICE);
    const original = axios.create;
    axios.create = () => asaas.http;
    const svc = require(SERVICE);
    axios.create = original;
    restaurar();
    return svc;
}

const vivo = (extra = {}) => ({
    id: 'cob_old', asaasPaymentId: 'pay_old', tipo: 'PIX', status: 'PENDENTE', valor: 50, pedidoId: 'ped1',
    parcelaId: null, ambiente: 'SANDBOX', createdAt: new Date(2020, 1, 1),
    canceladoEm: null, canceladoPorId: null, canceladoPorNome: null, canceladoMotivo: null, ...extra,
});

test('PIX vivo com o mesmo valor: devolve a existente, sem rede', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo()] });
    const svc = carregarServico(db, asaas);
    const r = await svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    assert.equal(r.id, 'cob_old');
    assert.equal(asaas.posts.length, 0);
    assert.equal(asaas.gets.length, 0);
});

test('PENDENTE sem expiração e com data antiga também é reaproveitado (sem filtro de pixExpiraEm)', async () => {
    const asaas = criarAsaasFalso();
    const db = criarBanco({ cobrancas: [vivo({ pixExpiraEm: new Date(2000, 1, 1) })] });
    const svc = carregarServico(db, asaas);
    assert.equal((await svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 })).id, 'cob_old');
});

test('valor diferente: erro 409 PIX_PENDENTE_VALOR_DIFERENTE com o pendente', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo()] });
    const svc = carregarServico(db, asaas);
    await assert.rejects(() => svc.criarPixPedido({ pedidoId: 'ped1', valor: 70 }), (e) => {
        assert.equal(e.statusCode, 409);
        assert.equal(e.codigo, 'PIX_PENDENTE_VALOR_DIFERENTE');
        assert.equal(e.pendente.id, 'cob_old');
        return true;
    });
    assert.equal(asaas.posts.length, 0);
    assert.equal(db.cobrancas[0].status, 'PENDENTE');
});

test('substituirPendente: cancela o antigo (VALOR_ALTERADO, com quem) e cria o novo', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo()] });
    const svc = carregarServico(db, asaas);
    const r = await svc.criarPixPedido({ pedidoId: 'ped1', valor: 70, substituirPendente: true, usuario: { id: 'u1', nome: 'Leticia' } });
    const antigo = db.cobrancas.find(c => c.id === 'cob_old');
    assert.equal(antigo.status, 'CANCELADO');
    assert.equal(antigo.canceladoMotivo, 'VALOR_ALTERADO');
    assert.equal(antigo.canceladoPorId, 'u1');
    assert.equal(antigo.canceladoPorNome, 'Leticia');
    assert.ok(antigo.canceladoEm instanceof Date);
    assert.ok(asaas.deletes.includes('/payments/pay_old'));
    assert.equal(r.status, 'PENDENTE');
    assert.equal(Number(r.valor), 70);
    assert.equal(asaas.posts.length, 1);
});

test('duas chamadas simultâneas do mesmo pedido criam UM QR só', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco();
    const svc = carregarServico(db, asaas);
    const [a, b] = await Promise.all([
        svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 }),
        svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 }),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(asaas.posts.length, 1);
    assert.equal(db.cobrancas.length, 1);
});

test('transação do lock usa timeout 20000/maxWait 10000', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco();
    await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    assert.deepEqual(db.opcoesTx[0], { timeout: 20000, maxWait: 10000 });
});

test('corrida entre processos: lock acha outro vivo -> apaga o recém-criado no Asaas e devolve o existente', async () => {
    const asaas = criarAsaasFalso();
    const outro = vivo({ id: 'cob_outro', asaasPaymentId: 'pay_outro' });
    const db = criarBanco({ lockEncontraOutro: outro });
    const r = await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    assert.equal(r.id, 'cob_outro');
    assert.equal(asaas.posts.length, 1);
    assert.deepEqual(asaas.deletes, ['/payments/pay_1']);
    assert.equal(db.cobrancas.length, 0);
});

test('EXPIRADO que já foi PAGO no Asaas: marca recebida e NÃO cria outro QR', async () => {
    const asaas = criarAsaasFalso({ statusRemoto: { pay_old: 'RECEIVED' } });
    const db = criarBanco({ cobrancas: [vivo({ status: 'EXPIRADO' })] });
    const svc = carregarServico(db, asaas);
    const chamadas = [];
    svc.marcarRecebida = async (id) => { chamadas.push(id); return { id, status: 'RECEBIDO' }; };
    const r = await svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    assert.deepEqual(chamadas, ['cob_old']);
    assert.equal(r.status, 'RECEBIDO');
    assert.equal(asaas.posts.length, 0);
});

test('EXPIRADO apagado no Asaas: marca CANCELADO (ASAAS) e cria um novo', async () => {
    const asaas = criarAsaasFalso({ statusRemoto: { pay_old: 'DELETED' } });
    const db = criarBanco({ cobrancas: [vivo({ status: 'EXPIRADO' })] });
    const r = await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    const antigo = db.cobrancas.find(c => c.id === 'cob_old');
    assert.equal(antigo.status, 'CANCELADO');
    assert.equal(antigo.canceladoMotivo, 'ASAAS');
    assert.notEqual(r.id, 'cob_old');
    assert.equal(asaas.posts.length, 1);
});

test('EXPIRADO ainda vencido (OVERDUE) no Asaas: reaproveita e não mexe no parcelaId', async () => {
    const asaas = criarAsaasFalso({ statusRemoto: { pay_old: 'OVERDUE' } });
    const db = criarBanco({ cobrancas: [vivo({ status: 'EXPIRADO', parcelaId: null })] });
    const r = await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50, vincularParcela: false });
    assert.equal(r.id, 'cob_old');
    assert.equal(r.parcelaId, null);
    assert.equal(asaas.posts.length, 0);
});

test('RECEBIDO parcial não bloqueia um QR novo', async () => {
    const asaas = criarAsaasFalso();
    const db = criarBanco({ cobrancas: [vivo({ status: 'RECEBIDO' })] });
    const r = await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50 });
    assert.notEqual(r.id, 'cob_old');
    assert.equal(asaas.posts.length, 1);
});

test('cancelarCobranca grava quem, quando e o motivo; sem 2º argumento grava só canceladoEm', async () => {
    const asaas = criarAsaasFalso();
    const db = criarBanco({ cobrancas: [vivo(), vivo({ id: 'cob_b', asaasPaymentId: 'pay_b' })] });
    const svc = carregarServico(db, asaas);
    const r = await svc.cancelarCobranca('cob_old', { motivo: 'MANUAL', usuario: { id: 'u9', nome: 'Admin' } });
    assert.equal(r.status, 'CANCELADO');
    assert.equal(r.canceladoMotivo, 'MANUAL');
    assert.equal(r.canceladoPorId, 'u9');
    assert.equal(r.canceladoPorNome, 'Admin');
    assert.ok(r.canceladoEm instanceof Date);
    const b = await svc.cancelarCobranca('cob_b');
    assert.ok(b.canceladoEm instanceof Date);
    assert.equal(b.canceladoMotivo, null);
    assert.equal(b.canceladoPorNome, null);
});

// ── Rotas ────────────────────────────────────────────────────────────
async function subirRotas({ cobrancas = [], perms = {} } = {}) {
    const asaas = criarAsaasFalso();
    const db = criarBanco({ cobrancas, vendedores: { u1: perms } });
    const original = axios.create;
    axios.create = () => asaas.http;
    const restaurarAuth = stubModule(AUTH_MODULE, (req, _res, next) => { req.user = { id: 'u1', nome: 'Fulana', permissoes: perms }; next(); });
    let app;
    try { app = buildApp('/api/asaas', ROUTER, db.prisma, ['services/asaasService.js']); }
    finally { axios.create = original; restaurarAuth(); }
    const srv = await startTestServer(app);
    return { ...srv, db, asaas };
}

test('POST /cobrancas/:id/cancelar: sem permissão -> 403 e nada cancelado', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { Pode_Baixar_Contas_Receber: true } });
    try {
        const r = await t.request('POST', '/api/asaas/cobrancas/cob_old/cancelar', { body: {} });
        assert.equal(r.status, 403);
        assert.equal(t.db.cobrancas[0].status, 'PENDENTE');
    } finally { await t.close(); }
});

test('POST /cobrancas/:id/cancelar: com Pode_Cancelar_QR_Pix grava quem/quando (MANUAL)', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { Pode_Cancelar_QR_Pix: true } });
    try {
        const r = await t.request('POST', '/api/asaas/cobrancas/cob_old/cancelar', { body: {} });
        assert.equal(r.status, 200);
        const c = t.db.cobrancas[0];
        assert.equal(c.status, 'CANCELADO');
        assert.equal(c.canceladoMotivo, 'MANUAL');
        assert.equal(c.canceladoPorNome, 'Fulana');
        assert.ok(c.canceladoEm);
        assert.equal(r.body?.canceladoPorNome ?? r.json?.canceladoPorNome, 'Fulana');
    } finally { await t.close(); }
});

test('permissão pedidos truthy NÃO libera cancelar (booleano direto)', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { pedidos: { view: false } } });
    try {
        const r = await t.request('POST', '/api/asaas/cobrancas/cob_old/cancelar', { body: {} });
        assert.equal(r.status, 403);
    } finally { await t.close(); }
});

test('DELETE /cobrancas/:id de PIX responde 409 e NÃO cancela (app antigo no X)', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { admin: true } });
    try {
        const r = await t.request('DELETE', '/api/asaas/cobrancas/cob_old');
        assert.equal(r.status, 409);
        assert.equal(t.db.cobrancas[0].status, 'PENDENTE');
        assert.equal(t.asaas.deletes.length, 0);
    } finally { await t.close(); }
});

test('POST /pix com valor diferente -> 409 com codigo e pendente (mapCobranca)', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { admin: true } });
    try {
        const r = await t.request('POST', '/api/asaas/pix', { body: { pedidoId: 'ped1', valor: 70 } });
        assert.equal(r.status, 409);
        const corpo = r.body ?? r.json;
        assert.equal(corpo.codigo, 'PIX_PENDENTE_VALOR_DIFERENTE');
        assert.equal(corpo.pendente.id, 'cob_old');
        assert.equal(corpo.pendente.vinculadaParcela, false);
    } finally { await t.close(); }
});

test('POST /pix com substituirPendente sem permissão de cancelar -> 403', async () => {
    const t = await subirRotas({ cobrancas: [vivo()], perms: { Pode_Baixar_Contas_Receber: true } });
    try {
        const r = await t.request('POST', '/api/asaas/pix', { body: { pedidoId: 'ped1', valor: 70, substituirPendente: true } });
        assert.equal(r.status, 403);
        assert.equal(t.db.cobrancas[0].status, 'PENDENTE');
    } finally { await t.close(); }
});


test('fluxo diferente A: QR vivo do financeiro (com parcela) + criação pela entrega -> 409 PIX_FLUXO_DIFERENTE, parcelaId intacto', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo({ parcelaId: 'par1' })] });
    const svc = carregarServico(db, asaas);
    await assert.rejects(() => svc.criarPixPedido({ pedidoId: 'ped1', valor: 50, vincularParcela: false }), (e) => {
        assert.equal(e.statusCode, 409);
        assert.equal(e.codigo, 'PIX_FLUXO_DIFERENTE');
        assert.match(e.message, /baixa autom/);
        assert.equal(e.pendente.id, 'cob_old');
        return true;
    });
    assert.equal(db.cobrancas[0].parcelaId, 'par1');
    assert.equal(asaas.posts.length, 0);
});

test('fluxo diferente B: QR vivo da entrega (sem parcela) + criação pelo financeiro -> 409 PIX_FLUXO_DIFERENTE, parcelaId continua null', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo({ parcelaId: null })] });
    const svc = carregarServico(db, asaas);
    await assert.rejects(() => svc.criarPixPedido({ pedidoId: 'ped1', valor: 50, vincularParcela: true }), (e) => {
        assert.equal(e.codigo, 'PIX_FLUXO_DIFERENTE');
        assert.match(e.message, /entrega/);
        return true;
    });
    assert.equal(db.cobrancas[0].parcelaId, null);
});

test('mesmo fluxo (ambos com parcela) reaproveita normalmente', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco({ cobrancas: [vivo({ parcelaId: 'par1' })] });
    const r = await carregarServico(db, asaas).criarPixPedido({ pedidoId: 'ped1', valor: 50, vincularParcela: true });
    assert.equal(r.id, 'cob_old');
});

test('erro na transação depois do POST /payments: apaga o QR órfão no Asaas e relança', async () => {
    const asaas = criarAsaasFalso(); const db = criarBanco();
    db.prisma.$transaction = async () => { throw new Error('banco caiu'); };
    const svc = carregarServico(db, asaas);
    await assert.rejects(() => svc.criarPixPedido({ pedidoId: 'ped1', valor: 50 }), /banco caiu/);
    assert.deepEqual(asaas.deletes, ['/payments/pay_1']);
});

// ── helper de permissões ─────────────────────────────────────────────
const pp = require('../utils/permissoesPix');
test('permissoesPix: atendimentos libera ver; objeto pedidos não libera cancelar; financeiro', () => {
    assert.equal(pp.podeVerPix({ Pode_Ver_Atendimentos: true }), true);
    assert.equal(pp.podeVerPix({ Pode_Ver_Atendimentos: { view: true } }), true);
    assert.equal(pp.podeVerPix({ Pode_Ver_Atendimentos: { view: false } }), false);
    assert.equal(pp.podeCancelarQr({ pedidos: { view: false } }), false);
    assert.equal(pp.podeCancelarQr({ Pode_Cancelar_QR_Pix: true }), true);
    assert.equal(pp.ehFinanceiro({ Pode_Ver_Atendimentos: true }), false);
    assert.equal(pp.ehFinanceiro({ Pode_Acessar_Contas_Receber: true }), true);
});

// ── Aviso de divergência (função pura) ───────────────────────────────
const { calcularAvisoDivergencia } = require('../services/pixDivergenciaService');
const baixa = (extra = {}) => ({ valor: 80, em: new Date('2026-11-03T15:00:00Z'), porNome: 'Caixa Fulano', origem: 'CAIXA_ROTA', forma: 'PIX', caixaData: '2026-11-03', temLastro: false, estornado: false, ...extra });

test('divergência: PIX comum no caixa, sem Asaas pago e sem lastro -> aviso', () => {
    const a = calcularAvisoDivergencia([baixa()], [{ status: 'CANCELADO' }]);
    assert.equal(a.valor, 80);
    assert.equal(a.baixadoPorNome, 'Caixa Fulano');
    assert.equal(a.caixaData, '2026-11-03');
    assert.match(a.mensagem, /80,00/);
});
test('divergência: com lastro no extrato -> sem aviso', () => assert.equal(calcularAvisoDivergencia([baixa({ temLastro: true })], []), null));
test('divergência: QR Asaas RECEBIDO no pedido -> sem aviso', () => assert.equal(calcularAvisoDivergencia([baixa()], [{ status: 'RECEBIDO' }]), null));
test('divergência: baixa estornada, dinheiro, PIX Asaas ou origem MANUAL -> sem aviso', () => {
    assert.equal(calcularAvisoDivergencia([baixa({ estornado: true })], []), null);
    assert.equal(calcularAvisoDivergencia([baixa({ forma: 'Dinheiro' })], []), null);
    assert.equal(calcularAvisoDivergencia([baixa({ forma: 'PIX Asaas' })], []), null);
    assert.equal(calcularAvisoDivergencia([baixa({ origem: 'MANUAL' })], []), null);
    assert.equal(calcularAvisoDivergencia([], []), null);
});
test('divergência: CAIXA_BAIXA_CA também conta', () => assert.ok(calcularAvisoDivergencia([baixa({ origem: 'CAIXA_BAIXA_CA' })], [])));
