/**
 * Retroage movimentacoes de estoque que foram capadas em 0 pelo Math.max antigo.
 * Para cada produto com pelo menos uma movimentacao suspeita, recalcula em ordem
 * cronologica as colunas estoqueAntes/estoqueDepois e o produto.estoqueTotal final.
 *
 * Nao altera movimentacoes ENTRADA AJUSTE_MANUAL (essas ja estao certas).
 * Assume que o saldo inicial do produto antes da primeira movimentacao era 0
 * se nao houver registro anterior, o que e verdade para produtos que nunca
 * receberam ajuste manual.
 *
 * Uso: node backend/scripts/retroagir-estoque-capado.js [--dry]
 */
const prisma = require('../config/database');

const DRY = process.argv.includes('--dry');

(async () => {
    // Produtos que tem pelo menos uma SAIDA com estoqueDepois=0 e estoqueAntes<quantidade
    const suspeitas = await prisma.movimentacaoEstoque.findMany({
        where: {
            tipo: 'SAIDA',
            estoqueDepois: 0
        },
        select: { produtoId: true, estoqueAntes: true, quantidade: true }
    });

    const produtosAfetados = new Set();
    for (const m of suspeitas) {
        if (parseFloat(m.estoqueAntes) < parseFloat(m.quantidade)) {
            produtosAfetados.add(m.produtoId);
        }
    }

    console.log(`Produtos com movimentacao capada: ${produtosAfetados.size}`);

    let fixedMov = 0;
    let fixedProd = 0;

    for (const produtoId of produtosAfetados) {
        const movs = await prisma.movimentacaoEstoque.findMany({
            where: { produtoId },
            orderBy: { createdAt: 'asc' }
        });

        let saldo = 0;
        for (const m of movs) {
            const qtd = parseFloat(m.quantidade);
            const antes = saldo;
            const depois = m.tipo === 'ENTRADA' ? antes + qtd : antes - qtd;

            if (parseFloat(m.estoqueAntes) !== antes || parseFloat(m.estoqueDepois) !== depois) {
                if (!DRY) {
                    await prisma.movimentacaoEstoque.update({
                        where: { id: m.id },
                        data: { estoqueAntes: antes, estoqueDepois: depois }
                    });
                }
                fixedMov++;
            }
            saldo = depois;
        }

        const produto = await prisma.produto.findUnique({
            where: { id: produtoId },
            select: { id: true, nome: true, estoqueTotal: true }
        });
        const totalAtual = parseFloat(produto.estoqueTotal || 0);

        if (totalAtual !== saldo) {
            console.log(`  ${produto.nome}: ${totalAtual} -> ${saldo}`);
            if (!DRY) {
                await prisma.produto.update({
                    where: { id: produtoId },
                    data: { estoqueTotal: saldo }
                });
            }
            fixedProd++;
        }
    }

    console.log(`\n${DRY ? '[DRY]' : '[APLICADO]'} Movimentacoes corrigidas: ${fixedMov}`);
    console.log(`${DRY ? '[DRY]' : '[APLICADO]'} Produtos com total corrigido: ${fixedProd}`);

    // Recalcula reservado/disponivel
    if (!DRY) {
        const estoqueService = require('../services/estoqueService');
        for (const produtoId of produtosAfetados) {
            await estoqueService.recalcularEstoqueProduto(produtoId);
        }
        console.log(`Recalculo de reservado/disponivel concluido para ${produtosAfetados.size} produtos.`);
    }

    process.exit(0);
})().catch(err => {
    console.error(err);
    process.exit(1);
});
