/**
 * DANFE simplificada em HTML (print-friendly) montada a partir do parse do XML da NF-e.
 *
 * Função PURA e testável offline: recebe o objeto do parseProcNFe (sefazDfeService)
 * e devolve uma string HTML de CORPO (com <style> inline, SEM <script>). O frontend
 * imprime com o padrão @media print da própria página.
 */

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fmtMoeda = (v) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtNum = (v, casas = 4) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas });
};

const fmtChave = (chave) => {
    const s = String(chave || '').replace(/\D/g, '');
    return s.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

const fmtCnpj = (v) => {
    const s = String(v || '').replace(/\D/g, '');
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s || '';
};

const fmtData = (v) => {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR');
};

const fmtEndereco = (e = {}) => {
    const partes = [];
    const l1 = [e.logradouro, e.numero].filter(Boolean).join(', ');
    if (l1) partes.push(l1);
    if (e.bairro) partes.push(e.bairro);
    const cid = [e.municipio, e.uf].filter(Boolean).join(' - ');
    if (cid) partes.push(cid);
    if (e.cep) partes.push('CEP ' + e.cep);
    return partes.join(' · ');
};

/**
 * Monta o HTML da DANFE simplificada.
 * @param {object} nota  resultado do parseProcNFe (com emitente, destinatario, itens, duplicatas)
 * @returns {string} HTML de corpo (com <style> inline)
 */
function montarDanfeHtml(nota) {
    const emit = nota.emitente || {};
    const dest = nota.destinatario || {};
    const itens = Array.isArray(nota.itens) ? nota.itens : [];
    const dups = Array.isArray(nota.duplicatas) ? nota.duplicatas : [];

    const linhasItens = itens.map((it) => `
        <tr>
          <td class="c">${esc(it.codigoFornecedor)}</td>
          <td>${esc(it.descricao)}${it.infAdProd ? `<div class="obs-item">${esc(it.infAdProd)}</div>` : ''}</td>
          <td class="c">${esc(it.ncm || '')}</td>
          <td class="c">${esc(it.cfop || '')}</td>
          <td class="c">${esc(it.unidade || '')}</td>
          <td class="r">${esc(fmtNum(it.quantidade))}</td>
          <td class="r">${esc(fmtNum(it.valorUnitario, 6))}</td>
          <td class="r">${esc(fmtMoeda(it.valorTotal))}</td>
        </tr>`).join('');

    const linhasDups = dups.map((d) => `
        <tr>
          <td class="c">${esc(d.numero || '')}</td>
          <td class="c">${esc(fmtData(d.vencimento))}</td>
          <td class="r">${esc(fmtMoeda(d.valor))}</td>
        </tr>`).join('');

    const blocoDups = dups.length ? `
      <div class="sec-titulo">Faturas / Duplicatas</div>
      <table class="tbl">
        <thead><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th></tr></thead>
        <tbody>${linhasDups}</tbody>
      </table>` : '';

    const blocoObs = nota.infComplementar ? `
      <div class="sec-titulo">Informações Complementares</div>
      <div class="obs">${esc(nota.infComplementar).replace(/\n/g, '<br>')}</div>` : '';

    return `
<style>
  .danfe { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; max-width: 820px; margin: 0 auto; }
  .danfe * { box-sizing: border-box; }
  .danfe .box { border: 1px solid #000; padding: 6px 8px; }
  .danfe .top { display: flex; gap: 8px; align-items: stretch; }
  .danfe .emit { flex: 2; }
  .danfe .selo { flex: 1; text-align: center; border-left: 1px solid #000; padding-left: 8px; }
  .danfe .selo .danfe-nome { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .danfe .emit-nome { font-size: 13px; font-weight: bold; }
  .danfe .lin { margin: 1px 0; }
  .danfe .chave { font-family: 'Courier New', monospace; font-size: 10px; word-break: break-all; margin-top: 4px; }
  .danfe .sec-titulo { font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: .5px;
      background: #eee; border: 1px solid #000; border-bottom: none; padding: 3px 6px; margin-top: 8px; }
  .danfe .tbl { width: 100%; border-collapse: collapse; }
  .danfe .tbl th, .danfe .tbl td { border: 1px solid #000; padding: 2px 4px; font-size: 9px; vertical-align: top; }
  .danfe .tbl th { background: #eee; text-align: left; }
  .danfe .tbl td.c, .danfe .tbl th.c { text-align: center; }
  .danfe .tbl td.r, .danfe .tbl th.r { text-align: right; white-space: nowrap; }
  .danfe .obs-item { color: #444; font-size: 8px; margin-top: 1px; }
  .danfe .obs { border: 1px solid #000; padding: 5px 6px; font-size: 9px; white-space: pre-wrap; }
  .danfe .totais { display: flex; gap: 8px; margin-top: 8px; }
  .danfe .totais .box { flex: 1; text-align: right; }
  .danfe .totais .rot { font-size: 8px; text-transform: uppercase; color: #333; display: block; text-align: right; }
  .danfe .totais .val { font-size: 12px; font-weight: bold; }
  .danfe .grid2 { display: flex; gap: 8px; }
  .danfe .grid2 > div { flex: 1; }
</style>
<div class="danfe">
  <div class="top box">
    <div class="emit">
      <div class="emit-nome">${esc(emit.nome || emit.fantasia || '')}</div>
      ${emit.fantasia && emit.fantasia !== emit.nome ? `<div class="lin">${esc(emit.fantasia)}</div>` : ''}
      <div class="lin">${esc(fmtEndereco(emit))}</div>
      <div class="lin">CNPJ: ${esc(fmtCnpj(emit.cnpj))}${emit.ie ? ` · IE: ${esc(emit.ie)}` : ''}${emit.telefone ? ` · Fone: ${esc(emit.telefone)}` : ''}</div>
    </div>
    <div class="selo">
      <div class="danfe-nome">DANFE</div>
      <div class="lin">Documento Auxiliar da NF-e</div>
      <div class="lin"><b>Nº ${esc(nota.numero || 's/nº')}</b> · Série ${esc(nota.serie || '')}</div>
      <div class="lin">Emissão: ${esc(fmtData(nota.emissao))}</div>
      <div class="lin">Valor total: R$ ${esc(fmtMoeda(nota.valorTotal))}</div>
    </div>
  </div>
  <div class="box" style="border-top:none;">
    <div class="lin"><b>Chave de acesso:</b> <span class="chave">${esc(fmtChave(nota.chave))}</span></div>
    <div class="lin"><b>Natureza da operação:</b> ${esc(nota.naturezaOperacao || '')}</div>
  </div>

  <div class="sec-titulo">Destinatário</div>
  <div class="box" style="border-top:none;">
    <div class="lin"><b>${esc(dest.nome || '')}</b></div>
    <div class="lin">${esc(fmtEndereco(dest))}</div>
    <div class="lin">CNPJ/CPF: ${esc(fmtCnpj(dest.cnpj))}${dest.ie ? ` · IE: ${esc(dest.ie)}` : ''}</div>
  </div>

  <div class="sec-titulo">Produtos / Serviços</div>
  <table class="tbl">
    <thead>
      <tr>
        <th class="c">Código</th>
        <th>Descrição</th>
        <th class="c">NCM</th>
        <th class="c">CFOP</th>
        <th class="c">Un</th>
        <th class="r">Qtd</th>
        <th class="r">V. Unit.</th>
        <th class="r">V. Total</th>
      </tr>
    </thead>
    <tbody>${linhasItens || '<tr><td colspan="8" class="c">Nota sem itens de produto.</td></tr>'}</tbody>
  </table>

  <div class="totais">
    <div class="box"><span class="rot">Valor dos produtos</span><span class="val">R$ ${esc(fmtMoeda(nota.valorProdutos))}</span></div>
    <div class="box"><span class="rot">Frete</span><span class="val">R$ ${esc(fmtMoeda(nota.valorFrete ?? 0))}</span></div>
    <div class="box"><span class="rot">Desconto</span><span class="val">R$ ${esc(fmtMoeda(nota.valorDesconto ?? 0))}</span></div>
    <div class="box"><span class="rot">Total da nota</span><span class="val">R$ ${esc(fmtMoeda(nota.valorTotal))}</span></div>
  </div>

  ${blocoDups}
  ${blocoObs}
</div>`;
}

module.exports = { montarDanfeHtml };
