const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const estoqueService = {

    // Aplica um ajuste de estoque manual ou automático (pedido especial/bonificação).
    // tipo: 'ENTRADA' | 'SAIDA'
    // motivo: 'AJUSTE_MANUAL' | 'PEDIDO_ESPECIAL' | 'PEDIDO_BONIFICACAO' | 'CANCELAMENTO' | 'EXCLUSAO'
    ajustar: async ({ produtoId, vendedorId = null, pedidoId = null, tipo, quantidade, motivo, observacao = null }) => {
        const produto = await prisma.produto.findUnique({ where: { id: produtoId } });
        if (!produto) throw new Error('Produto não encontrado');

        const delta = tipo === 'ENTRADA' ? Math.abs(quantidade) : -Math.abs(quantidade);
        const estoqueAntes = parseFloat(produto.estoqueDisponivel);
        const estoqueDepois = Math.max(0, estoqueAntes + delta);

        // Atualiza estoque local e registra movimentação
        await prisma.$transaction(async (tx) => {
            await tx.produto.update({
                where: { id: produtoId },
                data: { estoqueDisponivel: estoqueDepois }
            });

            await tx.movimentacaoEstoque.create({
                data: {
                    produtoId,
                    vendedorId,
                    pedidoId,
                    tipo,
                    quantidade: Math.abs(quantidade),
                    motivo,
                    observacao,
                    estoqueAntes,
                    estoqueDepois,
                    sincCA: false,
                    erroCA: null
                }
            });
        });

        // Sincroniza com CA imediatamente (busca saldo real do CA e atualiza local)
        // A API do CA não permite gravar estoque via PATCH — o saldo no CA é atualizado
        // automaticamente pelos pedidos de venda enviados. Para pedidos especiais/bonificação
        // (que não vão ao CA), o controle de estoque é local neste sistema.
        let sincCA = false;
        let erroCA = null;
        let estoqueCA = estoqueDepois;
        if (produto.contaAzulId) {
            try {
                const res = await contaAzulService.syncProdutoIndividual(produto.contaAzulId);
                estoqueCA = res.estoqueDisponivel;
                sincCA = true;
            } catch (err) {
                console.error(`[Estoque] Falha ao sincronizar CA para ${produto.nome}:`, err.message);
                erroCA = err.message?.substring(0, 500) || 'Erro desconhecido';
            }
        }

        // Atualiza o registro da movimentação com o resultado da sync
        await prisma.movimentacaoEstoque.updateMany({
            where: { produtoId, tipo, motivo, estoqueAntes, estoqueDepois },
            data: { sincCA, erroCA }
        });

        return { estoqueAntes, estoqueDepois, estoqueCA, sincCA };
    },

    // Dá baixa de todos os itens de um pedido especial/bonificação
    // e sincroniza os produtos com o CA em seguida
    baixarPedido: async (pedidoId, vendedorId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: { itens: { include: { produto: true } } }
        });
        if (!pedido) throw new Error('Pedido não encontrado');

        const motivo = pedido.bonificacao ? 'PEDIDO_BONIFICACAO' : 'PEDIDO_ESPECIAL';
        const resultados = [];
        const contaAzulIds = [];

        for (const item of pedido.itens) {
            if (!item.produto) continue;
            try {
                const res = await estoqueService.ajustar({
                    produtoId: item.produtoId,
                    vendedorId,
                    pedidoId,
                    tipo: 'SAIDA',
                    quantidade: parseFloat(item.quantidade),
                    motivo,
                    observacao: `Pedido #${pedido.numero || pedidoId}`
                });
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, ...res });
                if (item.produto.contaAzulId) contaAzulIds.push(item.produto.contaAzulId);
            } catch (err) {
                console.error(`[Estoque] Erro ao baixar item ${item.produto.nome}:`, err.message);
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, erro: err.message });
            }
        }

        // Sync CA para todos os produtos afetados
        for (const caId of contaAzulIds) {
            contaAzulService.syncProdutoIndividual(caId).catch(err =>
                console.error(`[Estoque] Falha sync CA pós-pedido ${pedidoId}:`, err.message)
            );
        }

        return resultados;
    },

    // Devolve estoque de todos os itens de um pedido (cancelamento/exclusão)
    // e sincroniza os produtos com o CA em seguida
    devolverPedido: async (pedidoId, vendedorId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: { itens: { include: { produto: true } } }
        });
        if (!pedido) throw new Error('Pedido não encontrado');

        // Verifica se este pedido já teve baixa de estoque
        const movExistentes = await prisma.movimentacaoEstoque.findMany({
            where: { pedidoId, tipo: 'SAIDA' }
        });
        if (movExistentes.length === 0) return [];

        const motivo = 'CANCELAMENTO';
        const resultados = [];
        const contaAzulIds = [];

        for (const item of pedido.itens) {
            if (!item.produto) continue;
            const movItem = movExistentes.find(m => m.produtoId === item.produtoId);
            if (!movItem) continue;

            try {
                const res = await estoqueService.ajustar({
                    produtoId: item.produtoId,
                    vendedorId,
                    pedidoId,
                    tipo: 'ENTRADA',
                    quantidade: parseFloat(item.quantidade),
                    motivo,
                    observacao: `Devolução pedido #${pedido.numero || pedidoId}`
                });
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, ...res });
                if (item.produto.contaAzulId) contaAzulIds.push(item.produto.contaAzulId);
            } catch (err) {
                console.error(`[Estoque] Erro ao devolver item ${item.produto.nome}:`, err.message);
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, erro: err.message });
            }
        }

        // Sync CA para todos os produtos afetados
        for (const caId of contaAzulIds) {
            contaAzulService.syncProdutoIndividual(caId).catch(err =>
                console.error(`[Estoque] Falha sync CA pós-devolução ${pedidoId}:`, err.message)
            );
        }

        return resultados;
    },

    // Listagem de movimentações com filtros
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
