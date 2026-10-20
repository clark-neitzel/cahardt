// Etiquetas em imagem (E3): empacotamento, CRC, ZPL ^GFA, EPL2 GW, validações e bitmap de teste. Funções puras.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const B = require('../services/etiquetaBitmapRender');

const imp100 = { linguagem: 'ZPL', tamanho: '100x120', dpi: 203, rotacao: 0 };
const imp40 = { linguagem: 'EPL2', tamanho: '40x25', colunas: 2, larguraRoloMm: 84, gapDots: 24, removerAcentos: true };
const raw100 = () => Buffer.alloc(96000, 0xaa);
const raw40 = (v) => Buffer.alloc(8000, v);
const bitmapZlib = (raw, w, h) => ({ larguraDots: w, alturaDots: h, formato: 'ZLIB', dados: zlib.deflateSync(raw).toString('base64') });

test('CRC16-XMODEM: vetor padrão "123456789" = 31C3', () => {
    assert.equal(B.crcHex('123456789'), '31C3');
});

test('empacotar: MSB primeiro, 1 = preto, bits de sobra = 0, bytes por linha = ceil(l/8)', () => {
    const px = new Uint8Array(10 * 2); // 10x2 -> 2 bytes/linha
    px[0] = 1; px[7] = 1; px[9] = 1; // linha 0: x=0, x=7, x=9
    px[10 + 8] = 1; // linha 1: x=8
    const r = B.empacotar(px, 10, 2);
    assert.equal(B.bytesPorLinha(10), 2);
    assert.deepEqual([...r], [0b10000001, 0b01000000, 0b00000000, 0b10000000]);
    assert.equal(B.bytesPorLinha(800), 100);
    assert.equal(B.bytesPorLinha(320), 40);
});

test('ZPL: cabeçalho ^GFA,96000,96000,100,:Z64: e CRC bate com o base64', () => {
    const z = B.renderZplImagem({ raw: raw100(), larguraDots: 800, alturaDots: 960, copias: 3, impressora: imp100 }).toString('ascii');
    assert.match(z, /^\^XA\n\^CI28\n\^PW800\n\^LL960\n\^LH0,0\n/);
    assert.match(z, /\^FO0,0\^GFA,96000,96000,100,:Z64:/);
    assert.match(z, /\^PQ3,0,1,N\n\^XZ\n$/);
    const m = /:Z64:([A-Za-z0-9+/=]+):([0-9A-F]{4})\^FS/.exec(z);
    assert.ok(m, 'formato :Z64:<b64>:<crc>');
    assert.equal(m[2], B.crcHex(m[1]));
    // round-trip: inflate do base64 volta aos bytes originais
    assert.ok(zlib.inflateSync(Buffer.from(m[1], 'base64')).equals(raw100()));
});

test('ZPL: HEX (reserva) = 192000 caracteres hexa sem compressão; offsets e densidade entram', () => {
    const z = B.renderZplImagem({ raw: raw100(), larguraDots: 800, alturaDots: 960, impressora: { ...imp100, ajustes: { offsetX: 8, offsetY: 4, densidade: 20 } }, compressao: 'HEX' }).toString('ascii');
    assert.match(z, /~SD20\n/);
    assert.match(z, /\^FO8,4\^GFA,96000,96000,100,AAAA/);
    const hex = /,100,([0-9A-F]+)\^FS/.exec(z)[1];
    assert.equal(hex.length, 192000);
});

test('ZPL: cópias limitadas a 1..999', () => {
    const z = (c) => B.renderZplImagem({ raw: raw100(), larguraDots: 800, alturaDots: 960, copias: c, impressora: imp100 }).toString('ascii');
    assert.match(z(0), /\^PQ1,/);
    assert.match(z(5000), /\^PQ999,/);
});

// ---- EPL2 ----
const latin = (b) => b.toString('latin1');
const contaStr = (b, re) => (latin(b).match(re) || []).length;
// bytes de dados de um GW (para checar inversão)
function dadosGw(buf, desde = 0) {
    const i = buf.indexOf('GW', desde, 'latin1');
    const cab = /^GW(\d+),(\d+),(\d+),(\d+),/.exec(latin(buf.subarray(i, i + 40)));
    const ini = i + cab[0].length;
    return { cab, dados: buf.subarray(ini, ini + 8000), fim: ini + 8000 };
}

test('EPL2: par = 1 formulário com GW16 e GW352 e um P1', () => {
    const b = B.renderEpl2Imagem({ raws: [raw40(0xff), raw40(0x00)], sequencia: [0, 1], impressora: imp40 });
    const t = latin(b);
    assert.match(t, /^\nN\nq672\nQ200,24\nD8\nS2\nZT\nN\nGW16,0,40,200,/);
    assert.equal(contaStr(b, /GW16,0,40,200,/g), 1);
    assert.equal(contaStr(b, /GW352,0,40,200,/g), 1);
    assert.equal(contaStr(b, /^P1$/gm), 1);
});

test('EPL2: ímpar (3) = 2 formulários, o último só com coluna 1', () => {
    const b = B.renderEpl2Imagem({ raws: [raw40(1), raw40(2), raw40(3)], sequencia: [0, 1, 2], impressora: imp40 });
    assert.equal(contaStr(b, /^P1$/gm), 2);
    assert.equal(contaStr(b, /GW16,0,40,200,/g), 2);
    assert.equal(contaStr(b, /GW352,0,40,200,/g), 1);
});

test('EPL2: 1 etiqueta = só coluna 1; impressora de 1 coluna = um formulário por etiqueta', () => {
    const um = B.renderEpl2Imagem({ raws: [raw40(1)], sequencia: [0], impressora: imp40 });
    assert.equal(contaStr(um, /GW352/g), 0);
    const uma = B.renderEpl2Imagem({ raws: [raw40(1), raw40(2)], sequencia: [0, 1], impressora: { ...imp40, colunas: 1 } });
    assert.equal(contaStr(uma, /^P1$/gm), 2);
    assert.equal(contaStr(uma, /GW352/g), 0);
});

test('EPL2: polaridade — com EPL2_GW_BIT_PRETO=0 o byte sai invertido; ordem da sequência respeitada', () => {
    assert.equal(B.EPL2_GW_BIT_PRETO, 0);
    const b = B.renderEpl2Imagem({ raws: [raw40(0b11110000), raw40(0b00001111)], sequencia: [1, 0], impressora: imp40 });
    const g1 = dadosGw(b);
    assert.equal(g1.cab[1], '16');
    assert.ok(g1.dados.every((x) => x === (~0b00001111 & 0xff)), 'coluna 1 = bitmap 1 invertido');
    const g2 = dadosGw(b, g1.fim);
    assert.equal(g2.cab[1], '352');
    assert.ok(g2.dados.every((x) => x === (~0b11110000 & 0xff)));
});

test('EPL2: ajustes de cadastro (col1X, col2X, offsets) valem', () => {
    const imp = { ...imp40, ajustes: { col1X: 24, col2X: 360, offsetY: 6, offsetX: 2 } };
    const b = B.renderEpl2Imagem({ raws: [raw40(1), raw40(1)], sequencia: [0, 1], impressora: imp });
    assert.equal(contaStr(b, /GW26,6,40,200,/g), 1);
    assert.equal(contaStr(b, /GW362,6,40,200,/g), 1);
    assert.throws(() => B.renderEpl2Imagem({ raws: [raw40(1)], sequencia: [0], impressora: { ...imp40, ajustes: { offsetX: -50 } } }), /negativo/);
});

test('divisão em trabalhos: 40 formulários por trabalho; 3 trabalhos no máximo', () => {
    const seq = (n) => Array.from({ length: n }, () => 0);
    assert.equal(B.dividirEmTrabalhos(seq(80), 2).length, 1);
    assert.equal(B.dividirEmTrabalhos(seq(81), 2).length, 2);
    assert.equal(B.dividirEmTrabalhos(seq(240), 2).length, 3);
    assert.throws(() => B.dividirEmTrabalhos(seq(241), 2), /demais/);
    assert.equal(B.dividirEmTrabalhos(seq(41), 1).length, 2); // 1 coluna: 40 etiquetas/trabalho
});

// ---- validação do corpo ----
test('desempacotar: ZLIB e RAW fazem round-trip', () => {
    const raw = raw100();
    assert.ok(B.desempacotar(bitmapZlib(raw, 800, 960), B.DIMENSOES['100x120']).equals(raw));
    assert.ok(B.desempacotar({ larguraDots: 800, alturaDots: 960, formato: 'RAW', dados: raw.toString('base64') }, B.DIMENSOES['100x120']).equals(raw));
});

test('desempacotar: recusa dimensão errada, formato ruim, base64 ruim, tamanho errado, zlib corrompido', () => {
    const dim = B.DIMENSOES['100x120'];
    assert.throws(() => B.desempacotar(bitmapZlib(raw100(), 799, 960), dim), /Tamanho da imagem inválido/);
    assert.throws(() => B.desempacotar({ ...bitmapZlib(raw100(), 800, 960), formato: 'PNG' }, dim), /formato/);
    assert.throws(() => B.desempacotar({ larguraDots: 800, alturaDots: 960, formato: 'RAW', dados: '###' }, dim), /base64/);
    assert.throws(() => B.desempacotar({ larguraDots: 800, alturaDots: 960, formato: 'RAW', dados: Buffer.alloc(10).toString('base64') }, dim), /esperado 96000/);
    assert.throws(() => B.desempacotar({ larguraDots: 800, alturaDots: 960, formato: 'ZLIB', dados: Buffer.from('nao e zlib!!').toString('base64') }, dim), /corrompida/);
    assert.throws(() => B.desempacotar(null, dim), /inválido/);
});

test('desempacotar: bomba zip (descomprime maior que o esperado) é recusada sem estourar memória', () => {
    const bomba = zlib.deflateSync(Buffer.alloc(50 * 1024 * 1024)); // 50 MB de zeros -> poucos KB
    assert.ok(bomba.length < 100 * 1024);
    assert.throws(() => B.desempacotar({ larguraDots: 800, alturaDots: 960, formato: 'ZLIB', dados: bomba.toString('base64') }, B.DIMENSOES['100x120']), /maior que o esperado/);
    // descomprimido MENOR que o esperado também recusa
    assert.throws(() => B.desempacotar(bitmapZlib(Buffer.alloc(1000), 800, 960), B.DIMENSOES['100x120']), /esperado 96000/);
});

test('dimensaoDe: pelo tamanho da impressora', () => {
    assert.deepEqual(B.dimensaoDe({ tamanho: '100x120' }), { w: 800, h: 960 });
    assert.deepEqual(B.dimensaoDe({ tamanho: '40x25' }), { w: 320, h: 200 });
    assert.equal(B.dimensaoDe({ tamanho: '80x100' }), null);
});

// ---- bitmap de teste ----
function pixel(raw, bpl, x, y) { return (raw[y * bpl + (x >> 3)] >> (7 - (x & 7))) & 1; }

test('EAN-13 7891234567895: 95 módulos, guardas 101 / 01010 / 101', () => {
    const m = B.ean13Modulos(B.EAN_TESTE);
    assert.equal(m.length, 95);
    assert.deepEqual(m.slice(0, 3), [1, 0, 1]);
    assert.deepEqual(m.slice(45, 50), [0, 1, 0, 1, 0]);
    assert.deepEqual(m.slice(92), [1, 0, 1]);
    assert.throws(() => B.ean13Modulos('7891234567890'), /verificador/);
});

test('bitmap de teste 100x120: tamanho exato, quadrado sólido no canto sup. esq., EAN decodifica nos 2 módulos, QR 29x29', () => {
    const t = B.gerarBitmapTeste('100x120');
    assert.equal(t.raws[0].length, 96000);
    const raw = t.raws[0];
    for (let y = 24; y < 104; y++) for (let x = 24; x < 104; x++) assert.equal(pixel(raw, 100, x, y), 1);
    assert.equal(pixel(raw, 100, 780, 20), 0, 'canto sup. direito branco (assimetria)');
    // lê o EAN da linha do meio das barras e compara com os módulos esperados
    const esperado = B.ean13Modulos(B.EAN_TESTE);
    for (const [x0, y, mod] of [[60, 375, 3], [60, 570, 2]]) {
        const lido = esperado.map((_, i) => pixel(raw, 100, x0 + i * mod + (mod >> 1), y));
        assert.deepEqual(lido, esperado, `EAN módulo ${mod}`);
    }
    // QR: 29 módulos a 3 dots, canto sup. esq. do finder (7x7) preto na borda
    const QRCode = require('qrcode');
    const qr = QRCode.create(B.QR_TESTE, { errorCorrectionLevel: 'M', version: 3 });
    assert.equal(qr.modules.size, 29);
    for (let r = 0; r < 29; r++) for (let c = 0; c < 29; c++) {
        assert.equal(pixel(raw, 100, 500 + c * 3 + 1, 520 + r * 3 + 1), qr.modules.get(r, c) ? 1 : 0);
    }
});

test('bitmap de teste 40x25: duas etiquetas diferentes de 8000 bytes cada', () => {
    const t = B.gerarBitmapTeste('40x25');
    assert.equal(t.raws.length, 2);
    assert.equal(t.raws[0].length, 8000);
    assert.equal(t.raws[1].length, 8000);
    assert.ok(!t.raws[0].equals(t.raws[1]));
    assert.equal(pixel(t.raws[0], 40, 20, 20), 1, 'A: quadrado sup. esq.');
    assert.equal(pixel(t.raws[1], 40, 20, 20), 0, 'B: sup. esq. vazio');
    assert.equal(pixel(t.raws[1], 40, 280, 20), 1, 'B: quadrado sup. dir.');
});

test('renderTesteBitmap: ZPL 100x120 e EPL2 40x25; combinação errada lança', () => {
    const z = B.renderTesteBitmap(imp100, 'Z64').toString('ascii');
    assert.match(z, /\^GFA,96000,96000,100,:Z64:/);
    const e = B.renderTesteBitmap(imp40);
    assert.equal(contaStr(e, /^P1$/gm), 1);
    assert.throws(() => B.renderTesteBitmap({ linguagem: 'ZPL', tamanho: '40x25' }), /só existe/);
});

// ---- ajustes por impressora (corrigir na Zebra sem deploy) ----
test('gwInverter do cadastro decide a polaridade do GW (default = constante)', () => {
    const raws = [raw40(0b11110000)];
    const gw = (imp) => dadosGw(B.renderEpl2Imagem({ raws, sequencia: [0], impressora: imp })).dados;
    assert.ok(gw(imp40).every((x) => x === 0b00001111), 'default: inverte');
    assert.ok(gw({ ...imp40, ajustes: { gwInverter: true } }).every((x) => x === 0b00001111));
    assert.ok(gw({ ...imp40, ajustes: { gwInverter: false } }).every((x) => x === 0b11110000), 'false: bytes como estão');
});

test('ZPL: gfCompressao HEX do cadastro vira ^GFA em hexa (via compressao resolvida)', async () => {
    const svc = require('../services/impressaoService');
    assert.equal(await svc.compressaoGf({ ajustes: { gfCompressao: 'HEX' } }), 'HEX');
    const z = B.renderZplImagem({ raw: raw100(), larguraDots: 800, alturaDots: 960, impressora: imp100, compressao: 'HEX' }).toString('ascii');
    assert.match(z, /,100,AAAA/);
    assert.throws(() => B.renderZplImagem({ raw: raw100(), larguraDots: 800, alturaDots: 960, impressora: { ...imp100, ajustes: { offsetX: -1 } } }), /negativo/);
});

test('validarAjustes: gwInverter bool, gfCompressao enum, offsets inteiros 0..200', () => {
    const { validarAjustes: v } = require('../services/impressaoService');
    assert.deepEqual(v({ gwInverter: false, gfCompressao: 'HEX', offsetX: 8, offsetY: 0, lixo: 1 }).ajustes, { offsetX: 8, offsetY: 0, gwInverter: false, gfCompressao: 'HEX' });
    assert.ok(v({ gwInverter: 'sim' }).erro);
    assert.ok(v({ gfCompressao: 'ZIP' }).erro);
    assert.ok(v({ offsetX: -1 }).erro);
    assert.ok(v({ offsetY: 201 }).erro);
    assert.ok(v({ offsetX: 1.5 }).erro);
    assert.ok(v([]).erro);
});
