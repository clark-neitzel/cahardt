// Etiqueta do PEDIDO (normal, especial, bonificação) e da AMOSTRA — 100 × 120 mm (rolo grande da Zebra),
// só preto no branco. Um desenho para todos: muda a faixa do topo (PEDIDO / PEDIDO ESPECIAL / BONIFICAÇÃO /
// AMOSTRA) e o número (#N / ZZ#N / BN#N / AM#N). REGRA: NUNCA usar área preta cheia (tarja/fundo): gruda o
// ribbon da Zebra. REGRA: NUNCA esconder item — se não couber, continua em outra etiqueta (1/2, 2/2…).
// Mesmo padrão da etiqueta da pasta do RH (RH/etiquetasFuncionario.js): `montar*` devolve { estilos, corpo }
// (prévia + "Imprimir pelo navegador") e `preparar*` rasteriza o MESMO desenho em bitmap 800×960 (Zebra).
import { escaparHtml } from '../../utils/imprimirNaPagina';
import { fmtNumero } from '../../utils/numeroPedido';
import { ajustarTexto, carregarFontesFuncionario, larguraTextoMm } from '../RH/etiquetasFuncionario';

const PILHA = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";
const PT_MIN_ITEM = 8;   // abaixo disso fica ilegível a 203 dpi: antes de reduzir mais, passa para outra etiqueta
const PT_MAX_ITEM = 12;
export const MAX_PAGINAS = 20; // a fila aceita até 60 imagens; 20 etiquetas já é um pedido gigante

const TITULOS = { PEDIDO: 'PEDIDO', ESPECIAL: 'PEDIDO ESPECIAL', BONIFICACAO: 'BONIFICAÇÃO', AMOSTRA: 'AMOSTRA' };

const dataBr = (v) => {
    if (!v) return '';
    const s = String(v).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
};
const hojeBr = () => new Date().toLocaleDateString('pt-BR');
const limpo = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const normNome = (t) => limpo(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// "Amostra - Coxinha de frango" -> "Coxinha de frango" (o prefixo é redundante na etiqueta de amostra)
export const nomeItemAmostra = (nome) => limpo(nome).replace(/^amostra\s*[-–:]\s*/i, '');

const fmtQtd = (q) => {
    const n = Number(q);
    if (!isFinite(n)) return String(q ?? '');
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
};

function destinatarioCliente(c) {
    const fant = limpo(c.NomeFantasia);
    const raz = limpo(c.Nome);
    return {
        nome: fant || raz,
        razao: fant && raz && normNome(fant) !== normNome(raz) ? raz : '',
        endereco: [limpo(c.End_Logradouro), limpo(c.End_Numero)].filter(Boolean).join(', '),
        cidade: [limpo(c.End_Bairro), limpo(c.End_Cidade)].filter(Boolean).join(' · '),
        telefone: limpo(c.Telefone_Celular) || limpo(c.Telefone),
    };
}

/** Amostra (cliente OU lead) → formato normalizado da etiqueta. */
export function deAmostra(a = {}) {
    const c = a.cliente || null;
    const l = a.lead || null;
    let dest = { nome: '', razao: '', endereco: '', cidade: '', telefone: '' };
    if (c) dest = destinatarioCliente(c);
    else if (l) dest = { nome: limpo(l.nomeEstabelecimento), razao: limpo(l.contato) ? `Contato: ${limpo(l.contato)}` : '', endereco: '', cidade: limpo(l.cidade), telefone: limpo(l.whatsapp) };
    return {
        tipo: 'AMOSTRA',
        numeroTxt: a.numero != null ? `AM#${a.numero}` : 'AM#',
        nome: dest.nome || 'DESTINATÁRIO',
        razao: dest.razao, endereco: dest.endereco, cidade: dest.cidade, telefone: dest.telefone,
        lead: !c && !!l,
        entrega: dataBr(a.dataEntrega),
        vendedor: limpo(a.solicitadoPor?.nome),
        obs: limpo(a.observacao),
        itens: (a.itens || []).map((i) => ({
            nome: nomeItemAmostra(i.nomeProduto || i.produto?.nome),
            qtd: fmtQtd(i.quantidade),
            un: limpo(i.produto?.unidade) || 'un',
        })),
        semValor: true,
    };
}
/** Compatível com o nome antigo (etiquetaAmostra.js). */
export const dadosEtiquetaAmostra = deAmostra;

/** Pedido (normal / especial / bonificação) → formato normalizado da etiqueta. */
export function dePedido(p = {}) {
    const dest = p.cliente ? destinatarioCliente(p.cliente) : { nome: '', razao: '', endereco: '', cidade: '', telefone: '' };
    const hora = limpo(p.horaEntrega);
    const dia = dataBr(p.dataVenda);
    const tipo = p.bonificacao ? 'BONIFICACAO' : p.especial ? 'ESPECIAL' : 'PEDIDO';
    return {
        tipo,
        numeroTxt: fmtNumero(p),
        nome: dest.nome || 'DESTINATÁRIO',
        razao: dest.razao, endereco: dest.endereco, cidade: dest.cidade, telefone: dest.telefone,
        lead: false,
        entrega: dia ? `${dia}${hora ? ` ${hora}` : ''}` : '',
        vendedor: limpo(p.vendedor?.nome),
        obs: limpo(p.observacoes),
        itens: (p.itens || []).map((i) => ({
            nome: limpo(i.nomeProduto || i.produto?.nome || i.descricao),
            qtd: fmtQtd(i.quantidade),
            un: limpo(i.produto?.unidade) || 'un',
        })),
        semValor: tipo === 'BONIFICACAO',
    };
}

const PT_MM = 25.4 / 72;
// Respiro (padding em cima e embaixo, em em) proporcional à fonte: 0,28em a 12pt, 0,12em de 10pt para baixo.
// O CSS usa a MESMA conta (variável --r na .lista): mmLinha e CSS têm que bater exatamente.
const respiro = (pt) => (pt >= 12 ? 0.28 : pt <= 10 ? 0.12 : 0.12 + ((pt - 10) / 2) * 0.16);
// altura de um item de `linhas` linhas = fonte × (entrelinha 1.1 × linhas + 2 × respiro) + filete
const mmItem = (pt, linhas = 1) => pt * (1.1 * linhas + 2 * respiro(pt)) * PT_MM + 0.25;

const LARG_LISTA = 91;                    // largura útil da lista de itens (100 − bordas − margens de 4mm)
const LARG_COL2 = (LARG_LISTA - 3) / 2;   // cada coluna quando há 2 (gap de 3mm)
// Cache de medição (o laço de paginação testa ~14 variantes várias vezes; measureText é caro em pedido grande).
const cacheMedida = new Map();
const medir = (texto, pt, peso) => {
    const k = `${peso}|${pt}|${texto}`;
    let w = cacheMedida.get(k);
    if (w === undefined) { w = larguraTextoMm(texto, pt, peso); if (cacheMedida.size > 20000) cacheMedida.clear(); cacheMedida.set(k, w); }
    return w;
};
const cacheLinhas = new Map();
/**
 * Nº de linhas do item numa coluna estreita: 1 se nome + quantidade cabem; 2 se o nome quebrado por palavras
 * (quebra gulosa, largura = coluna − quantidade − 2mm; palavra maior que a linha quebra por caractere) cabe em 2
 * linhas; 3 = NÃO cabe em 2 (esse grupo não pode usar 2 colunas — senão o line-clamp cortaria o nome em silêncio).
 */
function linhasNaColuna(i, pt) {
    const k = `${pt}|${i.nome}|${i.qtd} ${i.un}`;
    const c = cacheLinhas.get(k);
    if (c !== undefined) return c;
    const q = medir(`${i.qtd} ${i.un}`, pt, 800) + 2.6;
    let r;
    if (medir(i.nome, pt, 700) + q <= LARG_COL2) r = 1;
    else {
        const larg = LARG_COL2 - (q - 0.6) - 2;
        const esp = medir(' ', pt, 700);
        let linhas = 1, atual = 0;
        for (const pal of String(i.nome).split(' ').filter(Boolean)) {
            const w = medir(pal, pt, 700);
            if (w > larg) { // palavra maior que a linha: quebra por caractere
                const extra = Math.ceil(w / larg);
                linhas += (atual > 0 ? 1 : 0) + extra - 1; atual = w - (extra - 1) * larg; continue;
            }
            if (atual === 0) atual = w;
            else if (atual + esp + w <= larg) atual += esp + w;
            else { linhas++; atual = w; }
        }
        r = Math.min(linhas, 3);
    }
    if (cacheLinhas.size > 20000) cacheLinhas.clear();
    cacheLinhas.set(k, r);
    return r;
}
/** 1 coluna: o nome é maior que a linha inteira (menos a quantidade)? Então leva reticências (caso extremo). */
const nomeCortaEm1Col = (i, pt) => medir(i.nome, pt, 700) + medir(`${i.qtd} ${i.un}`, pt, 800) + 2.5 > LARG_LISTA;

// Variantes de layout: 1 coluna (12→8pt) e 2 colunas (10→8pt).
const VARIANTES = [];
for (let pt = PT_MAX_ITEM; pt >= PT_MIN_ITEM - 0.001; pt -= 0.5) VARIANTES.push({ colunas: 1, pt });
for (let pt = 10; pt >= PT_MIN_ITEM - 0.001; pt -= 0.5) VARIANTES.push({ colunas: 2, pt });

/** Altura (mm) de `itens` na variante `v` + como dividir em colunas (2 colunas: divisão que minimiza a maior). */
function medirGrupo(itens, v) {
    if (v.colunas === 1) return { altura: itens.length * mmItem(v.pt), split: itens.length, dupla: new Set() };
    const dupla = new Set();
    let estoura = false;
    const h = itens.map((i, idx) => { const l = linhasNaColuna(i, v.pt); if (l > 2) estoura = true; if (l === 2) dupla.add(idx); return mmItem(v.pt, Math.min(l, 2)); });
    if (estoura) return { altura: Infinity, split: itens.length, dupla };
    const total = h.reduce((x, y) => x + y, 0);
    let acc = 0, melhor = { altura: Infinity, split: itens.length };
    for (let k = 0; k <= itens.length; k++) {
        const m = Math.max(acc, total - acc);
        if (m < melhor.altura) melhor = { altura: m, split: k };
        acc += h[k] || 0;
    }
    return { ...melhor, dupla };
}
const cabeNa = (itens, v, disp) => medirGrupo(itens, v).altura <= disp;

/** Melhor layout de UM grupo: maior fonte que cabe; empate → 1 coluna. null = não cabe nem a 8pt. */
function melhorLayout(itens, disp) {
    let melhor = null;
    for (const v of VARIANTES) {
        if (!cabeNa(itens, v, disp)) continue;
        if (!melhor || v.pt > melhor.pt || (v.pt === melhor.pt && v.colunas < melhor.colunas)) melhor = v;
    }
    return melhor && { ...melhor, ...medirGrupo(itens, melhor) };
}
/** Quantos itens a partir de `ini` cabem numa página de `disp` mm na variante `v` (pelo menos 1: nunca trava). */
function quantosCabemV(todos, ini, v, disp) {
    let k = 1;
    while (ini + k < todos.length && cabeNa(todos.slice(ini, ini + k + 1), v, disp)) k++;
    return k;
}
/** Páginas para terminar a lista com a variante `v` (1ª página usa `disp`, as demais `disp2`). */
function paginasCom(todos, ini, v, disp, disp2) {
    let p = 0, d = disp;
    while (ini < todos.length && p <= MAX_PAGINAS) { ini += quantosCabemV(todos, ini, v, d); d = disp2; p++; }
    return p;
}

/**
 * Etiquetas 100 × 120 → { estilos, corpo, paginas, dados, cortouNome, cortouObs }.
 * `corpo` = todas as etiquetas, uma `.etq` por página, em ordem. Nenhum item é escondido.
 */
export function montarEtiquetaPedido(d) {
    const titulo = TITULOS[d.tipo] || 'PEDIDO';
    const n = d.itens.length;

    // ── cabeçalho completo (etiqueta 1) ──
    const linhasDest = [d.razao, d.endereco, d.cidade, d.telefone ? `Tel. ${d.telefone}` : '', d.lead ? 'Lead (ainda não é cliente)' : ''].filter(Boolean);
    const mmObs = d.obs ? 11.5 : 0;
    // Cabeçalho da etiqueta 1 com o nome do destinatário em fonte de até `teto` pt; devolve o nome e a altura livre p/ itens.
    // 120 − borda − faixa − destinatário − datas − (margem+filete+cabeçalho dos itens) − obs − rodapé − folga
    const cabecalho = (teto) => {
        const nm = ajustarTexto(d.nome.toLocaleUpperCase('pt-BR'), { larguraMm: 90, alturaMm: 18, maxLinhas: 2, tetoPt: teto, minPt: Math.min(10, teto) });
        const mmNm = Math.max(9, nm.linhas.length * nm.pt * 1.05 * PT_MM);
        const mmDst = 2.5 + 1.5 + mmNm + linhasDest.length * 4.1;
        return { nome: nm, disp1: 120 - 1 - 12 - mmDst - 11.5 - 2.5 - 0.6 - 5.2 - mmObs - 5.2 - 1.5 };
    };
    // Nome grande (24pt) por padrão. Se com ele os itens não cabem numa etiqueta só, tenta um nome menor
    // (18 → 14pt) ANTES de gastar uma etiqueta a mais; se nem assim, volta ao padrão e pagina.
    let cab = cabecalho(24);
    if (n > 0 && !melhorLayout(d.itens, cab.disp1)) {
        for (const t of [18, 14]) { const c = cabecalho(t); if (melhorLayout(d.itens, c.disp1)) { cab = c; break; } }
    }
    const { nome, disp1 } = cab;
    // ── cabeçalho reduzido (etiquetas 2+): só faixa + nome em 1 linha ──
    const nome1 = ajustarTexto(d.nome.toLocaleUpperCase('pt-BR'), { larguraMm: 90, alturaMm: 8, maxLinhas: 1, tetoPt: 14, minPt: 9 });
    const mmDest2 = 2.5 + 1.5 + Math.max(6, nome1.pt * 1.05 * PT_MM);
    const disp2 = 120 - 1 - 12 - mmDest2 - 2.5 - 0.6 - 5.2 - 5.2 - 1.5;

    // ── paginação: tudo na 1ª se couber (até 8pt); senão enche a 1ª e continua nas seguintes ──
    const grupos = [];
    if (n === 0) grupos.push([]);
    else if (melhorLayout(d.itens, disp1)) grupos.push(d.itens);
    else {
        let ini = 0;
        while (ini < n && grupos.length < MAX_PAGINAS) {
            const disp = grupos.length === 0 ? disp1 : disp2;
            // variante que termina o pedido em MENOS páginas; empate → fonte maior; empate → 1 coluna
            let melhor = null;
            for (const v of VARIANTES) {
                const pg = paginasCom(d.itens, ini, v, disp, disp2);
                if (!melhor || pg < melhor.pg || (pg === melhor.pg && (v.pt > melhor.v.pt || (v.pt === melhor.v.pt && v.colunas < melhor.v.colunas)))) melhor = { v, pg };
            }
            const k = quantosCabemV(d.itens, ini, melhor.v, disp);
            grupos.push(d.itens.slice(ini, ini + k));
            ini += k;
        }
    }
    const paginas = grupos.length;
    let cortouItem = false; // algum nome com reticências (1 coluna, nome maior que a linha a 8pt)

    const linhaItem = (i, dupla = false) => `<div class="it${dupla ? ' dl' : ''}"><span class="nm">${escaparHtml(i.nome)}</span><span class="qt">${escaparHtml(i.qtd)} ${escaparHtml(i.un)}</span></div>`;
    const ptFaixa = titulo.length > 9 ? 12 : 16;
    const ptNum = d.numeroTxt.length > 8 ? 15 : 20;
    let inicio = 0;
    const etiquetas = grupos.map((itens, idx) => {
        const primeira = idx === 0;
        const lay = itens.length ? (melhorLayout(itens, primeira ? disp1 : disp2) || { pt: PT_MIN_ITEM, colunas: 1, ...medirGrupo(itens, { colunas: 1, pt: PT_MIN_ITEM }) }) : { pt: PT_MAX_ITEM, colunas: 1, split: 0, dupla: new Set() };
        if (lay.colunas === 1 && itens.some((i) => nomeCortaEm1Col(i, lay.pt))) cortouItem = true;
        let itensHtml;
        if (!itens.length) itensHtml = '<div class="it vazio">Sem itens</div>';
        else if (lay.colunas === 1) itensHtml = itens.map((i) => linhaItem(i)).join('');
        else {
            itensHtml = `<div class="col">${itens.slice(0, lay.split).map((i, k) => linhaItem(i, lay.dupla.has(k))).join('')}</div><div class="col">${itens.slice(lay.split).map((i, k) => linhaItem(i, lay.dupla.has(lay.split + k))).join('')}</div>`;
        }
        const de = inicio + 1, ate = inicio + itens.length;
        inicio = ate;
        const contagem = paginas > 1 ? `itens ${de}–${ate} de ${n}` : `${n} ite${n === 1 ? 'm' : 'ns'}`;
        const rotItens = d.tipo === 'AMOSTRA' ? 'ITENS DA AMOSTRA' : 'ITENS DO PEDIDO';
        const cabDest = primeira
            ? `<div class="dest"><div class="nome" style="font-size:${nome.pt}pt">${nome.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('')}</div>${linhasDest.map((l) => `<div class="end">${escaparHtml(l)}</div>`).join('')}</div>
        <div class="datas">
            <div class="dt"><div class="rot">ENTREGA</div><div class="vl" style="font-size:${(d.entrega || '').length > 10 ? 11 : 15}pt${(d.entrega || '').length > 10 ? ';line-height:1.6' : ''}">${escaparHtml(d.entrega || '—')}</div></div>
            <div class="dt"><div class="rot">VENDEDOR</div><div class="vl vd">${escaparHtml(d.vendedor || '—')}</div></div>
        </div>`
            : `<div class="dest red"><div class="nome" style="font-size:${nome1.pt}pt"><div class="ln">${escaparHtml((nome1.linhas[0] || ''))}</div></div></div>`;
        const rodape = `${d.semValor ? 'SEM VALOR COMERCIAL · ' : ''}HARDT DOCES E SALGADOS · ${hojeBr()}`;
        return `<div class="etq ped">
        <div class="faixa"><span class="esq"><span class="tit" style="font-size:${ptFaixa}pt">${escaparHtml(titulo)}</span>${paginas > 1 ? `<span class="pgn">${idx + 1}/${paginas}</span>` : ''}</span><span class="num" style="font-size:${ptNum}pt">${escaparHtml(d.numeroTxt)}</span></div>
        ${cabDest}
        <div class="itens">
            <div class="cab"><span>${rotItens}</span><span>${contagem}</span></div>
            <div class="lista${lay.colunas === 2 ? ' duas' : ''}" style="font-size:${lay.pt}pt;--r:${respiro(lay.pt)}em">${itensHtml}</div>
        </div>
        ${primeira && d.obs ? `<div class="obs"><b>OBS:</b> ${escaparHtml(d.obs)}</div>` : ''}
        <div class="rod">${escaparHtml(rodape)}</div>
    </div>`;
    });

    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.ped { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; flex-direction: column; border: 0.5mm solid #000; }
        /* SEM área preta cheia: tarja sólida gruda o ribbon da Zebra. Só texto + linha grossa embaixo. */
        #area-impressao .ped .faixa { background: #fff; color: #000; height: 12mm; flex: none; padding: 0 4mm; box-sizing: border-box;
            border-bottom: 0.9mm solid #000; display: flex; align-items: center; justify-content: space-between; gap: 2mm; }
        #area-impressao .ped .faixa .esq { display: flex; align-items: baseline; gap: 2.5mm; min-width: 0; white-space: nowrap; }
        #area-impressao .ped .faixa .tit { font-weight: 800; letter-spacing: 0.1em; }
        #area-impressao .ped .faixa .pgn { font-weight: 800; font-size: 12pt; }
        #area-impressao .ped .faixa .num { font-weight: 800; letter-spacing: 0.02em; white-space: nowrap; }
        #area-impressao .ped .dest { flex: none; padding: 2.5mm 4mm 1.5mm; }
        #area-impressao .ped .nome { font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; min-height: 9mm; }
        #area-impressao .ped .dest.red .nome { min-height: 0; }
        #area-impressao .ped .ln { white-space: nowrap; }
        #area-impressao .ped .end { font-size: 9.5pt; font-weight: 600; line-height: 4.1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .ped .datas { flex: none; display: flex; gap: 2.5mm; padding: 1mm 4mm 0; height: 11.5mm; box-sizing: border-box; }
        #area-impressao .ped .dt { flex: 1; min-width: 0; border: 0.5mm solid #000; padding: 1mm 1.5mm 0; text-align: center; box-sizing: border-box; }
        #area-impressao .ped .rot { font-size: 7pt; font-weight: 800; letter-spacing: 0.14em; line-height: 1.1; }
        #area-impressao .ped .vl { font-size: 15pt; font-weight: 800; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .ped .vl.vd { font-size: 12pt; line-height: 1.35; }
        #area-impressao .ped .itens { flex: 1; min-height: 0; margin: 2.5mm 4mm 0; border-top: 0.6mm solid #000; display: flex; flex-direction: column; overflow: hidden; }
        #area-impressao .ped .cab { flex: none; display: flex; justify-content: space-between; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.14em; height: 5.2mm; box-sizing: border-box; padding-top: 1.2mm; }
        #area-impressao .ped .lista { flex: 1; min-height: 0; overflow: hidden; font-weight: 700; line-height: 1.1; }
        #area-impressao .ped .lista.duas { display: flex; flex-wrap: wrap; gap: 0 3mm; align-content: flex-start; }
        #area-impressao .ped .lista.duas .col { flex: 1; min-width: 0; }
        #area-impressao .ped .it { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; padding: var(--r, 0.28em) 0; border-bottom: 0.25mm solid #000; }
        #area-impressao .ped .it:last-child { border-bottom: 0; }
        #area-impressao .ped .it .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        /* nome em 2 linhas (só nas 2 colunas, quando 1 linha não cabe); reticências só se nem 2 couberem */
        #area-impressao .ped .it.dl .nm { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; max-height: 2.2em; text-overflow: clip; }
        #area-impressao .ped .it .qt { flex: none; font-weight: 800; white-space: nowrap; }
        #area-impressao .ped .it.vazio { justify-content: center; font-weight: 600; border: 0; }
        #area-impressao .ped .obs { flex: none; margin: 1.5mm 4mm 0; font-size: 8.5pt; font-weight: 600; line-height: 1.2; height: 10mm; overflow: hidden; }
        #area-impressao .ped .obs b { font-weight: 800; }
        #area-impressao .ped .rod { flex: none; font-size: 6.5pt; font-weight: 600; text-align: center; height: 5.2mm; box-sizing: border-box; padding-top: 1.4mm; letter-spacing: 0.03em; white-space: nowrap; }
    `;
    return {
        estilos, corpo: etiquetas.join(''), etiquetas, paginas, dados: d,
        cortouNome: !!nome.cortou || cortouItem,
        cortouObs: d.obs.length > 170,   // ~3 linhas de 8,5pt na largura útil
        itensFora: Math.max(0, n - grupos.reduce((s, g) => s + g.length, 0)), // só se passar de MAX_PAGINAS (aviso no modal)
    };
}

// ─── Rasterização para a fila (Zebra), igual à pasta do RH ───────────────────
const erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });

/**
 * Rasteriza cada página → { bitmaps:[únicos], sequencia }. `sequencia` = ordem de impressão com as
 * cópias embutidas: páginas × cópias em ordem (1,2,1,2…), cada valor = índice em `bitmaps`.
 */
export async function prepararEtiquetaPedido(dados, copias = 1) {
    await carregarFontesFuncionario();
    const montada = montarEtiquetaPedido(dados);
    const R = await import('../PCP/etiquetaRaster');
    const itens = montada.etiquetas.map((html) => ({ html, estilos: montada.estilos, seletorCelula: '.etq', larguraMm: 100, alturaMm: 120 }));
    const r = await R.rasterizarEtiquetas({ itens });
    if (r.indices.length !== montada.paginas) throw erroLocal('A imagem da etiqueta saiu incompleta. Use "Imprimir pelo navegador".');
    for (const bm of r.bitmaps) {
        if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    }
    const bitmaps = [];
    for (const bm of r.bitmaps) bitmaps.push(await R.empacotarParaEnvio(bm));
    const qtd = Math.max(1, Math.min(99, parseInt(copias, 10) || 1));
    const sequencia = [];
    for (let c = 0; c < qtd; c++) sequencia.push(...r.indices);
    return { bitmaps, sequencia };
}
