import JsBarcode from 'jsbarcode';

// ─── EAN no modo raster ─────────────────────────────────────────────────────────
// O layout NÃO muda: o <svg> do JsBarcode continua exatamente igual (mesma caixa, mesmos
// dígitos). No modoRaster só marcamos o svg (`data-raster="ean"` + geometria) e escondemos as
// BARRAS; os dígitos continuam sendo fotografados como hoje. O rasterizador pinta as barras
// por cima, na mesma caixa, com módulo INTEIRO de dots (módulo fracionário saía com barras
// de 2/3 dots irregulares na Zebra).

/** Codifica o valor (EAN13 válido; senão CODE128). null se não der. */
export function codificarBarras(valor) {
    const v = String(valor ?? '').trim();
    if (!v) return null;
    for (const format of ['EAN13', 'CODE128']) {
        try {
            const o = {};
            JsBarcode(o, v, { format });
            // EAN13 vem em várias partes (guardas/metades); as barras são a concatenação das partes
            const bits = (o.encodings || []).map((e) => (typeof e.data === 'string' ? e.data : '')).join('');
            // tira a zona de silêncio (zeros) das pontas: sobram só as 95 barras do EAN13
            const i0 = bits.indexOf('1'), i1 = bits.lastIndexOf('1');
            if (i0 >= 0) return { bits: bits.slice(i0, i1 + 1), formato: format, texto: v };
        } catch { /* tenta o próximo */ }
    }
    return null;
}

/** Chamar no fim do efeito do JsBarcode, só quando modoRaster. `opts` = os mesmos usados no JsBarcode. */
export function marcarEanRaster(svg, opts, valor) {
    if (!svg) return;
    const natW = parseFloat(svg.getAttribute('width'));
    const natH = parseFloat(svg.getAttribute('height'));
    if (!(natW > 0 && natH > 0)) return;
    svg.setAttribute('data-raster', 'ean');
    svg.setAttribute('data-valor', String(valor));
    svg.setAttribute('data-nat-w', String(natW));
    svg.setAttribute('data-nat-h', String(natH));
    // Geometria REAL das barras (px do svg), lida dos próprios <rect> do JsBarcode (cada grupo <g>
    // tem a sua translação): o EAN13 reserva espaço à esquerda p/ o 1º dígito e as guardas são
    // mais altas que as barras de dado.
    const barras = [];
    svg.querySelectorAll('g').forEach((g) => {
        const m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(g.getAttribute('transform') || '');
        const tx = m ? parseFloat(m[1]) : 0, ty = m ? parseFloat(m[2]) : 0;
        g.querySelectorAll('rect').forEach((r) => {
            const x = tx + parseFloat(r.getAttribute('x')), w = parseFloat(r.getAttribute('width'));
            barras.push({ x, xf: x + w, y: ty + parseFloat(r.getAttribute('y')), h: parseFloat(r.getAttribute('height')) });
        });
    });
    if (!barras.length) return;
    const minX = Math.min(...barras.map((b) => b.x));
    const maxX = Math.max(...barras.map((b) => b.xf));
    const hs = barras.map((b) => b.h);
    svg.setAttribute('data-barras-x', String(minX));
    svg.setAttribute('data-barras-w', String(maxX - minX));
    svg.setAttribute('data-barras-y', String(Math.min(...barras.map((b) => b.y))));
    svg.setAttribute('data-barras-h', String(Math.min(...hs)));    // barras de dado
    svg.setAttribute('data-barras-hg', String(Math.max(...hs)));   // guardas (mais altas)
    // esconde só as barras; o fundo branco e os <text> dos dígitos permanecem
    svg.querySelectorAll('g rect').forEach((r) => { r.style.display = 'none'; });
}
