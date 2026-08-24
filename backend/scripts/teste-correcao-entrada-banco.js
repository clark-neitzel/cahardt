/**
 * Teste da correção de entrada de estoque CONTRA O BANCO (local), exercitando o
 * serviço de verdade — transação, ledger, movimentações e recálculo de custo.
 *
 * Cenário: exatamente o que aconteceu em julho/2026 — nota conferida com a CONVERSÃO
 * errada (12 CX viraram 12 KG em vez de 120 KG), despesa gerada e JÁ PAGA. Hoje esse
 * caso só teria conserto estornando a baixa e cancelando a conta.
 *
 * Prova, no banco:
 *   • o custo do produto cai de R$ 200,00 para o valor certo;
 *   • os 108 KG que faltavam entram no estoque;
 *   • a despesa, a parcela e o PAGAMENTO ficam exatamente como estavam;
 *   • o histórico de compras troca a linha errada pela certa (a errada fica estornada).
 *
 * Cria e APAGA os próprios dados (prefixo TESTE-CORRECAO).
 *
 * ⛔ SÓ RODA NO BANCO LOCAL — trava dura em `exigir-banco-local.js`: o script cria
 * nota/despesa/pagamento e APAGA linhas no final; num banco de produção isso mexeria em
 * estoque, custo e financeiro de verdade. Se a DATABASE_URL não for local, aborta sem
 * tocar no banco.
 *
 * Rodar: node backend/scripts/teste-correcao-entrada-banco.js
 */

require('dotenv').config();
require('./exigir-banco-local')('teste-correcao-entrada-banco.js'); // ANTES de tocar no banco
const prisma = require('../config/database');
const notaEstoqueService = require('../services/notaEstoqueService');
const compraEstoqueService = require('../services/compraEstoqueService');

const MARCA = `TESTE-CORRECAO-${Date.now()}`;
const num = (v) => Number(v || 0);
const round = (v, c) => Math.round(Number(v) * 10 ** c) / 10 ** c;

let falhas = 0;
const conferir = (rotulo, obtido, esperado, casas = 2) => {
    const ok = Math.abs(num(obtido) - num(esperado)) < 0.5 / 10 ** casas;
    console.log(`  ${ok ? '✅' : '❌'} ${rotulo}: ${round(obtido, casas)} (esperado ${round(esperado, casas)})`);
    if (!ok) falhas++;
};

const criado = { produtoId: null, notaId: null, contaId: null };

async function limpar() {
    if (criado.notaId) {
        await prisma.notaEntradaEstoqueMov.deleteMany({ where: { notaEntradaId: criado.notaId } });
        await prisma.compraItem.deleteMany({ where: { notaEntradaId: criado.notaId } });
        await prisma.notaEntradaItem.deleteMany({ where: { notaEntradaId: criado.notaId } });
        await prisma.notaEntrada.deleteMany({ where: { id: criado.notaId } });
    }
    if (criado.contaId) {
        const parcelas = await prisma.parcelaPagar.findMany({ where: { contaPagarId: criado.contaId }, select: { id: true } });
        await prisma.pagamentoParcelaPagar.deleteMany({ where: { parcelaPagarId: { in: parcelas.map((p) => p.id) } } });
        await prisma.parcelaPagar.deleteMany({ where: { contaPagarId: criado.contaId } });
        await prisma.contaPagar.deleteMany({ where: { id: criado.contaId } });
    }
    if (criado.produtoId) {
        await prisma.movimentacaoEstoque.deleteMany({ where: { produtoId: criado.produtoId } });
        await prisma.compraItem.deleteMany({ where: { produtoId: criado.produtoId } });
        await prisma.produto.deleteMany({ where: { id: criado.produtoId } });
    }
    await prisma.fornecedorProdutoVinculo.deleteMany({ where: { fornecedorCnpj: '99999999000199' } });
}

async function principal() {
    console.log(`\n═══ Montando o cenário de julho (${MARCA}) ═══`);

    // Produto com estoque e custo anteriores à compra errada
    const produto = await prisma.produto.create({
        data: {
            contaAzulId: MARCA,
            codigo: MARCA,
            nome: 'Mussarela (teste correção)',
            unidade: 'KG',
            valorVenda: 45,
            estoqueTotal: 40,
            estoqueDisponivel: 40,
            custoManual: 21,
            ativo: false // fora das telas enquanto o teste roda
        }
    });
    criado.produtoId = produto.id;
    console.log(`  produto: 40 KG em estoque, custo R$ 21,00/KG`);

    // Nota: 12 CX por R$ 2.400 (1 CX = 10 KG na vida real)
    const nota = await prisma.notaEntrada.create({
        data: {
            chave: MARCA.padEnd(44, '0').slice(0, 44),
            tipo: 'NFE',
            numero: '999999',
            fornecedorCnpj: '99999999000199',
            fornecedorNome: 'Fornecedor de Teste',
            emissao: new Date('2026-07-10T12:00:00Z'),
            valorTotal: 2400,
            status: 'NOVA',
            itens: {
                create: [{
                    numeroItem: 1,
                    codigoFornecedor: 'CX-MUSSA',
                    descricao: 'MUSSARELA CAIXA 10KG',
                    unidade: 'CX',
                    quantidade: 12,
                    valorUnitario: 200,
                    valorTotal: 2400
                }]
            }
        },
        include: { itens: true }
    });
    criado.notaId = nota.id;
    const itemNota = nota.itens[0];

    // Despesa gerada e JÁ PAGA (é o que hoje impede a correção)
    const conta = await prisma.contaPagar.create({
        data: {
            descricao: `NF-e 999999 — ${MARCA}`,
            origem: 'NFE',
            valorTotal: 2400,
            status: 'QUITADO',
            parcelas: { create: [{ numeroParcela: 1, valor: 2400, dataVencimento: new Date('2026-08-10T12:00:00Z'), status: 'PAGO' }] }
        },
        include: { parcelas: true }
    });
    criado.contaId = conta.id;
    const parcela = conta.parcelas[0];
    const pagamento = await prisma.pagamentoParcelaPagar.create({
        data: { parcelaPagarId: parcela.id, valorPago: 2400, dataPagamento: new Date('2026-08-10T12:00:00Z'), origem: 'MANUAL' }
    });
    await prisma.notaEntrada.update({ where: { id: nota.id }, data: { status: 'CONFERIDA', contaPagarId: conta.id } });
    console.log('  despesa de R$ 2.400 gerada e QUITADA (baixa registrada)');

    // ── A conferência ERRADA: fator 1 (tratou CX como KG) ──
    await prisma.$transaction(async (tx) => {
        await notaEstoqueService.aplicarEstoqueNota(
            tx, nota,
            notaEstoqueService.montarItensResolvidos([{ itemNota, produtoId: produto.id, fator: 1 }]),
            { comCusto: true, contaPagarId: conta.id }
        );
    }, { timeout: 20000, maxWait: 10000 });

    const errado = await prisma.produto.findUnique({ where: { id: produto.id } });
    console.log('\n═══ Como ficou com a conversão errada (fator 1) ═══');
    conferir('estoque (KG)', errado.estoqueTotal, 52, 3);           // 40 + 12
    // REGRA NOVA: custo = compras válidas recentes que cobrem o estoque. Os 12 KG lançados
    // não cobrem os 52 do estoque → usa a ÚNICA compra válida (12 KG @ R$ 200) → R$ 200,00.
    // O erro de conversão inflou o custo unitário (2.400 ÷ 12) e o custo herda isso inteiro.
    conferir('custo do produto (R$/KG)', errado.custoManual, 200);

    // ── A CORREÇÃO: mesma nota, fator 10, sem tocar no financeiro ──
    console.log('\n═══ Corrigindo a conversão para 1 CX = 10 KG ═══');
    let resultado;
    await prisma.$transaction(async (tx) => {
        resultado = await notaEstoqueService.corrigirEstoqueNota(
            tx, nota,
            notaEstoqueService.montarItensResolvidos([{ itemNota, produtoId: produto.id, fator: 10 }]),
            { comCusto: true, contaPagarId: conta.id }
        );
    }, { timeout: 20000, maxWait: 10000 });
    const novoCusto = await compraEstoqueService.recalcularCustoPelasCompras({ produtoId: produto.id });

    const certo = await prisma.produto.findUnique({ where: { id: produto.id } });
    conferir('estoque agora (KG)', certo.estoqueTotal, 160, 3);   // 40 + 120
    conferir('entraram no estoque de hoje (KG)', num(certo.estoqueTotal) - num(errado.estoqueTotal), 108, 3);
    // REGRA NOVA (08/2026): custo = compras válidas recentes que cobrem o estoque. Só sobra
    // a compra corrigida (120 KG @ R$ 20). Ela não cobre os 160 KG do estoque → usa ela
    // inteira → R$ 20,00/KG. Os 40 KG antigos (custo manual R$ 21) NÃO entram na média: o
    // custo passa a valer o preço das compras recentes, por decisão do dono — não há mais a
    // "conservação de dinheiro" do modelo de média ponderada.
    conferir('custo recalculado (R$/KG)', novoCusto, 20);
    conferir('custo gravado no produto (R$/KG)', certo.custoManual, 20);
    console.log(`  → o custo CAIU de R$ ${round(errado.custoManual, 2)} para R$ ${round(certo.custoManual, 2)}/KG`);

    console.log('\n═══ O financeiro ficou intocado? ═══');
    const contaDepois = await prisma.contaPagar.findUnique({ where: { id: conta.id }, include: { parcelas: true } });
    const pagDepois = await prisma.pagamentoParcelaPagar.findUnique({ where: { id: pagamento.id } });
    conferir('valor da despesa (R$)', contaDepois.valorTotal, 2400);
    conferir('parcelas da despesa', contaDepois.parcelas.length, 1, 0);
    conferir('valor pago (R$)', pagDepois.valorPago, 2400);
    console.log(`  ${contaDepois.status === 'QUITADO' ? '✅' : '❌'} status da despesa: ${contaDepois.status} (esperado QUITADO)`);
    if (contaDepois.status !== 'QUITADO') falhas++;
    console.log(`  ${pagDepois.estornado === false ? '✅' : '❌'} pagamento estornado: ${pagDepois.estornado} (esperado false)`);
    if (pagDepois.estornado !== false) falhas++;

    console.log('\n═══ Rastro (ledger, histórico de compras e movimentações) ═══');
    const ledgerAtivo = await prisma.notaEntradaEstoqueMov.findMany({ where: { notaEntradaId: nota.id, estornado: false } });
    const ledgerEstornado = await prisma.notaEntradaEstoqueMov.count({ where: { notaEntradaId: nota.id, estornado: true } });
    conferir('linhas ativas no ledger', ledgerAtivo.length, 1, 0);
    conferir('quantidade da linha ativa (KG)', ledgerAtivo[0]?.quantidade, 120, 3);
    conferir('custo da linha ativa (R$/KG)', ledgerAtivo[0]?.custoUnitario, 20);
    conferir('linhas estornadas (o lançamento errado)', ledgerEstornado, 1, 0);

    const compraAtiva = await prisma.compraItem.findMany({ where: { notaEntradaId: nota.id, estornado: false } });
    conferir('compras válidas no histórico', compraAtiva.length, 1, 0);
    conferir('quantidade da compra válida (KG)', compraAtiva[0]?.quantidade, 120, 3);
    conferir('valor da compra (R$ — nunca muda)', compraAtiva[0]?.valorTotal, 2400);

    const movs = await prisma.movimentacaoEstoque.findMany({ where: { produtoId: produto.id }, orderBy: { createdAt: 'asc' } });
    console.log(`  movimentações registradas (${movs.length}):`);
    for (const m of movs) console.log(`    · ${m.tipo} ${round(m.quantidade, 3)} — ${m.observacao}`);
    const temCorrecao = movs.some((m) => String(m.observacao || '').startsWith('Correção'));
    console.log(`  ${temCorrecao ? '✅' : '❌'} a correção aparece como movimentação rastreável`);
    if (!temCorrecao) falhas++;

    console.log(`\n  avisos do serviço: ${resultado.avisos.length ? resultado.avisos.join(' | ') : '(nenhum)'}`);
}

principal()
    .catch((e) => { console.error('\n❌ ERRO:', e.message); falhas++; })
    .finally(async () => {
        await limpar().catch((e) => console.error('Falha ao limpar os dados de teste:', e.message));
        await prisma.$disconnect();
        console.log(falhas === 0 ? '\n✅ Todos os testes passaram (dados de teste apagados).\n' : `\n❌ ${falhas} teste(s) falharam.\n`);
        process.exit(falhas === 0 ? 0 : 1);
    });
