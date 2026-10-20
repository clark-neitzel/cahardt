import { EtiquetaRender } from './EtiquetaLabelNova';
import { ehDeitada, dimensoesEtiqueta } from './etiquetaModelos';
import { montarEtiquetas, LINK_KIT_FESTA, FONTES_ETIQUETA } from '../KitFesta/etiquetasCaixas';

// Montagem do que vai para a fila de impressão direta (E3): rasteriza a etiqueta REAL (o mesmo
// desenho do preview) em bitmap 1-bit 203 dpi. O html2canvas só é baixado no clique (import dinâmico).

// erro de validação local: repetir não adianta (some o "Tentar de novo")
const erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });

// falha de chunk (deploy trocou os arquivos) sobe como está: o hook mostra "atualize a página"
const carregarRaster = () => import('./etiquetaRaster');

/** Produto → { bitmaps:[1], sequencia:undefined }. 800×960 (100×120), deitada girada. */
export async function prepararProduto({ et, tamanho, layout, dataFab, dataVal }) {
    const R = await carregarRaster();
    const deitada = ehDeitada(et);
    const d = dimensoesEtiqueta(tamanho, deitada ? 'DEITADA' : 'EM_PE');
    const r = await R.rasterizarEtiquetas({
        itens: [{
            elemento: <EtiquetaRender layout={layout} tamanho={tamanho} et={et} dataFab={dataFab} dataVal={dataVal} modoRaster />,
            larguraMm: d.larguraMM, alturaMm: d.alturaMM, giro: deitada ? R.GIRO_DEITADA : 0,
        }],
    });
    const bm = r.bitmaps[0];
    if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    return { bitmaps: [await R.empacotarParaEnvio(bm)] };
}

const QR_PLACEHOLDER = '<svg data-raster="qr" viewBox="0 0 1 1" style="visibility:hidden"></svg>';

// O texto das caixas é MEDIDO com canvas.measureText ao montar o HTML: só vale com as fontes já carregadas.
async function carregarFontesCaixas() {
    try {
        await Promise.all([...FONTES_ETIQUETA, '600 12pt Manrope', '700 12pt Manrope'].map((f) => document.fonts.load(f).catch(() => {})));
        await document.fonts.ready;
    } catch { /* sem Font Loading API */ }
}

/** Caixas (Kit Festa/Delivery) → { bitmaps:[únicos ≤ 60], sequencia:[índices na ordem de impressão] }. */
export async function prepararCaixas({ pedido, opcoes }) {
    const R = await carregarRaster();
    await carregarFontesCaixas();
    const { estilos, corpo, total } = montarEtiquetas(pedido, { ...opcoes, qrSvg: QR_PLACEHOLDER });
    if (!total) throw erroLocal('Pedido sem caixas para etiquetar.');
    const matriz = await R.matrizQr(LINK_KIT_FESTA);
    const r = await R.rasterizarEtiquetas({
        itens: [{ html: corpo, estilos, seletorCelula: '.etq', larguraMm: 40, alturaMm: 25, qrMatriz: matriz }],
    });
    if (r.indices.length !== total) throw erroLocal('Não foi possível montar todas as etiquetas. Use "Imprimir pelo navegador".');
    if (r.bitmaps.length > 60) throw erroLocal('Etiquetas diferentes demais para enviar de uma vez (máx. 60 modelos). Use "Imprimir pelo navegador".');
    const bitmaps = [];
    for (const bm of r.bitmaps) bitmaps.push(await R.empacotarParaEnvio(bm));
    return { bitmaps, sequencia: r.indices };
}
