// Etiqueta da BOLSA (uma por bolsa) — 100 × 120 mm, só preto no branco. Layout do mock aprovado:
// faixa do topo "Hardt Salgados · Carga #482", "BOLSA", "1 de 3" bem grande, cliente grande, cidade e rodapé
// "Pedido … · Entrega dd/mm · Motorista …". SEM lista de produtos e SEM área preta cheia (gruda o ribbon da
// Zebra) — só bordas/linhas. Mesmo caminho de rasterização da etiqueta do pedido (800×960 dots).
import { escaparHtml } from '../../../utils/imprimirNaPagina';
import { ajustarTexto, carregarFontesFuncionario } from '../../RH/etiquetasFuncionario';

const PILHA = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";
export const MAX_BOLSAS = 20; // = teto da fila (PLANO 2.3 item 4)

const limpo = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const dataBr = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '';
};

/**
 * dados = { etiqueta:'#904512', cliente, cidade, cargaNumero, dataSaida:'YYYY-MM-DD', motorista }
 * Devolve { estilos, etiquetas:[html × total], corpo }.
 */
export function montarEtiquetaBolsa(dados = {}, total = 1) {
    const n = Math.max(1, Math.min(MAX_BOLSAS, parseInt(total, 10) || 1));
    const cliente = limpo(dados.cliente).toLocaleUpperCase('pt-BR') || 'CLIENTE';
    const cidade = limpo(dados.cidade);
    const entrega = dataBr(dados.dataSaida);
    // nome do cliente: o maior corpo (pt) em que cabe em até 3 linhas
    const nome = ajustarTexto(cliente, { larguraMm: 90, alturaMm: 30, maxLinhas: 3, tetoPt: 26, minPt: 12 });
    const rodape = [
        dados.etiqueta ? `Pedido ${limpo(dados.etiqueta)}` : '',
        entrega ? `Entrega ${entrega}` : '',
        limpo(dados.motorista) ? `Motorista ${limpo(dados.motorista)}` : '',
    ].filter(Boolean).join(' · ');
    const carga = dados.cargaNumero != null && dados.cargaNumero !== '' ? `Carga #${escaparHtml(dados.cargaNumero)}` : 'Carga';

    const etiquetas = [];
    for (let i = 1; i <= n; i++) {
        etiquetas.push(`<div class="etq bolsa">
        <div class="faixa"><span>HARDT SALGADOS</span><span>${carga}</span></div>
        <div class="rot">BOLSA</div>
        <div class="num">${i}<small> de ${n}</small></div>
        <div class="cli" style="font-size:${nome.pt}pt">${(nome.linhas.length ? nome.linhas : [cliente]).map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('')}</div>
        ${cidade ? `<div class="cid">${escaparHtml(cidade)}</div>` : ''}
        <div class="rod">${escaparHtml(rodape)}</div>
    </div>`);
    }

    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.bolsa { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; flex-direction: column; border: 0.6mm solid #000; padding: 0 5mm 4mm; }
        #area-impressao .bolsa .faixa { flex: none; height: 11mm; display: flex; align-items: center; justify-content: space-between; gap: 3mm;
            border-bottom: 0.9mm solid #000; font-size: 10pt; font-weight: 800; letter-spacing: 0.14em; white-space: nowrap; }
        #area-impressao .bolsa .rot { flex: none; margin-top: 4mm; font-size: 13pt; font-weight: 800; letter-spacing: 0.2em; line-height: 1; }
        #area-impressao .bolsa .num { flex: none; font-size: 78pt; font-weight: 800; line-height: 1; white-space: nowrap; }
        #area-impressao .bolsa .num small { font-size: 28pt; font-weight: 800; }
        #area-impressao .bolsa .cli { flex: none; margin-top: 4mm; border-top: 0.9mm solid #000; padding-top: 3mm; font-weight: 800; line-height: 1.08; letter-spacing: -0.01em; }
        #area-impressao .bolsa .cli .ln { white-space: nowrap; }
        #area-impressao .bolsa .cid { flex: none; margin-top: 2mm; font-size: 17pt; font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .bolsa .rod { margin-top: auto; flex: none; border-top: 0.4mm solid #000; padding-top: 2mm; font-size: 10pt; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
    `;
    return { estilos, etiquetas, corpo: etiquetas.join(''), paginas: n };
}

const erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });

/** Rasteriza as N bolsas → { bitmaps, sequencia } (cada "i de N" é um bitmap diferente; sequencia = 0..N-1). */
export async function prepararEtiquetasBolsas(dados, total) {
    await carregarFontesFuncionario();
    const montada = montarEtiquetaBolsa(dados, total);
    const R = await import('../../PCP/etiquetaRaster');
    const itens = montada.etiquetas.map((html) => ({ html, estilos: montada.estilos, seletorCelula: '.etq', larguraMm: 100, alturaMm: 120 }));
    const r = await R.rasterizarEtiquetas({ itens });
    if (r.indices.length !== montada.paginas) throw erroLocal('A imagem da etiqueta saiu incompleta.');
    for (const bm of r.bitmaps) {
        if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado.');
    }
    const bitmaps = [];
    for (const bm of r.bitmaps) bitmaps.push(await R.empacotarParaEnvio(bm));
    return { bitmaps, sequencia: [...r.indices] };
}
