// Etiquetas das caixas do Kit Festa — rolo 40 × 25 mm (Zebra TLP 2844, 2 colunas).
//
// Para cada caixa do pedido sai 1 etiqueta com o nome do sabor (o mesmo do site, em uma
// linha), o número do pedido e o QR da página do Kit Festa (SVG inline: imagem data: não
// dava tempo de decodificar antes do print() síncrono e saía um quadrado vazio); a cada N caixas (padrão 4) sai 1 etiqueta do pedido com
// número, cliente e data/horário da entrega. Impressão na própria página
// (utils/imprimirNaPagina) — nunca window.open nem iframe (regra do iPad).
import { escaparHtml } from '../../utils/imprimirNaPagina';

export const LINK_KIT_FESTA = 'https://hardtsalgados.com.br/kit-festa';
export const OPCOES_PADRAO = { cada: 4, nomeLimpo: true, colunas: 2 };

// "COXINHA FRANGO C/25-HF" → "COXINHA FRANGO" (sufixo do cadastro; a quantidade sai na linha de baixo)
export function nomeDaEtiqueta(nome, limpo) {
    const n = String(nome || '').trim();
    return limpo ? n.replace(/\s*C\/\d+\s*-\s*HF\s*$/i, '').trim() || n : n;
}

function dataBr(d) {
    const s = String(d || '').slice(0, 10).split('-');
    return s.length === 3 ? `${s[2]}/${s[1]}` : '';
}

/** Lista de caixas na ordem de impressão: [{ tipo:'sabor', nome, un } | { tipo:'pedido', de, ate }] */
export function sequenciaEtiquetas(pedido, opcoes = {}) {
    const cada = Math.max(1, Number(opcoes.cada) || OPCOES_PADRAO.cada);
    const caixas = [];
    (pedido?.itens || []).forEach((it) => {
        const q = Math.max(0, Number(it.quantidade) || 0);
        const nome = `${it.nomeProduto || ''}${it.opcao ? ` (${it.opcao})` : ''}`;
        for (let i = 0; i < q; i++) caixas.push({ tipo: 'sabor', nome, un: it.unidadesPorCaixa });
    });
    const seq = [];
    caixas.forEach((c, i) => {
        seq.push(c);
        const fim = (i + 1) % cada === 0 || i === caixas.length - 1;
        if (fim) seq.push({ tipo: 'pedido', de: i + 1 - (i % cada), ate: i + 1, total: caixas.length });
    });
    return seq;
}

/**
 * Card do kanban do Delivery → objeto no formato que montarEtiquetas espera.
 * Pedido vindo do site do Kit Festa usa horário e caixas do site; os demais usam os itens
 * do próprio pedido (quantidade = caixas) e a data de entrega, sem horário.
 */
export function pedidoDoDelivery(card) {
    const kf = card?.kitFesta;
    const nomeCliente = card?.cliente?.NomeFantasia || card?.cliente?.Nome || kf?.nomeCliente || '';
    if (kf) return { numero: card.numero, nomeCliente, modo: kf.modo, data: kf.data, horario: kf.horario, itens: kf.itens || [] };
    return {
        numero: card?.numero, nomeCliente, modo: 'entrega', data: card?.dataVenda, horario: '',
        itens: (card?.itens || []).map((i) => ({ nomeProduto: i.produto?.nome, quantidade: i.quantidade, unidadesPorCaixa: null })),
    };
}

/** Monta { estilos, corpo } prontos para imprimirNaPagina(estilos, corpo). */
export function montarEtiquetas(pedido, { qrSvg, cada, nomeLimpo, colunas } = {}) {
    const op = { ...OPCOES_PADRAO, cada, nomeLimpo, colunas };
    if (op.cada == null) op.cada = OPCOES_PADRAO.cada;
    if (op.nomeLimpo == null) op.nomeLimpo = OPCOES_PADRAO.nomeLimpo;
    const cols = Number(op.colunas) === 1 ? 1 : 2;
    const seq = sequenciaEtiquetas(pedido, op);
    const entrega = pedido.modo === 'entrega';

    const etq = (e) => {
        if (e.tipo === 'pedido') {
            return `<div class="etq pedido ${entrega ? '' : 'retirada'}">
                <div class="num">PEDIDO #${escaparHtml(pedido.numero)}</div>
                <div class="cli">${escaparHtml(pedido.nomeCliente)}</div>
                <div><span class="ent">${entrega ? 'ENTREGA' : 'RETIRADA'} ${dataBr(pedido.data)}${pedido.horario ? ` · ${escaparHtml(pedido.horario)}` : ''}</span></div>
                <div class="cx">Caixas ${e.de}–${e.ate} de ${e.total} · Kit Festa Hardt</div>
            </div>`;
        }
        const nome = nomeDaEtiqueta(e.nome, op.nomeLimpo);
        // nome em UMA linha: a fonte encolhe conforme o tamanho (40mm úteis ≈ 26 caracteres a 7pt)
        const tam = nome.length <= 14 ? '9.5pt' : nome.length <= 19 ? '8.2pt' : nome.length <= 24 ? '7pt' : nome.length <= 29 ? '6pt' : '5.2pt';
        return `<div class="etq sabor">
            <div class="nome" style="font-size:${tam}">${escaparHtml(nome)}</div>
            <div class="linha">
                ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}
                <div class="txt">
                    <div class="ped">PEDIDO</div>
                    <div class="num">#${escaparHtml(pedido.numero)}</div>
                    ${e.un ? `<div class="un">${escaparHtml(e.un)} - UN</div>` : ''}
                </div>
            </div>
        </div>`;
    };

    const paginas = [];
    for (let i = 0; i < seq.length; i += cols) {
        paginas.push(`<div class="pag">${seq.slice(i, i + cols).map(etq).join('')}</div>`);
    }

    const largPag = cols === 2 ? '84mm' : '40mm';
    const estilos = `
        @page { size: ${largPag} 25mm; margin: 0; }
        html.modo-impressao #area-impressao { width: ${largPag} !important; max-width: none !important; margin: 0 !important; }
        #area-impressao { font-family: Manrope, Arial, Helvetica, sans-serif; color: #000; }
        #area-impressao .pag { width: ${largPag}; height: 25mm; display: flex; overflow: hidden;
            ${cols === 2 ? 'padding-left: 2mm; gap: 2mm;' : ''} page-break-after: always; break-after: page; }
        #area-impressao .etq { width: 40mm; height: 25mm; flex: none; overflow: hidden; background: #fff; }
        #area-impressao .etq.sabor { display: flex; flex-direction: column; padding: 1.4mm 1.6mm 1.2mm; gap: 0.8mm; }
        #area-impressao .nome { font-weight: 800; line-height: 1.1; text-transform: uppercase; white-space: nowrap; overflow: hidden; }
        #area-impressao .linha { display: flex; gap: 1.5mm; flex: 1; min-height: 0; }
        #area-impressao .qr { width: 15mm; height: 15mm; flex: none; }
        #area-impressao .qr svg { width: 15mm; height: 15mm; display: block; }
        #area-impressao .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0.8mm; }
        #area-impressao .ped { font-weight: 800; font-size: 7.5pt; line-height: 1; letter-spacing: .04em; white-space: nowrap; }
        #area-impressao .txt .num { font-weight: 800; font-size: 13pt; line-height: 1; white-space: nowrap; }
        #area-impressao .un { font-weight: 800; font-size: 8pt; line-height: 1; white-space: nowrap; }
        #area-impressao .etq.pedido { padding: 1.6mm 2mm; display: flex; flex-direction: column; justify-content: space-between; border: 0.5mm solid #000; box-sizing: border-box; }
        #area-impressao .etq.pedido .num { font-weight: 800; font-size: 12pt; line-height: 1; }
        #area-impressao .etq.pedido .cli { font-weight: 800; font-size: 8pt; line-height: 1.1; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .etq.pedido .ent { font-weight: 800; font-size: 8pt; white-space: nowrap; background: #000; color: #fff; padding: 0.6mm 1.2mm; border-radius: 0.8mm; display: inline-block; }
        #area-impressao .etq.pedido.retirada .ent { background: #fff; color: #000; border: 0.4mm solid #000; }
        #area-impressao .etq.pedido .cx { font-size: 6.2pt; font-weight: 700; }
    `;
    return { estilos, corpo: paginas.join(''), total: seq.length, caixas: seq.filter((e) => e.tipo === 'sabor').length };
}
