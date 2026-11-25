const test = require('node:test');
const assert = require('node:assert/strict');
const { divergeDoCadastro, resumoKitFesta } = require('../utils/enderecoEntrega');

const cli = { End_Logradouro: 'Rua das Flores', End_Numero: '12' };

test('igual ao cadastro (formato "completo") -> false', () => {
    assert.equal(divergeDoCadastro('Rua das Flores, nº 12, Centro, Joinville', cli), false);
});

test('rua diferente -> true', () => {
    assert.equal(divergeDoCadastro('Rua das Palmeiras, 12, Centro', cli), true);
});

test('número diferente -> true (inclusive 12 vs 120)', () => {
    assert.equal(divergeDoCadastro('Rua das Flores, 99', cli), true);
    assert.equal(divergeDoCadastro('Rua das Flores, 120', cli), true);
});

test('"R." vs "Rua", acento e caixa não divergem', () => {
    assert.equal(divergeDoCadastro('R. DAS FLORES 12 - centro', cli), false);
    assert.equal(divergeDoCadastro('Rua das Flôres, 12', { End_Logradouro: 'R. das Flores', End_Numero: '12' }), false);
    assert.equal(divergeDoCadastro('Av. Brasil, 500', { End_Logradouro: 'Avenida Brasil', End_Numero: '500' }), false);
});

test('"nº 12" vs "12" e número com letra', () => {
    assert.equal(divergeDoCadastro('Rua das Flores nº 12', cli), false);
    assert.equal(divergeDoCadastro('Rua das Flores, 12A', cli), false);
    assert.equal(divergeDoCadastro('Rua das Flores', { ...cli, End_Numero: 'nº 12' }), true);
    assert.equal(divergeDoCadastro('Rua das Flores, 12', { ...cli, End_Numero: 'nº 12' }), false);
});

test('cadastro sem logradouro -> null', () => {
    assert.equal(divergeDoCadastro('Rua das Flores, 12', { End_Logradouro: null, End_Numero: '12' }), null);
    assert.equal(divergeDoCadastro('Rua das Flores, 12', { End_Logradouro: '  ', End_Numero: '12' }), null);
    assert.equal(divergeDoCadastro('Rua das Flores, 12', null), null);
});

test('cadastro sem número (S/N) compara só o logradouro', () => {
    assert.equal(divergeDoCadastro('Rua das Flores, 77', { ...cli, End_Numero: 'S/N' }), false);
    assert.equal(divergeDoCadastro('Rua das Flores, 77', { ...cli, End_Numero: null }), false);
});

test('pedido sem endereço -> null', () => {
    assert.equal(divergeDoCadastro(null, cli), null);
    assert.equal(divergeDoCadastro('   ', cli), null);
});

test('resumoKitFesta: retirada -> null; entrega compara; sem kit -> null', () => {
    assert.equal(resumoKitFesta(null, cli), null);
    assert.deepEqual(
        resumoKitFesta({ numero: 5, modo: 'retirada', enderecoEntrega: 'Rua X, 1' }, cli),
        { numero: 5, modo: 'retirada', enderecoEntrega: 'Rua X, 1', divergeCadastro: null }
    );
    assert.deepEqual(
        resumoKitFesta({ numero: 6, modo: 'entrega', enderecoEntrega: 'Rua das Flores, 12' }, cli),
        { numero: 6, modo: 'entrega', enderecoEntrega: 'Rua das Flores, 12', divergeCadastro: false }
    );
    assert.deepEqual(
        resumoKitFesta({ numero: 7, modo: 'entrega', enderecoEntrega: null }, cli),
        { numero: 7, modo: 'entrega', enderecoEntrega: null, divergeCadastro: null }
    );
});
