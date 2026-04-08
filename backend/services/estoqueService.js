const prisma = require('../config/database');

// Status de pedido que geram reserva de estoque (excluído e recebido/faturado não reservam)
const STATUS_RESERVA = ['ABERTO', 'ENVIAR', 'SINCRONIZANDO', 'ERRO'];

// Verifica se a categoria de produto (campo livre do CA) controla estoque
async function categoriaControlaEstoque(categoriaNome, db) {
    if (!categoriaNome) return false;
    const cat = await (db || prisma).categoriaEstoque.findUnique({
        where: { nome: categoriaNome },
        select: { controlaEstoque: true }
    });
    return cat?.controlaEstoque === true;
}

// Recalcula estoqueReservado e estoqueDisponivel para um produto com base nos pedidos ativos.
// Só atua se a categoria do produto tiver controlaEstoque=true.
// Pode receber uma transaction Prisma (tx) para rodar dentro de uma transação.
async function recalcularEstoqueProduto(produtoId, tx) {
    const db = tx || prisma;

    const produto = await db.produto.findUnique({
        where: { id: produtoId },
        select: { id: true, estoqueTotal: true, categoria: true }
    });
    if (!produto) return null;

    const controla = await categoriaControlaEstoque(produto.categoria, db);
    if (!controla) return null;

    // Soma itens de pedidos ativos (todos os pedidos que ainda não saíram do estoque)
    const reservaResult = await db.pedidoItem.aggregate({
        where: {
            produtoId,
            pedido: { statusEnvio: { in: STATUS_RESERVA } }
        },
        _sum: { quantidade: true }
    });

    const reservado = parseFloat(reservaResult._sum.quantidade || 0);
    const total = parseFloat(produto.estoqueTotal || 0);
    const disponivel = Math.max(0, total - reservado);

    await db.produto.update({
        where: { id: produtoId },
        data: { estoqueReservado: reservado, estoqueDisponivel: disponivel }
    });

    return { estoqueTotal: total, estoqueReservado: reservado, estoqueDisponivel: disponivel };
}

const estoqueService = {

    recalcularEstoqueProduto,

    // Ajuste manual de estoque: afeta somente estoqueTotal, depois recalcula disponivel/reservado.
    // tipo: 'ENTRADA' | 'SAIDA'
    // motivo: 'AJUSTE_MANUAL' (padrão para ajustes via painel)
    ajustar: async ({ produtoId, vendedorId = null, pedidoId = null, tipo, quantidade, motivo = 'AJUSTE_MANUAL', observacao = null }) => {
        const produto = await prisma.produto.findUnique({
            where: { id: produtoId },
            select: { id: true, estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true, categoria: true }
        });
        if (!produto) throw new Error('Produto não encontrado');

        const delta = tipo === 'ENTRADA' ? Math.abs(quantidade) : -Math.abs(quantidade);
        const totalAntes = parseFloat(produto.estoqueTotal || 0);
        const totalDepois = Math.max(0, totalAntes + delta);

        const result = await prisma.$transaction(async (tx) => {
            // Atualiza estoqueTotal; estoqueDisponivel parte do mesmo valor e será corrigido
            // pelo recalculo se a categoria controlar estoque (com reservas de pedidos).
            await tx.produto.update({
                where: { id: produtoId },
                data: { estoqueTotal: totalDepois, estoqueDisponivel: totalDepois }
            });

            const mov = await tx.movimentacaoEstoque.create({
                data: {
                    produtoId,
                    vendedorId,
                    pedidoId,
                    tipo,
                    quantidade: Math.abs(quantidade),
                    motivo,
                    observacao,
                    estoqueAntes: totalAntes,
                    estoqueDepois: totalDepois,
                    sincCA: false,
                    erroCA: null
                }
            });

            // Se a categoria controla estoque, recalcula reservado/disponivel
            const recalc = await recalcularEstoqueProduto(produtoId, tx);
            return { movId: mov.id, recalc };
        });

        const reservado = result.recalc?.estoqueReservado ?? parseFloat(produto.estoqueReservado || 0);
        const disponivel = result.recalc?.estoqueDisponivel ?? totalDepois;

        return {
            estoqueAntes: totalAntes,
            estoqueDepois: totalDepois,
            estoqueTotal: result.recalc?.estoqueTotal ?? totalDepois,
            estoqueReservado: reservado,
            estoqueDisponivel: disponivel
        };
    },

    // Chamado quando um pedido é faturado/recebido: deduz os itens do estoqueTotal e recalcula.
    // Para pedidos já reservados, o reservado cai automaticamente ao recalcular (pois o statusEnvio
    // sai de STATUS_RESERVA), e o estoqueTotal também é reduzido, resultando em saldo correto.
    faturarPedido: async (pedidoId, vendedorId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                itens: {
                    include: {
                        produto: { select: { id: true, nome: true, estoqueTotal: true, categoria: true } }
                    }
                }
            }
        });
        if (!pedido) throw new Error('Pedido não encontrado');

        const motivo = pedido.bonificacao ? 'PEDIDO_BONIFICACAO' : (pedido.especial ? 'PEDIDO_ESPECIAL' : 'FATURAMENTO');
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of pedido.itens) {
                if (!item.produto) continue;

                const controla = await categoriaControlaEstoque(item.produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(item.produto.estoqueTotal || 0);
                const totalDepois = Math.max(0, totalAntes - qtd);

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'SAIDA',
                        quantidade: qtd,
                        motivo,
                        observacao: `Faturamento pedido #${pedido.numero || pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Credita itens devolvidos de volta ao estoque (ENTRADA com motivo DEVOLUCAO).
    // itens: [{ produtoId, quantidade }]
    creditarDevolucao: async (pedidoId, itens, vendedorId = null) => {
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of itens) {
                const produto = await tx.produto.findUnique({
                    where: { id: item.produtoId },
                    select: { id: true, nome: true, estoqueTotal: true, categoria: true }
                });
                if (!produto) continue;

                const controla = await categoriaControlaEstoque(produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(produto.estoqueTotal || 0);
                const totalDepois = totalAntes + qtd;

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'ENTRADA',
                        quantidade: qtd,
                        motivo: 'DEVOLUCAO',
                        observacao: `Devolução de itens do pedido ${pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Debita itens quando uma devolução é revertida (SAIDA com motivo REVERSAO_DEVOLUCAO).
    // itens: [{ produtoId, quantidade }]
    debitarReversaoDevolucao: async (pedidoId, itens, vendedorId = null) => {
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of itens) {
                const produto = await tx.produto.findUnique({
                    where: { id: item.produtoId },
                    select: { id: true, nome: true, estoqueTotal: true, categoria: true }
                });
                if (!produto) continue;

                const controla = await categoriaControlaEstoque(produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(produto.estoqueTotal || 0);
                const totalDepois = Math.max(0, totalAntes - qtd);

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'SAIDA',
                        quantidade: qtd,
                        motivo: 'REVERSAO_DEVOLUCAO',
                        observacao: `Reversão de devolução do pedido ${pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Recalcula reserva para todos os produtos de um pedido.
    // Usar em: criar pedido, editar itens, cancelar, excluir.
    recalcularPedido: async (pedidoId) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            select: { itens: { select: { produtoId: true } } }
        });
        if (!pedido) return;

        const produtosUnicos = [...new Set(pedido.itens.map(i => i.produtoId))];
        for (const produtoId of produtosUnicos) {
            await recalcularEstoqueProduto(produtoId);
        }
    },

    // Listagem de movimentações com filtros e paginação
    listarMovimentacoes: async ({ produtoId, vendedorId, motivo, tipo, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 }) => {
        const where = {};
        if (produtoId) where.produtoId = produtoId;
        if (vendedorId) where.vendedorId = vendedorId;
        if (motivo) where.motivo = motivo;
        if (tipo) where.tipo = tipo;
        if (dataInicio || dataFim) {
            where.createdAt = {};
            if (dataInicio) where.createdAt.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.createdAt.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.movimentacaoEstoque.findMany({
                where,
                include: {
                    produto: { select: { nome: true, codigo: true, ean: true } },
                    vendedor: { select: { nome: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.movimentacaoEstoque.count({ where })
        ]);

        return { items, total, pagina, tamanhoPagina };
    }
};

module.exports = estoqueService;
