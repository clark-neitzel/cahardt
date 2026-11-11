// Etiqueta do PEDIDO DE AMOSTRA — 100 × 120 mm (rolo grande da Zebra), só preto no branco.
// Resumo do pedido para colar na caixa/sacola: destinatário, endereço, entrega, quem pediu, os itens
// e a observação do vendedor. NUNCA usar área preta cheia (tarja/fundo): gruda o ribbon na Zebra. Mesmo padrão da etiqueta da pasta do RH (RH/etiquetasFuncionario.js):
// `montar*` devolve { estilos, corpo } (preview + "Imprimir pelo navegador") e `preparar*` rasteriza
// o MESMO desenho em bitmap 800×960 para a fila da Zebra (E3).
import { escaparHtml } from '../../utils/imprimirNaPagina';
import { ajustarTexto, carregarFontesFuncionario } from '../RH/etiquetasFuncionario';

const PILHA = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";

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

/** Normaliza a amostra (cliente OU lead) para o que a etiqueta mostra. */
export function dadosEtiquetaAmostra(a = {}) {
    const c = a.cliente || null;
    const l = a.lead || null;
    let nome = '', razao = '', endereco = '', cidade = '', telefone = '';
    if (c) {
        const fant = limpo(c.NomeFantasia);
        const raz = limpo(c.Nome);
        nome = fant || raz;
        razao = fant && raz && normNome(fant) !== normNome(raz) ? raz : '';
        endereco = [limpo(c.End_Logradouro), limpo(c.End_Numero)].filter(Boolean).join(', ');
        cidade = [limpo(c.End_Bairro), limpo(c.End_Cidade)].filter(Boolean).join(' · ');
        telefone = limpo(c.Telefone_Celular) || limpo(c.Telefone);
    } else if (l) {
        nome = limpo(l.nomeEstabelecimento);
        razao = limpo(l.contato) ? `Contato: ${limpo(l.contato)}` : '';
        cidade = limpo(l.cidade);
        telefone = limpo(l.whatsapp);
    }
    const itens = (a.itens || []).map((i) => ({
        nome: nomeItemAmostra(i.nomeProduto || i.produto?.nome),
        qtd: fmtQtd(i.quantidade),
        un: limpo(i.produto?.unidade) || 'un',
    }));
    return {
        numero: a.numero != null ? `AM#${a.numero}` : 'AM#',
        nome: nome || 'DESTINATÁRIO',
        razao, endereco, cidade, telefone,
        lead: !c && !!l,
        entrega: dataBr(a.dataEntrega),
        vendedor: limpo(a.solicitadoPor?.nome),
        obs: limpo(a.observacao),
        itens,
    };
}

/** Etiqueta 100 × 120 → { estilos, corpo, dados, cortou, itensOcultos }. */
export function montarEtiquetaAmostra(a) {
    const d = dadosEtiquetaAmostra(a);
    // nome do destinatário: até 2 linhas, 10–24pt, na largura útil (100 - 2×4mm de padding - borda)
    const nome = ajustarTexto(d.nome.toLocaleUpperCase('pt-BR'), { larguraMm: 90, alturaMm: 18, maxLinhas: 2, tetoPt: 24, minPt: 10 });
    const linhasNome = nome.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join('');

    // Linhas do destinatário (cada uma em 1 linha, com reticências se passar)
    const linhasDest = [
        d.razao,
        d.endereco,
        d.cidade,
        d.telefone ? `Tel. ${d.telefone}` : '',
        d.lead ? 'Lead (ainda não é cliente)' : '',
    ].filter(Boolean);

    // ── quanto cabe de itens: altura total 120mm menos tudo que é fixo ──
    const PT_MM = 25.4 / 72;
    const mmNome = Math.max(9, nome.linhas.length * nome.pt * 1.05 * PT_MM);
    const mmDest = 2.5 + 1.5 + mmNome + linhasDest.length * 4.1;
    const mmObs = d.obs ? 11.5 : 0;
    const disponivel = 120 - 1 /*borda*/ - 12 /*faixa*/ - mmDest - 11.5 /*datas*/ - 2.5 - 0.6 - 5.2 /*itens: margem+linha+cabeçalho*/ - mmObs - 5.2 /*rodapé*/ - 1.5 /*folga*/;
    const n = d.itens.length;
    // acima de 8 itens a lista vai em 2 colunas (letra maior do que espremer tudo numa coluna só)
    const colunas = n > 8 ? 2 : 1;
    const linhasPorColuna = Math.ceil(n / colunas);
    // altura de uma linha de item = fonte × (entrelinha 1.1 + 2 × 0.28 de respiro) + filete
    const mmLinha = (pt) => pt * (1.1 + 0.56) * PT_MM + 0.25;
    let ptItem = 12;
    while (ptItem > 6 && linhasPorColuna * mmLinha(ptItem) > disponivel) ptItem -= 0.5;
    let itens = d.itens;
    let itensOcultos = 0;
    const cabem = Math.max(1, Math.floor(disponivel / mmLinha(ptItem))) * colunas;
    if (n > cabem) {                      // nem a 6pt coube tudo: mostra os primeiros e avisa quantos faltam
        itensOcultos = n - (cabem - 1);
        itens = d.itens.slice(0, cabem - 1);
    }
    const linhaItem = (i) => `<div class="it"><span class="nm">${escaparHtml(i.nome)}</span><span class="qt">${escaparHtml(i.qtd)} ${escaparHtml(i.un)}</span></div>`;
    let itensHtml;
    if (!n) itensHtml = '<div class="it vazio">Sem itens</div>';
    else if (colunas === 1) itensHtml = itens.map(linhaItem).join('');
    else {
        const porCol = Math.ceil(itens.length / 2);
        itensHtml = `<div class="col">${itens.slice(0, porCol).map(linhaItem).join('')}</div><div class="col">${itens.slice(porCol).map(linhaItem).join('')}</div>`;
    }
    if (itensOcultos) itensHtml += `<div class="it mais">+ ${itensOcultos} itens — ver o pedido AM#${escaparHtml(String(a?.numero ?? ''))}</div>`;

    const corpo = `<div class="etq amostra">
        <div class="faixa"><span class="tit">AMOSTRA</span><span class="num">${escaparHtml(d.numero)}</span></div>
        <div class="dest">
            <div class="nome" style="font-size:${nome.pt}pt">${linhasNome}</div>
            ${linhasDest.map((l) => `<div class="end">${escaparHtml(l)}</div>`).join('')}
        </div>
        <div class="datas">
            <div class="dt"><div class="rot">ENTREGA</div><div class="vl">${escaparHtml(d.entrega || '—')}</div></div>
            <div class="dt"><div class="rot">PEDIDO POR</div><div class="vl vd">${escaparHtml(d.vendedor || '—')}</div></div>
        </div>
        <div class="itens">
            <div class="cab"><span>ITENS DA AMOSTRA</span><span>${n} ite${n === 1 ? 'm' : 'ns'}</span></div>
            <div class="lista${colunas === 2 ? ' duas' : ''}" style="font-size:${ptItem}pt">${itensHtml}</div>
        </div>
        ${d.obs ? `<div class="obs"><b>OBS:</b> ${escaparHtml(d.obs)}</div>` : ''}
        <div class="rod">SEM VALOR COMERCIAL · HARDT DOCES E SALGADOS · ${hojeBr()}</div>
    </div>`;

    const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.amostra { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA}; display: flex; flex-direction: column; border: 0.5mm solid #000; }
        /* SEM área preta cheia: tarja sólida gruda o ribbon da Zebra. Só texto + linha grossa embaixo. */
        #area-impressao .amostra .faixa { background: #fff; color: #000; height: 12mm; flex: none; padding: 0 4mm; box-sizing: border-box;
            border-bottom: 0.9mm solid #000; display: flex; align-items: center; justify-content: space-between; }
        #area-impressao .amostra .faixa .tit { font-weight: 800; font-size: 16pt; letter-spacing: 0.14em; }
        #area-impressao .amostra .faixa .num { font-weight: 800; font-size: 20pt; letter-spacing: 0.02em; white-space: nowrap; }
        #area-impressao .amostra .dest { flex: none; padding: 2.5mm 4mm 1.5mm; }
        #area-impressao .amostra .nome { font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; min-height: 9mm; }
        #area-impressao .amostra .ln { white-space: nowrap; }
        #area-impressao .amostra .end { font-size: 9.5pt; font-weight: 600; line-height: 4.1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .amostra .datas { flex: none; display: flex; gap: 2.5mm; padding: 1mm 4mm 0; height: 11.5mm; box-sizing: border-box; }
        #area-impressao .amostra .dt { flex: 1; min-width: 0; border: 0.5mm solid #000; padding: 1mm 1.5mm 0; text-align: center; box-sizing: border-box; }
        #area-impressao .amostra .rot { font-size: 7pt; font-weight: 800; letter-spacing: 0.14em; line-height: 1.1; }
        #area-impressao .amostra .vl { font-size: 15pt; font-weight: 800; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .amostra .vl.vd { font-size: 12pt; line-height: 1.35; }
        #area-impressao .amostra .itens { flex: 1; min-height: 0; margin: 2.5mm 4mm 0; border-top: 0.6mm solid #000; display: flex; flex-direction: column; overflow: hidden; }
        #area-impressao .amostra .cab { flex: none; display: flex; justify-content: space-between; font-size: 7.5pt; font-weight: 800; letter-spacing: 0.14em; height: 5.2mm; box-sizing: border-box; padding-top: 1.2mm; }
        #area-impressao .amostra .lista { flex: 1; min-height: 0; overflow: hidden; font-weight: 700; line-height: 1.1; }
        #area-impressao .amostra .lista.duas { display: flex; flex-wrap: wrap; gap: 0 3mm; align-content: flex-start; }
        #area-impressao .amostra .lista.duas .col { flex: 1; min-width: 0; }
        #area-impressao .amostra .lista.duas .it.mais { flex: 0 0 100%; }
        #area-impressao .amostra .it { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; padding: 0.28em 0; border-bottom: 0.25mm solid #000; }
        #area-impressao .amostra .it:last-child { border-bottom: 0; }
        #area-impressao .amostra .it .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        #area-impressao .amostra .it .qt { flex: none; font-weight: 800; white-space: nowrap; }
        #area-impressao .amostra .it.vazio, #area-impressao .amostra .it.mais { justify-content: center; font-weight: 600; border: 0; }
        #area-impressao .amostra .obs { flex: none; margin: 1.5mm 4mm 0; font-size: 8.5pt; font-weight: 600; line-height: 1.2; height: 10mm; overflow: hidden; }
        #area-impressao .amostra .obs b { font-weight: 800; }
        #area-impressao .amostra .rod { flex: none; font-size: 6.5pt; font-weight: 600; text-align: center; height: 5.2mm; box-sizing: border-box; padding-top: 1.4mm; letter-spacing: 0.03em; white-space: nowrap; }
    `;
    return { estilos, corpo, dados: d, cortou: !!nome.cortou, itensOcultos };
}

// ─── Rasterização para a fila (Zebra), igual à pasta do RH ───────────────────
const erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });

/** Amostra → { bitmaps:[1] } (800×960). As cópias vão no corpo do pedido (copias). */
export async function prepararEtiquetaAmostra(a) {
    await carregarFontesFuncionario();
    const montada = montarEtiquetaAmostra(a);
    const R = await import('../PCP/etiquetaRaster');
    const r = await R.rasterizarEtiquetas({ itens: [{ html: montada.corpo, estilos: montada.estilos, seletorCelula: '.etq', larguraMm: 100, alturaMm: 120 }] });
    const bm = r.bitmaps[0];
    if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
    return { bitmaps: [await R.empacotarParaEnvio(bm)] };
}
