// promocaoService.encerrarVencidas (rota admin POST /api/admin-exec/promocoes-encerrar-vencidas)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const DB = path.join(__dirname, '../config/database.js');
const DIA = 24 * 3600 * 1000;
const agora = Date.now();
const mk = (id, status, ini, fim) => ({
    id, nome: id, tipo: 'SIMPLES', produtoId: 'p-' + id, status, precoPromocional: '8.00', criadoPor: 'u1',
    dataInicio: new Date(agora + ini * DIA), dataFim: new Date(agora + fim * DIA),
    produto: { codigo: 'C' + id, nome: 'Prod ' + id },
    encerradoPor: null, encerradoEm: null, encerradaAntesPrevisto: null,
});

function setup() {
    const linhas = [mk('vencida', 'ATIVA', -20, -2), mk('vigente', 'ATIVA', -2, 5), mk('agendada', 'ATIVA', 3, 9), mk('encerrada', 'ENCERRADA', -20, -2)];
    const restaurar = stubModule(DB, makeMockPrisma({
        promocao: {
            findMany: async ({ where }) => linhas.filter(p => p.status === where.status && p.dataFim < where.dataFim.lt),
            updateMany: async ({ where, data }) => {
                let n = 0;
                for (const p of linhas) if (where.id.in.includes(p.id) && p.status === where.status && p.dataFim < where.dataFim.lt) { Object.assign(p, data); n++; }
                return { count: n };
            },
        },
    }));
    limparCacheContendo('promocaoService');
    return { linhas, svc: require('../services/promocaoService'), fim: () => { restaurar(); limparCacheContendo('promocaoService'); } };
}

test('simulação lista só a vencida e não grava', async () => {
    const { linhas, svc, fim } = setup();
    try {
        const r = await svc.encerrarVencidas({ aplicar: false });
        assert.equal(r.simulacao, true);
        assert.equal(r.total, 1);
        assert.equal(r.promocoes[0].id, 'vencida');
        assert.equal(r.promocoes[0].produtoCodigo, 'Cvencida');
        assert.equal(linhas.find(p => p.id === 'vencida').status, 'ATIVA');
    } finally { fim(); }
});

test('aplicar encerra só a vencida; 2ª chamada → 0', async () => {
    const { linhas, svc, fim } = setup();
    try {
        const r = await svc.encerrarVencidas({ aplicar: true });
        assert.equal(r.simulacao, false);
        assert.equal(r.encerradas, 1);
        const v = linhas.find(p => p.id === 'vencida');
        assert.equal(v.status, 'ENCERRADA');
        assert.equal(v.encerradoPor, 'sistema');
        assert.ok(v.encerradoEm instanceof Date);
        assert.equal(v.encerradaAntesPrevisto, false);
        assert.equal(linhas.find(p => p.id === 'vigente').status, 'ATIVA');
        assert.equal(linhas.find(p => p.id === 'agendada').status, 'ATIVA');
        assert.equal(linhas.find(p => p.id === 'encerrada').encerradoPor, null);
        const r2 = await svc.encerrarVencidas({ aplicar: true });
        assert.equal(r2.encerradas, 0);
    } finally { fim(); }
});
