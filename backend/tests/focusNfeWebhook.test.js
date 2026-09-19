// POST /api/webhooks/focus-nfe — chamado pela Focus NFe quando um documento
// fiscal muda de status. Cobre: autenticação por header `x-focus-secret`
// (fail-closed) e o formato real do payload (ver backend/docs/focus-nfe-api.md
// seção 9 e backend/routes/focusNfeWebhookRoutes.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.FOCUS_NFE_WEBHOOK_SECRET = 'segredo-teste-focus-nfe';

const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const ROUTER = path.join(__dirname, '../routes/focusNfeWebhookRoutes.js');

function montarApp(overridesPrisma) {
    const mockPrisma = makeMockPrisma(overridesPrisma);
    return buildApp('/api/webhooks', ROUTER, mockPrisma);
}

test('sem x-focus-secret -> 401', async () => {
    const app = montarApp({});
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/webhooks/focus-nfe', {
            body: { evento: 'nfe', status: 'autorizado' },
        });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('x-focus-secret errado -> 401', async () => {
    const app = montarApp({});
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/webhooks/focus-nfe', {
            headers: { 'x-focus-secret': 'errado' },
            body: { evento: 'nfe', status: 'autorizado' },
        });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

async function enviarEvento(payload) {
    const chamadas = [];
    const app = montarApp({
        focusNfeEvento: {
            create: async (args) => { chamadas.push(args); return { id: 42, ...args.data }; },
        },
    });
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('POST', '/api/webhooks/focus-nfe', {
            headers: { 'x-focus-secret': 'segredo-teste-focus-nfe' },
            body: payload,
        });
        return { r, chamadas };
    } finally {
        await close();
    }
}

test('segredo certo + evento "autorizado" -> 200 e evento gravado', async () => {
    // Payload real da Focus: ref (nosso identificador), status, status_sefaz, chave_nfe...
    const payload = {
        evento: 'nfe',
        ref: 'nfd-producao-123',
        cnpj_emitente: '12345678000199',
        status: 'autorizado',
        status_sefaz: '100',
        mensagem_sefaz: 'Autorizado o uso da NF-e',
        chave_nfe: '35260912345678000199550010000000011234567890',
        numero: '85149',
        serie: '1',
    };
    const { r, chamadas } = await enviarEvento(payload);
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].data.ref, 'nfd-producao-123');
    assert.equal(chamadas[0].data.status, 'autorizado');
    assert.equal(chamadas[0].data.chaveNfe, payload.chave_nfe);
    assert.deepEqual(chamadas[0].data.payload, payload);
});

test('segredo certo + evento "erro_autorizacao" -> 200 e evento gravado', async () => {
    const payload = {
        evento: 'nfe',
        ref: 'nfd-producao-124',
        status: 'erro_autorizacao',
        mensagem_sefaz: 'Rejeição: duplicidade de NF-e',
    };
    const { r, chamadas } = await enviarEvento(payload);
    assert.equal(r.status, 200);
    assert.equal(chamadas[0].data.status, 'erro_autorizacao');
    assert.equal(chamadas[0].data.mensagemSefaz, payload.mensagem_sefaz);
});

test('segredo certo + evento "cancelado" -> 200 e evento gravado', async () => {
    const payload = { evento: 'nfe', ref: 'nfd-producao-125', status: 'cancelado' };
    const { r, chamadas } = await enviarEvento(payload);
    assert.equal(r.status, 200);
    assert.equal(chamadas[0].data.status, 'cancelado');
});

test('body vazio (nenhum campo) com segredo certo -> não derruba, grava evento com campos null', async () => {
    const { r, chamadas } = await enviarEvento({});
    assert.equal(r.status, 200);
    assert.equal(chamadas[0].data.evento, 'nfe'); // default quando falta 'evento'
    assert.equal(chamadas[0].data.ref, null);
});
