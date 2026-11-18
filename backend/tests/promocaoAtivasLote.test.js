// GET /api/promocoes/ativas-lote só devolve promoção VIGENTE (11/2026).
// Bug: devolvia toda promoção com status ATIVA, inclusive vencida/futura, e a tela de
// Novo Pedido calculava o valorBase (e o flex) com preço promocional que o salvamento rejeita.
// Sem banco: o Prisma é trocado por um fake em memória que aplica o `where` de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');

const DB = path.join(__dirname, '../config/database.js');
const DIA = 24 * 3600 * 1000;
const agora = Date.now();
const mk = (id, produtoId, status, ini, fim, criadoEm = new Date(agora)) => ({
    id, produtoId, status, dataInicio: new Date(agora + ini * DIA), dataFim: new Date(agora + fim * DIA),
    criadoEm, grupos: [],
});
const BASE = [
    mk('vencida', 'p-vencida', 'ATIVA', -60, -10),
    mk('futura', 'p-futura', 'ATIVA', 5, 30),
    mk('vigente', 'p-vigente', 'ATIVA', -5, 5),
    mk('encerrada', 'p-encerrada', 'ENCERRADA', -5, 5),
];

function fakePrisma(linhas) {
    return makeMockPrisma({
        promocao: {
            findMany: async ({ where }) => linhas.filter(p =>
                (!where.status || p.status === where.status) &&
                (!where.dataInicio?.lte || p.dataInicio <= where.dataInicio.lte) &&
                (!where.dataFim?.gte || p.dataFim >= where.dataFim.gte) &&
                (!where.produtoId?.in || where.produtoId.in.includes(p.produtoId))),
        },
    });
}

async function chamar(linhas) {
    const restaurar = stubModule(DB, fakePrisma(linhas));
    limparCacheContendo('promocaoController', 'promocaoService');
    try {
        const ctrl = require('../controllers/promocaoController');
        let corpo, status = 200;
        const res = { json: b => { corpo = b; return res; }, status: s => { status = s; return res; } };
        await ctrl.buscarAtivasLote({}, res);
        return { status, corpo };
    } finally {
        restaurar();
        limparCacheContendo('promocaoController', 'promocaoService');
    }
}

test('ativas-lote: vencida e futura ficam fora; vigente entra; encerrada fora', async () => {
    const { status, corpo } = await chamar(BASE);
    assert.equal(status, 200);
    assert.deepEqual(Object.keys(corpo), ['p-vigente']);
    assert.equal(corpo['p-vigente'].id, 'vigente');
    assert.ok(Array.isArray(corpo['p-vigente'].grupos), 'formato com grupos preservado');
});

test('ativas-lote: sem nenhuma vigente devolve objeto vazio', async () => {
    const { corpo } = await chamar(BASE.filter(p => p.id !== 'vigente'));
    assert.deepEqual(corpo, {});
});
