// Etiquetas em IMAGEM (E3) — funções PURAS (sem banco, sem rede).
// Plano: docs/etiquetas-cozinha/PLANO-E3-ETIQUETAS-ATUAIS.md seções 3.5 e 3.7. Contrato: CONTRATO-E3.md.
//
// Formato canônico do bitmap (o que o app manda e o que circula aqui dentro):
//   linhas de cima para baixo, MSB = pixel mais à esquerda, bit 1 = PRETO,
//   bytesPorLinha = ceil(largura/8), bits de sobra = 0 (branco).
//   100x120 -> 800x960 dots -> 100 bytes/linha -> 96.000 bytes
//   40x25   -> 320x200 dots ->  40 bytes/linha ->  8.000 bytes (por etiqueta; 2 por formulário na TLP 2844)
//
//   renderZplImagem(...)   -> Buffer  ZPL (^GFA, :Z64: + CRC16 ou HEX)
//   renderEpl2Imagem(...)  -> Buffer  EPL2 (GW em 2 colunas, P1 por formulário)
//   gerarBitmapTeste(...)  -> bitmaps assimétricos p/ o teste físico (BITMAP_TESTE)

const zlib = require('zlib');
const { parametrosEpl2 } = require('./etiquetaCozinhaRender');

// [A VALIDAR NA ZEBRA] Polaridade do GW no EPL2: valor do BIT que significa PRETO no `GW`.
// O bitmap interno é 1 = preto. O plano manda tratar o GW como "1 = branco" => 0 aqui (inverte os bytes).
// É só o PADRÃO: a impressora sobrepõe com ajustes.gwInverter (true = inverte, false = não) — corrige sem deploy.
const EPL2_GW_BIT_PRETO = 0;

const DIMENSOES = { '100x120': { w: 800, h: 960 }, '40x25': { w: 320, h: 200 } };
const MAX_FORMULARIOS_POR_TRABALHO = 40;
const MAX_TRABALHOS = 3;

class ErroBitmap extends Error {
    constructor(msg, status = 400) { super(msg); this.status = status; }
}

const bytesPorLinha = (largura) => Math.ceil(largura / 8);

// ---------- CRC16 (CRC-16/XMODEM: poli 0x1021, init 0x0000) ----------

function crc16Xmodem(dados) {
    const buf = Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados), 'latin1');
    let crc = 0;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i] << 8;
        for (let b = 0; b < 8; b++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
}
const crcHex = (dados) => crc16Xmodem(dados).toString(16).toUpperCase().padStart(4, '0');

// ---------- empacotar / desempacotar ----------

// pixels: Uint8Array largura*altura (1 = preto) -> Buffer MSB-first
function empacotar(pixels, largura, altura) {
    const bpl = bytesPorLinha(largura);
    const out = Buffer.alloc(bpl * altura);
    for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
            if (pixels[y * largura + x]) out[y * bpl + (x >> 3)] |= 0x80 >> (x & 7);
        }
    }
    return out;
}

// Valida um item de `bitmaps` do corpo e devolve o Buffer cru (1 = preto) com tamanho exato.
// Nunca confia no cliente: dimensões exatas, base64 estrito, inflate com teto (bomba zip).
function desempacotar(bitmap, esperado) {
    if (!bitmap || typeof bitmap !== 'object') throw new ErroBitmap('Bitmap inválido.');
    const { w, h } = esperado;
    if (Number(bitmap.larguraDots) !== w || Number(bitmap.alturaDots) !== h) {
        throw new ErroBitmap(`Tamanho da imagem inválido: esperado ${w}x${h} dots, recebido ${Number(bitmap.larguraDots)}x${Number(bitmap.alturaDots)}.`);
    }
    const formato = String(bitmap.formato || '').toUpperCase();
    if (formato !== 'ZLIB' && formato !== 'RAW') throw new ErroBitmap('formato do bitmap deve ser ZLIB ou RAW.');
    const b64 = bitmap.dados;
    if (typeof b64 !== 'string' || !b64.length || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
        throw new ErroBitmap('dados do bitmap não são base64 válido.');
    }
    const total = bytesPorLinha(w) * h;
    const bruto = Buffer.from(b64, 'base64');
    let raw;
    if (formato === 'RAW') {
        raw = bruto;
    } else {
        try {
            raw = zlib.inflateSync(bruto, { maxOutputLength: total });
        } catch (e) {
            if (e.code === 'ERR_BUFFER_TOO_LARGE') throw new ErroBitmap('Imagem descomprimida maior que o esperado.');
            throw new ErroBitmap('Imagem comprimida corrompida (zlib).');
        }
    }
    if (raw.length !== total) throw new ErroBitmap(`Imagem com ${raw.length} bytes; esperado ${total} bytes (${w}x${h}).`);
    return raw;
}

// Dimensão exigida pelo tamanho da impressora (null = tamanho sem suporte a imagem)
function dimensaoDe(impressora) {
    return DIMENSOES[impressora?.tamanho] || null;
}

// ---------- ZPL ----------

// Campo ^GFA. Os dois contadores são bytes DESCOMPRIMIDOS; Z64 = base64 do zlib + ":" + CRC16 (4 hex) sobre o base64.
function gfa(raw, bpl, compressao) {
    if (compressao === 'HEX') return `^GFA,${raw.length},${raw.length},${bpl},${raw.toString('hex').toUpperCase()}`;
    const b64 = zlib.deflateSync(raw, { level: 9 }).toString('base64');
    return `^GFA,${raw.length},${raw.length},${bpl},:Z64:${b64}:${crcHex(b64)}`;
}

function renderZplImagem({ raw, larguraDots, alturaDots, copias = 1, impressora = {}, compressao = 'Z64' }) {
    const ajustes = impressora.ajustes || {};
    const ox = Math.round(Number(ajustes.offsetX) || 0);
    const oy = Math.round(Number(ajustes.offsetY) || 0);
    const dens = Number(ajustes.densidade);
    if (ox < 0 || oy < 0) throw new ErroBitmap('Ajuste de posição da impressora fora do limite (valor negativo).', 409);
    const n = Math.min(999, Math.max(1, Math.floor(Number(copias)) || 1));
    const out = ['^XA', '^CI28', `^PW${larguraDots}`, `^LL${alturaDots}`, '^LH0,0'];
    if (Number.isFinite(dens) && dens > 0) out.push(`~SD${Math.min(30, dens)}`);
    out.push(`^FO${ox},${oy}${gfa(raw, bytesPorLinha(larguraDots), compressao === 'HEX' ? 'HEX' : 'Z64')}^FS`);
    out.push(`^PQ${n},0,1,N`, '^XZ');
    return Buffer.from(out.join('\n') + '\n', 'ascii');
}

// ---------- EPL2 ----------

// Divide a sequência de etiquetas (índices) em trabalhos de até 40 formulários cada.
function dividirEmTrabalhos(sequencia, colunas) {
    const porTrabalho = MAX_FORMULARIOS_POR_TRABALHO * (colunas >= 2 ? 2 : 1);
    const partes = [];
    for (let i = 0; i < sequencia.length; i += porTrabalho) partes.push(sequencia.slice(i, i + porTrabalho));
    if (partes.length > MAX_TRABALHOS) {
        throw new ErroBitmap(`Etiquetas demais de uma vez (máximo ${MAX_TRABALHOS * porTrabalho}). Divida em lotes menores.`);
    }
    return partes;
}

// raws: Buffers 40x200 (1 = preto); sequencia: índices em raws (ordem de impressão).
// Cabeçalho idêntico ao de renderEpl2Pequena (parametrosEpl2). 2 colunas: pares (0,1),(2,3)...; ímpar => só coluna 1.
function renderEpl2Imagem({ raws, sequencia, impressora = {} }) {
    const p = parametrosEpl2(impressora);
    const bpl = bytesPorLinha(DIMENSOES['40x25'].w); // 40
    const alt = DIMENSOES['40x25'].h; // 200
    if (p.col1 < 0 || p.oy < 0 || (p.colunas === 2 && p.col2 < 0)) throw new ErroBitmap('Ajuste de posição da impressora fora do limite (valor negativo).', 409);
    const blocos = [Buffer.from(p.cabecalho.join('\n') + '\n', 'ascii')];
    const inverter = typeof impressora.ajustes?.gwInverter === 'boolean' ? impressora.ajustes.gwInverter : EPL2_GW_BIT_PRETO === 0;
    const gw = (x, raw) => {
        const dados = !inverter ? raw : Buffer.from(raw.map((b) => (~b) & 0xff));
        return Buffer.concat([Buffer.from(`GW${x},${p.oy},${bpl},${alt},`, 'ascii'), dados, Buffer.from('\n', 'ascii')]);
    };
    for (let i = 0; i < sequencia.length; i += p.colunas) {
        blocos.push(Buffer.from('N\n', 'ascii'), gw(p.col1, raws[sequencia[i]]));
        if (p.colunas === 2 && i + 1 < sequencia.length) blocos.push(gw(p.col2, raws[sequencia[i + 1]]));
        blocos.push(Buffer.from('P1\n', 'ascii'));
    }
    return Buffer.concat(blocos);
}

// ---------- bitmap de TESTE (assimétrico) ----------

class Tela {
    constructor(w, h) { this.w = w; this.h = h; this.px = new Uint8Array(w * h); }
    ret(x, y, w, h, v = 1) {
        for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++) {
            for (let i = Math.max(0, x); i < Math.min(this.w, x + w); i++) this.px[j * this.w + i] = v;
        }
    }
    moldura(x, y, w, h, esp = 1) {
        this.ret(x, y, w, esp); this.ret(x, y + h - esp, w, esp); this.ret(x, y, esp, h); this.ret(x + w - esp, y, esp, h);
    }
    // Letra "F" grande (assimétrica: denuncia espelhamento e giro)
    letraF(x, y, alt, esp) {
        const larg = Math.round(alt * 0.6);
        this.ret(x, y, esp, alt); // haste
        this.ret(x, y, larg, esp); // barra de cima
        this.ret(x, y + Math.round(alt * 0.45), Math.round(larg * 0.75), esp); // barra do meio
    }
    ean13(digitos, x, y, modulo, altura) {
        const mods = ean13Modulos(digitos);
        for (let i = 0; i < mods.length; i++) if (mods[i]) this.ret(x + i * modulo, y, modulo, altura);
    }
    qr(texto, x, y, modulo) {
        const QRCode = require('qrcode'); // transitivo antes (node-pdf-nfe); agora dependência direta
        const qr = QRCode.create(texto, { errorCorrectionLevel: 'M', version: 3 });
        const n = qr.modules.size;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) this.ret(x + c * modulo, y + r * modulo, modulo, modulo);
        return n;
    }
    empacotado() { return empacotar(this.px, this.w, this.h); }
}

const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map((s) => [...s].map((b) => (b === '0' ? '1' : '0')).join(''));
const EAN_G = EAN_R.map((s) => [...s].reverse().join(''));
const EAN_PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function ean13DigitoVerificador(d12) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (s % 10)) % 10;
}

// 95 módulos (1 = barra) de um EAN-13
function ean13Modulos(digitos) {
    const d = String(digitos);
    if (!/^\d{13}$/.test(d)) throw new Error('EAN-13 precisa de 13 dígitos.');
    if (ean13DigitoVerificador(d) !== Number(d[12])) throw new Error('EAN-13 com dígito verificador inválido.');
    const par = EAN_PARIDADE[Number(d[0])];
    let bits = '101';
    for (let i = 0; i < 6; i++) bits += (par[i] === 'L' ? EAN_L : EAN_G)[Number(d[i + 1])];
    bits += '01010';
    for (let i = 0; i < 6; i++) bits += EAN_R[Number(d[i + 7])];
    bits += '101';
    return [...bits].map((b) => (b === '1' ? 1 : 0));
}

const EAN_TESTE = '7891234567895';
const QR_TESTE = 'https://hardtsalgados.com.br/kit-festa'; // 38 bytes -> versão 3 (29x29 módulos)

// Devolve { larguraDots, alturaDots, raws:[Buffer], descricao }.
// 100x120: UM bitmap com tudo. 40x25: DOIS bitmaps (colunas 1 e 2 saem diferentes, p/ ver se trocaram/deslocaram).
function gerarBitmapTeste(tamanho) {
    if (tamanho === '100x120') {
        const t = new Tela(800, 960);
        t.moldura(16, 16, 768, 928, 1); // 1 dot a 2 mm da borda
        t.ret(24, 24, 80, 80); // quadrado sólido 10 mm, canto superior ESQUERDO
        t.letraF(300, 60, 220, 44); // "F" grande
        t.ean13(EAN_TESTE, 60, 300, 3, 150); // módulo 3 dots (285 de largura)
        t.ean13(EAN_TESTE, 60, 520, 2, 100); // módulo 2 dots (190 de largura)
        t.qr(QR_TESTE, 500, 520, 3); // QR 29 módulos x 3 dots = 87 dots
        t.ret(60, 700, 400, 6); // régua de 400 dots (50 mm) p/ conferir a escala com uma régua
        return { larguraDots: 800, alturaDots: 960, raws: [t.empacotado()], descricao: 'moldura 2mm, quadrado sólido sup. esq., F, EAN-13 módulo 3 e 2, QR 29x3, régua 50mm' };
    }
    if (tamanho === '40x25') {
        const a = new Tela(320, 200);
        a.moldura(8, 8, 304, 184, 1);
        a.ret(14, 14, 40, 40); // quadrado sólido sup. esq.
        a.letraF(70, 14, 80, 16);
        a.qr(QR_TESTE, 215, 14, 3);
        a.ean13(EAN_TESTE, 24, 112, 2, 66); // módulo 2 dots
        const b = new Tela(320, 200);
        b.moldura(8, 8, 304, 184, 1);
        b.ret(266, 14, 40, 40); // quadrado sólido sup. DIREITO (diferente da A)
        b.letraF(70, 14, 80, 16);
        b.letraF(70, 110, 60, 12); // dois F: etiqueta B
        b.qr(QR_TESTE, 215, 100, 3);
        return { larguraDots: 320, alturaDots: 200, raws: [a.empacotado(), b.empacotado()], descricao: 'A: quadrado sup. esq. + F + QR + EAN módulo 2; B: quadrado sup. dir. + 2 F + QR' };
    }
    throw new Error('Tamanho sem teste de imagem.');
}

// Conteúdo do BITMAP_TESTE para a impressora cadastrada (mesmo empacotador de produção). Lança Error em combinação inválida.
function renderTesteBitmap(impressora, compressao = 'Z64') {
    if (impressora.linguagem === 'ZPL' && impressora.tamanho === '100x120') {
        const t = gerarBitmapTeste('100x120');
        return renderZplImagem({ raw: t.raws[0], larguraDots: t.larguraDots, alturaDots: t.alturaDots, copias: 1, impressora, compressao });
    }
    if (impressora.linguagem === 'EPL2' && impressora.tamanho === '40x25') {
        const t = gerarBitmapTeste('40x25');
        return renderEpl2Imagem({ raws: t.raws, sequencia: [0, 1], impressora });
    }
    throw new Error('Teste de imagem só existe para ZPL 100x120 ou EPL2 40x25.');
}

module.exports = {
    renderTesteBitmap,
    EPL2_GW_BIT_PRETO, DIMENSOES, MAX_FORMULARIOS_POR_TRABALHO, MAX_TRABALHOS, ErroBitmap,
    crc16Xmodem, crcHex, bytesPorLinha, empacotar, desempacotar, dimensaoDe,
    gfa, renderZplImagem, renderEpl2Imagem, dividirEmTrabalhos,
    ean13Modulos, gerarBitmapTeste, EAN_TESTE, QR_TESTE,
};
