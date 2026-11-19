// GET /api/promocoes/para-meta: vigente + agendada; vencida e ENCERRADA fora; array.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const DB = path.join(__dirname, '../config/database.js');
const DIA = 24 * 3600 * 1000;
const agora = Date.now();
const mk = (id, prod, status, ini, fim) => ({
    id, nome: 'Promo ' + id, tipo: 'SIMPLES', produtoId: 'p-' + id, status,
    dataInicio: new Date(agora + ini * DIA), dataFim: new Date(agora + fim * DIA),
    produto: { id: 'p-' + id, nome: prod },
});

async function chamar(linhas) {
    const restaurar = stubModule(DB, makeMockPrisma({
        promocao: { findMany: async ({ where }) => linhas.filter(p => p.status === where.status && p.dataFim >= where.dataFim.gte) },
    }));
    limparCacheContendo('promocaoController', 'promocaoService');
    try {
        const ctrl = require('../controllers/promocaoController');
        let corpo, status = 200;
        const res = { json: b => { corpo = b; return res; }, status: s => { status = s; return res; } };
        await ctrl.listarParaMeta({}, res);
        return { status, corpo };
    } finally { restaurar(); limparCacheContendo('promocaoController', 'promocaoService'); }
}

test('vigente + agendada entram, vencida e encerrada não; ordenado por produto; formato do contrato', async () => {
    const { status, corpo } = await chamar([
        mk('vencida', 'Aaa', 'ATIVA', -20, -2), mk('futura', 'Zzz', 'ATIVA', 3, 9),
        mk('vigente', 'Mmm', 'ATIVA', -2, 5), mk('enc', 'Bbb', 'ENCERRADA', -2, 5),
    ]);
    assert.equal(status, 200);
    assert.ok(Array.isArray(corpo));
    assert.deepEqual(corpo.map(p => p.id), ['vigente', 'futura']);
    assert.deepEqual(corpo.map(p => p.agendada), [false, true]);
    assert.deepEqual(Object.keys(corpo[0]).sort(), ['agendada', 'dataFim', 'dataInicio', 'id', 'nome', 'produtoId', 'produtoNome', 'tipo']);
    assert.equal(corpo[0].produtoNome, 'Mmm');
    assert.match(corpo[0].dataInicio, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test('sem nenhuma → []', async () => {
    const { corpo } = await chamar([mk('vencida', 'Aaa', 'ATIVA', -20, -2)]);
    assert.deepEqual(corpo, []);
});
