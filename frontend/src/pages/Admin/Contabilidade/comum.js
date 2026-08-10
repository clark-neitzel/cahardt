// Utilitários compartilhados das abas da Contabilidade (formatação, CSV, impressão, downloads)
import api from '../../../services/api';

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
export const fmtVal = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
export const fmtNumCsv = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
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

// Receita do CLAUDE.md: imprimir NA PRÓPRIA PÁGINA (funciona no iPad/PWA)
export function imprimirConteudo(estilos, corpoHtml) {
    document.getElementById('area-impressao')?.remove();
    document.getElementById('estilo-impressao')?.remove();
    const style = document.createElement('style');
    style.id = 'estilo-impressao';
    const estilosSemPage = (estilos || '').replace(/@page\s*{[^}]*}/g, '');
    style.textContent = `
        @page { size: A4 landscape; margin: 10mm; }
        #area-impressao { display: none; }
        @media print {
            html, body { margin:0!important; padding:0!important; background:#fff!important; height:auto!important; }
            body * { visibility: hidden !important; }
            body > *:not(#area-impressao) { position:absolute!important; top:0; left:0; width:0!important; height:0!important; overflow:hidden!important; }
            #area-impressao { display: block !important; }
            #area-impressao, #area-impressao * { visibility: visible !important; }
            #area-impressao * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            ${estilosSemPage}
        }`;
    document.head.appendChild(style);
    const area = document.createElement('div');
    area.id = 'area-impressao';
    area.innerHTML = corpoHtml;
    document.body.appendChild(area);
    const limpar = () => { area.remove(); style.remove(); window.removeEventListener('afterprint', limpar); };
    window.addEventListener('afterprint', limpar);
    setTimeout(limpar, 60000);
    void area.offsetHeight;
    window.print();
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
