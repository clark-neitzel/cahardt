// ─── Rasterizador de etiquetas: DOM → bitmap 1-bit a 203 dpi (8 dots/mm) ───────────
// Usado pela impressão direta (fila → agente → Zebra): a etiqueta que o usuário vê é
// "fotografada" no navegador e vira imagem preto/branco, enviada como ZPL ^GFA / EPL2 GW.
//
// Regras (plano E3, seções 3.2 e 3.3):
//  • escala EXATA 8 dots/mm = 2,1167 × px CSS; canvas final de tamanho exato (800×960…);
//  • limiar fixo (LIMIAR) sem dithering — a impressora é térmica 1-bit;
//  • código de barras (EAN) e QR NÃO são fotografados: o layout reserva o espaço (svg
//    escondido `data-raster="ean"|"qr"`) e os pixels são pintados por cima com módulo INTEIRO
//    de dots (módulo fracionário saía com barras de larguras irregulares);
//  • formato do bitmap: linhas de cima p/ baixo, MSB = pixel mais à esquerda, 1 = PRETO.

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { codificarBarras } from './etiquetaEan';

export const DOTS_POR_MM = 8;
export const PX_POR_MM = 96 / 25.4;
export const ESCALA = DOTS_POR_MM / PX_POR_MM;   // 2,116667
export const LIMIAR = 160;                       // luminância < LIMIAR => preto
// Módulo do EAN em dots (203 dpi): 2 = 0,25 mm (cabe na MESMA caixa do SVG de hoje). Se o leitor não ler a
// etiqueta impressa, trocar para 3 SEM deploy, no console do aparelho:
//   localStorage.setItem('etiquetas:eanModuloDots', '3')   (volta ao padrão: removeItem)
// Com 3 dots as barras passam da caixa atual (285 contra ~241 dots) — ficam centralizadas e comem a zona de silêncio.
export const EAN_MODULO_DOTS = 2;
export const CHAVE_EAN_MODULO = 'etiquetas:eanModuloDots';
export function eanModuloDots() {
    try {
        const v = Number(localStorage.getItem(CHAVE_EAN_MODULO));
        if (Number.isInteger(v) && v >= 1 && v <= 5) return v;
    } catch { /* sem localStorage */ }
    return EAN_MODULO_DOTS;
}
export const MODULO_QR = 3;                      // dots por módulo do QR (Kit Festa)
// Sentido do giro da etiqueta DEITADA (120×100 desenhada → 100×120 no rolo).
// +90 = horário. [A VALIDAR NA ZEBRA] — uma só constante para trocar.
export const GIRO_DEITADA = 90;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const mmParaDots = (mm) => Math.round(mm * DOTS_POR_MM);

// CAUSA DE FUNDO do "texto deslocado para baixo" no html2canvas: o preflight do Tailwind define
// `img { display:block }`, e o html2canvas mede a linha de base das fontes com um <img 1×1>
// que precisa ser inline. Em bloco a medição dá lixo e todo texto sai ~meia linha abaixo das bordas.
// Esta regra (restrita ao img 1×1 da medição) vale só enquanto a captura roda.
function injetarCorrecaoMedicao() {
    const st = document.createElement('style');
    st.setAttribute('data-raster-fix', '1');
    st.textContent = 'img[width="1"][height="1"]{display:inline !important;}';
    document.head.appendChild(st);
    return () => st.remove();
}

async function carregarHtml2canvas() {
    const m = await import('html2canvas');
    return m.default || m;
}

// ─── Espera: fontes + auto-fit estabilizado ───────────────────────────────────────
// Sem isso o 1º clique fotografa o ajuste ainda em andamento (--fs / ResizeObserver).
export async function aguardarEstabilizar(raiz, { timeoutMs = 2500, framesEstaveis = 3 } = {}) {
    try {
        const fams = new Set();
        raiz.querySelectorAll('*').forEach((el) => {
            const f = getComputedStyle(el).fontFamily;
            const w = getComputedStyle(el).fontWeight;
            const s = getComputedStyle(el).fontStyle;
            if (f) fams.add(`${s} ${w} 12px ${f}`);
        });
        await Promise.all([...fams].map((f) => document.fonts.load(f).catch(() => {})));
        await document.fonts.ready;
    } catch { /* sem Font Loading API */ }
    await nextFrame(); await nextFrame();
    const t0 = performance.now();
    let ultima = null, iguais = 0;
    while (performance.now() - t0 < timeoutMs) {
        const assinatura = raiz.innerHTML + '|' + raiz.scrollHeight;
        if (assinatura === ultima) { iguais++; if (iguais >= framesEstaveis) return true; }
        else { iguais = 0; ultima = assinatura; }
        await nextFrame();
    }
    return false; // estourou o prazo: segue com o que há (o chamador pode avisar)
}

// ─── Sobreposições (EAN/QR em pixels) ─────────────────────────────────────────────
function retRelativo(el, raiz) {
    const a = el.getBoundingClientRect(), r = raiz.getBoundingClientRect();
    return { x: (a.left - r.left) * ESCALA, y: (a.top - r.top) * ESCALA, w: a.width * ESCALA, h: a.height * ESCALA };
}

// Barras do EAN pintadas NA MESMA CAIXA do svg de hoje (mesma posição/altura, centralizadas na
// largura original das barras), com o maior módulo INTEIRO de dots que cabe nela. Os dígitos
// (<text> do svg) já foram fotografados como sempre — não são tocados.
export function moduloInteiro(larguraBarrasDots, nModulos) {
    return Math.max(1, Math.floor(larguraBarrasDots / nModulos));
}
function pintarEan(ctx, rect, el) {
    const cod = codificarBarras(el.getAttribute('data-valor'));
    if (!cod) return;
    const natW = Number(el.getAttribute('data-nat-w'));
    const k = rect.w / natW;                              // dots por px "natural" do svg
    const bits = cod.bits;
    const larguraAtual = Number(el.getAttribute('data-barras-w')) * k;   // largura das barras hoje
    const mod = eanModuloDots();
    const largNova = bits.length * mod;
    const xAtual = rect.x + Number(el.getAttribute('data-barras-x')) * k;
    const xb = Math.round(xAtual + (larguraAtual - largNova) / 2);
    const y0 = Math.round(rect.y + Number(el.getAttribute('data-barras-y')) * k);
    const hBarras = Math.round(Number(el.getAttribute('data-barras-h')) * k);
    const hGuarda = Math.round(Number(el.getAttribute('data-barras-hg')) * k);
    const ehGuarda = (i) => cod.formato === 'EAN13' && bits.length === 95 && (i < 3 || (i >= 45 && i < 50) || i >= 92);
    // apaga as barras antigas só se tivessem sobrado no canvas (estão escondidas: não sobram)
    ctx.fillStyle = '#000';
    for (let i = 0; i < bits.length;) {
        if (bits[i] === '1') {
            let j = i; while (j < bits.length && bits[j] === '1') j++;
            // desenha por módulo: guardas (início/meio/fim do EAN13) são mais altas, como hoje
            for (let q = i; q < j; q++) ctx.fillRect(xb + q * mod, y0, mod, ehGuarda(q) ? hGuarda : hBarras);
            i = j;
        } else i++;
    }
    return { mod, larguraAtual, hBarras };
}

function pintarQr(ctx, rect, matriz) {
    const n = matriz.size;
    // 3 dots/módulo; se não couber na caixa, 2; se ainda não couber, erro (nunca pintar por cima do vizinho)
    let mod = MODULO_QR;
    while (mod >= 2 && n * mod > Math.min(rect.w, rect.h) + 0.5) mod -= 1;
    if (mod < 2) throw new Error('O QR não cabe na caixa reservada da etiqueta. Use "Imprimir pelo navegador".');
    const lado = n * mod;
    const x0 = Math.round(rect.x + (rect.w - lado) / 2);
    const y0 = Math.round(rect.y + (rect.h - lado) / 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h));
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (matriz.data[r * n + c]) ctx.fillRect(x0 + c * mod, y0 + r * mod, mod, mod);
        }
    }
}

function aplicarSobreposicoes(canvas, raiz, qrMatriz) {
    const ctx = canvas.getContext('2d');
    raiz.querySelectorAll('[data-raster="ean"]').forEach((el) => pintarEan(ctx, retRelativo(el, raiz), el));
    if (qrMatriz) raiz.querySelectorAll('[data-raster="qr"]').forEach((el) => pintarQr(ctx, retRelativo(el, raiz), qrMatriz));
}

// ─── Texto desenhado por nós (não pelo html2canvas) ───────────────────────────────
// O html2canvas posiciona cada texto pelo retângulo do Range + baseline "bottom" do canvas, e erra
// 1–3 dots (0,1–0,4 mm) de forma diferente a cada tamanho de fonte (ascent/descent arredondados do
// DOM × valores sem arredondar do canvas). Aqui o html2canvas desenha SÓ caixas, bordas, fundos e
// SVGs (texto transparente) e o texto é pintado CARACTERE A CARACTERE na posição que o próprio
// navegador calculou (Range de cada caractere): kerning, letter-spacing, números tabulares e
// quebras de linha vêm do layout do DOM; só o desenho do glifo vem do canvas.
function congelarETirarTexto(raiz) {
    const win = raiz.ownerDocument.defaultView;
    const els = [raiz, ...raiz.querySelectorAll('*')];
    // 1º lê tudo (cores que dependem de currentColor), 2º escreve
    const dados = els.map((el) => {
        const cs = win.getComputedStyle(el);
        return {
            el, bt: cs.borderTopColor, br: cs.borderRightColor, bb: cs.borderBottomColor, bl: cs.borderLeftColor,
            oc: cs.outlineColor, td: cs.textDecorationColor,
        };
    });
    dados.forEach((d) => {
        const st = d.el.style;
        st.borderTopColor = d.bt; st.borderRightColor = d.br; st.borderBottomColor = d.bb; st.borderLeftColor = d.bl;
        st.outlineColor = d.oc; st.textDecorationColor = d.td;
        st.setProperty('color', 'transparent', 'important');
        st.setProperty('text-shadow', 'none', 'important');
    });
}

function retanguloDeCorte(no, raiz) {
    // interseção dos retângulos dos ancestrais com overflow != visible (as caixas do auto-fit cortam)
    let r = raiz.getBoundingClientRect();
    let a = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let el = no.parentElement; el && el !== raiz.parentElement; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
            const q = el.getBoundingClientRect();
            a = { l: Math.max(a.l, q.left), t: Math.max(a.t, q.top), r: Math.min(a.r, q.right), b: Math.min(a.b, q.bottom) };
        }
    }
    return a;
}

function pintarTextos(ctx, raiz) {
    const rr = raiz.getBoundingClientRect();
    const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const caches = new Map();
    for (let no = walker.nextNode(); no; no = walker.nextNode()) {
        const el = no.parentElement;
        if (!el || el.closest('svg')) continue;                    // texto de svg já vem na imagem do svg
        const texto = no.nodeValue;
        if (!texto || !texto.trim()) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const clip = retanguloDeCorte(no, raiz);
        const tamanho = parseFloat(cs.fontSize) * ESCALA;
        const fonte = `${cs.fontStyle} ${cs.fontWeight} ${tamanho}px ${cs.fontFamily}`;
        ctx.save();
        ctx.beginPath();
        ctx.rect((clip.l - rr.left) * ESCALA, (clip.t - rr.top) * ESCALA, (clip.r - clip.l) * ESCALA, (clip.b - clip.t) * ESCALA);
        ctx.clip();
        ctx.fillStyle = cs.color;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        // ascent do DOM = o do canvas medido no tamanho CSS (o navegador já o arredonda p/ px inteiro);
        // medir no tamanho escalado daria um valor sem esse arredondamento e erraria 1–3 dots.
        if (!caches.has(fonte)) {
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
            const m = ctx.measureText('Hg');
            caches.set(fonte, m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.9);
        }
        const ascCss = caches.get(fonte);
        ctx.font = fonte;
        const maius = cs.textTransform === 'uppercase', minus = cs.textTransform === 'lowercase';
        for (let i = 0; i < texto.length;) {
            const cp = texto.codePointAt(i); const n = cp > 0xffff ? 2 : 1;
            const ch = texto.slice(i, i + n);
            const ini = i; i += n;
            if (!ch.trim()) continue;
            range.setStart(no, ini); range.setEnd(no, ini + n);
            const rc = range.getClientRects()[0];
            if (!rc || !rc.width) continue;
            const g = maius ? ch.toUpperCase() : minus ? ch.toLowerCase() : ch;
            // baseline = topo do retângulo do caractere (área de conteúdo) + ascent
            let x = (rc.left - rr.left) * ESCALA;
            // dígitos em fonte com números tabulares (font-variant-numeric herdado do :root): o DOM reserva
            // a célula tabular e centraliza o glifo; o canvas desenha o glifo proporcional — centraliza igual.
            if (g >= '0' && g <= '9') {
                const sobra = rc.width * ESCALA - ctx.measureText(g).width;
                if (sobra > 0) x += sobra / 2;
            }
            const y = (rc.top - rr.top + ascCss) * ESCALA;
            ctx.fillText(g, x, y);
        }
        ctx.restore();
    }
}
// ─── Captura ──────────────────────────────────────────────────────────────────────
function criarContainer(larguraMm, alturaMm) {
    const c = document.createElement('div');
    // Fora do preview (que tem transform: scale). z-index -1 = atrás do app, sem aparecer.
    c.style.cssText = `position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;` +
        `width:${larguraMm}mm;height:${alturaMm}mm;overflow:hidden;`;
    document.body.appendChild(c);
    return c;
}

/** Fotografa `raiz` (já visível no DOM) num canvas de tamanho EXATO em dots. */
async function fotografar(raiz, larguraDots, alturaDots) {
    const html2canvas = await carregarHtml2canvas();
    const src = await html2canvas(raiz, {
        scale: ESCALA, backgroundColor: '#fff', logging: false,
        foreignObjectRendering: false, useCORS: false,
        width: Math.ceil(larguraDots / ESCALA), height: Math.ceil(alturaDots / ESCALA),
        windowWidth: document.documentElement.clientWidth, windowHeight: document.documentElement.clientHeight,
        scrollX: 0, scrollY: 0,
        onclone: (_doc, clonado) => { congelarETirarTexto(clonado); },
    });
    const final = document.createElement('canvas');
    final.width = larguraDots; final.height = alturaDots;
    const ctx = final.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, larguraDots, alturaDots);
    ctx.drawImage(src, 0, 0); // sem reescala: se a lib arredondar 799/800, sobra/falta 1 dot de borda branca
    pintarTextos(ctx, raiz);  // texto por nossa conta (ver bloco acima)
    return { canvas: final, dimOriginal: [src.width, src.height] };
}

function girar(canvas, graus) {
    if (!graus) return canvas;
    const out = document.createElement('canvas');
    out.width = canvas.height; out.height = canvas.width;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((graus * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
}

/** Canvas → Uint8Array packed (MSB primeiro, 1 = preto), limiar fixo, sem dithering. */
export function empacotarBitmap(canvas, limiar = LIMIAR) {
    const w = canvas.width, h = canvas.height;
    const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const bpl = Math.ceil(w / 8);
    const bytes = new Uint8Array(bpl * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const a = data[i + 3] / 255;
            // composição sobre branco
            const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * a + 255 * (1 - a);
            if (lum < limiar) bytes[y * bpl + (x >> 3)] |= 0x80 >> (x & 7);
        }
    }
    return { larguraDots: w, alturaDots: h, bytesPorLinha: bpl, bytes };
}

/** bitmap packed → canvas preto/branco (preview em tamanho real / PNG). */
export function bitmapParaCanvas(bm) {
    const c = document.createElement('canvas');
    c.width = bm.larguraDots; c.height = bm.alturaDots;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(bm.larguraDots, bm.alturaDots);
    for (let y = 0; y < bm.alturaDots; y++) {
        for (let x = 0; x < bm.larguraDots; x++) {
            const preto = (bm.bytes[y * bm.bytesPorLinha + (x >> 3)] >> (7 - (x & 7))) & 1;
            const v = preto ? 0 : 255, i = (y * bm.larguraDots + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return c;
}

// ─── Hash (dedupe) ────────────────────────────────────────────────────────────────
export function hashBytes(bytes) {
    let a = 0x811c9dc5, b = 0x01000193 ^ bytes.length;
    for (let i = 0; i < bytes.length; i++) {
        a = Math.imul(a ^ bytes[i], 0x01000193) >>> 0;
        b = Math.imul(b + bytes[i] + i, 0x85ebca6b) >>> 0;
    }
    return `${bytes.length}-${a.toString(16)}-${b.toString(16)}`;
}

// ─── Compressão / transporte ──────────────────────────────────────────────────────
function paraBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
}

/** zlib via CompressionStream('deflate'); sem suporte → RAW. Devolve o corpo do envio. */
export async function empacotarParaEnvio(bm) {
    let formato = 'RAW', dados = bm.bytes;
    try {
        if (typeof CompressionStream !== 'undefined') {
            const cs = new CompressionStream('deflate'); // 'deflate' = formato zlib (o que o ^GFA :Z64: espera)
            const w = cs.writable.getWriter();
            const escrita = w.write(bm.bytes).then(() => w.close()); // sem await solto: rejeição não vira unhandledrejection
            escrita.catch(() => {});
            const buf = await new Response(cs.readable).arrayBuffer();
            await escrita;
            dados = new Uint8Array(buf); formato = 'ZLIB';
        }
    } catch { formato = 'RAW'; dados = bm.bytes; }
    return { larguraDots: bm.larguraDots, alturaDots: bm.alturaDots, formato, dados: paraBase64(dados) };
}

// ─── API principal ────────────────────────────────────────────────────────────────
/**
 * Rasteriza uma lista de itens.
 *  item de produto: { elemento: <ReactElement>, larguraMm, alturaMm, giro?: 0|90|-90, qrMatriz? }
 *    (o elemento deve ser renderizado com modoRaster, ex.: <EtiquetaRender modoRaster .../>)
 *  item de caixas:  { html, estilos, seletorCelula: '.etq', larguraMm: 40, alturaMm: 25, qrMatriz? }
 *    (HTML string do Kit Festa; cada célula vira UM bitmap; até 20 por passada)
 * Devolve { bitmaps:[únicos], indices:[bitmap de cada etiqueta, na ordem], tempos:[ms por passada],
 *           avisos:[], canvasesOriginais? }
 */
export async function rasterizarEtiquetas({ itens, limiar = LIMIAR, manterDebug = false }) {
    const bitmaps = [], indices = [], tempos = [], avisos = [], debug = [];
    const porHash = new Map();
    const removerCorrecao = injetarCorrecaoMedicao();
    try {
    const registrar = (bm) => {
        const h = hashBytes(bm.bytes);
        const igual = (i) => { const o = bitmaps[i].bytes; if (o.length !== bm.bytes.length) return false; for (let k = 0; k < o.length; k++) if (o[k] !== bm.bytes[k]) return false; return true; };
        // mesmo hash NÃO basta: confere os bytes antes de deduplicar (colisão = etiqueta errada no papel)
        let idx = (porHash.get(h) || []).find(igual);
        if (idx === undefined) { idx = bitmaps.length; bitmaps.push({ ...bm, hash: h }); porHash.set(h, [...(porHash.get(h) || []), idx]); }
        indices.push(idx);
    };

    for (const item of itens) {
        const t0 = performance.now();
        const lMm = item.larguraMm, aMm = item.alturaMm;
        if (item.elemento) {
            const cont = criarContainer(lMm, aMm);
            const root = createRoot(cont);
            try {
                root.render(item.elemento);
                await nextFrame();
                const ok = await aguardarEstabilizar(cont);
                if (!ok) avisos.push('auto-fit não estabilizou em 2,5 s');
                const { canvas, dimOriginal } = await fotografar(cont, mmParaDots(lMm), mmParaDots(aMm));
                aplicarSobreposicoes(canvas, cont, item.qrMatriz);
                const final = girar(canvas, item.giro || 0);
                if (manterDebug) debug.push({ dimOriginal });
                registrar(empacotarBitmap(final, limiar));
            } finally { root.unmount(); cont.remove(); }
        } else {
            // lote de células (Kit Festa): empilha até 20 por passada e fatia em tiras exatas
            const seletor = item.seletorCelula || '.etq';
            const idCap = `raster-cap-${Math.random().toString(36).slice(2, 8)}`;
            const estilo = document.createElement('style');
            estilo.textContent = String(item.estilos || '')
                .replace(/@page\s*{[^}]*}/g, '')
                .replace(/html\.modo-impressao[^{]*{[^}]*}/g, '')
                .replaceAll('#area-impressao', `#${idCap}`);
            document.head.appendChild(estilo);
            try {
            const tmp = document.createElement('div');
            tmp.innerHTML = item.html;
            const celulas = [...tmp.querySelectorAll(seletor)];
            for (let ini = 0; ini < celulas.length; ini += 20) {
                const fatia = celulas.slice(ini, ini + 20);
                const cont = document.createElement('div');
                cont.id = idCap;
                cont.style.cssText = `position:fixed;left:0;top:0;z-index:-1;pointer-events:none;background:#fff;width:${lMm}mm;height:${aMm * fatia.length}mm;overflow:hidden;color:#000;`;
                fatia.forEach((c) => { const w = document.createElement('div'); w.style.cssText = `width:${lMm}mm;height:${aMm}mm;overflow:hidden;`; w.appendChild(c); cont.appendChild(w); });
                document.body.appendChild(cont);
                try {
                    const ok = await aguardarEstabilizar(cont);
                    if (!ok) avisos.push('lote não estabilizou');
                    const hDots = mmParaDots(aMm), wDots = mmParaDots(lMm);
                    const { canvas } = await fotografar(cont, wDots, hDots * fatia.length);
                    aplicarSobreposicoes(canvas, cont, item.qrMatriz);
                    for (let i = 0; i < fatia.length; i++) {
                        const tira = document.createElement('canvas');
                        tira.width = wDots; tira.height = hDots;
                        tira.getContext('2d', { willReadFrequently: true }).drawImage(canvas, 0, i * hDots, wDots, hDots, 0, 0, wDots, hDots);
                        registrar(empacotarBitmap(tira, limiar));
                    }
                } finally { cont.remove(); }
            }
            } finally { estilo.remove(); }  // o CSS do Kit Festa NUNCA pode sobrar no app
        }
        tempos.push(Math.round(performance.now() - t0));
    }
    } finally { removerCorrecao(); }
    return { bitmaps, indices, tempos, avisos, debug };
}

/** Matriz do QR (29×29 na versão 3-M) para a sobreposição de 3 dots/módulo. */
export async function matrizQr(link) {
    const QR = await import('qrcode');
    const q = (QR.default || QR).create(link, { errorCorrectionLevel: 'M' });
    return { size: q.modules.size, data: q.modules.data };
}

/** Elemento React (sem JSX) — conveniência para quem chama de .js. */
export const elemento = createElement;
