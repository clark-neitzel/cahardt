// src/utils/imprimirNaPagina.js
function escaparHtml(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// src/pages/RH/etiquetasFuncionario.js
var PILHA = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";
var MM_PX = 96 / 25.4;
var FONTES_FUNCIONARIO = ["800 12pt Manrope", "700 12pt Manrope", "600 12pt Manrope"];
async function carregarFontesFuncionario() {
  try {
    await Promise.all(FONTES_FUNCIONARIO.map((f) => document.fonts.load(f).catch(() => {
    })));
    await document.fonts.ready;
  } catch {
  }
}
var _ctx;
function larguraPx100(texto, peso) {
  try {
    if (_ctx === void 0) _ctx = typeof document !== "undefined" && document.createElement("canvas").getContext("2d") || null;
    if (!_ctx) return null;
    _ctx.font = `${peso} 100px ${PILHA}`;
    const w = _ctx.measureText(texto).width;
    return w > 0 ? w : null;
  } catch {
    return null;
  }
}
var larguraEm = (texto, peso) => {
  const w = larguraPx100(texto, peso);
  return w ? w / 100 : texto.length * 0.62;
};
function ajustarTexto(texto, { larguraMm, alturaMm, maxLinhas, tetoPt, minPt, peso = 800, entrelinha = 1.05 }) {
  const t = String(texto || "").trim().replace(/\s+/g, " ");
  if (!t) return { pt: tetoPt, linhas: [] };
  const palavras = t.split(" ");
  const wMax = larguraMm * MM_PX;
  for (let pt = tetoPt; pt >= minPt - 1e-3; pt -= 0.5) {
    const px2 = pt / 0.75;
    const cabe = (s) => larguraEm(s, peso) * px2 <= wMax;
    const linhas2 = [];
    let atual2 = "";
    let ok = true;
    for (const p of palavras) {
      const tent = atual2 ? `${atual2} ${p}` : p;
      if (cabe(tent)) {
        atual2 = tent;
        continue;
      }
      if (!atual2) {
        ok = false;
        break;
      }
      linhas2.push(atual2);
      atual2 = p;
      if (!cabe(atual2)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    linhas2.push(atual2);
    if (linhas2.length > maxLinhas) continue;
    if (linhas2.length * pt * entrelinha * (25.4 / 72) > alturaMm) continue;
    return { pt, linhas: linhas2 };
  }
  const px = minPt / 0.75;
  const linhas = [];
  let atual = "";
  for (const p of palavras) {
    const tent = atual ? `${atual} ${p}` : p;
    if (larguraEm(tent, peso) * px <= wMax || !atual) atual = tent;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  linhas.push(atual);
  return { pt: minPt, linhas: linhas.slice(0, maxLinhas), cortou: linhas.length > maxLinhas };
}

// src/pages/Pedidos/etiquetaAmostra.js
var PILHA2 = "Manrope, 'SF Pro Text', Arial, Helvetica, sans-serif";
var dataBr = (v) => {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  const d = new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("pt-BR");
};
var hojeBr = () => (/* @__PURE__ */ new Date()).toLocaleDateString("pt-BR");
var limpo = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
var normNome = (t) => limpo(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
var nomeItemAmostra = (nome) => limpo(nome).replace(/^amostra\s*[-–:]\s*/i, "");
var fmtQtd = (q) => {
  const n = Number(q);
  if (!isFinite(n)) return String(q ?? "");
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
};
function dadosEtiquetaAmostra(a = {}) {
  const c = a.cliente || null;
  const l = a.lead || null;
  let nome = "", razao = "", endereco = "", cidade = "", telefone = "";
  if (c) {
    const fant = limpo(c.NomeFantasia);
    const raz = limpo(c.Nome);
    nome = fant || raz;
    razao = fant && raz && normNome(fant) !== normNome(raz) ? raz : "";
    endereco = [limpo(c.End_Logradouro), limpo(c.End_Numero)].filter(Boolean).join(", ");
    cidade = [limpo(c.End_Bairro), limpo(c.End_Cidade)].filter(Boolean).join(" \xB7 ");
    telefone = limpo(c.Telefone_Celular) || limpo(c.Telefone);
  } else if (l) {
    nome = limpo(l.nomeEstabelecimento);
    razao = limpo(l.contato) ? `Contato: ${limpo(l.contato)}` : "";
    cidade = limpo(l.cidade);
    telefone = limpo(l.whatsapp);
  }
  const itens = (a.itens || []).map((i) => ({
    nome: nomeItemAmostra(i.nomeProduto || i.produto?.nome),
    qtd: fmtQtd(i.quantidade),
    un: limpo(i.produto?.unidade) || "un"
  }));
  return {
    numero: a.numero != null ? `AM#${a.numero}` : "AM#",
    nome: nome || "DESTINAT\xC1RIO",
    razao,
    endereco,
    cidade,
    telefone,
    lead: !c && !!l,
    entrega: dataBr(a.dataEntrega),
    vendedor: limpo(a.solicitadoPor?.nome),
    obs: limpo(a.observacao),
    itens
  };
}
function montarEtiquetaAmostra(a) {
  const d = dadosEtiquetaAmostra(a);
  const nome = ajustarTexto(d.nome.toLocaleUpperCase("pt-BR"), { larguraMm: 90, alturaMm: 18, maxLinhas: 2, tetoPt: 24, minPt: 10 });
  const linhasNome = nome.linhas.map((l) => `<div class="ln">${escaparHtml(l)}</div>`).join("");
  const linhasDest = [
    d.razao,
    d.endereco,
    d.cidade,
    d.telefone ? `Tel. ${d.telefone}` : "",
    d.lead ? "Lead (ainda n\xE3o \xE9 cliente)" : ""
  ].filter(Boolean);
  const PT_MM = 25.4 / 72;
  const mmNome = Math.max(9, nome.linhas.length * nome.pt * 1.05 * PT_MM);
  const mmDest = 2.5 + 1.5 + mmNome + linhasDest.length * 4.1;
  const mmObs = d.obs ? 11.5 : 0;
  const disponivel = 120 - 1 - 12 - mmDest - 11.5 - 2.5 - 0.6 - 5.2 - mmObs - 5.2 - 1.5;
  const n = d.itens.length;
  const colunas = n > 8 ? 2 : 1;
  const linhasPorColuna = Math.ceil(n / colunas);
  const mmLinha = (pt) => pt * (1.1 + 0.56) * PT_MM + 0.25;
  let ptItem = 12;
  while (ptItem > 6 && linhasPorColuna * mmLinha(ptItem) > disponivel) ptItem -= 0.5;
  let itens = d.itens;
  let itensOcultos = 0;
  const cabem = Math.max(1, Math.floor(disponivel / mmLinha(ptItem))) * colunas;
  if (n > cabem) {
    itensOcultos = n - (cabem - 1);
    itens = d.itens.slice(0, cabem - 1);
  }
  const linhaItem = (i) => `<div class="it"><span class="nm">${escaparHtml(i.nome)}</span><span class="qt">${escaparHtml(i.qtd)} ${escaparHtml(i.un)}</span></div>`;
  let itensHtml;
  if (!n) itensHtml = '<div class="it vazio">Sem itens</div>';
  else if (colunas === 1) itensHtml = itens.map(linhaItem).join("");
  else {
    const porCol = Math.ceil(itens.length / 2);
    itensHtml = `<div class="col">${itens.slice(0, porCol).map(linhaItem).join("")}</div><div class="col">${itens.slice(porCol).map(linhaItem).join("")}</div>`;
  }
  if (itensOcultos) itensHtml += `<div class="it mais">+ ${itensOcultos} itens \u2014 ver o pedido AM#${escaparHtml(String(a?.numero ?? ""))}</div>`;
  const corpo = `<div class="etq amostra">
        <div class="faixa"><span class="tit">AMOSTRA</span><span class="num">${escaparHtml(d.numero)}</span></div>
        <div class="dest">
            <div class="nome" style="font-size:${nome.pt}pt">${linhasNome}</div>
            ${linhasDest.map((l) => `<div class="end">${escaparHtml(l)}</div>`).join("")}
        </div>
        <div class="datas">
            <div class="dt"><div class="rot">ENTREGA</div><div class="vl">${escaparHtml(d.entrega || "\u2014")}</div></div>
            <div class="dt"><div class="rot">PEDIDO POR</div><div class="vl vd">${escaparHtml(d.vendedor || "\u2014")}</div></div>
        </div>
        <div class="itens">
            <div class="cab"><span>ITENS DA AMOSTRA</span><span>${n} ite${n === 1 ? "m" : "ns"}</span></div>
            <div class="lista${colunas === 2 ? " duas" : ""}" style="font-size:${ptItem}pt">${itensHtml}</div>
        </div>
        ${d.obs ? `<div class="obs"><b>OBS:</b> ${escaparHtml(d.obs)}</div>` : ""}
        <div class="rod">SEM VALOR COMERCIAL \xB7 HARDT DOCES E SALGADOS \xB7 ${hojeBr()}</div>
    </div>`;
  const estilos = `
        #area-impressao { color: #000; }
        #area-impressao .etq.amostra { width: 100mm; height: 120mm; box-sizing: border-box; background: #fff; color: #000; overflow: hidden;
            font-family: ${PILHA2}; display: flex; flex-direction: column; border: 0.5mm solid #000; }
        /* SEM \xE1rea preta cheia: tarja s\xF3lida gruda o ribbon da Zebra. S\xF3 texto + linha grossa embaixo. */
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
var erroLocal = (msg) => Object.assign(new Error(msg), { semRetentativa: true });
async function prepararEtiquetaAmostra(a) {
  await carregarFontesFuncionario();
  const montada = montarEtiquetaAmostra(a);
  const R = await import("../PCP/etiquetaRaster");
  const r = await R.rasterizarEtiquetas({ itens: [{ html: montada.corpo, estilos: montada.estilos, seletorCelula: ".etq", larguraMm: 100, alturaMm: 120 }] });
  const bm = r.bitmaps[0];
  if (!bm || bm.larguraDots !== 800 || bm.alturaDots !== 960) throw erroLocal('A imagem da etiqueta saiu com tamanho inesperado. Use "Imprimir pelo navegador".');
  return { bitmaps: [await R.empacotarParaEnvio(bm)] };
}
export {
  dadosEtiquetaAmostra,
  montarEtiquetaAmostra,
  nomeItemAmostra,
  prepararEtiquetaAmostra
};
