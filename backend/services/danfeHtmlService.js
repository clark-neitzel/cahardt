/**
 * DANFE OFICIAL (NF-e modelo 55 / NFC-e modelo 65) em HTML print-friendly.
 *
 * Layout fiel ao Manual de Orientação do Contribuinte, montado a partir do XML
 * COMPLETO da nota (não do subconjunto salvo no banco). A função é PURA e
 * testável offline: recebe a STRING do XML, parseia tudo com fast-xml-parser
 * internamente, e devolve uma string HTML de CORPO (com <style> inline, SEM
 * <script>). O frontend injeta o HTML na própria página e imprime com o padrão
 * @media print (não usar window.open nem iframe).
 *
 * Robustez total: protege todo acesso a campos; XML pode vir com/sem namespace,
 * com nfeProc externo ou NFe direto, arrays que às vezes são objeto único.
 * Degrada sem lançar — na pior das hipóteses mostra os blocos que conseguiu ler.
 */

const { XMLParser } = require('fast-xml-parser');

// Parser dedicado — mesma config do sefazDfeService (strings, preserva zeros à esquerda).
const _parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    trimValues: true,
    // remove prefixo de namespace de tags/atributos (ex.: ns2:NFe → NFe) por robustez
    removeNSPrefix: true
});

// ─────────────────────────────────────────────────────────────
// Helpers de formatação / acesso seguro
// ─────────────────────────────────────────────────────────────

const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toArray = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]));
const soDigitos = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const S = (v) => (v == null ? '' : String(v).trim()); // string segura (nunca "undefined")

// Moeda pt-BR (2 casas). Vazio vira ''.
const fmtMoeda = (v) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Número genérico (default 4 casas — quantidades/valores unitários).
const fmtNum = (v, casas = 4) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas });
};

// Alíquota (%) — até 4 casas mas sem zeros supérfluos exagerados.
const fmtPerc = (v) => {
    if (v == null || v === '') return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtChave = (chave) => soDigitos(chave).replace(/(\d{4})(?=\d)/g, '$1 ').trim();

const fmtCnpjCpf = (v) => {
    const s = soDigitos(v);
    if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s || '';
};

const fmtCep = (v) => {
    const s = soDigitos(v);
    if (s.length === 8) return s.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    return s || '';
};

const fmtFone = (v) => {
    const s = soDigitos(v);
    if (s.length === 11) return s.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    if (s.length === 10) return s.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    if (s.length === 9) return s.replace(/^(\d{5})(\d{4})$/, '$1-$2');
    if (s.length === 8) return s.replace(/^(\d{4})(\d{4})$/, '$1-$2');
    return s || '';
};

// Data DD/MM/YYYY a partir de dhEmi (com TZ) ou dEmi (só data).
const fmtData = (v) => {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
};

// Data + hora DD/MM/YYYY HH:MM:SS (para protocolo / dhRecbto).
const fmtDataHora = (v) => {
    if (!v) return '';
    const s = String(v);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
    return fmtData(v);
};

// Hora HH:MM:SS a partir de dhEmi.
const fmtHora = (v) => {
    if (!v) return '';
    const m = String(v).match(/T(\d{2}):(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}:${m[3]}` : '';
};

// Descrições por código do MOC
const TP_NF = { '0': '0 - ENTRADA', '1': '1 - SAÍDA' };
const MOD_FRETE = {
    '0': '0 - Por conta do Emitente',
    '1': '1 - Por conta do Destinatário',
    '2': '2 - Por conta de Terceiros',
    '3': '3 - Transporte Próprio (Remetente)',
    '4': '4 - Transporte Próprio (Destinatário)',
    '9': '9 - Sem Frete'
};

// ─────────────────────────────────────────────────────────────
// Code128-C server-side (renderiza barras como <span> pretos/brancos).
// A chave são 44 dígitos → Code128-C codifica pares de dígitos.
// Start C = 105, checksum = módulo 103, Stop = 106.
// ─────────────────────────────────────────────────────────────

// Larguras (em módulos) de cada um dos 107 padrões Code128 (índices 0..106).
// Cada string tem 6 dígitos: barra, espaço, barra, espaço, barra, espaço.
const CODE128_PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
    '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
    '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
    '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
    '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
    '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
    '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
    '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
    '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
    '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
    '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
    '211214', '211232', '2331112'
];

const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Gera os "valores" Code128-C de uma string só de dígitos.
 * Se ímpar, faz o encoding do resto — mas a chave da NF-e é sempre par (44 díg).
 * Retorna a lista de índices de padrão (Start C, dados, checksum, Stop).
 */
function code128cValues(digits) {
    const d = soDigitos(digits);
    if (!d || d.length % 2 !== 0) throw new Error('Code128-C requer número par de dígitos.');
    const values = [CODE128_START_C];
    for (let i = 0; i < d.length; i += 2) {
        values.push(parseInt(d.substr(i, 2), 10)); // par de dígitos → valor 0..99
    }
    // Checksum módulo 103: soma ponderada (Start peso 1, 1º dado peso 1, 2º peso 2, ...)
    let soma = CODE128_START_C;
    for (let i = 1; i < values.length; i++) soma += values[i] * i;
    values.push(soma % 103);
    values.push(CODE128_STOP);
    return values;
}

/**
 * Renderiza um código de barras Code128-C da chave como HTML (barras em <span>).
 * Lança se algo der errado — o chamador captura e cai no fallback textual.
 */
function code128Barras(chave) {
    const d = soDigitos(chave);
    if (d.length !== 44) throw new Error('Chave deve ter 44 dígitos.');
    const values = code128cValues(d);
    let barras = '';
    for (const v of values) {
        const p = CODE128_PATTERNS[v];
        if (!p) throw new Error('Padrão Code128 inexistente: ' + v);
        for (let i = 0; i < p.length; i++) {
            const larg = parseInt(p[i], 10); // largura em módulos
            const cor = (i % 2 === 0) ? '#000' : '#fff'; // par = barra preta, ímpar = espaço
            barras += `<span style="display:inline-block;width:${larg}px;height:100%;background:${cor}"></span>`;
        }
    }
    return `<div class="barcode" aria-label="Código de barras da chave de acesso">${barras}</div>`;
}

// Fallback seguro: chave em fonte monoespaçada grande (aparência de código).
function barcodeFallback(chave) {
    return `<div class="barcode-fallback">${esc(fmtChave(chave))}</div>`;
}

function renderBarcode(chave) {
    try {
        return code128Barras(chave);
    } catch (_) {
        return barcodeFallback(chave);
    }
}

// ─────────────────────────────────────────────────────────────
// Extração dos dados do XML (tolerante a variações)
// ─────────────────────────────────────────────────────────────

function extrairNota(xmlString) {
    let doc;
    try {
        doc = _parser.parse(String(xmlString || ''));
    } catch (e) {
        throw new Error('XML inválido: ' + e.message);
    }
    // nfeProc/procNFe externos ou NFe/infNFe direto
    const raiz = doc.nfeProc || doc.procNFe || doc;
    const nfe = raiz.NFe || doc.NFe || raiz;
    const inf = nfe && nfe.infNFe;
    if (!inf) throw new Error('XML não contém infNFe (não é uma NF-e/NFC-e válida).');

    const prot = raiz.protNFe && raiz.protNFe.infProt ? raiz.protNFe.infProt : {};
    const chave = soDigitos(prot.chNFe) || soDigitos(inf['@_Id']);

    return { doc, raiz, nfe, inf, prot, chave };
}

// ─────────────────────────────────────────────────────────────
// Blocos de layout — cada um recebe os pedaços do XML e devolve HTML
// ─────────────────────────────────────────────────────────────

// Célula rotulada padrão DANFE (label pequeno em cima, valor embaixo).
const campo = (label, valor, extra = '') =>
    `<div class="campo" style="${extra}"><span class="lbl">${esc(label)}</span><span class="val">${valor == null || valor === '' ? '&nbsp;' : esc(valor)}</span></div>`;

// Igual, mas o valor já é HTML confiável (não escapa).
const campoHtml = (label, htmlVal, extra = '') =>
    `<div class="campo" style="${extra}"><span class="lbl">${esc(label)}</span><span class="val">${htmlVal || '&nbsp;'}</span></div>`;

function blocoCanhoto(emit, ide, nNF, serie) {
    return `
  <div class="canhoto">
    <div class="canhoto-txt">
      <div class="lbl">RECEBEMOS DE ${esc(S(emit.xNome))} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO</div>
      <div class="canhoto-rec">
        <div class="campo" style="flex:0 0 42%;border-right:1px solid #000;"><span class="lbl">DATA DE RECEBIMENTO</span><span class="val">&nbsp;</span></div>
        <div class="campo" style="flex:1;"><span class="lbl">IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</span><span class="val">&nbsp;</span></div>
      </div>
    </div>
    <div class="canhoto-nfe">
      <div class="canhoto-nfe-num">NF-e</div>
      <div>Nº ${esc(nNF || '')}</div>
      <div>SÉRIE ${esc(serie || '')}</div>
    </div>
  </div>
  <div class="tracejado"></div>`;
}

function blocoCabecalho({ emit, enderEmit, ide, chave, nNF, serie }) {
    const tpNF = S(ide.tpNF);
    const linhaTp = ['0', '1'].map((c) => {
        const marc = c === tpNF ? ' marcado' : '';
        return `<span class="tp${marc}">${c}</span>`;
    }).join(' ');

    const endLinha1 = [S(enderEmit.xLgr), S(enderEmit.nro)].filter(Boolean).join(', ')
        + (S(enderEmit.xCpl) ? ' - ' + S(enderEmit.xCpl) : '');
    const endLinha2 = [S(enderEmit.xBairro), S(enderEmit.xMun)].filter(Boolean).join(' - ');
    const endLinha3 = [
        S(enderEmit.UF) ? 'UF: ' + S(enderEmit.UF) : '',
        fmtCep(enderEmit.CEP) ? 'CEP: ' + fmtCep(enderEmit.CEP) : '',
        fmtFone(enderEmit.fone) ? 'Fone: ' + fmtFone(enderEmit.fone) : ''
    ].filter(Boolean).join('   ');

    return `
  <div class="cab">
    <div class="cab-emit">
      <div class="emit-nome">${esc(S(emit.xNome))}</div>
      ${S(emit.xFant) && S(emit.xFant) !== S(emit.xNome) ? `<div class="emit-fant">${esc(S(emit.xFant))}</div>` : ''}
      <div class="emit-end">${esc(endLinha1)}</div>
      <div class="emit-end">${esc(endLinha2)}</div>
      <div class="emit-end">${esc(endLinha3)}</div>
    </div>
    <div class="cab-danfe">
      <div class="danfe-titulo">DANFE</div>
      <div class="danfe-sub">Documento Auxiliar da Nota Fiscal Eletrônica</div>
      <div class="danfe-entsai">
        <div class="entsai-txt">0 - ENTRADA<br>1 - SAÍDA</div>
        <div class="entsai-box">${linhaTp}</div>
      </div>
      <div class="danfe-nums">
        <div><b>Nº</b> ${esc(nNF || '')}</div>
        <div><b>SÉRIE</b> ${esc(serie || '')}</div>
        <div><b>FOLHA</b> 1/1</div>
      </div>
    </div>
    <div class="cab-chave">
      ${renderBarcode(chave)}
      <div class="chave-lbl">CHAVE DE ACESSO</div>
      <div class="chave-val">${esc(fmtChave(chave))}</div>
      <div class="chave-consulta">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal ou no site da Sefaz autorizadora</div>
    </div>
  </div>`;
}

function montarNfe(nota) {
    const { inf, prot, chave } = nota;
    const ide = inf.ide || {};
    const emit = inf.emit || {};
    const enderEmit = emit.enderEmit || {};
    const dest = inf.dest || {};
    const enderDest = dest.enderDest || {};
    const total = (inf.total && inf.total.ICMSTot) || {};
    const issqn = (inf.total && inf.total.ISSQNtot) || {};
    const cobr = inf.cobr || {};
    const fat = cobr.fat || {};
    const transp = inf.transp || {};
    const transporta = transp.transporta || {};
    const veic = transp.veicTransp || {};
    const infAdic = inf.infAdic || {};

    const nNF = S(ide.nNF);
    const serie = S(ide.serie);
    const dets = toArray(inf.det);

    // ── Protocolo ──
    const protTxt = [S(prot.nProt), fmtDataHora(prot.dhRecbto)].filter(Boolean).join(' - ');

    // ── Natureza + protocolo ──
    const blocoNatProt = `
  <div class="grupo-titulo">DADOS DA NF-e</div>
  <div class="linha">
    ${campo('NATUREZA DA OPERAÇÃO', S(ide.natOp), 'flex:2;')}
    ${campo('PROTOCOLO DE AUTORIZAÇÃO DE USO', protTxt, 'flex:1;')}
  </div>
  <div class="linha">
    ${campo('INSCRIÇÃO ESTADUAL', S(emit.IE), 'flex:1;')}
    ${campo('INSC.EST. SUBST. TRIBUT.', S(emit.IEST), 'flex:1;')}
    ${campo('CNPJ / CPF', fmtCnpjCpf(emit.CNPJ || emit.CPF), 'flex:1;')}
    ${S(emit.IM) ? campo('INSCRIÇÃO MUNICIPAL', S(emit.IM), 'flex:1;') : ''}
  </div>`;

    // ── Destinatário / Remetente ──
    const destEnd1 = [S(enderDest.xLgr), S(enderDest.nro)].filter(Boolean).join(', ')
        + (S(enderDest.xCpl) ? ' - ' + S(enderDest.xCpl) : '');
    const blocoDest = `
  <div class="grupo-titulo">DESTINATÁRIO / REMETENTE</div>
  <div class="linha">
    ${campo('NOME / RAZÃO SOCIAL', S(dest.xNome), 'flex:3;')}
    ${campo('CNPJ / CPF', fmtCnpjCpf(dest.CNPJ || dest.CPF), 'flex:1.4;')}
    ${campo('DATA DA EMISSÃO', fmtData(ide.dhEmi || ide.dEmi), 'flex:1;')}
  </div>
  <div class="linha">
    ${campo('ENDEREÇO', destEnd1, 'flex:2.5;')}
    ${campo('BAIRRO / DISTRITO', S(enderDest.xBairro), 'flex:1.2;')}
    ${campo('CEP', fmtCep(enderDest.CEP), 'flex:1;')}
    ${campo('DATA ENT./SAÍDA', fmtData(ide.dhSaiEnt || ide.dSaiEnt), 'flex:1;')}
  </div>
  <div class="linha">
    ${campo('MUNICÍPIO', S(enderDest.xMun), 'flex:2;')}
    ${campo('FONE / FAX', fmtFone(enderDest.fone), 'flex:1.2;')}
    ${campo('UF', S(enderDest.UF), 'flex:0.4;')}
    ${campo('INSCRIÇÃO ESTADUAL', S(dest.IE), 'flex:1.4;')}
    ${campo('HORA ENT./SAÍDA', fmtHora(ide.dhSaiEnt), 'flex:1;')}
  </div>`;

    // ── Fatura / Duplicatas ──
    const dups = toArray(cobr.dup);
    let blocoFatura = '';
    const temFat = S(fat.nFat) || S(fat.vOrig) || S(fat.vLiq);
    if (temFat || dups.length) {
        const cells = [];
        if (temFat) {
            cells.push(campo('FATURA Nº', S(fat.nFat), 'flex:1;'));
            cells.push(campo('VALOR ORIGINAL', fmtMoeda(fat.vOrig), 'flex:1;'));
            cells.push(campo('VALOR DESCONTO', fmtMoeda(fat.vDesc), 'flex:1;'));
            cells.push(campo('VALOR LÍQUIDO', fmtMoeda(fat.vLiq), 'flex:1;'));
        }
        const dupCells = dups.map((d) => {
            const inner = `<div class="dup-num">${esc(S(d.nDup))}</div>`
                + `<div class="dup-venc">${esc(fmtData(d.dVenc))}</div>`
                + `<div class="dup-val">${esc(fmtMoeda(d.vDup))}</div>`;
            return `<div class="dup">${inner}</div>`;
        }).join('');
        blocoFatura = `
  <div class="grupo-titulo">FATURA / DUPLICATAS</div>
  ${temFat ? `<div class="linha">${cells.join('')}</div>` : ''}
  ${dups.length ? `<div class="dups">${dupCells}</div>` : ''}`;
    }

    // ── Cálculo do imposto ──
    const impCel = (l, v) => campo(l, fmtMoeda(v), 'flex:1;');
    let uf_dest = '';
    if (S(total.vICMSUFDest) || S(total.vICMSUFRemet) || S(total.vFCPUFDest)) {
        uf_dest = `
  <div class="linha">
    ${impCel('V. ICMS UF DESTINO', total.vICMSUFDest)}
    ${impCel('V. ICMS UF REMET.', total.vICMSUFRemet)}
    ${impCel('V. FCP UF DESTINO', total.vFCPUFDest)}
    ${impCel('V. TOTAL TRIBUTOS', total.vTotTrib)}
  </div>`;
    }
    const blocoImposto = `
  <div class="grupo-titulo">CÁLCULO DO IMPOSTO</div>
  <div class="linha">
    ${impCel('BASE DE CÁLC. DO ICMS', total.vBC)}
    ${impCel('VALOR DO ICMS', total.vICMS)}
    ${impCel('BASE CÁLC. ICMS ST', total.vBCST)}
    ${impCel('VALOR DO ICMS ST', total.vST)}
    ${impCel('V. IMP. IMPORTAÇÃO', total.vII)}
    ${impCel('V. TOTAL PRODUTOS', total.vProd)}
  </div>
  <div class="linha">
    ${impCel('VALOR DO FRETE', total.vFrete)}
    ${impCel('VALOR DO SEGURO', total.vSeg)}
    ${impCel('DESCONTO', total.vDesc)}
    ${impCel('OUTRAS DESPESAS', total.vOutro)}
    ${impCel('VALOR DO IPI', total.vIPI)}
    ${campoHtml('V. TOTAL DA NOTA', `<b>${esc(fmtMoeda(total.vNF))}</b>`, 'flex:1;')}
  </div>
  ${uf_dest}`;

    // ── Transportador / Volumes ──
    const vols = toArray(transp.vol);
    const modFrete = MOD_FRETE[S(transp.modFrete)] || S(transp.modFrete);
    let blocoTransp = '';
    const temTransp = S(transporta.xNome) || modFrete || vols.length || S(veic.placa);
    if (temTransp) {
        const volLinhas = vols.map((v) => `
    <div class="linha">
      ${campo('QUANTIDADE', S(v.qVol), 'flex:1;')}
      ${campo('ESPÉCIE', S(v.esp), 'flex:1.5;')}
      ${campo('MARCA', S(v.marca), 'flex:1.5;')}
      ${campo('NUMERAÇÃO', S(v.nVol), 'flex:1;')}
      ${campo('PESO LÍQUIDO', fmtNum(v.pesoL, 3), 'flex:1;')}
      ${campo('PESO BRUTO', fmtNum(v.pesoB, 3), 'flex:1;')}
    </div>`).join('');
        blocoTransp = `
  <div class="grupo-titulo">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
  <div class="linha">
    ${campo('NOME / RAZÃO SOCIAL', S(transporta.xNome), 'flex:2.4;')}
    ${campo('FRETE POR CONTA', modFrete, 'flex:1.4;')}
    ${campo('CÓDIGO ANTT', S(veic.RNTC), 'flex:1;')}
    ${campo('PLACA DO VEÍCULO', S(veic.placa), 'flex:1;')}
    ${campo('UF', S(veic.UF), 'flex:0.4;')}
    ${campo('CNPJ / CPF', fmtCnpjCpf(transporta.CNPJ || transporta.CPF), 'flex:1.2;')}
  </div>
  <div class="linha">
    ${campo('ENDEREÇO', S(transporta.xEnder), 'flex:2.4;')}
    ${campo('MUNICÍPIO', S(transporta.xMun), 'flex:1.6;')}
    ${campo('UF', S(transporta.UF), 'flex:0.4;')}
    ${campo('INSCRIÇÃO ESTADUAL', S(transporta.IE), 'flex:1.4;')}
  </div>
  ${volLinhas}`;
    }

    // ── Produtos / Serviços ──
    const linhasItens = dets.map((det) => {
        const prod = (det && det.prod) || {};
        const imp = (det && det.imposto) || {};
        // ICMS: o grupo é ICMS/ICMS00, ICMS10, ... ou ICMSSN101 etc. Pega o primeiro filho.
        const icmsGrupo = imp.ICMS ? (Object.values(imp.ICMS)[0] || {}) : {};
        const ipiGrupo = imp.IPI || {};
        const ipiTrib = ipiGrupo.IPITrib || {};
        const orig = S(icmsGrupo.orig);
        const cst = S(icmsGrupo.CST);
        const csosn = S(icmsGrupo.CSOSN);
        const cstCol = orig ? (orig + (cst || csosn)) : (cst || csosn);
        const infAdProd = S(det && det.infAdProd);
        return `
      <tr>
        <td class="c">${esc(S(prod.cProd))}</td>
        <td>${esc(S(prod.xProd))}${infAdProd ? `<div class="item-obs">${esc(infAdProd)}</div>` : ''}</td>
        <td class="c">${esc(S(prod.NCM))}</td>
        <td class="c">${esc(cstCol)}</td>
        <td class="c">${esc(S(prod.CFOP))}</td>
        <td class="c">${esc(S(prod.uCom))}</td>
        <td class="r">${esc(fmtNum(prod.qCom))}</td>
        <td class="r">${esc(fmtNum(prod.vUnCom, 4))}</td>
        <td class="r">${esc(fmtMoeda(prod.vProd))}</td>
        <td class="r">${esc(fmtMoeda(icmsGrupo.vBC))}</td>
        <td class="r">${esc(fmtMoeda(icmsGrupo.vICMS))}</td>
        <td class="r">${esc(fmtMoeda(ipiTrib.vIPI))}</td>
        <td class="r">${esc(fmtPerc(icmsGrupo.pICMS))}</td>
        <td class="r">${esc(fmtPerc(ipiTrib.pIPI))}</td>
      </tr>`;
    }).join('');

    const blocoProdutos = `
  <div class="grupo-titulo">DADOS DO PRODUTO / SERVIÇO</div>
  <table class="tbl-prod">
    <thead>
      <tr>
        <th class="c">CÓDIGO</th>
        <th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
        <th class="c">NCM/SH</th>
        <th class="c">CST</th>
        <th class="c">CFOP</th>
        <th class="c">UN</th>
        <th class="r">QUANT.</th>
        <th class="r">VLR. UNIT.</th>
        <th class="r">VLR. TOTAL</th>
        <th class="r">B.CÁLC ICMS</th>
        <th class="r">VLR. ICMS</th>
        <th class="r">VLR. IPI</th>
        <th class="r">ALÍQ ICMS</th>
        <th class="r">ALÍQ IPI</th>
      </tr>
    </thead>
    <tbody>${linhasItens || '<tr><td colspan="14" class="c">Nota sem itens de produto.</td></tr>'}</tbody>
  </table>`;

    // ── ISSQN ──
    let blocoIssqn = '';
    if (S(issqn.vServ) || S(issqn.vBC) || S(issqn.vISS)) {
        blocoIssqn = `
  <div class="grupo-titulo">CÁLCULO DO ISSQN</div>
  <div class="linha">
    ${campo('INSCRIÇÃO MUNICIPAL', S(emit.IM), 'flex:1;')}
    ${campo('VALOR TOTAL DOS SERVIÇOS', fmtMoeda(issqn.vServ), 'flex:1;')}
    ${campo('BASE DE CÁLCULO DO ISSQN', fmtMoeda(issqn.vBC), 'flex:1;')}
    ${campo('VALOR DO ISSQN', fmtMoeda(issqn.vISS), 'flex:1;')}
  </div>`;
    }

    // ── Dados adicionais ──
    const obsConts = toArray(infAdic.obsCont).map((o) => {
        const campoNome = S(o && o['@_xCampo']);
        const val = S(o && o.xTexto);
        return [campoNome, val].filter(Boolean).join(': ');
    }).filter(Boolean).join(' | ');
    const infCplTxt = [S(infAdic.infCpl), obsConts].filter(Boolean).join(' | ');
    const blocoAdic = `
  <div class="grupo-titulo">DADOS ADICIONAIS</div>
  <div class="linha adic">
    <div class="campo" style="flex:2;"><span class="lbl">INFORMAÇÕES COMPLEMENTARES</span><span class="val-multi">${esc(infCplTxt).replace(/\n/g, '<br>') || '&nbsp;'}</span></div>
    <div class="campo" style="flex:1;"><span class="lbl">RESERVADO AO FISCO</span><span class="val-multi">${esc(S(infAdic.infAdFisco)).replace(/\n/g, '<br>') || '&nbsp;'}</span></div>
  </div>`;

    return `
<div class="danfe">
  ${blocoCanhoto(emit, ide, nNF, serie)}
  ${blocoCabecalho({ emit, enderEmit, ide, chave, nNF, serie })}
  ${blocoNatProt}
  ${blocoDest}
  ${blocoFatura}
  ${blocoImposto}
  ${blocoTransp}
  ${blocoProdutos}
  ${blocoIssqn}
  ${blocoAdic}
</div>`;
}

// ─────────────────────────────────────────────────────────────
// NFC-e (modelo 65) — cupom simplificado
// ─────────────────────────────────────────────────────────────

function montarNfce(nota) {
    const { inf, prot, chave } = nota;
    const ide = inf.ide || {};
    const emit = inf.emit || {};
    const enderEmit = emit.enderEmit || {};
    const dest = inf.dest || {};
    const total = (inf.total && inf.total.ICMSTot) || {};
    const pag = inf.pag || {};
    const dets = toArray(inf.det);

    const endEmit = [
        [S(enderEmit.xLgr), S(enderEmit.nro)].filter(Boolean).join(', '),
        S(enderEmit.xBairro),
        [S(enderEmit.xMun), S(enderEmit.UF)].filter(Boolean).join(' - ')
    ].filter(Boolean).join(' - ');

    const linhasItens = dets.map((det, i) => {
        const prod = (det && det.prod) || {};
        return `
      <tr>
        <td class="c">${esc(S(prod.cProd) || String(i + 1))}</td>
        <td>${esc(S(prod.xProd))}</td>
        <td class="c">${esc(fmtNum(prod.qCom, 3))} ${esc(S(prod.uCom))}</td>
        <td class="r">${esc(fmtNum(prod.vUnCom, 2))}</td>
        <td class="r">${esc(fmtMoeda(prod.vProd))}</td>
      </tr>`;
    }).join('');

    // Pagamentos (detPag pode ser objeto único ou array)
    const T_PAG = {
        '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito', '04': 'Cartão de Débito',
        '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '12': 'Vale Presente',
        '13': 'Vale Combustível', '15': 'Boleto', '17': 'PIX', '90': 'Sem pagamento', '99': 'Outros'
    };
    const pagamentos = toArray(pag.detPag).map((p) => {
        const tp = T_PAG[S(p && p.tPag)] || S(p && p.tPag) || 'Pagamento';
        return `<div class="nfce-pag-linha"><span>${esc(tp)}</span><span>${esc(fmtMoeda(p && p.vPag))}</span></div>`;
    }).join('');

    const protTxt = [S(prot.nProt), fmtDataHora(prot.dhRecbto)].filter(Boolean).join(' - ');
    const infCpl = S((inf.infAdic || {}).infCpl);

    return `
<div class="danfe nfce">
  <div class="nfce-head">
    <div class="nfce-emit">${esc(S(emit.xNome))}</div>
    <div class="nfce-emit-cnpj">CNPJ ${esc(fmtCnpjCpf(emit.CNPJ || emit.CPF))}${S(emit.IE) ? ' &nbsp; IE ' + esc(S(emit.IE)) : ''}</div>
    <div class="nfce-emit-end">${esc(endEmit)}</div>
    <div class="nfce-doc">DANFE NFC-e — Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  </div>
  <table class="tbl-nfce">
    <thead>
      <tr><th class="c">CÓD</th><th>DESCRIÇÃO</th><th class="c">QTD x UN</th><th class="r">VL.UNIT</th><th class="r">VL.TOTAL</th></tr>
    </thead>
    <tbody>${linhasItens || '<tr><td colspan="5" class="c">Sem itens.</td></tr>'}</tbody>
  </table>
  <div class="nfce-tot">
    <div class="nfce-tot-linha"><span>Qtd. total de itens</span><span>${esc(String(dets.length))}</span></div>
    ${S(total.vDesc) && Number(total.vDesc) > 0 ? `<div class="nfce-tot-linha"><span>Descontos</span><span>${esc(fmtMoeda(total.vDesc))}</span></div>` : ''}
    ${S(total.vFrete) && Number(total.vFrete) > 0 ? `<div class="nfce-tot-linha"><span>Frete</span><span>${esc(fmtMoeda(total.vFrete))}</span></div>` : ''}
    <div class="nfce-tot-linha total"><span>VALOR TOTAL R$</span><span>${esc(fmtMoeda(total.vNF))}</span></div>
    ${pagamentos ? `<div class="nfce-pag-titulo">FORMA DE PAGAMENTO</div>${pagamentos}` : ''}
    ${S(total.vTotTrib) ? `<div class="nfce-trib">Valor aproximado dos tributos: R$ ${esc(fmtMoeda(total.vTotTrib))}</div>` : ''}
  </div>
  <div class="nfce-fisco">
    <div><b>NFC-e nº ${esc(S(ide.nNF))} Série ${esc(S(ide.serie))}</b> — Emissão ${esc(fmtDataHora(ide.dhEmi || ide.dEmi))}</div>
    <div class="nfce-chave-lbl">Consulte pela Chave de Acesso em www.nfce.sefaz.br</div>
    ${renderBarcode(chave)}
    <div class="chave-val">${esc(fmtChave(chave))}</div>
    ${protTxt ? `<div class="nfce-prot">Protocolo de autorização: ${esc(protTxt)}</div>` : ''}
    ${S(dest.xNome) || soDigitos(dest.CNPJ || dest.CPF) ? `<div class="nfce-dest">CONSUMIDOR: ${esc(S(dest.xNome))} ${esc(fmtCnpjCpf(dest.CNPJ || dest.CPF))}</div>` : '<div class="nfce-dest">CONSUMIDOR NÃO IDENTIFICADO</div>'}
    ${infCpl ? `<div class="nfce-obs">${esc(infCpl).replace(/\n/g, '<br>')}</div>` : ''}
  </div>
</div>`;
}

// ─────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────

const ESTILO = `
<style>
  .danfe { font-family: Arial, Helvetica, sans-serif; font-size: 8px; color: #000; width: 100%; max-width: 200mm; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .danfe * { box-sizing: border-box; }
  .danfe .lbl { display: block; font-size: 6px; text-transform: uppercase; color: #333; line-height: 1.1; }
  .danfe .val { display: block; font-size: 9px; line-height: 1.2; min-height: 11px; }
  .danfe .val-multi { display: block; font-size: 8px; line-height: 1.3; white-space: pre-wrap; min-height: 40px; }

  /* Canhoto */
  .danfe .canhoto { display: flex; border: 1px solid #000; }
  .danfe .canhoto-txt { flex: 1; }
  .danfe .canhoto-txt > .lbl { padding: 3px 4px; border-bottom: 1px solid #000; font-size: 6.5px; }
  .danfe .canhoto-rec { display: flex; }
  .danfe .canhoto-nfe { flex: 0 0 90px; border-left: 1px solid #000; text-align: center; padding: 4px 2px; font-size: 8px; }
  .danfe .canhoto-nfe-num { font-size: 12px; font-weight: bold; }
  .danfe .tracejado { border-top: 1px dashed #000; margin: 3px 0 5px; }

  /* Cabeçalho */
  .danfe .cab { display: flex; border: 1px solid #000; }
  .danfe .cab-emit { flex: 1.6; padding: 4px 6px; border-right: 1px solid #000; }
  .danfe .emit-nome { font-size: 12px; font-weight: bold; }
  .danfe .emit-fant { font-size: 9px; }
  .danfe .emit-end { font-size: 8px; line-height: 1.35; }
  .danfe .cab-danfe { flex: 0 0 130px; text-align: center; padding: 4px; border-right: 1px solid #000; }
  .danfe .danfe-titulo { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .danfe .danfe-sub { font-size: 6.5px; line-height: 1.1; margin-bottom: 3px; }
  .danfe .danfe-entsai { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 3px 0; }
  .danfe .entsai-txt { font-size: 7px; text-align: left; }
  .danfe .entsai-box .tp { display: inline-block; border: 1px solid #000; width: 14px; height: 16px; line-height: 16px; text-align: center; font-size: 9px; }
  .danfe .entsai-box .tp.marcado { font-weight: bold; background: #000; color: #fff; }
  .danfe .danfe-nums { font-size: 9px; margin-top: 2px; }
  .danfe .cab-chave { flex: 1.5; padding: 4px 6px; text-align: center; }
  .danfe .barcode { display: flex; align-items: stretch; height: 40px; margin: 0 auto 3px; width: fit-content; max-width: 100%; }
  .danfe .barcode-fallback { font-family: 'Courier New', monospace; font-size: 11px; font-weight: bold; letter-spacing: 1px; word-break: break-all; border: 1px solid #000; padding: 6px 4px; margin-bottom: 3px; }
  .danfe .chave-lbl { font-size: 6px; text-transform: uppercase; color: #333; }
  .danfe .chave-val { font-family: 'Courier New', monospace; font-size: 9px; font-weight: bold; word-break: break-all; }
  .danfe .chave-consulta { font-size: 6.5px; margin-top: 3px; line-height: 1.2; }

  /* Grupos */
  .danfe .grupo-titulo { font-size: 7px; font-weight: bold; text-transform: uppercase; padding: 1px 4px; margin-top: 3px; }
  .danfe .linha { display: flex; border: 1px solid #000; border-bottom: none; }
  .danfe .linha:last-of-type { border-bottom: 1px solid #000; }
  .danfe .campo { padding: 1px 4px; border-right: 1px solid #000; overflow: hidden; }
  .danfe .campo:last-child { border-right: none; }

  /* Duplicatas */
  .danfe .dups { display: flex; flex-wrap: wrap; border: 1px solid #000; border-top: none; }
  .danfe .dup { flex: 0 0 16.66%; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 4px; font-size: 7.5px; }
  .danfe .dup-num { font-weight: bold; }
  .danfe .dup-val { text-align: right; }

  /* Tabela de produtos */
  .danfe .tbl-prod { width: 100%; border-collapse: collapse; margin-top: 1px; }
  .danfe .tbl-prod th, .danfe .tbl-prod td { border: 1px solid #000; padding: 1px 3px; font-size: 7px; vertical-align: top; }
  .danfe .tbl-prod th { background: #eee; text-align: center; font-size: 6.5px; }
  .danfe .tbl-prod td.c { text-align: center; }
  .danfe .tbl-prod td.r { text-align: right; white-space: nowrap; }
  .danfe .item-obs { font-size: 6.5px; color: #333; }

  /* Adicionais */
  .danfe .adic { min-height: 45px; }

  /* NFC-e */
  .danfe.nfce { max-width: 80mm; font-size: 9px; }
  .danfe .nfce-head { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 4px; }
  .danfe .nfce-emit { font-size: 12px; font-weight: bold; }
  .danfe .nfce-emit-cnpj, .danfe .nfce-emit-end { font-size: 8px; }
  .danfe .nfce-doc { font-size: 8px; margin-top: 3px; }
  .danfe .tbl-nfce { width: 100%; border-collapse: collapse; }
  .danfe .tbl-nfce th, .danfe .tbl-nfce td { border-bottom: 1px dotted #999; padding: 2px 3px; font-size: 8px; vertical-align: top; }
  .danfe .tbl-nfce th { text-align: left; }
  .danfe .tbl-nfce td.c, .danfe .tbl-nfce th.c { text-align: center; }
  .danfe .tbl-nfce td.r, .danfe .tbl-nfce th.r { text-align: right; }
  .danfe .nfce-tot { margin-top: 4px; border-top: 1px dashed #000; padding-top: 4px; }
  .danfe .nfce-tot-linha { display: flex; justify-content: space-between; font-size: 9px; }
  .danfe .nfce-tot-linha.total { font-size: 12px; font-weight: bold; margin-top: 3px; }
  .danfe .nfce-pag-titulo { font-size: 8px; font-weight: bold; margin-top: 4px; }
  .danfe .nfce-pag-linha { display: flex; justify-content: space-between; font-size: 8px; }
  .danfe .nfce-trib { font-size: 7.5px; margin-top: 3px; }
  .danfe .nfce-fisco { text-align: center; border-top: 1px dashed #000; margin-top: 6px; padding-top: 5px; font-size: 7.5px; }
  .danfe .nfce-fisco .barcode { height: 40px; margin: 5px auto; }
  .danfe .nfce-chave-lbl { margin-top: 3px; }
  .danfe .nfce-prot, .danfe .nfce-dest, .danfe .nfce-obs { margin-top: 3px; }
</style>`;

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────

/**
 * Monta o HTML da DANFE oficial a partir da STRING do XML da NF-e/NFC-e.
 * @param {string} xmlString  XML cru (nfeProc, procNFe ou NFe direto)
 * @returns {string} HTML de corpo (com <style> inline, SEM <script>)
 */
function montarDanfeHtml(xmlString) {
    const nota = extrairNota(xmlString);
    const mod = S(((nota.inf || {}).ide || {}).mod);
    const corpo = mod === '65' ? montarNfce(nota) : montarNfe(nota);
    return ESTILO + corpo;
}

module.exports = {
    montarDanfeHtml,
    // exportados para testes offline
    _code128cValues: code128cValues,
    _code128Barras: code128Barras,
    _extrairNota: extrairNota
};
