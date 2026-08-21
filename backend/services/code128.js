// =====================================================================
// Code128 (conjunto B) — encoder AGNÓSTICO DE RENDERIZAÇÃO.
//
// Devolve apenas a lista de LARGURAS (em módulos) das barras e espaços;
// quem desenha (pdfkit, SVG, HTML…) é o chamador.
//
// A tabela CODE128_PATTERNS é a mesma usada pela DANFE
// (backend/services/danfeHtmlService.js) — copiada de propósito para cá,
// porque o arquivo da DANFE é processo fiscal sensível e NÃO pode ser alterado.
//
// Regras do Code128-B:
//   Start B = 104 · valor de cada caractere = charCode - 32 (ASCII 32..126)
//   checksum = (StartB + Σ valor_i × posição_i) módulo 103   (posição começa em 1)
//   Stop = 106 (padrão de 13 módulos: '2331112')
// =====================================================================

// Larguras (em módulos) dos 107 padrões Code128 (índices 0..106).
// Cada string: barra, espaço, barra, espaço, barra, espaço (o Stop tem 7).
const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
    '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
    '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
    '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
    '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
    '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
    '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
    '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
    '211214', '211232', '2331112'
];

const CODE128_START_B = 104;
const CODE128_STOP = 106;

/**
 * Valores Code128-B de um texto ASCII 32..126.
 * Retorna [StartB, ...dados, checksum, Stop].
 * Lança se algum caractere estiver fora do intervalo (o chamador cai no fallback textual).
 */
function code128bValues(texto) {
    const s = String(texto ?? '');
    if (!s.length) throw new Error('Code128-B: texto vazio.');
    const values = [CODE128_START_B];
    for (const ch of s) {
        const cod = ch.charCodeAt(0);
        if (cod < 32 || cod > 126) throw new Error(`Code128-B: caractere fora do intervalo ASCII 32..126: "${ch}"`);
        values.push(cod - 32);
    }
    // Checksum módulo 103 — Start entra com peso 1, 1º dado peso 1, 2º peso 2, ...
    let soma = CODE128_START_B;
    for (let i = 1; i < values.length; i++) soma += values[i] * i;
    values.push(soma % 103);
    values.push(CODE128_STOP);
    return values;
}

/**
 * Larguras das barras/espaços de um texto em Code128-B.
 * Retorna { larguras, modulos, values }:
 *   - larguras: array de inteiros; índice PAR = barra preta, ÍMPAR = espaço branco.
 *   - modulos: soma das larguras (largura total do símbolo, sem quiet zone).
 *   - values: os valores Code128 usados (útil para teste/decodificação).
 * Total de módulos = 11 × (nº de caracteres + 2) + 13  (o Stop tem 13 módulos).
 */
function code128bLarguras(texto) {
    const values = code128bValues(texto);
    const larguras = [];
    for (const v of values) {
        const p = CODE128_PATTERNS[v];
        if (!p) throw new Error('Padrão Code128 inexistente: ' + v);
        for (let i = 0; i < p.length; i++) larguras.push(parseInt(p[i], 10));
    }
    const modulos = larguras.reduce((a, b) => a + b, 0);
    return { larguras, modulos, values };
}

module.exports = { code128bValues, code128bLarguras, CODE128_PATTERNS, CODE128_START_B, CODE128_STOP };
