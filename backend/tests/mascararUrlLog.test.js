// Logger: o valor de parâmetros sensíveis da query nunca vai em claro para o log do servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mascararUrlLog } = require('../utils/mascararUrlLog');

test('mascara o VALOR de query sensível (senha/token/secret/authorization/api_key); resto intacto', () => {
    assert.equal(mascararUrlLog('/api/x?forcar=1&token=X&senha=Y'), '/api/x?forcar=1&token=***&senha=***');
    assert.equal(mascararUrlLog('/api/x?busca=pao'), '/api/x?busca=pao');
    assert.equal(mascararUrlLog('/api/x?API_KEY=k&x-api-key=k2&clientSecret=s&Authorization=Bearer%20z&passwd=1&Password=2'),
        '/api/x?API_KEY=***&x-api-key=***&clientSecret=***&Authorization=***&passwd=***&Password=***');
    assert.equal(mascararUrlLog('/api/x?tok%65n=ZZ&a=1'), '/api/x?token=***&a=1');       // chave codificada
    assert.equal(mascararUrlLog('/api/x?senha=a%26b&c=1'), '/api/x?senha=***&c=1');        // `%26` dentro do valor não vaza o resto
    assert.equal(mascararUrlLog('/x?a=%zz&token=Q'), '/x?a=%zz&token=***');                 // decodificação inválida
});

test('mantém mt= e cah_ag_; caminho com "token" (ex.: /lista/:token) não é afetado', () => {
    assert.equal(mascararUrlLog('/api/x?mt=abc'), '/api/x?mt=***');
    assert.match(mascararUrlLog('/api/x?a=cah_ag_SEGREDO'), /cah_ag_\*\*\*/);
    assert.equal(mascararUrlLog('/lista/abc123token'), '/lista/abc123token');
    assert.equal(mascararUrlLog('/lista/meu-token-publico?busca=a'), '/lista/meu-token-publico?busca=a');
    assert.equal(mascararUrlLog('/api/ponto-publico/token/xyz'), '/api/ponto-publico/token/xyz');
});

test('NUNCA lança: undefined, null, objeto, 40 KB, controle e %zz', () => {
    for (const v of [undefined, null, {}, 123, '%zz', '/x?%', '/x?token=%E0%A4%A', '/' + 'x'.repeat(40 * 1024), '/x?token=' + 'a'.repeat(40 * 1024), '/x?a=1&'.repeat(5000) + 'senha=Q', '/x?t\r\noken=Q']) {
        let r; assert.doesNotThrow(() => { r = mascararUrlLog(v); });
        assert.equal(typeof r, 'string');
        assert.ok(r.length <= 2001);
        assert.ok(!/senha=Q|token=Q/.test(r));
    }
    assert.equal(mascararUrlLog(undefined), ''); assert.equal(mascararUrlLog(null), '');
});

test('máscaras antigas seguem: a[token]=, ;secret=, segredo dentro do valor de chave comum, mt=, cah_ag_', () => {
    assert.equal(mascararUrlLog('/x?a[token]=ZZ&b=1'), '/x?a[token]=***&b=1');
    assert.equal(mascararUrlLog('/x;secret=ZZ&b=1'), '/x;secret=***&b=1');
    assert.equal(mascararUrlLog('/x?a=1;token=ZZ'), '/x?a=1;token=***');
    assert.equal(mascararUrlLog('/x?m%74=SEG&tok%65n=ZZ'), '/x?mt=***&token=***');
    assert.equal(mascararUrlLog('/x?token=a;b&c=1'), '/x?token=***&c=1');
    assert.equal(mascararUrlLog('/x?token='), '/x?token=***');
    assert.equal(mascararUrlLog('/x?token'), '/x?token');
    assert.equal(mascararUrlLog('/x?busca=senhorita&a=1'), '/x?busca=senhorita&a=1'); // valor com palavra parecida: intacto
    assert.match(mascararUrlLog('/x?token=cah_ag_ABC'), /token=cah_ag_\*\*\*/);
});

// URL hostil roda em TODA requisição, antes do login: o custo tem que ser linear (nada de regex com retrocesso).
test('desempenho: URLs hostis (token repetido sem "=", 100 KB de "a&", 1 MB de valor, 1 MB de "%") terminam em poucos ms', () => {
    const casos = [
        ['token x400 (2 KB)', '/api/x?' + 'token'.repeat(400)],
        ['token x3200 (16 KB)', '/api/x?' + 'token'.repeat(3200)],
        ['a& x50000 (100 KB)', '/api/x?' + 'a&'.repeat(50000)],
        ['token=A x1M', '/api/x?token=' + 'A'.repeat(1_000_000)],
        ['% x1MB', '/api/x?' + '%'.repeat(1_000_000)],
        ['token x200000 (1 MB)', '/api/x?' + 'token'.repeat(200_000)],
        ['senha&token&secret x', '/api/x?' + 'senha&token&secret;'.repeat(60_000)],
        ['?a=? x', '/api/x' + '?a=;'.repeat(300_000)],
        ['%zz x', '/api/x?' + '%zz'.repeat(300_000)],
    ];
    mascararUrlLog('/aquecimento?token=1');
    for (const [nome, url] of casos) {
        const t0 = process.hrtime.bigint();
        const r = mascararUrlLog(url);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        assert.ok(ms < 50, `${nome}: ${ms.toFixed(1)} ms (limite 50)`);
        assert.ok(r.length <= 2001, nome);
        assert.ok(!/token=A{5}/.test(r), `${nome}: vazou valor`);
    }
});
