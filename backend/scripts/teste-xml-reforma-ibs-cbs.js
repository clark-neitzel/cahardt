/**
 * Teste OFFLINE — XML de NF-e de fornecedor já no leiaute da Reforma Tributária
 * (grupos novos IS + IBSCBS no item e ISTot + IBSCBSTot no total, obrigatórios para
 * empresas do regime regular a partir de 03/08/2026).
 *
 * Objetivo: provar que a captura de notas recebidas e a DANFE do app NÃO quebram
 * quando o fornecedor começar a mandar esses grupos. A Hardt é Simples Nacional —
 * só passa a destacar IBS/CBS nas notas PRÓPRIAS em 01/01/2027 —, mas os XMLs que
 * ela RECEBE já vêm com os campos novos a partir de agosto/2026.
 *
 * Uso (sem banco, sem rede):  node backend/scripts/teste-xml-reforma-ibs-cbs.js
 *
 * Obs.: hoje o parser IGNORA os grupos novos (não são gravados). Isso é proposital
 * enquanto os valores de 2026 são só de teste/adaptação e não geram crédito.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://x:x@localhost:5432/x';

const { parseProcNFe } = require('../services/sefazDfeService');
const { montarDanfeHtml } = require('../services/danfeHtmlService');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe42260812345678000199550010000123451000123456" versao="4.00">
  <ide><cUF>42</cUF><nNF>12345</nNF><serie>1</serie><natOp>VENDA DE MERCADORIA</natOp>
   <dhEmi>2026-08-05T09:15:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest></ide>
  <emit><CNPJ>12345678000199</CNPJ><xNome>FORNECEDOR LUCRO REAL LTDA</xNome><xFant>FORNEC</xFant>
   <enderEmit><xLgr>RUA A</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><xMun>JOINVILLE</xMun><UF>SC</UF><CEP>89200000</CEP></enderEmit>
   <IE>255000000</IE><CRT>3</CRT></emit>
  <dest><CNPJ>08766459000102</CNPJ><xNome>HARDT DOCES E SALGADOS LTDA</xNome>
   <enderDest><xLgr>R 15 DE OUTUBRO</xLgr><nro>170</nro><xBairro>RIO BONITO</xBairro><xMun>JOINVILLE</xMun><UF>SC</UF><CEP>89239700</CEP></enderDest>
   <indIEDest>1</indIEDest><IE>255372744</IE></dest>
  <det nItem="1">
   <prod><cProd>7788</cProd><cEAN>SEM GTIN</cEAN><xProd>FARINHA DE TRIGO 25KG</xProd><NCM>11010010</NCM>
    <CFOP>5102</CFOP><uCom>SC</uCom><qCom>10.0000</qCom><vUnCom>100.0000000000</vUnCom><vProd>1000.00</vProd>
    <uTrib>SC</uTrib><qTrib>10.0000</qTrib><vUnTrib>100.0000000000</vUnTrib><indTot>1</indTot></prod>
   <imposto>
    <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>1000.00</vBC><pICMS>17.00</pICMS><vICMS>170.00</vICMS></ICMS00></ICMS>
    <PIS><PISAliq><CST>01</CST><vBC>1000.00</vBC><pPIS>1.65</pPIS><vPIS>16.50</vPIS></PISAliq></PIS>
    <COFINS><COFINSAliq><CST>01</CST><vBC>1000.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>76.00</vCOFINS></COFINSAliq></COFINS>
    <!-- ===== grupos novos da Reforma (regime regular, a partir de 03/08/2026) ===== -->
    <IS><CSTIS>000</CSTIS><cClassTribIS>000001</cClassTribIS><vBCIS>0.00</vBCIS><pIS>0.0000</pIS><vIS>0.00</vIS></IS>
    <IBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib>
     <gIBSCBS><vBC>1000.00</vBC>
      <gIBSUF><pIBSUF>0.0000</pIBSUF><vIBSUF>0.00</vIBSUF></gIBSUF>
      <gIBSMun><pIBSMun>0.1000</pIBSMun><vIBSMun>1.00</vIBSMun></gIBSMun>
      <vIBS>1.00</vIBS>
      <gCBS><pCBS>0.9000</pCBS><vCBS>9.00</vCBS></gCBS>
     </gIBSCBS></IBSCBS>
   </imposto></det>
  <total>
   <ICMSTot><vBC>1000.00</vBC><vICMS>170.00</vICMS><vProd>1000.00</vProd><vFrete>0.00</vFrete>
    <vDesc>0.00</vDesc><vPIS>16.50</vPIS><vCOFINS>76.00</vCOFINS><vNF>1000.00</vNF><vTotTrib>262.50</vTotTrib></ICMSTot>
   <ISTot><vIS>0.00</vIS></ISTot>
   <IBSCBSTot><vBCIBSCBS>1000.00</vBCIBSCBS>
    <gIBS><gIBSUF><vIBSUF>0.00</vIBSUF></gIBSUF><gIBSMun><vIBSMun>1.00</vIBSMun></gIBSMun><vIBS>1.00</vIBS></gIBS>
    <gCBS><vCBS>9.00</vCBS></gCBS><vTotIBSCBS>10.00</vTotIBSCBS></IBSCBSTot>
  </total>
  <cobr><fat><nFat>12345</nFat><vOrig>1000.00</vOrig><vLiq>1000.00</vLiq></fat>
   <dup><nDup>001</nDup><dVenc>2026-09-04</dVenc><vDup>1000.00</vDup></dup></cobr>
  <infAdic><infCpl>PEDIDO 998877 - TESTE REFORMA</infCpl></infAdic>
 </infNFe></NFe>
 <protNFe versao="4.00"><infProt><chNFe>42260812345678000199550010000123451000123456</chNFe><nProt>142260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>
</nfeProc>`;

let falhas = 0;
const conferir = (ok, msg) => { console.log(`${ok ? '✅' : '❌'} ${msg}`); if (!ok) falhas++; };

console.log('=== 1) parseProcNFe — captura da nota do fornecedor ===');
const nota = parseProcNFe(xml);
console.log(JSON.stringify({
    chave: nota.chave, numero: nota.numero, valorTotal: nota.valorTotal,
    itens: nota.itens, duplicatas: nota.duplicatas
}, null, 2));
conferir(nota.chave === '42260812345678000199550010000123451000123456', 'chave lida');
conferir(nota.valorTotal === 1000, 'valor total da nota (vNF) = 1000');
conferir(nota.itens.length === 1 && nota.itens[0].valorTotal === 1000, 'item lido com valor correto');
conferir(nota.duplicatas.length === 1 && nota.duplicatas[0].valor === 1000, 'duplicata (conta a pagar) lida');

console.log('\n=== 2) montarDanfeHtml — DANFE da nota recebida ===');
const html = montarDanfeHtml(xml);
conferir(html.length > 1000, `HTML gerado (${html.length} caracteres)`);
conferir(/1\.000,00/.test(html), 'total aparece na DANFE');
console.log(`ℹ️  IBS/CBS ${/IBS|CBS/.test(html) ? 'aparecem' : 'NÃO aparecem'} na DANFE (hoje são ignorados de propósito)`);

console.log(falhas === 0 ? '\n✅ Tudo certo — o leiaute novo não quebra a leitura.' : `\n❌ ${falhas} verificação(ões) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
