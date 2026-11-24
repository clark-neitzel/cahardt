/**
 * Teste (sem banco, sem Focus) do vencimento da duplicata da NF-e de venda.
 * Uso: cd backend && node scripts/teste-nf-vencimento-duplicata.js
 */
const { montarCobranca } = require('../services/focusNfeEmissaoService');

const r2 = (n) => Math.round(n * 100) / 100;
let falhas = 0;
const checar = (c, m) => { if (!c) { falhas++; console.log('  X FALHOU: ' + m); } else console.log('  ok ' + m); };

function valida(nome, cob, total, emissao) {
    const d = cob.duplicatas || [];
    const soma = r2(d.reduce((s, x) => s + x.valor, 0));
    console.log(`  duplicatas: ${d.map(x => x.data_vencimento + ' R$' + x.valor).join(' | ')}`);
    checar(soma === total, `soma das duplicatas (${soma}) == valor_total (${total})`);
    checar(cob.valor_liquido_fatura === total, 'valor_liquido_fatura == valor_total');
    checar(d.every((x, i) => i === 0 || x.data_vencimento >= d[i - 1].data_vencimento), 'ordem nao-decrescente');
    checar(d.every(x => x.data_vencimento > emissao), `nenhuma data <= emissao (${emissao})`);
}

const base = { id: 'x', numero: 4254, qtdParcelas: 1, intervaloDias: 1 };
const venda = (dia) => new Date(`2026-11-${dia}T15:00:00.000Z`); // 12h Brasilia

console.log('\n(a) emissao == vencimento (caso #4254: venda 22/11, intervalo 1, emissao 23/11)');
let c = montarCobranca({ ...base, dataVenda: venda(22) }, 100, '2026-11-23');
valida('a', c, 100, '2026-11-23');
checar(c.duplicatas[0].data_vencimento === '2026-11-24', 'duplicata = 24/11');

console.log('\n(b) emissao > vencimento (venda 22/11, emissao 27/11, virada de mes 30/11)');
c = montarCobranca({ ...base, dataVenda: venda(22) }, 100, '2026-11-27');
valida('b', c, 100, '2026-11-27');
checar(c.duplicatas[0].data_vencimento === '2026-11-28', 'duplicata = 28/11');
c = montarCobranca({ ...base, dataVenda: venda(22) }, 100, '2026-11-30');
checar(c.duplicatas[0].data_vencimento === '2026-12-01', 'virada de mes: emissao 30/11 -> 01/12');

console.log('\n(c) vencimento > emissao: payload INALTERADO vs logica antiga (sem 3o argumento)');
const ped3 = { ...base, dataVenda: venda(22) };
const novo = montarCobranca(ped3, 100, '2026-11-22');
const antigo = montarCobranca(ped3, 100);
valida('c', novo, 100, '2026-11-22');
checar(JSON.stringify(novo) === JSON.stringify(antigo), 'payload identico ao da logica antiga');
console.log('  data antiga = ' + antigo.duplicatas[0].data_vencimento);

console.log('\n(d) 3 parcelas, 1a ja vencida (venda 01/11, 30/60/90 dias... intervalo 10, emissao 15/11)');
const p3 = { ...base, qtdParcelas: 3, intervaloDias: 10, dataVenda: venda('01') };
const antigo3 = montarCobranca(p3, 100);
console.log('  antiga: ' + antigo3.duplicatas.map(x => x.data_vencimento).join(' | '));
c = montarCobranca(p3, 100, '2026-11-15');
valida('d', c, 100, '2026-11-15');
checar(c.duplicatas.length === 3, '3 duplicatas preservadas');

console.log('\n(e) caBoletos com data passada; array original nao mutado');
const boletos = [
    { numeroParcela: 2, vencimento: '2026-11-20', valor: 50 },
    { numeroParcela: 1, vencimento: '2026-11-10', valor: 50.01 },
];
const copia = JSON.stringify(boletos);
c = montarCobranca({ ...base, caBoletos: boletos }, 100.01, '2026-11-23');
valida('e', c, 100.01, '2026-11-23');
checar(JSON.stringify(boletos) === copia, 'caBoletos original nao foi mutado');

console.log('\n(f) a vista sem intervalo (aPrazo=false) continua sem cobranca');
const { ehPedidoAPrazo } = require('../services/pedidoCalculos');
const pAvista = { ...base, intervaloDias: 0, qtdParcelas: 1, dataVenda: venda(22) };
const aPrazo = ehPedidoAPrazo(pAvista);
checar(aPrazo === false, 'ehPedidoAPrazo = false');
checar(!aPrazo, 'montarNotaVenda nao chama montarCobranca -> sem duplicatas/fatura (inalterado)');

console.log(falhas ? `\nRESULTADO: ${falhas} FALHA(S)` : '\nRESULTADO: tudo certo');
process.exit(falhas ? 1 : 0);
