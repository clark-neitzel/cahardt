/**
 * Teste puro (sem banco) das funções do relatório do contador.
 * Rodar: node backend/scripts/teste-ratear-contabilidade.js
 */
const assert = require('assert');
const { ratear, juntarUnicos, rotuloDocumento } = require('../services/contabilidadeRelatorioService');

const soma = (a) => a.reduce((s, x) => s + x, 0);

// 1000,01 em 3 pesos iguais: soma exata
let r = ratear(100001, [33333, 33333, 33333]);
assert.strictEqual(soma(r), 100001); assert.deepStrictEqual(r, [33333, 33334, 33334]); // as outras arredondam; a 1ª (maior peso, empate) fica com o resto

// proporcional: 1000,00 entre 3 categorias 50/30/20
r = ratear(100000, [50000, 30000, 20000]); assert.deepStrictEqual(r, [50000, 30000, 20000]);

// centavo ímpar: 1,01 entre 2 pesos iguais
r = ratear(101, [100, 100]); assert.strictEqual(soma(r), 101); assert.deepStrictEqual(r, [50, 51]);

// maior peso recebe o resto (não é a primeira)
r = ratear(1000, [1, 1, 8]); assert.strictEqual(soma(r), 1000); assert.deepStrictEqual(r, [100, 100, 800]);

// peso negativo (linha de ajuste de desconto) — soma continua exata
r = ratear(5000, [10000, -1000]); assert.strictEqual(soma(r), 5000);
r = ratear(333, [7000, -3001, 12]); assert.strictEqual(soma(r), 333);

// soma de pesos 0 → tudo na 1ª
r = ratear(777, [0, 0, 0]); assert.deepStrictEqual(r, [777, 0, 0]);
r = ratear(777, [500, -500]); assert.strictEqual(soma(r), 777); assert.deepStrictEqual(r, [777, 0]);

// total 0
r = ratear(0, [100, 200]); assert.deepStrictEqual(r, [0, 0]);

// 1 linha; vazio
assert.deepStrictEqual(ratear(4242, [999]), [4242]);
assert.deepStrictEqual(ratear(10, []), []);

// total negativo
r = ratear(-100001, [33333, 33333, 33333]); assert.strictEqual(soma(r), -100001);

// valor grande (acima de 2^53 no produto) — BigInt
r = ratear(100000000000, [333333333, 333333333, 333333334]); assert.strictEqual(soma(r), 100000000000);

// varredura aleatória: soma sempre exata
let s = 12345;
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 5000; i++) {
    const n = 1 + Math.floor(rnd() * 6);
    const pesos = Array.from({ length: n }, () => Math.floor(rnd() * 200000) - (rnd() < 0.15 ? 20000 : 0));
    const total = Math.floor(rnd() * 4000000) - 500000;
    assert.strictEqual(soma(ratear(total, pesos)), total, `falhou: ${total} / ${pesos}`);
}

// juntarUnicos
assert.strictEqual(juntarUnicos(['PIX', null, 'PIX', '', 'Boleto']), 'Boleto; PIX');
assert.strictEqual(juntarUnicos([]), '');

// rotuloDocumento
const chave = (mod) => '41' + '2608' + '12345678000190' + mod + '1'.repeat(22);
assert.strictEqual(chave('55').length, 44);
assert.strictEqual(rotuloDocumento({ tipo: 'NFE', chave: chave('55') }), 'NF-e');
assert.strictEqual(rotuloDocumento({ tipo: 'NFE', chave: chave('65') }), 'NFC-e');
assert.strictEqual(rotuloDocumento({ tipo: 'NFE', chave: null }), 'NF-e');
assert.strictEqual(rotuloDocumento({ tipo: 'NFSE' }), 'NFS-e');
assert.strictEqual(rotuloDocumento({ tipo: 'IMPORTADO_CA' }), 'Importada (antiga)');
assert.strictEqual(rotuloDocumento({ tipo: 'SEM_DOC' }), 'Sem documento');

console.log('OK — todos os testes de ratear/juntarUnicos/rotuloDocumento passaram (incl. 5000 casos aleatórios).');
