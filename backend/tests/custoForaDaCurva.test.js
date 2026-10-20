const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../services/custoForaDaCurvaService');

const ref = (custo, extra = {}) => ({ custo, fonte: 'COMPRAS', dataUltima: new Date('2026-09-16T15:00:00Z'), custoUltima: custo, qtdAmostra: 5, ...extra });
const tipos = (a) => a.map((x) => x.tipo);

test('normalizarUnidade: aliases, acento e caixa', () => {
    assert.equal(s.normalizarUnidade(' Kilograma '), 'KG');
    assert.equal(s.normalizarUnidade('kg'), 'KG');
    assert.equal(s.normalizarUnidade('l'), 'LT');
    assert.equal(s.normalizarUnidade('Und'), 'UN');
    assert.equal(s.normalizarUnidade('pct'), 'PCT');
    assert.equal(s.normalizarUnidade(null), '');
});

test('UNIDADES_EMBALAGEM não contém unidade de medida', () => {
    for (const u of ['KG', 'LT', 'UN', 'PC', 'G', 'ML', 'M']) assert.equal(s.UNIDADES_EMBALAGEM.has(u), false, u);
    for (const u of ['CX', 'FD', 'PCT', 'BLD', 'SC']) assert.equal(s.UNIDADES_EMBALAGEM.has(u), true, u);
});

test('APRESUNTADO: 2 CX fator 1, R$ 248,17, ref 9,52 -> CUSTO_ALTO + EMBALAGEM', () => {
    const a = s.avaliarItem({
        chave: 'i1', descricao: 'APRESUNTADO', quantidade: 2, valorTotal: 248.17, unidadeFornecedor: 'CX', fator: 1,
        alvoUnidade: 'KG', referencia: ref(9.52), checarEmbalagem: true
    });
    assert.deepEqual(tipos(a), ['CUSTO_ALTO', 'EMBALAGEM_FATOR_1']);
    assert.equal(a[0].custoUnitario, 124.085);
    assert.match(a[0].mensagem, /^R\$ 124,09\/kg\. Última compra: R\$ 9,52\/kg \(16\/09\)\. Confira/);
    assert.equal(a[1].mensagem, 'Caixa com fator 1: 2 CX viraram 2 kg. Quantos kg tem cada caixa?');
});

test('CEBOLINHA: 8215 KG por valor baixo -> CUSTO_BAIXO', () => {
    const a = s.avaliarItem({ chave: 'c', descricao: 'CEBOLINHA', quantidade: 8215, valorTotal: 120, unidadeFornecedor: 'KG', fator: 1, alvoUnidade: 'KG', referencia: ref(12), checarEmbalagem: true });
    assert.deepEqual(tipos(a), ['CUSTO_BAIXO']);
});

test('carne moída 20 kg / R$ 2.550 com ref 20 -> CUSTO_ALTO (127,5 / 20 = 6,4x)', () => {
    const a = s.avaliarItem({ chave: 'm', descricao: 'CARNE MOIDA', quantidade: 20, valorTotal: 2550, unidadeFornecedor: 'KG', fator: 1, alvoUnidade: 'KG', referencia: ref(20) });
    assert.deepEqual(tipos(a), ['CUSTO_ALTO']);
    assert.match(a[0].mensagem, /R\$ 127,50\/kg/);
});

test('água 10 FD = 10 UN -> EMBALAGEM', () => {
    const a = s.avaliarItem({ chave: 'a', descricao: 'AGUA', quantidade: 10, valorTotal: 30, unidadeFornecedor: 'FD', fator: 1, alvoUnidade: 'UN', referencia: ref(3), checarEmbalagem: true });
    assert.deepEqual(tipos(a), ['EMBALAGEM_FATOR_1']);
    assert.match(a[0].mensagem, /^Fardo com fator 1: 10 FD viraram 10 un\./);
});

test('bordas: 2,9x não alerta, 3,1x alerta; 1/2,9 não, 1/3,1 sim', () => {
    const f = (custo) => s.avaliarItem({ chave: 'b', quantidade: 1, valorTotal: custo, alvoUnidade: 'KG', referencia: ref(10) });
    assert.equal(f(29).length, 0);
    assert.deepEqual(tipos(f(31)), ['CUSTO_ALTO']);
    assert.equal(f(10 / 2.9).length, 0);
    assert.deepEqual(tipos(f(10 / 3.1)), ['CUSTO_BAIXO']);
});

test('sem referência -> sem alerta de custo', () => {
    assert.equal(s.avaliarItem({ chave: 'x', quantidade: 1, valorTotal: 9999, alvoUnidade: 'KG', referencia: null }).length, 0);
});

test('valorTotal 0 (bonificação) -> sem alerta de custo', () => {
    assert.equal(s.avaliarItem({ chave: 'x', quantidade: 5, valorTotal: 0, alvoUnidade: 'KG', referencia: ref(10) }).length, 0);
});

test('CX com fator 12 -> sem alerta de embalagem; unidade igual -> sem embalagem', () => {
    const base = { chave: 'x', quantidade: 2, valorTotal: 24, alvoUnidade: 'UN', referencia: ref(1), checarEmbalagem: true };
    assert.equal(s.avaliarItem({ ...base, unidadeFornecedor: 'CX', fator: 12 }).length, 0);
    assert.equal(s.avaliarItem({ ...base, unidadeFornecedor: 'CX', fator: 1, alvoUnidade: 'CX', referencia: ref(12) }).length, 0);
    assert.equal(s.avaliarItem({ ...base, unidadeFornecedor: 'PT', fator: 1, alvoUnidade: 'PCT', referencia: ref(12) }).length, 0);
});

test('supressão: alvo já comprado em CX com fator 1 não reavisa embalagem', () => {
    const a = s.avaliarItem({ chave: 'x', quantidade: 2, valorTotal: 20, alvoUnidade: 'UN', unidadeFornecedor: 'CX', fator: 1, referencia: ref(10), checarEmbalagem: true, jaUsouEmbalagemFator1: true });
    assert.equal(a.length, 0);
});

test('checarCusto=false (entrada sem pagamento) só embalagem', () => {
    const a = s.avaliarItem({ chave: 'x', quantidade: 2, valorTotal: 1000, alvoUnidade: 'KG', unidadeFornecedor: 'CX', fator: 1, referencia: ref(10), checarCusto: false, checarEmbalagem: true });
    assert.deepEqual(tipos(a), ['EMBALAGEM_FATOR_1']);
});

test('quantidade convertida <= 0 -> nada', () => {
    assert.equal(s.avaliarItem({ chave: 'x', quantidade: 0, valorTotal: 10, alvoUnidade: 'KG', referencia: ref(1) }).length, 0);
});

test('calcularReferencia: mediana das 5 mais recentes; fallback cadastro; vazio -> null', () => {
    const compras = [10, 12, 11, 100, 9, 500].map((c, i) => ({ custoUnitario: c, dataCompra: new Date(2026, 8, 20 - i) }));
    const r = s.calcularReferencia(compras, 7);
    assert.equal(r.fonte, 'COMPRAS');
    assert.equal(r.custo, 11); // [10,12,11,100,9] -> 9,10,11,12,100 -> 11
    assert.equal(r.custoUltima, 10);
    assert.equal(r.qtdAmostra, 5);
    const c = s.calcularReferencia([], 7);
    assert.equal(c.fonte, 'CADASTRO');
    assert.equal(s.calcularReferencia([], 0), null);
});

test('mensagem com fonte CADASTRO', () => {
    const a = s.avaliarItem({ chave: 'x', quantidade: 1, valorTotal: 100, alvoUnidade: 'KG', referencia: { custo: 10, fonte: 'CADASTRO', dataUltima: null, custoUltima: null, qtdAmostra: 0 } });
    assert.match(a[0].mensagem, /Custo atual do cadastro: R\$ 10,00\/kg\./);
});
