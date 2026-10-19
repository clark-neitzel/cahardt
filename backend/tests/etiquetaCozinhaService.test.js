// Etiquetas da Cozinha (E2): regras puras (lote, datas, validade sugerida, validação, nome livre). Sem banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { stubModule } = require('./helpers/mockPrisma');

// o service captura `prisma` no topo: injeta um stub vazio (nenhum teste aqui toca o banco)
stubModule(path.join(__dirname, '../config/database.js'), {});
const { _internos: I } = require('../services/etiquetaCozinhaService');
const { normalizarNome, camposCozinha } = require('../services/pcpItemService');

const base = () => ({
    requisicaoId: 'abcdef123456', itemPcpId: 'x', conservacao: 'REFRIGERADO', tamanho: '40x25', quantidade: 3,
    fabricacao: I.hojeStr(), validadeDias: 3, responsavelId: 'r1',
});

test('lote: AAMMDD-NN com 2 dígitos', () => {
    assert.equal(I.loteTexto('2026-10-19', 3), '261019-03');
    assert.equal(I.loteTexto('2026-01-02', 12), '260102-12');
});

test('datas: soma e diferença atravessam mês/ano sem erro de fuso', () => {
    assert.equal(I.somaDias('2026-12-30', 3), '2027-01-02');
    assert.equal(I.somaDias('2026-03-01', -1), '2026-02-28');
    assert.equal(I.diffDias('2026-10-19', '2026-10-22'), 3);
    assert.equal(I.dataValida('2026-02-30'), false);
    assert.equal(I.dataValida('2026-10-19'), true);
});

test('validade sugerida: congelado x refrigerado; sem prazo = null', () => {
    const item = { validadeRefrigeradoDias: 3, validadeCongeladoDias: 90 };
    assert.equal(I.validadeSugerida(item, 'REFRIGERADO'), 3);
    assert.equal(I.validadeSugerida(item, 'CONGELADO'), 90);
    assert.equal(I.validadeSugerida({}, 'CONGELADO'), null);
});

test('validação: caminho feliz calcula validade a partir de validadeDias', () => {
    const b = base();
    const v = I.validarEntrada(b);
    assert.equal(v.validade, I.somaDias(b.fabricacao, 3));
    assert.equal(v.validadeDias, 3);
});

test('validação: validade explícita vira validadeDias', () => {
    const b = { ...base(), validadeDias: undefined };
    b.validade = I.somaDias(b.fabricacao, 10);
    assert.equal(I.validarEntrada(b).validadeDias, 10);
});

test('validação: recusa fabricação futura, antiga (>7d), validade antes, dias fora de 1..730, qtd e peso inválidos', () => {
    const h = I.hojeStr();
    const falha = (mut, re) => assert.throws(() => I.validarEntrada({ ...base(), ...mut }), (e) => e.status === 400 && re.test(e.message));
    falha({ fabricacao: I.somaDias(h, 1) }, /futuro/);
    falha({ fabricacao: I.somaDias(h, -8) }, /7 dias/);
    falha({ validadeDias: 0 }, /1 a 730/);
    falha({ validadeDias: 731 }, /1 a 730/);
    falha({ validadeDias: undefined, validade: I.somaDias(h, -1) }, /antes da fabricação/);
    falha({ quantidade: 0 }, /quantidade/);
    falha({ quantidade: 201 }, /quantidade/);
    falha({ pesoGramas: 0 }, /pesoGramas/);
    falha({ pesoGramas: 2000001 }, /pesoGramas/);
    falha({ conservacao: 'QUENTE' }, /conservacao/);
    falha({ tamanho: '50x50' }, /tamanho/);
    falha({ requisicaoId: 'curto' }, /requisicaoId/);
    falha({ itemPcpId: undefined, nomeLivre: '  ' }, /item/);
    falha({ responsavelId: undefined }, /respons/);
});

test('fabricação de 7 dias atrás ainda vale', () => {
    assert.doesNotThrow(() => I.validarEntrada({ ...base(), fabricacao: I.somaDias(I.hojeStr(), -7) }));
});

test('iniciais do responsável', () => {
    assert.equal(I.iniciais('Maria Aparecida Silva'), 'MS');
    assert.equal(I.iniciais('joao'), 'J');
    assert.equal(I.iniciais(''), '');
});

test('nome livre: normalização ignora caixa, acento e espaços repetidos', () => {
    assert.equal(normalizarNome('  Açúcar   MASCAVO '), normalizarNome('acucar mascavo'));
    assert.notEqual(normalizarNome('recheio frango'), normalizarNome('recheio de frango'));
});

test('campos da cozinha no item: faixa 1..730 e enum de grupo', () => {
    assert.deepEqual(camposCozinha({ validadeRefrigeradoDias: '5', grupoCozinha: 'MASSA' }), { validadeRefrigeradoDias: 5, grupoCozinha: 'MASSA' });
    assert.deepEqual(camposCozinha({ validadeCongeladoDias: '' , grupoCozinha: null }), { validadeCongeladoDias: null, grupoCozinha: null });
    assert.deepEqual(camposCozinha({ nome: 'x' }), {});
    assert.throws(() => camposCozinha({ validadeCongeladoDias: 0 }), (e) => e.status === 400);
    assert.throws(() => camposCozinha({ validadeRefrigeradoDias: 1.5 }), (e) => e.status === 400);
    assert.throws(() => camposCozinha({ grupoCozinha: 'XIS' }), (e) => e.status === 400);
});
