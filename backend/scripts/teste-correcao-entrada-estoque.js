/**
 * Teste OFFLINE (sem banco) da REGRA DE CUSTO por compras recentes que cobrem o estoque
 * (custoCompraCalculo.custoPorEstoqueRecente) — a função pura, sem I/O.
 *
 * Regra (travada com o dono, 08/2026): custo = média das compras VÁLIDAS mais recentes
 * que COBREM o estoqueAtual. Ordena da mais recente para a mais antiga (dataCompra,
 * desempate criadoEm depois id), soma as quantidades até cobrir o estoque; a compra que
 * CRUZA o limite entra INTEIRA (nunca proporcional). Sem compra válida → null (custo
 * intocado). estoque <= 0 → último preço pago. estoque > soma de todas → usa todas.
 *
 * Prova aqui:
 *   1. cobertura por 2 compras (a 3ª, mais antiga, fica de fora);
 *   2. a compra que cruza entra INTEIRA (não proporcional);
 *   3. estoque maior que a soma de todas → usa TODAS;
 *   4. estoque <= 0 → custo da compra mais recente;
 *   5. sem compra válida (lista vazia ou só quantidade zero) → null;
 *   6. desempate por criadoEm/id quando a dataCompra empata;
 *   7. o valor da nota é intocável: quantidade × custo = valor do item, para qualquer fator.
 *
 * Rodar: node backend/scripts/teste-correcao-entrada-estoque.js
 */

const { custoPorEstoqueRecente } = require('../services/custoCompraCalculo');

const round = (v, c) => Math.round(Number(v) * 10 ** c) / 10 ** c;
let falhas = 0;

const conferir = (rotulo, obtido, esperado, casas = 2) => {
    const ok = obtido == null && esperado == null
        ? true
        : (obtido != null && esperado != null && Math.abs(Number(obtido) - Number(esperado)) < 0.5 / 10 ** casas);
    console.log(`  ${ok ? '✅' : '❌'} ${rotulo}: ${obtido == null ? 'null' : round(obtido, casas)} (esperado ${esperado == null ? 'null' : round(esperado, casas)})`);
    if (!ok) falhas++;
};

// Compra de teste: da mais recente para a mais antiga (o algoritmo ordena sozinho, mas
// deixamos as datas explícitas para o teste ser legível).
const A = { id: 'A', quantidade: 100, custoUnitario: 20, dataCompra: '2026-08-10', criadoEm: '2026-08-10T10:00:00Z' }; // mais recente
const B = { id: 'B', quantidade: 100, custoUnitario: 10, dataCompra: '2026-08-05', criadoEm: '2026-08-05T10:00:00Z' };
const C = { id: 'C', quantidade: 100, custoUnitario: 5, dataCompra: '2026-08-01', criadoEm: '2026-08-01T10:00:00Z' }; // mais antiga
const compras = [C, A, B]; // ordem embaralhada de propósito

console.log('\n═══ 1. Cobertura por 2 compras (a 3ª, mais antiga, fica de fora) ═══');
// estoque 150: A(100) + B(100) = 200 ≥ 150 → inclui A e B; C não entra.
// custo = (100·20 + 100·10) / 200 = 15,00
conferir('estoque 150 → média das 2 compras recentes', custoPorEstoqueRecente(150, compras), 15);

console.log('\n═══ 2. A compra que CRUZA o limite entra INTEIRA (não proporcional) ═══');
// estoque 120: A(100) < 120; A+B(200) ≥ 120 → B entra INTEIRA.
// inteira: (100·20 + 100·10)/200 = 15,00 ; proporcional (só 20 de B) daria 18,33.
conferir('estoque 120 → B inteira → 15,00 (não 18,33)', custoPorEstoqueRecente(120, compras), 15);

console.log('\n═══ 3. Estoque maior que a soma de todas → usa TODAS ═══');
// soma = 300; estoque 500 → inclui A+B+C = (2000+1000+500)/300 = 11,6667
conferir('estoque 500 → todas as compras', custoPorEstoqueRecente(500, compras), 11.6667, 4);

console.log('\n═══ 4. Estoque <= 0 → custo da compra MAIS RECENTE ═══');
conferir('estoque 0 → último preço (A = 20)', custoPorEstoqueRecente(0, compras), 20);
conferir('estoque negativo → último preço (A = 20)', custoPorEstoqueRecente(-5, compras), 20);

console.log('\n═══ 5. Sem compra válida → null (custo intocado) ═══');
conferir('lista vazia → null', custoPorEstoqueRecente(100, []), null);
conferir('só quantidade zero → null', custoPorEstoqueRecente(100, [{ id: 'Z', quantidade: 0, custoUnitario: 9, dataCompra: '2026-08-09', criadoEm: '2026-08-09T10:00:00Z' }]), null);

console.log('\n═══ 6. Desempate por criadoEm/id quando a dataCompra empata ═══');
// Duas compras na MESMA dataCompra: a de criadoEm mais novo é a "mais recente".
const M1 = { id: 'M1', quantidade: 10, custoUnitario: 30, dataCompra: '2026-08-12', criadoEm: '2026-08-12T08:00:00Z' };
const M2 = { id: 'M2', quantidade: 10, custoUnitario: 40, dataCompra: '2026-08-12', criadoEm: '2026-08-12T09:00:00Z' }; // criadoEm mais novo
// estoque 0 → último preço = a de criadoEm mais novo (M2 = 40).
conferir('empate de data → criadoEm mais novo ganha (M2 = 40)', custoPorEstoqueRecente(0, [M1, M2]), 40);

console.log('\n═══ 7. O valor da nota é intocável (quantidade × custo = valor do item) ═══');
// Como a conferência calcula a entrada de um item (montarItensResolvidos, lógica pura).
const entradaDoItem = (item, fator) => {
    const quantidade = round(item.quantidade * fator, 3);
    return { quantidade, custoUnitario: quantidade > 0 ? round(item.valorTotal / quantidade, 6) : null };
};
const item = { quantidade: 12, valorTotal: 2400 };
for (const f of [0.5, 1, 3.7, 10, 144]) {
    const e = entradaDoItem(item, f);
    conferir(`fator ${f} → quantidade × custo`, e.quantidade * e.custoUnitario, item.valorTotal, 2);
}

console.log(falhas === 0 ? '\n✅ Todos os testes passaram.\n' : `\n❌ ${falhas} teste(s) falharam.\n`);
process.exit(falhas === 0 ? 0 : 1);
