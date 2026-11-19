// POST /api/promocoes: "YYYY-MM-DD" vale da 0h do dia inicial até 23:59:59.999 do dia final, horário de Brasília (-03:00).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const DB = path.join(__dirname, '../config/database.js');

async function criar(body) {
    let gravado = null;
    const restaurar = stubModule(DB, makeMockPrisma({
        promocao: {
            findFirst: async () => null,
            create: async ({ data }) => { gravado = data; return { ...data, grupos: [] }; },
        },
    }));
    limparCacheContendo('promocaoController', 'promocaoService');
    try {
        const ctrl = require('../controllers/promocaoController');
        let corpo, status = 200;
        const res = { json: b => { corpo = b; return res; }, status: s => { status = s; return res; } };
        await ctrl.criar({ body: { produtoId: 'p1', nome: 'X', tipo: 'SIMPLES', precoPromocional: '8', ...body }, user: { id: 'u1' } }, res);
        return { status, corpo, gravado };
    } finally { restaurar(); limparCacheContendo('promocaoController', 'promocaoService'); }
}

test('datas YYYY-MM-DD: início 0h e fim 23:59:59.999 de Brasília', async () => {
    const r = await criar({ dataInicio: '2026-11-30', dataFim: '2026-12-05' });
    assert.equal(r.status, 201);
    assert.equal(r.gravado.dataInicio.toISOString(), '2026-11-30T03:00:00.000Z');
    assert.equal(r.gravado.dataFim.toISOString(), '2026-12-06T02:59:59.999Z');
});

test('ISO completo passa intacto', async () => {
    const r = await criar({ dataInicio: '2026-11-30T10:00:00.000Z', dataFim: '2026-12-05T12:30:00.000Z' });
    assert.equal(r.status, 201);
    assert.equal(r.gravado.dataInicio.toISOString(), '2026-11-30T10:00:00.000Z');
    assert.equal(r.gravado.dataFim.toISOString(), '2026-12-05T12:30:00.000Z');
});

test('mesmo dia vale (fim >= início)', async () => {
    const r = await criar({ dataInicio: '2026-12-01', dataFim: '2026-12-01' });
    assert.equal(r.status, 201);
});

test('fim antes do início → 400', async () => {
    const r = await criar({ dataInicio: '2026-12-05', dataFim: '2026-12-01' });
    assert.equal(r.status, 400);
    assert.match(r.corpo.error, /data final/i);
    assert.equal(r.gravado, null);
});

test('data inválida → 400 (inclusive dia inexistente)', async () => {
    for (const ini of ['abc', '2026-02-30']) {
        const r = await criar({ dataInicio: ini, dataFim: '2026-12-05' });
        assert.equal(r.status, 400, ini);
        assert.equal(r.gravado, null);
    }
});
