// backend/services/botWhatsappService.js — cliente HTTP do bot da Ana (Z-API).
// Cobre o contrato descrito no cabeçalho do próprio arquivo (e em
// INTEGRACAO-ENVIO-BOT-WHATSAPP.md): 429/502 entram na fila (reagendado, status
// PENDENTE); `duplicado` não é falha; texto > 2000 chars é cortado ANTES do POST
// (senão o bot recusa com texto_longo e o cliente não recebe nada).
//
// Mock do `fetch` global (Node 18+) — sem rede de verdade — e do Prisma (via
// require.cache) — sem gravar no banco de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.BOT_WHATSAPP_URL = 'https://bot-teste.exemplo.com';
process.env.BOT_WHATSAPP_API_KEY = 'chave-teste-bot';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');

const DATABASE_MODULE = path.join(__dirname, '../config/database.js');
const SERVICE_MODULE = path.join(__dirname, '../services/botWhatsappService.js');

/** Carrega o service com um prisma mockado fresco (cada teste tem sua própria instância). */
function carregarServiceComMock(overridesPrisma) {
    const mockPrisma = makeMockPrisma(overridesPrisma);
    const restaurar = stubModule(DATABASE_MODULE, mockPrisma);
    limparCacheContendo(SERVICE_MODULE);
    const service = require(SERVICE_MODULE);
    restaurar();
    return service;
}

/** Troca o fetch global por um mock controlado; devolve os argumentos recebidos e uma função de restauração. */
function mockFetch(implementacao) {
    const chamadas = [];
    const original = global.fetch;
    global.fetch = async (url, opts) => {
        chamadas.push({ url, opts });
        return implementacao(url, opts);
    };
    return { chamadas, restaurar: () => { global.fetch = original; } };
}

function respostaFetch(status, corpoJson) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => corpoJson,
    };
}

test('429 (limite por hora) -> { ok:false, reagendado:true } e grava PENDENTE', async () => {
    const registros = [];
    const service = carregarServiceComMock({
        botWhatsappEnvio: { create: async (args) => { registros.push(args.data); return { id: 1, ...args.data }; } },
    });
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(429, { codigo: 'limite_por_hora', erro: 'Limite de 200/h atingido' }));
    try {
        const r = await service.enviar({ telefone: '47999998888', texto: 'Pedido confirmado!', tipo: 'pedido', origem: 'teste', referencia: 'ref-1' });
        assert.equal(r.ok, false);
        assert.equal(r.reagendado, true);
        assert.equal(chamadas.length, 1);
        assert.equal(registros.length, 1);
        assert.equal(registros[0].status, 'PENDENTE');
        assert.equal(registros[0].codigoErro, 'limite_por_hora');
        assert.ok(registros[0].proximaEm instanceof Date);
    } finally {
        restaurar();
    }
});

test('502 (Z-API fora do ar) -> { ok:false, reagendado:true } e grava PENDENTE', async () => {
    const registros = [];
    const service = carregarServiceComMock({
        botWhatsappEnvio: { create: async (args) => { registros.push(args.data); return { id: 2, ...args.data }; } },
    });
    const { restaurar } = mockFetch(async () => respostaFetch(502, { codigo: 'zapi_falhou', erro: 'Z-API indisponível' }));
    try {
        const r = await service.enviar({ telefone: '47999998888', texto: 'Sua entrega saiu!', tipo: 'entrega', origem: 'teste', referencia: 'ref-2' });
        assert.equal(r.ok, false);
        assert.equal(r.reagendado, true);
        assert.equal(registros[0].status, 'PENDENTE');
        assert.equal(registros[0].codigoErro, 'zapi_falhou');
    } finally {
        restaurar();
    }
});

test('resposta "duplicado" -> tratado como sucesso (idempotência do bot), não como falha', async () => {
    const registros = [];
    const service = carregarServiceComMock({
        botWhatsappEnvio: { create: async (args) => { registros.push(args.data); return { id: 3, ...args.data }; } },
    });
    const { restaurar } = mockFetch(async () => respostaFetch(200, { status: 'duplicado' }));
    try {
        const r = await service.enviar({ telefone: '47999998888', texto: 'Código: 123456', tipo: 'verificacao', origem: 'teste', referencia: 'ref-3' });
        assert.equal(r.ok, true);
        assert.equal(r.status, 'duplicado');
        assert.equal(registros[0].status, 'DUPLICADO');
    } finally {
        restaurar();
    }
});

test('texto > 2000 caracteres é cortado ANTES do POST', async () => {
    const registros = [];
    const service = carregarServiceComMock({
        botWhatsappEnvio: { create: async (args) => { registros.push(args.data); return { id: 4, ...args.data }; } },
    });
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        const textoGigante = 'x'.repeat(2500);
        const r = await service.enviar({ telefone: '47999998888', texto: textoGigante, tipo: 'interno', origem: 'teste', referencia: 'ref-4' });
        assert.equal(r.ok, true);

        // O corpo mandado pro bot precisa já vir cortado — é isso que impede o
        // bot de recusar com texto_longo e o cliente ficar sem mensagem nenhuma.
        const corpoEnviado = JSON.parse(chamadas[0].opts.body);
        assert.ok(corpoEnviado.texto.length <= 2000, `texto enviado tem ${corpoEnviado.texto.length} chars, deveria ser <= 2000`);
        assert.ok(registros[0].texto.length <= 2000);
    } finally {
        restaurar();
    }
});

test('tipo inválido cai em "outro" (contrato do bot: valores fechados)', async () => {
    const registros = [];
    const service = carregarServiceComMock({
        botWhatsappEnvio: { create: async (args) => { registros.push(args.data); return { id: 5, ...args.data }; } },
    });
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        await service.enviar({ telefone: '47999998888', texto: 'oi', tipo: 'promocao-nao-existe', origem: 'teste', referencia: 'ref-5' });
        const corpoEnviado = JSON.parse(chamadas[0].opts.body);
        assert.equal(corpoEnviado.tipo, 'outro');
        assert.equal(registros[0].tipo, 'outro');
    } finally {
        restaurar();
    }
});
