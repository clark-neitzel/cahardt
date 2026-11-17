// node scripts/teste-ncm.js — testes unitários simples do utils/ncm.js
const assert = require('assert');
const { normalizarNcm, ncmValido, ncmDoItem } = require('../utils/ncm');
const cfg = { ncmPadrao: '19022000' };
const casos = [
    ['', false], [null, false], [undefined, false], ['   ', false],
    ['1234567', false], ['12345678', true], ['123456789', false],
    ['1902.20.00', true], ['1902200', false], ['abcdefgh', false], ['A19022000', false], ['1902-20-00', false], ['1902 2000', true], ['1902200A', false], [' 19022000 ', true],
];
for (const [v, esp] of casos) assert.strictEqual(ncmValido(v), esp, `ncmValido(${JSON.stringify(v)})`);
assert.strictEqual(normalizarNcm('1902.20.00'), '19022000');
assert.strictEqual(normalizarNcm(null), '');
assert.strictEqual(normalizarNcm('1902-20-00'), '1902-20-00');
assert.deepStrictEqual(ncmDoItem({ produto: { ncm: '1902.20.00' } }, cfg), { ncm: '19022000', origem: 'produto', bruto: '19022000' });
assert.strictEqual(ncmDoItem({ produto: { ncm: '' } }, cfg).origem, 'padrao');
assert.strictEqual(ncmDoItem({ produto: null }, cfg).origem, 'padrao');
const inv = ncmDoItem({ produto: { ncm: '1234' } }, cfg);
assert.strictEqual(inv.origem, 'invalido'); assert.strictEqual(inv.ncm, '19022000'); assert.strictEqual(inv.bruto, '1234');
assert.strictEqual(ncmDoItem({ produto: { ncm: 'abc' } }, cfg).origem, 'invalido');
console.log('OK — todos os testes de NCM passaram');
