// Etiquetas das caixas do Kit Festa — rolo 40 × 25 mm (Zebra TLP 2844, 2 colunas).
//
// Para cada caixa do pedido sai 1 etiqueta com o nome do sabor (o mesmo do site, em uma
// linha), o número do pedido e o QR da página do Kit Festa (SVG inline: imagem data: não
// dava tempo de decodificar antes do print() síncrono e saía um quadrado vazio); a cada N caixas (padrão 4) sai 1 etiqueta do pedido com
// número, cliente e data/horário da entrega. Impressão na própria página
// (utils/imprimirNaPagina) — nunca window.open nem iframe (regra do iPad).
import { escaparHtml } from '../../utils/imprimirNaPagina';

export const LINK_KIT_FESTA = 'https://hardtsalgados.com.br/kit-festa';

// Frase de agradecimento: gira caixa a caixa (caixa 1 → frase 1, caixa 2 → frase 2…).
// O conjunto é escolhido no painel de etiquetas (opção `frases`, lembrada por usuário).
export const CONJUNTOS_FRASES = {
    carinho: { nome: 'Carinho', frases: [
        'Feito com carinho pra você', 'Obrigado por escolher a Hardt', 'Que a sua festa seja linda!', 'Preparado hoje, com amor',
        'Bom apetite, e boa festa!', 'Sabor de casa na sua mesa', 'A gente ama fazer parte', 'Compartilhe, é feito pra isso',
    ] },
    festa: { nome: 'Clima de festa', frases: [
        'Hora da festa!', 'Salgadinho bom junta gente', 'Parabéns pra quem faz a festa', 'Serve quente, que fica melhor',
        'Guarde um pra você', 'Que venham os convidados!', 'Feito pra alegrar a mesa', 'Brinde, sorria, aproveite',
    ] },
    casa: { nome: 'Casa e família', frases: [
        'Receita da família Hardt', 'Feito à mão, como em casa', 'Com o cuidado de sempre', 'Da nossa cozinha pra sua festa',
        'Massa fininha, recheio farto', 'Tradição desde o primeiro lote', 'Obrigado pela confiança', 'Sabor que a gente conhece',
    ] },
    nenhuma: { nome: 'Sem frase', frases: [] },
};
export const FRASES_CAIXA = CONJUNTOS_FRASES.carinho.frases;

// Fontes das etiquetas (declaradas no index.html). Pré-carregar ao abrir a tela: o print()
// é síncrono no clique e uma fonte ainda não baixada sairia no fallback.
export const FONTES_ETIQUETA = ['700 12pt Fredoka', '600 12pt Fredoka', '700 12pt Caveat', '600 12pt Lora', 'italic 600 12pt Lora'];
export function precarregarFontesEtiqueta() {
    try { FONTES_ETIQUETA.forEach((f) => document.fonts?.load(f).catch(() => {})); } catch { /* sem Font Loading API */ }
}

// Fonte que encolhe para o texto caber em UMA linha (40mm úteis ≈ 26 caracteres a 7pt).
function tamanhoPt(texto, base) {
    const n = String(texto || '').length;
    const k = n <= 14 ? 1 : n <= 19 ? 0.86 : n <= 24 ? 0.74 : n <= 29 ? 0.63 : 0.55;
    return (base * k).toFixed(1) + 'pt';
}
export const OPCOES_PADRAO = { cada: 4, nomeLimpo: true, colunas: 2, frases: 'carinho' };

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
export function montarEtiquetas(pedido, { qrSvg, cada, nomeLimpo, colunas, frases } = {}) {
    const op = { ...OPCOES_PADRAO, cada, nomeLimpo, colunas, frases };
    const listaFrases = (CONJUNTOS_FRASES[op.frases] || CONJUNTOS_FRASES.carinho).frases;
    if (op.cada == null) op.cada = OPCOES_PADRAO.cada;
    if (op.nomeLimpo == null) op.nomeLimpo = OPCOES_PADRAO.nomeLimpo;
    const cols = Number(op.colunas) === 1 ? 1 : 2;
    const seq = sequenciaEtiquetas(pedido, op);
    const entrega = pedido.modo === 'entrega';

    let nCaixa = 0;
    const etq = (e) => {
        if (e.tipo === 'pedido') {
            // "Clássica": serifa, centralizada, sem borda
            return `<div class="etq pedido">
                <div class="ola">Feito com carinho para</div>
                <div class="cli" style="font-size:${tamanhoPt(pedido.nomeCliente, 10.5)}">${escaparHtml(pedido.nomeCliente)}</div>
                <div class="ent">${entrega ? 'entrega' : 'retirada'} ${dataBr(pedido.data)}${pedido.horario ? ` às ${escaparHtml(pedido.horario)}` : ''}</div>
                <div class="orn">✿ ❧ ✿</div>
                <div class="rod">Pedido #${escaparHtml(pedido.numero)} · caixas ${e.de}–${e.ate} de ${e.total}</div>
            </div>`;
        }
        // "Caseira": fonte arredondada, QR, pedido e frase manuscrita que muda a cada caixa
        const nome = nomeDaEtiqueta(e.nome, op.nomeLimpo);
        const frase = listaFrases.length ? listaFrases[nCaixa++ % listaFrases.length] : '';
        return `<div class="etq sabor">
            <div class="nome" style="font-size:${tamanhoPt(nome, 9.5)}">${escaparHtml(nome)}</div>
            <div class="linha">
                ${qrSvg ? `<div class="qr">${qrSvg}</div>` : ''}
                <div class="txt">
                    <div class="ped">Pedido<b>#${escaparHtml(pedido.numero)}</b></div>
                    ${e.un ? `<div class="un">${escaparHtml(e.un)} unidades</div>` : ''}
                </div>
            </div>
            ${frase ? `<div class="frase" style="font-size:${tamanhoPt(frase, 10)}">${escaparHtml(frase)}</div>` : ''}
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
        #area-impressao { color: #000; }
        #area-impressao .pag { width: ${largPag}; height: 25mm; display: flex; overflow: hidden;
            ${cols === 2 ? 'padding-left: 2mm; gap: 2mm;' : ''} page-break-after: always; break-after: page; }
        #area-impressao .etq { width: 40mm; height: 25mm; flex: none; overflow: hidden; background: #fff; box-sizing: border-box; }
        /* caixa — "Caseira" */
        #area-impressao .etq.sabor { font-family: Fredoka, Manrope, Arial, sans-serif; padding: 1.3mm 1.6mm 1mm; display: flex; flex-direction: column; }
        #area-impressao .nome { font-weight: 700; line-height: 1; white-space: nowrap; overflow: hidden; letter-spacing: -.01em; }
        #area-impressao .linha { display: flex; gap: 1.5mm; flex: 1; min-height: 0; margin-top: 0.8mm; }
        #area-impressao .qr { width: 13mm; height: 13mm; flex: none; }
        #area-impressao .qr svg { width: 13mm; height: 13mm; display: block; }
        #area-impressao .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; }
        #area-impressao .ped { font-weight: 600; font-size: 7pt; line-height: 1; }
        #area-impressao .ped b { display: block; font-weight: 700; font-size: 10.5pt; line-height: 1; margin-top: 0.4mm; white-space: nowrap; }
        #area-impressao .un { font-weight: 600; font-size: 6.5pt; white-space: nowrap; }
        #area-impressao .frase { font-family: Caveat, 'Segoe Script', cursive; font-weight: 700; line-height: 1; margin-top: 0.8mm; white-space: nowrap; overflow: hidden; text-align: center; }
        /* pedido — "Clássica", sem borda */
        #area-impressao .etq.pedido { font-family: Lora, Georgia, 'Times New Roman', serif; padding: 1.4mm 2mm 1.2mm; display: flex; flex-direction: column; justify-content: space-between; text-align: center; }
        #area-impressao .etq.pedido .ola { font-family: Caveat, 'Segoe Script', cursive; font-weight: 700; font-size: 11.5pt; line-height: 1; white-space: nowrap; overflow: hidden; }
        #area-impressao .etq.pedido .cli { font-weight: 600; line-height: 1.1; white-space: nowrap; overflow: hidden; }
        #area-impressao .etq.pedido .ent { font-style: italic; font-weight: 600; font-size: 7pt; line-height: 1.1; white-space: nowrap; }
        #area-impressao .etq.pedido .orn { font-size: 5.5pt; letter-spacing: .3em; line-height: 1; }
        #area-impressao .etq.pedido .rod { font-size: 6.3pt; white-space: nowrap; }
    `;
    return { estilos, corpo: paginas.join(''), total: seq.length, caixas: seq.filter((e) => e.tipo === 'sabor').length };
}
