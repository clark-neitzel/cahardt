// Editar pedido NÃO pode zerar a promoção do item (bug 11/2026): a edição regravava os itens sem
// emPromocao/promocaoId. Agora usa calcularItensComFlex, igual à criação.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const DB = path.join(__dirname, '../config/database.js');
const FLEX = path.join(__dirname, '../services/flexService.js');
const EST = path.join(__dirname, '../services/estoqueService.js');
const INS = path.join(__dirname, '../services/clienteInsightService.js');

const PROMO = { id: 'promo-1', nome: 'Promo Teste', tipo: 'SIMPLES', precoPromocional: '8.00', status: 'ATIVA', grupos: [] };

async function editar({ itens, promo = PROMO, isento = false, regras = new Map() }) {
    let gravado = null;
    const tx = {
        pedido: {
            findUnique: async () => ({ id: 'ped1', statusEnvio: 'ABERTO', especial: false, bonificacao: false, flexTotal: 0, itens: [] }),
            update: async ({ data }) => { gravado = data; return { id: 'ped1', itens: data.itens.create }; },
        },
        pedidoItem: { deleteMany: async () => ({}) },
    };
    const restaurar = [
        stubModule(DB, Object.assign(makeMockPrisma({
            cliente: { findUnique: async () => ({ categoriaCliente: { isentoFlex: isento } }) },
            promocao: { findFirst: async () => promo },
            $transaction: async (fn) => fn(tx),
        }))),
        stubModule(FLEX, { obterRegrasCategoria: async () => regras, calcularFlexDinamico: async () => ({ orcamento: 0 }) }),
        stubModule(EST, { recalcularPedido: async () => {} }),
        stubModule(INS, { recalcularCliente: async () => {} }),
    ];
    limparCacheContendo('pedidoService', 'promocaoService', 'pedidoCalculos');
    try {
        const svc = require('../services/pedidoService');
        await svc.editar('ped1', { clienteId: 'c1', itens, statusEnvio: 'ABERTO', dataVenda: '2026-11-20' });
        return { gravado, itens: gravado.itens.create };
    } finally { restaurar.reverse().forEach(f => f()); limparCacheContendo('pedidoService', 'promocaoService', 'pedidoCalculos'); }
}
const item = (valor) => ({ produtoId: 'p1', quantidade: 10, valor, valorBase: 8, });

test('item em promoção SIMPLES vigente mantém emPromocao/promocaoId/nome/tipo; acima do promo → flex 0', async () => {
    const r = await editar({ itens: [item(9)] });
    const i = r.itens[0];
    assert.equal(i.emPromocao, true);
    assert.equal(i.promocaoId, 'promo-1');
    assert.equal(i.nomePromocao, 'Promo Teste');
    assert.equal(i.tipoPromocao, 'SIMPLES');
    assert.equal(i.flexGerado, 0); // calcularFlexComPromocao zera flex positivo
    assert.equal(r.gravado.flexTotal, 0);
});

test('abaixo do preço promocional → flex negativo (7,00 vs 8,00 x 10 = -10)', async () => {
    const r = await editar({ itens: [item(7)] });
    assert.equal(r.itens[0].flexGerado, -10);
    assert.equal(r.gravado.flexTotal, -10);
    assert.equal(r.itens[0].emPromocao, true);
});

test('sem promoção: flex = (valor - valorBase) x qtd, como sempre', async () => {
    const r = await editar({ itens: [item(9)], promo: null });
    assert.equal(r.itens[0].emPromocao, false);
    assert.equal(r.itens[0].promocaoId, null);
    assert.equal(r.itens[0].flexGerado, 10);
    assert.equal(r.gravado.flexTotal, 10);
});

test('promoção vencida (buscarAtiva devolve null) → emPromocao false', async () => {
    const r = await editar({ itens: [item(7)], promo: null });
    assert.equal(r.itens[0].emPromocao, false);
    assert.equal(r.itens[0].flexGerado, -10);
});

test('cliente isento de flex → flex 0, mas promoção mantida', async () => {
    const r = await editar({ itens: [item(7)], isento: true });
    assert.equal(r.itens[0].flexGerado, 0);
    assert.equal(r.gravado.flexTotal, 0);
    assert.equal(r.itens[0].emPromocao, true);
});

test('regra de categoria (flexNegativo=false) continua zerando; valor vazio não vira NaN', async () => {
    const regras = new Map([['p1', { contabilizaFlex: true, flexPositivo: true, flexNegativo: false }]]);
    const r = await editar({ itens: [item(7), { produtoId: 'p2', quantidade: '', valor: '', valorBase: '' }], promo: null, regras });
    assert.equal(r.itens[0].flexGerado, 0);
    assert.equal(r.itens[1].flexGerado, 0);
    assert.equal(r.itens[1].valor, 0);
});
