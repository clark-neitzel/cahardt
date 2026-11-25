const test = require('node:test');
const assert = require('node:assert/strict');
const { resolverLocalEntrega, pontoValido, montarTexto } = require('../utils/enderecoEntrega');

const cliente = {
    End_Logradouro: 'Rua das Flores', End_Numero: '12', End_Complemento: null,
    End_Bairro: 'Centro', End_Cidade: 'Jaraguá do Sul', End_Estado: 'SC', End_CEP: '89251-000',
    Ponto_GPS: '-26.4850,-49.0660',
};
const local = {
    ativo: true, logradouro: 'Rua Dona Francisca', numero: '500', bairro: 'Atiradores',
    cidade: 'Joinville', estado: 'SC', cep: '89203-000', referencia: 'Portão azul', pontoGps: '-26.3045,-48.8487',
};

test('pontoValido: aceita lat,lng; recusa lixo e fora de faixa', () => {
    assert.equal(pontoValido('-26.3045, -48.8487'), '-26.3045,-48.8487');
    assert.equal(pontoValido(null), null);
    assert.equal(pontoValido(''), null);
    assert.equal(pontoValido('abc,def'), null);
    assert.equal(pontoValido('91,10'), null);
    assert.equal(pontoValido('10,181'), null);
    assert.equal(pontoValido('10'), null);
    assert.equal(pontoValido('10,20,30'), null);
    assert.equal(pontoValido(',20'), null);
});

test('montarTexto: linha única; vazio -> null', () => {
    assert.equal(
        montarTexto({ logradouro: 'Rua X', numero: '1', complemento: 'Ap 2', bairro: 'B', cidade: 'C', estado: 'SC', cep: '89000-000' }),
        'Rua X, 1, Ap 2, B, C - SC, 89000-000'
    );
    assert.equal(montarTexto({}), null);
});

test('1. Kit Festa retirada -> RETIRADA, vence tudo (inclusive avulso e local)', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: local,
        pedidoLocal: { modo: 'AVULSO', logradouro: 'Rua Y', numero: '9' },
        kitFesta: { modo: 'retirada', enderecoEntrega: 'Rua Z, 1' },
    });
    assert.deepEqual(r, { origem: 'RETIRADA', texto: null, endereco: null, ponto: null, cidade: null, divergeCadastro: null });
});

test('2. avulso com ponto -> PEDIDO com o ponto do avulso', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: local,
        pedidoLocal: { modo: 'AVULSO', logradouro: 'Rua Y', numero: '9', cidade: 'Blumenau', pontoGps: '-26.9,-49.0' },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.equal(r.texto, 'Rua Y, 9, Blumenau');
    assert.equal(r.ponto, '-26.9,-49');
    assert.equal(r.cidade, 'Blumenau');
    assert.equal(r.divergeCadastro, true);
    assert.equal(r.endereco.logradouro, 'Rua Y');
});

test('2. avulso SEM ponto -> ponto null (regra de ouro: nunca cai no Ponto_GPS do cadastro)', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: null,
        pedidoLocal: { modo: 'AVULSO', logradouro: 'Rua Y', numero: '9', cidade: 'Blumenau', pontoGps: null },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.equal(r.ponto, null);
});

test('2. avulso com ponto inválido -> ponto null (não cai no cadastro)', () => {
    const r = resolverLocalEntrega({
        cliente,
        pedidoLocal: { modo: 'AVULSO', logradouro: 'Rua Y', pontoGps: '999,999' },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.equal(r.ponto, null);
});

test('2. avulso vence o local do cliente e o texto do Kit Festa', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: local,
        pedidoLocal: { modo: 'AVULSO', logradouro: 'Rua Y', numero: '9' },
        kitFesta: { modo: 'entrega', enderecoEntrega: 'Rua Kit, 77' },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.match(r.texto, /Rua Y/);
});

test('2. avulso vazio (sem texto nem ponto) é ignorado e segue a cadeia', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: local, pedidoLocal: { modo: 'AVULSO' } });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
});

test('3. modo CADASTRO força o cadastro mesmo com local ativo e texto do Kit Festa', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: local,
        pedidoLocal: { modo: 'CADASTRO' },
        kitFesta: { modo: 'entrega', enderecoEntrega: 'Rua Kit, 77' },
    });
    assert.equal(r.origem, 'CADASTRO');
    assert.equal(r.ponto, '-26.4850,-49.0660');
    assert.equal(r.cidade, 'Jaraguá do Sul');
    assert.equal(r.divergeCadastro, false);
    assert.equal(r.texto, 'Rua das Flores, 12, Centro, Jaraguá do Sul - SC, 89251-000');
});

test('4. Kit Festa com endereço -> PEDIDO (texto livre, sem ponto, sem cidade)', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: local,
        kitFesta: { modo: 'entrega', enderecoEntrega: '  Rua das Palmeiras, 80, Joinville ' },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.equal(r.texto, 'Rua das Palmeiras, 80, Joinville');
    assert.equal(r.ponto, null);
    assert.equal(r.cidade, null);
    assert.equal(r.divergeCadastro, true);
});

test('4. Kit Festa com endereço igual ao do cadastro -> PEDIDO mas divergeCadastro=false', () => {
    const r = resolverLocalEntrega({
        cliente,
        kitFesta: { modo: 'entrega', enderecoEntrega: 'Rua das Flores, nº 12, Centro' },
    });
    assert.equal(r.origem, 'PEDIDO');
    assert.equal(r.divergeCadastro, false);
});

test('4. Kit Festa de entrega SEM endereço cai no local/cadastro', () => {
    const a = resolverLocalEntrega({ cliente, clienteLocal: local, kitFesta: { modo: 'entrega', enderecoEntrega: '  ' } });
    assert.equal(a.origem, 'LOCAL_CLIENTE');
    const b = resolverLocalEntrega({ cliente, kitFesta: { modo: 'entrega', enderecoEntrega: null } });
    assert.equal(b.origem, 'CADASTRO');
});

test('5. local ativo -> LOCAL_CLIENTE com ponto do local, cidade do local', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: local });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
    assert.equal(r.texto, 'Rua Dona Francisca, 500, Atiradores, Joinville - SC, 89203-000');
    assert.equal(r.ponto, '-26.3045,-48.8487');
    assert.equal(r.cidade, 'Joinville');
    assert.equal(r.endereco.referencia, 'Portão azul');
    assert.equal(r.divergeCadastro, true);
});

test('5. local SEM ponto -> ponto null, nunca o Ponto_GPS do cadastro', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: { ...local, pontoGps: null } });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
    assert.equal(r.ponto, null);
    const r2 = resolverLocalEntrega({ cliente, clienteLocal: { ...local, pontoGps: 'lixo' } });
    assert.equal(r2.ponto, null);
});

test('5. local com o mesmo endereço do cadastro -> divergeCadastro=false', () => {
    const r = resolverLocalEntrega({
        cliente, clienteLocal: { ativo: true, logradouro: 'R. das Flores', numero: '12', cidade: 'Jaraguá do Sul' },
    });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
    assert.equal(r.divergeCadastro, false);
});

test('5. local INATIVO -> CADASTRO (como se não existisse)', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: { ...local, ativo: false } });
    assert.equal(r.origem, 'CADASTRO');
    assert.equal(r.ponto, '-26.4850,-49.0660');
});

test('5. local ativo mas vazio (sem texto e sem ponto) -> CADASTRO', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: { ativo: true, logradouro: ' ', pontoGps: null } });
    assert.equal(r.origem, 'CADASTRO');
});

test('6. sem nada -> CADASTRO com ponto e cidade do cadastro', () => {
    const r = resolverLocalEntrega({ cliente });
    assert.equal(r.origem, 'CADASTRO');
    assert.equal(r.ponto, '-26.4850,-49.0660');
    assert.equal(r.cidade, 'Jaraguá do Sul');
    assert.equal(r.divergeCadastro, false);
});

test('6. cadastro sem ponto -> ponto null; sem argumentos não estoura', () => {
    const r = resolverLocalEntrega({ cliente: { ...cliente, Ponto_GPS: null } });
    assert.equal(r.origem, 'CADASTRO');
    assert.equal(r.ponto, null);
    const vazio = resolverLocalEntrega();
    assert.equal(vazio.origem, 'CADASTRO');
    assert.equal(vazio.texto, null);
    assert.equal(vazio.ponto, null);
});

test('pedidoLocal sem modo (só carimbo de destino) não muda nada', () => {
    const r = resolverLocalEntrega({ cliente, clienteLocal: local, pedidoLocal: { modo: null, destinoConcluido: 'LOCAL_CLIENTE' } });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
    const r2 = resolverLocalEntrega({ cliente, pedidoLocal: { modo: null } });
    assert.equal(r2.origem, 'CADASTRO');
});

test('divergeCadastro: false só quando bate; null quando não dá para comparar', () => {
    const r = resolverLocalEntrega({
        cliente: { ...cliente, End_Logradouro: null }, clienteLocal: local,
    });
    assert.equal(r.origem, 'LOCAL_CLIENTE');
    assert.equal(r.divergeCadastro, null);
});
