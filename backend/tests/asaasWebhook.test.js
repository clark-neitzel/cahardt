// POST /api/asaas/webhook — chamado pelo Asaas quando uma cobrança muda de status.
// Cobre: autenticação por header `asaas-access-token` (fail-closed) e o formato
// real dos eventos PAYMENT_RECEIVED / PAYMENT_CONFIRMED / PAYMENT_OVERDUE que a
// Asaas manda (ver backend/services/asaasService.js `processarWebhook`).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.ASAAS_WEBHOOK_TOKEN = 'token-teste-asaas-123';
// asaasRoutes.js importa authMiddleware no topo (para as rotas autenticadas do
// próprio arquivo, ex. POST /pix) — e authMiddleware exige JWT_SECRET só para
// CARREGAR o módulo, mesmo que a rota sob teste (webhook) não passe por ele.
process.env.JWT_SECRET = 'segredo-teste-jwt-asaas-0123456789abcdef';

const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const ROUTER = path.join(__dirname, '../routes/asaasRoutes.js');
const CACHE_FRAGMENTOS = ['services/asaasService.js', 'services/botWhatsappService.js'];

// Cobrança "vazia" (sem pedido/parcela vinculados) — mantém marcarRecebida() no
// caminho simples, sem entrar nos ramais de conversão de especial / baixa automática
// (que dependem de mais services). O contrato testado aqui é o do WEBHOOK (auth +
// leitura do payload), não a regra de negócio de conciliação — essa é coberta em
// outro nível (não há teste de banco real neste diretório).
function cobrancaBase() {
    return {
        id: 'cob_1',
        asaasPaymentId: 'pay_123',
        status: 'PENDENTE',
        pedidoId: null,
        parcelaId: null,
        valor: 100,
        valorRecebido: null,
    };
}

function montarApp(overridesPrisma) {
    const mockPrisma = makeMockPrisma(overridesPrisma);
    return buildApp('/api/asaas', ROUTER, mockPrisma, CACHE_FRAGMENTOS);
}

test('sem header asaas-access-token -> 401', async () => {
    const app = montarApp({});
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/asaas/webhook', { body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } } });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('token errado -> 401', async () => {
    const app = montarApp({});
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-invalido' },
            body: { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } },
        });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('token certo + PAYMENT_RECEIVED -> 200 e cobrança marcada RECEBIDO', async () => {
    const chamadas = { updateMany: [], eventoCreate: [] };
    const cobranca = cobrancaBase();
    const app = montarApp({
        asaasWebhookEvento: {
            create: async (args) => { chamadas.eventoCreate.push(args); return { id: 1 }; },
            update: async () => ({}),
        },
        cobrancaAsaas: {
            findUnique: async () => cobranca,
            updateMany: async (args) => { chamadas.updateMany.push(args); return { count: 1 }; },
        },
    });
    const { close, request } = await startTestServer(app);
    try {
        // Payload real da Asaas: { id, event, payment: { id, value, paymentDate, ... } }
        const payload = {
            id: 'evt_abc123',
            event: 'PAYMENT_RECEIVED',
            payment: {
                id: 'pay_123',
                value: 100,
                netValue: 98.5,
                billingType: 'PIX',
                status: 'RECEIVED',
                paymentDate: '2026-09-19',
                clientPaymentDate: '2026-09-19',
            },
        };
        const r = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-teste-asaas-123' },
            body: payload,
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(chamadas.eventoCreate.length, 1);
        assert.equal(chamadas.eventoCreate[0].data.paymentId, 'pay_123');
        assert.equal(chamadas.updateMany.length, 1);
        assert.equal(chamadas.updateMany[0].where.id, 'cob_1');
        assert.equal(chamadas.updateMany[0].data.status, 'RECEBIDO');
    } finally {
        await close();
    }
});

test('token certo + PAYMENT_CONFIRMED -> 200 e cobrança marcada RECEBIDO', async () => {
    const chamadas = { updateMany: [] };
    const cobranca = cobrancaBase();
    const app = montarApp({
        asaasWebhookEvento: { create: async () => ({ id: 2 }), update: async () => ({}) },
        cobrancaAsaas: {
            findUnique: async () => cobranca,
            updateMany: async (args) => { chamadas.updateMany.push(args); return { count: 1 }; },
        },
    });
    const { close, request } = await startTestServer(app);
    try {
        const payload = { id: 'evt_conf1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_123', value: 100 } };
        const r = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-teste-asaas-123' },
            body: payload,
        });
        assert.equal(r.status, 200);
        assert.equal(chamadas.updateMany[0].data.status, 'RECEBIDO');
    } finally {
        await close();
    }
});

test('token certo + PAYMENT_OVERDUE (cobrança PENDENTE) -> 200 e cobrança marcada EXPIRADO', async () => {
    const chamadas = { update: [] };
    const cobranca = { ...cobrancaBase(), status: 'PENDENTE' };
    const app = montarApp({
        asaasWebhookEvento: { create: async () => ({ id: 3 }), update: async () => ({}) },
        cobrancaAsaas: {
            findUnique: async () => cobranca,
            update: async (args) => { chamadas.update.push(args); return { ...cobranca, status: 'EXPIRADO' }; },
        },
    });
    const { close, request } = await startTestServer(app);
    try {
        const payload = { id: 'evt_over1', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_123', value: 100 } };
        const r = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-teste-asaas-123' },
            body: payload,
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.motivo, 'cobrança expirada');
        assert.equal(chamadas.update.length, 1);
        assert.equal(chamadas.update[0].data.status, 'EXPIRADO');
    } finally {
        await close();
    }
});

test('payload malformado (sem event/payment) -> resposta controlada, não derruba o servidor', async () => {
    const app = montarApp({}); // nenhum model deveria ser tocado — confirma que o guard é o primeiro passo
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-teste-asaas-123' },
            body: { foo: 'bar' },
        });
        assert.equal(r.status, 200); // asaasService devolve { ok:false, motivo:... } sem lançar
        assert.equal(r.body.ok, false);
        assert.match(r.body.motivo, /event\/payment/);

        // Servidor continua de pé — uma segunda chamada ao mesmo endpoint ainda responde normal.
        const r2 = await request('POST', '/api/asaas/webhook', {
            headers: { 'asaas-access-token': 'token-teste-asaas-123' },
            body: { outra: 'coisa' },
        });
        assert.equal(r2.status, 200);
        assert.equal(r2.body.ok, false);
    } finally {
        await close();
    }
});
