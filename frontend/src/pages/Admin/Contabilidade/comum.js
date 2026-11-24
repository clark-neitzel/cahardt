// Utilitários compartilhados das abas da Contabilidade (formatação, CSV, impressão, downloads)
import api from '../../../services/api';
import { formatarDoc } from '../../../utils/documento';

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
export const fmtVal = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const fmtNumCsv = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
/** Percentual com vírgula e 1 casa: 24,7% (null/NaN → —). */
export const fmtPct = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toFixed(1).replace('.', ',')}%`);
/** Número com N casas (vírgula) sem zeros inúteis — p/ quantidade e valor unitário no CSV. */
export const fmtNumCsvN = (v, casas = 6) => {
    if (v == null || v === '' || !Number.isFinite(Number(v))) return '';
    return String(Number(Number(v).toFixed(casas))).replace('.', ',');
};
/** CNPJ/CPF formatado (aceita CNPJ alfanumérico); vazio → ''. */
export const fmtDocFormatado = (v) => (v ? formatarDoc(v) : '');
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const STATUS_BADGE = {
    PAGO: 'bg-green-100 text-green-800',
    QUITADO: 'bg-green-100 text-green-800',
    PENDENTE: 'bg-gray-100 text-gray-700',
    ABERTO: 'bg-gray-100 text-gray-700',
    PARCIAL: 'bg-yellow-100 text-yellow-800',
    VENCIDO: 'bg-red-100 text-red-700',
    CANCELADO: 'bg-red-100 text-red-700',
};

/** Gera e baixa um CSV (padrão Excel pt-BR: ; + BOM). */
export function baixarCsv(nomeArquivo, cabecalhos, linhas) {
    const cab = cabecalhos.map((c) => `"${c}"`).join(';');
    const corpo = linhas.map((l) => l.join(';')).join('\n');
    const blob = new Blob(['﻿' + cab + '\n' + corpo], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(a.href);
}

export const csvTexto = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
/** Texto livre vindo de fora (fornecedor, descrição, produto): entre aspas + proteção contra fórmula do Excel (= + - @). */
export const csvTextoSeguro = (v) => {
    let t = String(v ?? '').replace(/[\r\n]+/g, ' ');
    if (/^[=+\-@\t]/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
};
/** Força o Excel a tratar como TEXTO (chave de 44 dígitos, NCM, CNPJ, código, "1/2"): vira ="valor". Vazio → vazio. */
export const csvTextoForcado = (v) => {
    const t = String(v ?? '').replace(/[\r\n";]+/g, ' ').trim();
    return t ? `="${t}"` : '';
};

/** Baixa um arquivo de uma rota autenticada (ZIP/OFX/XML). */
export async function baixarArquivoApi(url, params, nomePadrao) {
    const resp = await api.get(url, { params, responseType: 'blob' });
    const cd = resp.headers['content-disposition'] || '';
    const m = cd.match(/filename="?([^";]+)"?/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(resp.data);
    a.download = m ? m[1] : nomePadrao;
    a.click();
    URL.revokeObjectURL(a.href);
}

// Impressão NA PRÓPRIA PÁGINA (padrão do CLAUDE.md, "modo impressão em qualquer media"):
// o app some com display:none em TELA e em impressão; a folha vira o documento. Funciona no iPad/PWA.
// larguraMm = largura útil da folha (padrão 277 = A4 paisagem com margem de 10mm).
export function imprimirConteudo(estilos, corpoHtml, larguraMm = 277) {
    const MODO = 'modo-impressao';
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    document.documentElement.classList.remove(MODO);
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, ''); // @page só no nível raiz (iOS)
    const regraPage = ((estilos || '').match(/@page\s*{[^}]*}/) || ['@page { size: A4 landscape; margin: 10mm; }'])[0];
    style.textContent = `
        ${regraPage}
        html.${MODO}, html.${MODO} body {
            margin:0!important; padding:0!important; background:#fff!important;
            width:auto!important; min-width:0!important; max-width:none!important;
            height:auto!important; min-height:0!important; overflow:visible!important;
        }
        html.${MODO} body > *:not(#area-impressao) { display:none!important; }
        html.${MODO} #area-impressao { display:block; width:${larguraMm}mm; max-width:100%; margin:0 auto; }
        ${estilosSemPage}
        @media print {
            html.${MODO} body > *:not(#area-impressao) { display:none!important; visibility:hidden!important; }
            html.${MODO} #area-impressao, html.${MODO} #area-impressao * { visibility:visible!important; }
            #area-impressao * { -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    document.documentElement.classList.add(MODO);
    let momentoPrint = 0, timerFallback = 0;
    const limpar = () => {
        area.remove(); style.remove(); document.documentElement.classList.remove(MODO);
        window.removeEventListener('afterprint', limpar);
        window.removeEventListener('focus', aoVoltar);
        window.removeEventListener('pointerdown', aoVoltar);
        document.removeEventListener('visibilitychange', aoVoltar);
        clearTimeout(timerFallback);
    };
    // iOS nem sempre dispara afterprint; com guarda de tempo (o focus pode disparar junto do print())
    const aoVoltar = () => { if (momentoPrint && Date.now() - momentoPrint > 1200) limpar(); };
    window.addEventListener('afterprint', limpar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('pointerdown', aoVoltar);
    document.addEventListener('visibilitychange', aoVoltar);
    timerFallback = setTimeout(limpar, 60000);
    void area.offsetHeight; // força layout com o modo aplicado
    momentoPrint = Date.now();
    try { window.print(); } catch { limpar(); } // SÍNCRONO no clique (senão o iOS bloqueia)
}

/** Impressão padrão das abas: título + subtítulo + tabela simples. */
export function imprimirTabela(titulo, subtitulo, cabecalhos, linhas) {
    const ths = cabecalhos.map((c) => `<th${c.num ? ' class="num"' : ''}>${esc(c.label ?? c)}</th>`).join('');
    const trs = linhas.map((l) => '<tr>' + l.map((v) =>
        `<td${v && v.num ? ' class="num"' : ''}>${esc(v && v.txt !== undefined ? v.txt : v)}</td>`).join('') + '</tr>').join('');
    imprimirConteudo(`
        #area-impressao * { font-family: 'SF Pro Text', -apple-system, Arial, sans-serif; color:#000; }
        #area-impressao h1 { font-size: 14px; margin: 0 0 2px; }
        #area-impressao .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
        #area-impressao table { width: 100%; border-collapse: collapse; }
        #area-impressao th, #area-impressao td { border: 1px solid #000; padding: 3px 5px; font-size: 8.5px; text-align: left; }
        #area-impressao th { background: #eee; }
        #area-impressao .num { text-align: right; }
    `, `
        <h1>${esc(titulo)}</h1>
        <div class="sub">${esc(subtitulo)} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
        <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
    `);
}

/**
 * Impressão de relatório em ÁRVORE (já cortado no nível escolhido em "Abrir até").
 * linhas: [{ tipo: 'grupo'|'cat'|'forn'|'doc'|'prod'|'info', texto, sub?, cols: [contas, valor, pago, aberto, %] }]
 * colunas: rótulos das colunas numéricas. Reaproveitável pelas etapas 2 e 3.
 */
export function imprimirArvore(titulo, subtitulo, colunas, linhas) {
    const ths = colunas.map((c) => `<th class="num">${esc(c)}</th>`).join('');
    const trs = linhas.map((l) => {
        const tds = (l.cols || []).map((v) => `<td class="num">${esc(v ?? '')}</td>`).join('');
        const sub = l.sub ? `<div class="s">${esc(l.sub)}</div>` : '';
        return `<tr class="t-${l.tipo}"><td class="nm">${esc(l.texto)}${sub}</td>${tds}</tr>`;
    }).join('');
    imprimirConteudo(`
        #area-impressao * { font-family: 'SF Pro Text', -apple-system, Arial, sans-serif; color:#000; box-sizing:border-box; }
        #area-impressao h1 { font-size: 14px; margin: 0 0 2px; }
        #area-impressao .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
        #area-impressao table { width: 100%; border-collapse: collapse; }
        #area-impressao thead { display: table-header-group; }
        #area-impressao th { background: #eee; border: 1px solid #000; padding: 3px 5px; font-size: 8.5px; text-align: left; }
        #area-impressao td { padding: 2px 5px; font-size: 8.5px; border-bottom: 1px solid #ddd; vertical-align: top; }
        #area-impressao tr { break-inside: avoid; page-break-inside: avoid; }
        #area-impressao .num { text-align: right; white-space: nowrap; }
        #area-impressao .s { font-size: 7.5px; color: #555; }
        #area-impressao tr.t-grupo td { background: #1E3932; color:#fff; font-weight: 800; font-size: 9px; border-bottom: 1px solid #000; }
        #area-impressao tr.t-grupo td * { color:#fff; }
        #area-impressao tr.t-cat td { background: #e6f1ec; font-weight: 700; border-top: 1px solid #000; }
        #area-impressao tr.t-forn td.nm { padding-left: 14px; font-weight: 600; }
        #area-impressao tr.t-doc td.nm { padding-left: 28px; }
        #area-impressao tr.t-prod td { font-size: 8px; color:#222; }
        #area-impressao tr.t-prod td.nm { padding-left: 42px; }
        #area-impressao tr.t-info td { color:#555; font-style: italic; }
        #area-impressao tr.t-total td { font-weight: 800; border-top: 2px solid #000; background:#eee; }
    `, `
        <h1>${esc(titulo)}</h1>
        <div class="sub">${esc(subtitulo)} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
        <table><thead><tr><th>Descrição</th>${ths}</tr></thead><tbody>${trs}</tbody></table>
    `);
}
