// Regra de nome do cadastro: CPF = nome+sobrenome; CNPJ = razão+fantasia (utils/nomeCadastro).
const test = require('node:test');
const assert = require('node:assert/strict');
const n = require('../utils/nomeCadastro');

const CPF = '52998224725';      // CPF válido
const CNPJ = '11222333000181';  // CNPJ válido

test('contarPalavras ignora espaços duplicados e das pontas', () => {
    assert.equal(n.contarPalavras('Maria'), 1);
    assert.equal(n.contarPalavras('Maria Silva'), 2);
    assert.equal(n.contarPalavras('  Maria   Silva '), 2);
    assert.equal(n.contarPalavras('   '), 0);
    assert.equal(n.contarPalavras(null), 0);
});

test('CPF: uma palavra recusa; duas aceita', () => {
    assert.deepEqual(n.validarNomeCadastro({ documento: CPF, nome: 'Maria' }), { ok: false, erro: 'CPF exige nome e sobrenome (ex.: Maria Silva)' });
    assert.equal(n.validarNomeCadastro({ documento: CPF, nome: 'Maria Silva' }).ok, true);
    assert.equal(n.validarNomeCadastro({ documento: '529.982.247-25', nome: '  Maria   Silva ' }).ok, true);
    assert.equal(n.validarNomeCadastro({ documento: CPF, nome: '' }).ok, false);
});

test('CNPJ: exige razão E fantasia', () => {
    assert.deepEqual(n.validarNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: '' }), { ok: false, erro: 'CNPJ exige razão social e nome fantasia' });
    assert.equal(n.validarNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: '   ' }).ok, false);
    assert.equal(n.validarNomeCadastro({ documento: CNPJ, nome: '', nomeFantasia: 'Padaria' }).ok, false);
    assert.equal(n.validarNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: 'Padaria' }).ok, true);
    // CNPJ alfanumérico
    assert.equal(n.validarNomeCadastro({ documento: '12ABC34501DE35', nome: 'X Ltda', nomeFantasia: 'X' }).ok, true);
    assert.equal(n.validarNomeCadastro({ documento: '12ABC34501DE35', nome: 'X Ltda' }).ok, false);
});

test('documento que não é CPF/CNPJ não é problema do helper', () => {
    assert.equal(n.validarNomeCadastro({ documento: '123', nome: 'A' }).ok, true);
    assert.equal(n.validarNomeCadastro({}).ok, true);
});

test('cpfComNomeIncompleto', () => {
    assert.equal(n.cpfComNomeIncompleto(CPF, 'Maria'), true);
    assert.equal(n.cpfComNomeIncompleto(CPF, 'Maria Silva'), false);
    assert.equal(n.cpfComNomeIncompleto(CNPJ, 'Padaria'), false);
});

test('situacaoNomeCadastro: CPF', () => {
    const s = n.situacaoNomeCadastro({ documento: CPF, nome: 'Maria' });
    assert.deepEqual(s, { tipo: 'CPF_NOME_UNICO', campo: 'Nome', mensagem: n.MSG_CPF });
    assert.equal(n.situacaoNomeCadastro({ documento: CPF, nome: 'Maria Silva' }), null);
    // pontuação no documento e espaços duplicados no nome
    assert.equal(n.situacaoNomeCadastro({ documento: '529.982.247-25', nome: 'Maria' }).tipo, 'CPF_NOME_UNICO');
    assert.equal(n.situacaoNomeCadastro({ documento: '529.982.247-25', nome: '  Maria   Silva ' }), null);
    assert.equal(n.situacaoNomeCadastro({ documento: CPF, nome: '   ' }).tipo, 'CPF_NOME_UNICO');
    // fantasia não salva CPF de nome único
    assert.equal(n.situacaoNomeCadastro({ documento: CPF, nome: 'Maria', nomeFantasia: 'Maria Doces' }).tipo, 'CPF_NOME_UNICO');
});

test('situacaoNomeCadastro: CNPJ (só aviso)', () => {
    assert.deepEqual(n.situacaoNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: '' }),
        { tipo: 'CNPJ_SEM_FANTASIA', campo: 'NomeFantasia', mensagem: n.MSG_CNPJ });
    assert.equal(n.situacaoNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: null }).campo, 'NomeFantasia');
    assert.equal(n.situacaoNomeCadastro({ documento: CNPJ, nome: '', nomeFantasia: 'Padaria' }).campo, 'Nome');
    assert.equal(n.situacaoNomeCadastro({ documento: CNPJ, nome: 'Padaria Ltda', nomeFantasia: 'Padaria' }), null);
    assert.equal(n.situacaoNomeCadastro({ documento: '11.222.333/0001-81', nome: 'Padaria Ltda' }).tipo, 'CNPJ_SEM_FANTASIA');
    // alfanumérico
    assert.equal(n.situacaoNomeCadastro({ documento: '12ABC34501DE35', nome: 'X Ltda' }).tipo, 'CNPJ_SEM_FANTASIA');
    assert.equal(n.situacaoNomeCadastro({ documento: '12ABC34501DE35', nome: 'X Ltda', nomeFantasia: 'X' }), null);
});

test('situacaoNomeCadastro: documento vazio/inválido não entra', () => {
    assert.equal(n.situacaoNomeCadastro({ documento: '', nome: 'Maria' }), null);
    assert.equal(n.situacaoNomeCadastro({ documento: null, nome: 'Maria' }), null);
    assert.equal(n.situacaoNomeCadastro({ documento: '123', nome: 'Maria' }), null);
    assert.equal(n.situacaoNomeCadastro({}), null);
    assert.equal(n.situacaoNomeCadastro(), null);
});

test('documentoMudou: cadastro antigo com pontuação não conta como mudança', () => {
    assert.equal(n.documentoMudou('529.982.247-25', '52998224725'), false);   // mesmo CPF, salvo pontuado
    assert.equal(n.documentoMudou('11.222.333/0001-81', '11222333000181'), false);
    assert.equal(n.documentoMudou('52998224725', '52998224725'), false);
    assert.equal(n.documentoMudou('529.982.247-25', '11222333000181'), true);   // documento realmente diferente
    assert.equal(n.documentoMudou(null, '52998224725'), true);                  // não havia documento
    assert.equal(n.documentoMudou('12ABC34501DE35', '12abc34501de35'), false);  // alfanumérico, caixa
});
