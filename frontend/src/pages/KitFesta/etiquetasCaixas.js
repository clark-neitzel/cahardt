// Etiquetas das caixas do Kit Festa — rolo 40 × 25 mm (Zebra TLP 2844, 2 colunas).
//
// Para cada caixa do pedido sai 1 etiqueta com o nome do sabor (o mesmo do site) e o
// QR da página do Kit Festa; a cada N caixas (padrão 4) sai 1 etiqueta do pedido com
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

/** Monta { estilos, corpo } prontos para imprimirNaPagina(estilos, corpo). */
export function montarEtiquetas(pedido, { qrDataUrl, cada, nomeLimpo, colunas } = {}) {
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
                <div><span class="ent">${entrega ? 'ENTREGA' : 'RETIRADA'} ${dataBr(pedido.data)} · ${escaparHtml(pedido.horario)}</span></div>
                <div class="cx">Caixas ${e.de}–${e.ate} de ${e.total} · Kit Festa Hardt</div>
            </div>`;
        }
        const nome = nomeDaEtiqueta(e.nome, op.nomeLimpo);
        return `<div class="etq sabor">
            ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="">` : ''}
            <div class="txt">
                <div class="nome ${nome.length > 20 ? 'longo' : ''}">${escaparHtml(nome)}</div>
                <div><div class="un">${escaparHtml(e.un)} un · Kit Festa</div><div class="marca">HARDT SALGADOS</div></div>
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
        #area-impressao .etq.sabor { display: flex; gap: 1.2mm; padding: 1.4mm 1.6mm 1.2mm 1.4mm; }
        #area-impressao .qr { width: 17mm; height: 17mm; flex: none; margin-top: 1.3mm; display: block; }
        #area-impressao .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        #area-impressao .nome { font-weight: 800; font-size: 7.8pt; line-height: 1.05; text-transform: uppercase; word-break: break-word; }
        #area-impressao .nome.longo { font-size: 6.6pt; }
        #area-impressao .un { font-weight: 700; font-size: 6.2pt; white-space: nowrap; }
        #area-impressao .marca { font-size: 5pt; font-weight: 700; letter-spacing: .06em; white-space: nowrap; }
        #area-impressao .etq.pedido { padding: 1.6mm 2mm; display: flex; flex-direction: column; justify-content: space-between; border: 0.5mm solid #000; box-sizing: border-box; }
        #area-impressao .etq.pedido .num { font-weight: 800; font-size: 12pt; line-height: 1; }
        #area-impressao .etq.pedido .cli { font-weight: 800; font-size: 8pt; line-height: 1.1; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .etq.pedido .ent { font-weight: 800; font-size: 8pt; white-space: nowrap; background: #000; color: #fff; padding: 0.6mm 1.2mm; border-radius: 0.8mm; display: inline-block; }
        #area-impressao .etq.pedido.retirada .ent { background: #fff; color: #000; border: 0.4mm solid #000; }
        #area-impressao .etq.pedido .cx { font-size: 6.2pt; font-weight: 700; }
    `;
    return { estilos, corpo: paginas.join(''), total: seq.length, caixas: seq.filter((e) => e.tipo === 'sabor').length };
}
