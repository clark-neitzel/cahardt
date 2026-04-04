/**
 * Recalcula estoqueReservado e estoqueDisponivel retroativamente para todos os
 * produtos em categorias que têm controlaEstoque=true.
 *
 * Uso:
 *   node backend/scripts/recalcular-estoque-retroativo.js
 *
 * O que faz:
 *   1. Busca todas as categorias com controlaEstoque=true
 *   2. Busca todos os produtos nessas categorias
 *   3. Para cada produto, soma os pedidos ativos (ABERTO/ENVIAR/SINCRONIZANDO/ERRO)
 *   4. Atualiza estoqueReservado e estoqueDisponivel = estoqueTotal - estoqueReservado
 */

const prisma = require('../config/database');

const STATUS_RESERVA = ['ABERTO', 'ENVIAR', 'SINCRONIZANDO', 'ERRO'];

async function main() {
    console.log('🔄 Iniciando recálculo retroativo de estoque...\n');

    const categorias = await prisma.categoriaProduto.findMany({
        where: { controlaEstoque: true },
        select: { id: true, nome: true }
    });

    if (categorias.length === 0) {
        console.log('Nenhuma categoria com controlaEstoque=true encontrada.');
        console.log('Ative o campo "Controla Estoque" nas categorias desejadas em Configurações → Categorias de Produto.');
        return;
    }

    console.log(`Categorias com controle de estoque: ${categorias.map(c => c.nome).join(', ')}\n`);

    const produtos = await prisma.produto.findMany({
        where: { categoria: { in: categorias.map(c => c.nome) } },
        select: { id: true, nome: true, estoqueTotal: true, categoria: true }
    });

    console.log(`Total de produtos a processar: ${produtos.length}\n`);

    let atualizados = 0;
    let semAlteracao = 0;

    for (const produto of produtos) {
        const reservaResult = await prisma.pedidoItem.aggregate({
            where: {
                produtoId: produto.id,
                pedido: { statusEnvio: { in: STATUS_RESERVA } }
            },
            _sum: { quantidade: true }
        });

        const reservado = parseFloat(reservaResult._sum.quantidade || 0);
        const total = parseFloat(produto.estoqueTotal || 0);
        const disponivel = Math.max(0, total - reservado);

        await prisma.produto.update({
            where: { id: produto.id },
            data: { estoqueReservado: reservado, estoqueDisponivel: disponivel }
        });

        if (reservado > 0) {
            console.log(`  ✅ ${produto.nome}: total=${total.toFixed(0)}, reservado=${reservado.toFixed(0)}, disponível=${disponivel.toFixed(0)}`);
            atualizados++;
        } else {
            semAlteracao++;
        }
    }

    console.log(`\n📊 Concluído:`);
    console.log(`   Produtos com reserva ativa: ${atualizados}`);
    console.log(`   Produtos sem pedidos ativos: ${semAlteracao}`);
    console.log(`   Total processado: ${produtos.length}`);
}

main()
    .catch(err => { console.error('Erro:', err); process.exit(1); })
    .finally(() => prisma.$disconnect());
