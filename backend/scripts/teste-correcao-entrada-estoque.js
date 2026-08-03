/**
 * Teste OFFLINE (sem banco) da correção de entrada de estoque.
 *
 * Prova as três perguntas que o dono fez ao pedir a funcionalidade (08/2026):
 *   1. corrigir a conversão REDUZ o custo? → reduz quando a conversão errada lançou
 *      quantidade a MENOS; sobe no caso contrário. O valor pago nunca muda.
 *   2. o valor da nota pode ser alterado por engano? → não: quantidade e custo são
 *      sempre derivados de (quantidade do XML × fator) e (valorTotal ÷ quantidade).
 *   3. compras posteriores atrapalham? → só restaurar o "custo anterior" não basta;
 *      o custo tem que ser refeito pelo histórico de compras válidas (o que a rota faz).
 *
 * Rodar: node backend/scripts/teste-correcao-entrada-estoque.js
 */

const { custoMedioPonderado } = require('../services/notaEstoqueService');

const round = (v, c) => Math.round(Number(v) * 10 ** c) / 10 ** c;
let falhas = 0;

const conferir = (rotulo, obtido, esperado, casas = 2) => {
    const ok = Math.abs(Number(obtido) - Number(esperado)) < 0.5 / 10 ** casas;
    console.log(`  ${ok ? '✅' : '❌'} ${rotulo}: ${round(obtido, casas)} (esperado ${round(esperado, casas)})`);
    if (!ok) falhas++;
};

/** Como a conferência calcula a entrada de um item (montarItensResolvidos). */
const entradaDoItem = (item, fator) => {
    const quantidade = round(item.quantidade * fator, 3);
    return { quantidade, custoUnitario: quantidade > 0 ? round(item.valorTotal / quantidade, 6) : null };
};

/** Replay da média ponderada sobre as compras válidas (compraEstoqueService.recalcularCustoPelasCompras). */
const custoPelasCompras = (compras) => {
    let est = 0;
    let custo = 0;
    for (const c of compras) {
        if (c.quantidade <= 0) continue;
        custo = custoMedioPonderado(est, custo, c.quantidade, c.custoUnitario);
        est += c.quantidade;
    }
    return round(custo, 2);
};

console.log('\n═══ 1. Conversão errada em julho: 12 CX de mussarela por R$ 2.400 (1 CX = 10 KG) ═══');
const item = { quantidade: 12, unidade: 'CX', valorTotal: 2400 };

const errada = entradaDoItem(item, 1);    // digitaram fator 1 (tratou CX como KG)
const certa = entradaDoItem(item, 10);    // conversão correta
conferir('quantidade lançada errada (KG)', errada.quantidade, 12, 3);
conferir('custo inflado pelo erro (R$/KG)', errada.custoUnitario, 200, 2);
conferir('quantidade correta (KG)', certa.quantidade, 120, 3);
conferir('custo correto (R$/KG)', certa.custoUnitario, 20, 2);
conferir('valor do item é o MESMO nos dois casos', certa.quantidade * certa.custoUnitario, item.valorTotal, 2);
conferir('falta entrar no estoque de hoje (KG)', certa.quantidade - errada.quantidade, 108, 3);

console.log('\n═══ 2. O erro ao contrário (fator alto demais) faz o custo SUBIR ═══');
const exagerada = entradaDoItem(item, 100); // 1 CX = 100 KG (errado para mais)
conferir('custo subestimado pelo erro (R$/KG)', exagerada.custoUnitario, 2, 2);
conferir('corrigir SOBE o custo de 2 para', certa.custoUnitario, 20, 2);
conferir('sai do estoque de hoje (KG)', exagerada.quantidade - certa.quantidade, 1080, 3);

console.log('\n═══ 3. Compras posteriores: restaurar o "custo anterior" NÃO basta ═══');
// Linha do tempo real: custo do produto era 21,00 antes de julho.
// Julho: a compra errada (200,00/KG) explodiu a média; depois vieram mais 2 compras.
const custoAntesDeJulho = 21;
const estoqueAntesDeJulho = 40;
const posteriores = [
    { quantidade: 100, custoUnitario: 19.5 },
    { quantidade: 80, custoUnitario: 22 }
];

// (a) como ficou com a compra ERRADA na média
let custoHoje = custoMedioPonderado(estoqueAntesDeJulho, custoAntesDeJulho, errada.quantidade, errada.custoUnitario);
let estoque = estoqueAntesDeJulho + errada.quantidade;
for (const c of posteriores) {
    custoHoje = custoMedioPonderado(estoque, custoHoje, c.quantidade, c.custoUnitario);
    estoque += c.quantidade;
}
console.log(`  → custo hoje, contaminado pelo erro: R$ ${round(custoHoje, 2)}/KG`);
if (!(custoHoje > 25)) { console.log('  ❌ o cenário deveria estar contaminado'); falhas++; }

// (b) só "desfazer a última entrada" não resolve — o erro já entrou na média das compras seguintes
const soRestaurando = custoAntesDeJulho;
console.log(`  → se o app apenas restaurasse o custo anterior: R$ ${round(soRestaurando, 2)}/KG (ignora 2 compras posteriores) ❗`);

// (c) o que a rota faz: refaz a média pelo histórico de compras VÁLIDAS (a errada sai, a certa entra)
const historicoCorrigido = [
    { quantidade: certa.quantidade, custoUnitario: certa.custoUnitario }, // julho, já corrigida
    ...posteriores
];
const custoRefeito = custoPelasCompras(historicoCorrigido);
console.log(`  → custo refeito pelo histórico de compras válidas: R$ ${custoRefeito}/KG`);
conferir('custo refeito fica na faixa real das compras (19,50–22,00)', custoRefeito > 19.5 && custoRefeito < 22 ? 1 : 0, 1, 0);
conferir('a compra errada saiu da média', custoRefeito < custoHoje ? 1 : 0, 1, 0);

console.log('\n═══ 4. O valor da nota é intocável ═══');
// Qualquer fator que o usuário digite: quantidade × custo continua sendo o valor do item.
for (const f of [0.5, 1, 3.7, 10, 144]) {
    const e = entradaDoItem(item, f);
    conferir(`fator ${f} → quantidade × custo`, e.quantidade * e.custoUnitario, item.valorTotal, 2);
}

console.log(falhas === 0 ? '\n✅ Todos os testes passaram.\n' : `\n❌ ${falhas} teste(s) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
