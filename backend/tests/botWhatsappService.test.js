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

// ─────────────────────────────────────────────────────────────────────────
// Pedido grande em várias partes (dividirEmPartes / enviarEmPartes / fila)
// ─────────────────────────────────────────────────────────────────────────
const { pedidoFixture } = require('./helpers/pedidosFixture');
const SNAP = require('./helpers/snapshotsMensagens.json');
const SNAP_INTERNO = require('./helpers/snapshotsInterno.json');
const WEBHOOK_MODULE = path.join(__dirname, '../services/webhookService.js');

/** Prisma em memória só da tabela de envios (create/findMany/findFirst/update). */
function prismaEnvios() {
    const linhas = [];
    let seq = 0;
    const casa = (r, where = {}) => Object.entries(where).every(([k, v]) => {
        if (k === 'proximaEm') return r.proximaEm && r.proximaEm <= v.lte;
        return r[k] === v;
    });
    return {
        linhas,
        overrides: {
            botWhatsappEnvio: {
                create: async ({ data }) => { const r = { id: `id${++seq}`, ...data }; linhas.push(r); return r; },
                findMany: async ({ where }) => linhas.filter(r => casa(r, where)).sort((a, b) => a.proximaEm - b.proximaEm),
                findFirst: async ({ where }) => linhas.find(r => casa(r, where)) || null,
                update: async ({ where, data }) => { Object.assign(linhas.find(r => r.id === where.id), data); },
            },
        },
    };
}

function carregarWebhookEBot(overridesPrisma) {
    const mockPrisma = makeMockPrisma(overridesPrisma);
    const restaurar = stubModule(DATABASE_MODULE, mockPrisma);
    limparCacheContendo(SERVICE_MODULE, WEBHOOK_MODULE);
    const bot = require(SERVICE_MODULE);
    const webhook = require(WEBHOOK_MODULE);
    restaurar();
    return { bot, webhook };
}

const textosPostados = (chamadas) => chamadas.map(c => JSON.parse(c.opts.body));

test('a) pedido de 5 itens: 1 mensagem, texto IDÊNTICO ao de antes, referencia sem sufixo', async () => {
    const { webhook, bot } = carregarWebhookEBot({});
    assert.equal(webhook.montarMensagemPedido(pedidoFixture(5)), SNAP.pedido5);
    assert.equal(webhook.montarMensagemPedido(pedidoFixture(3, { valorFrete: 0, observacoes: null })), SNAP.pedido3semFreteSemObs);
    const partes = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(5)));
    assert.deepEqual(partes, [SNAP.pedido5]);

    const env = prismaEnvios();
    const { bot: bot2 } = carregarWebhookEBot(env.overrides);
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        const r = await bot2.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'app-vendedor', referenciaBase: 'pedido-4321-confirmado' });
        assert.equal(r.ok, true);
        assert.equal(chamadas.length, 1);
        const corpo = textosPostados(chamadas)[0];
        assert.equal(corpo.referencia, 'pedido-4321-confirmado');
        assert.equal(corpo.texto, SNAP.pedido5);
    } finally { restaurar(); }
});

test('b) pedido de 60 itens: N>=2 partes <=1900, itens inteiros, cabeçalho só na 1ª, rodapé só na última', () => {
    const { webhook, bot } = carregarWebhookEBot({});
    const pedido = pedidoFixture(60);
    const p = webhook.montarPartesPedido(pedido);
    const partes = bot.dividirEmPartes(p);
    const n = partes.length;
    assert.ok(n >= 2, `esperava >=2 partes, veio ${n}`);
    partes.forEach((t, i) => {
        assert.ok(t.length <= 1900, `parte ${i + 1} tem ${t.length}`);
        assert.ok(t.endsWith(`*(${i + 1}/${n})*`), `marcador da parte ${i + 1}`);
    });
    // cabeçalho só na 1ª; continuação nas demais
    assert.ok(partes[0].startsWith('Ola, *Padaria do Zé*'));
    partes.slice(1).forEach((t, i) => {
        assert.ok(!t.includes('Segue o resumo'));
        assert.ok(t.startsWith(`Pedido #4321 — continuação *(${i + 2}/${n})*`));
    });
    // Total/Condição/Obs/despedida só na última
    partes.slice(0, -1).forEach(t => {
        for (const x of ['Total:', 'Condição:', 'Obs:', 'Obrigado']) assert.ok(!t.includes(x), `"${x}" fora da última`);
    });
    const ultima = partes[n - 1];
    for (const x of ['Total: R$', 'Condição:* Boleto 14 dias', 'Obs:* Entregar pela porta', 'Obrigado pela preferência']) assert.ok(ultima.includes(x), x);
    // nenhum item quebrado e nenhum perdido: cada item aparece inteiro, uma vez
    const uniao = partes.join('\n\n');
    for (const item of p.itens) {
        assert.equal(uniao.split(item).length - 1, 1, `item perdido/duplicado/quebrado: ${item.split('\n')[0]}`);
    }
});

test('b2) Obs gigante é limitada a ~500 chars só no multi-parte; no texto único fica inteira', () => {
    const { webhook, bot } = carregarWebhookEBot({});
    const obs = 'o'.repeat(900);
    const unica = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(2, { observacoes: obs })));
    assert.equal(unica.length, 1);
    assert.ok(unica[0].includes(obs));
    const multi = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(60, { observacoes: obs })));
    assert.ok(multi.length >= 2);
    const ult = multi[multi.length - 1];
    assert.ok(ult.includes('o'.repeat(400)) && !ult.includes(obs) && ult.includes('…'));
    multi.forEach(t => assert.ok(t.length <= 1900));
});

test('c) referencias -p1..pN em ordem sequencial; reenvio manual usa base única uma vez', async () => {
    const env = prismaEnvios();
    const { bot, webhook } = carregarWebhookEBot(env.overrides);
    const partes = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(60)));
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        const base = bot.referenciaUnica('pedido-4321-reenvio');
        const r = await bot.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'app-vendedor', referenciaBase: base });
        assert.equal(r.ok, true);
        assert.equal(r.status, 'enviado');
        const refs = textosPostados(chamadas).map(c => c.referencia);
        assert.deepEqual(refs, partes.map((_, i) => `${base}-p${i + 1}`));
        assert.ok(/^pedido-4321-reenvio-[0-9a-z]+-p1$/.test(refs[0]));
        assert.deepEqual(textosPostados(chamadas).map(c => c.texto), partes);
    } finally { restaurar(); }
});

test('d) parte 1 reagendada: 2..N gravadas PENDENTE sem POST; fila só libera a parte k depois da k-1', async () => {
    const env = prismaEnvios();
    const { bot, webhook } = carregarWebhookEBot(env.overrides);
    const partes = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(60)));
    const n = partes.length;
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(429, { codigo: 'limite_por_hora', erro: 'teto' }));
    try {
        const r = await bot.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'app-vendedor', referenciaBase: 'pedido-9-confirmado' });
        assert.equal(r.ok, true);          // reagendado conta como ok p/ o chamador
        assert.equal(r.reagendado, true);
        assert.equal(chamadas.length, 1, 'só a parte 1 foi tentada no POST');
        assert.equal(env.linhas.length, n);
        env.linhas.forEach((l, i) => {
            assert.equal(l.status, 'PENDENTE');
            assert.equal(l.referencia, `pedido-9-confirmado-p${i + 1}`);
        });
        const t1 = env.linhas[0].proximaEm.getTime();
        assert.ok(env.linhas[1].proximaEm.getTime() >= t1 && env.linhas[1].proximaEm.getTime() - t1 < 5000);
    } finally { restaurar(); }

    // worker: libera todos pelo relógio, mas o bot ainda recusa a parte 1 -> nenhuma outra é postada
    env.linhas.forEach(l => { l.proximaEm = new Date(Date.now() - 1000); });
    const m2 = mockFetch(async () => respostaFetch(429, { codigo: 'limite_por_hora', erro: 'teto' }));
    try {
        await bot.processarFila();
        const refs = textosPostados(m2.chamadas).map(c => c.referencia);
        assert.deepEqual(refs, ['pedido-9-confirmado-p1'], 'parte 2 não pode ser postada com a 1 PENDENTE');
    } finally { m2.restaurar(); }

    // agora o bot aceita: p1 sai e as demais seguem NA ORDEM na mesma rodada
    env.linhas.forEach(l => { l.proximaEm = new Date(Date.now() - 1000); l.status = 'PENDENTE'; });
    const m3 = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        await bot.processarFila();
        const refs = textosPostados(m3.chamadas).map(c => c.referencia);
        assert.deepEqual(refs, partes.map((_, i) => `pedido-9-confirmado-p${i + 1}`));
        assert.ok(env.linhas.every(l => l.status === 'ENVIADO'));
    } finally { m3.restaurar(); }
});

test('d2) parte 1 em ERRO libera a parte 2 na fila (não trava o resto)', async () => {
    const env = prismaEnvios();
    const { bot } = carregarWebhookEBot(env.overrides);
    const passado = new Date(Date.now() - 1000);
    env.linhas.push(
        { id: 'a', telefone: '5547999998888', texto: 'p1', tipo: 'pedido', origem: 'o', referencia: 'x-p1', status: 'ERRO', tentativas: 6, proximaEm: null },
        { id: 'b', telefone: '5547999998888', texto: 'p2', tipo: 'pedido', origem: 'o', referencia: 'x-p2', status: 'PENDENTE', tentativas: 0, proximaEm: passado },
    );
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        await bot.processarFila();
        assert.deepEqual(textosPostados(chamadas).map(c => c.referencia), ['x-p2']);
    } finally { restaurar(); }
});

test('e) ERRO definitivo na parte 2 -> ok:false "parte 2/N", seguintes não saem', async () => {
    const env = prismaEnvios();
    const { bot, webhook } = carregarWebhookEBot(env.overrides);
    const partes = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(90)));
    assert.ok(partes.length >= 3);
    let n = 0;
    const { chamadas, restaurar } = mockFetch(async () => (++n === 2
        ? respostaFetch(400, { codigo: 'texto_invalido', erro: 'recusado' })
        : respostaFetch(200, { status: 'enviado' })));
    try {
        const r = await bot.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'app-vendedor', referenciaBase: 'pedido-7-confirmado' });
        assert.equal(r.ok, false);
        assert.ok(!r.reagendado);
        assert.ok(r.motivo.startsWith(`parte 2/${partes.length}:`), r.motivo);
        assert.equal(chamadas.length, 2);
    } finally { restaurar(); }
});

test('f) todas as partes duplicadas -> status "duplicado"; mistura -> "enviado"', async () => {
    const env = prismaEnvios();
    const { bot, webhook } = carregarWebhookEBot(env.overrides);
    const partes = bot.dividirEmPartes(webhook.montarPartesPedido(pedidoFixture(60)));
    let m = mockFetch(async () => respostaFetch(200, { status: 'duplicado' }));
    try {
        const r = await bot.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'x', referenciaBase: 'pedido-1-confirmado' });
        assert.equal(r.ok, true);
        assert.equal(r.status, 'duplicado');
    } finally { m.restaurar(); }
    let k = 0;
    m = mockFetch(async () => respostaFetch(200, { status: ++k === 1 ? 'enviado' : 'duplicado' }));
    try {
        const r = await bot.enviarEmPartes({ telefone: '47999998888', partes, tipo: 'pedido', origem: 'x', referenciaBase: 'pedido-2-confirmado' });
        assert.equal(r.status, 'enviado');
    } finally { m.restaurar(); }
});

test('g) delivery: PRODUCAO divide; PEDIDO/SAINDO/ENTREGUE iguais ao de antes; prévia igual; interno idêntico', () => {
    const { webhook, bot } = carregarWebhookEBot({});
    for (const e of ['PEDIDO', 'PRODUCAO', 'SAINDO', 'ENTREGUE']) {
        assert.deepEqual(webhook.montarMensagemDeliveryCliente(pedidoFixture(5), e), SNAP['deliv_' + e], e);
    }
    assert.deepEqual(webhook.montarMensagemDeliveryCliente(pedidoFixture(2, { valorFrete: 0, observacoes: null }), 'PRODUCAO'), SNAP.deliv_PRODUCAO_semFrete);

    const grande = pedidoFixture(60);
    const est = webhook.montarPartesDeliveryCliente(grande, 'PRODUCAO');
    const partes = bot.dividirEmPartes(est);
    assert.ok(partes.length >= 2);
    partes.forEach(t => assert.ok(t.length <= 1900));
    // prévia continua sendo o texto inteiro numa mensagem só
    assert.equal(webhook.montarMensagemDeliveryCliente(grande, 'PRODUCAO').texto, est.texto);
    // SAINDO/ENTREGUE nunca dividem
    for (const e of ['SAINDO', 'ENTREGUE']) {
        const s = webhook.montarPartesDeliveryCliente(grande, e);
        assert.equal(s.temResumo, false);
        assert.ok(s.texto.length < 200);
    }
    // interno (equipe): texto igual ao de hoje, com "Frete"
    const interno = (ped) => bot.dividirEmPartes(webhook.montarPartesDeliveryInterno(ped, 'Em Produção', '4321', 'Padaria do Zé'));
    assert.deepEqual(interno(pedidoFixture(5)), [SNAP_INTERNO.interno_PRODUCAO]);
    assert.deepEqual(interno(pedidoFixture(2, { valorFrete: 0, observacoes: null })), [SNAP_INTERNO.interno_PRODUCAO_semFrete]);
    assert.ok(interno(grande).length >= 2);
});

test('h) cortarTexto segue como rede de segurança: parte única gigante (item > limite) é cortada no enviar', async () => {
    const env = prismaEnvios();
    const { bot } = carregarWebhookEBot(env.overrides);
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        await bot.enviarEmPartes({ telefone: '47999998888', partes: ['y'.repeat(2600)], tipo: 'pedido', origem: 'x', referenciaBase: 'r-1' });
        assert.ok(textosPostados(chamadas)[0].texto.length <= 2000);
    } finally { restaurar(); }
});

// ─────────────────────────────────────────────────────────────────────────
// Rede contra edição que apaga função vizinha em webhookService (já aconteceu 1x)
// ─────────────────────────────────────────────────────────────────────────
test('webhookService exporta TODAS as funções que existiam antes (typeof function)', () => {
    const { webhook } = carregarWebhookEBot({});
    for (const nome of [
        'notificarPedido', 'notificarAmostra', 'notificarPedidoKitFesta', 'enviarMensagemCustom',
        'enviarCobranca', 'notificarDelivery', 'montarMensagemDeliveryCliente', 'montarMensagemPedido',
        'formatPhoneComFallback', 'montarPartesPedido', 'montarPartesDeliveryCliente', 'montarPartesDeliveryInterno',
    ]) assert.equal(typeof webhook[nome], 'function', nome);
    for (const nome of ['MOTIVO_DELIVERY_SILENCIADO', 'MOTIVO_DELIVERY_SEM_TELEFONE', 'MOTIVO_DELIVERY_SEM_AVISO']) {
        assert.equal(typeof webhook[nome], 'string', nome);
    }
});

test('notificarPedidoKitFesta continua enviando com referencia kitfesta-N-confirmado (1 mensagem)', async () => {
    const atualizados = [];
    const env = prismaEnvios();
    const { webhook } = carregarWebhookEBot({
        ...env.overrides,
        kitFestaPedido: {
            findUnique: async () => ({
                numero: 77, nomeCliente: 'Maria Souza', telefoneCliente: '47999998888', modo: 'retirada',
                data: new Date('2026-10-10T00:00:00Z'), horario: '15:00', total: 100,
                itens: [{ nomeProduto: 'Kit 100 salgados', opcao: null, quantidade: 1, precoUnitario: 100 }],
                observacoes: null,
            }),
            update: async (a) => { atualizados.push(a.data); },
        },
    });
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        const r = await webhook.notificarPedidoKitFesta('id-kf');
        assert.equal(r.ok, true);
        assert.equal(chamadas.length, 1);
        const corpo = textosPostados(chamadas)[0];
        assert.equal(corpo.referencia, 'kitfesta-77-confirmado');
        assert.equal(corpo.tipo, 'pedido');
        assert.equal(corpo.origem, 'kit-festa');
        assert.ok(corpo.texto.includes('Kit Festa* #77'));
        assert.deepEqual(atualizados, [{ whatsappEnviado: true }]);
    } finally { restaurar(); }
});

test('enviarCobranca e enviarMensagemCustom chegam ao bot com a referencia pedida', async () => {
    const env = prismaEnvios();
    const { webhook } = carregarWebhookEBot(env.overrides);
    const { chamadas, restaurar } = mockFetch(async () => respostaFetch(200, { status: 'enviado' }));
    try {
        await webhook.enviarCobranca({ telefone: '47999998888', nome: 'X', mensagem: 'Boleto', referencia: 'cob-1' });
        await webhook.enviarMensagemCustom('47999998888', 'X', 'Codigo 1', { tipo: 'verificacao', origem: 'site', referencia: 'ver-1' });
        const refs = textosPostados(chamadas).map(c => c.referencia);
        assert.deepEqual(refs, ['cob-1', 'ver-1']);
    } finally { restaurar(); }
});
