const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const pedidoService = {
    // 1. Listagem de pedidos com filtros (para a tela de histórico)
    listar: async (filtros) => {
        const { statusEnvio, vendedorId, clienteId } = filtros;

        const where = {};
        if (statusEnvio) where.statusEnvio = statusEnvio;
        if (vendedorId) where.vendedorId = vendedorId;
        if (clienteId) where.clienteId = clienteId;

        return await prisma.pedido.findMany({
            where,
            include: {
                cliente: {
                    select: { Nome: true, NomeFantasia: true, Documento: true }
                },
                vendedor: {
                    select: { nome: true }
                },
                itens: {
                    include: {
                        produto: { select: { nome: true, codigo: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    // 2. Criação de novo pedido validando banco e regras de negócio
    criar: async (dadosPedido) => {
        const {
            clienteId,
            vendedorId,
            dataVenda,
            observacoes,
            tipoPagamento,
            opcaoCondicaoPagamento,
            qtdParcelas,
            primeiroVencimento,
            intervaloDias,
            idContaFinanceira,
            idCategoria,
            latLng,
            itens, // array de objetos
            statusEnvio // ABERTO ou ENVIAR
        } = dadosPedido;

        if (!clienteId || !itens || itens.length === 0) {
            throw new Error('Cliente e itens são obrigatórios');
        }

        // A validação de Flex e atualização do vendedor ocorrerá dentro de uma transação
        return await prisma.$transaction(async (tx) => {
            let flexTotalPedido = 0;

            // Criação base do pedido
            const novoPedido = await tx.pedido.create({
                data: {
                    clienteId,
                    vendedorId,
                    dataVenda: new Date(dataVenda),
                    observacoes,
                    tipoPagamento,
                    opcaoCondicaoPagamento,
                    qtdParcelas: qtdParcelas ? parseInt(qtdParcelas) : 1,
                    primeiroVencimento: primeiroVencimento ? new Date(primeiroVencimento) : undefined,
                    intervaloDias: intervaloDias ? parseInt(intervaloDias) : 0,
                    idContaFinanceira,
                    idCategoria,
                    latLng,
                    statusEnvio: statusEnvio || 'ABERTO',
                    itens: {
                        create: itens.map(item => {
                            const valorDigitado = parseFloat(item.valor);
                            const valorBase = parseFloat(item.valorBase);
                            const flexItem = (valorDigitado - valorBase) * parseFloat(item.quantidade);

                            flexTotalPedido += flexItem;

                            return {
                                produtoId: item.produtoId,
                                descricao: item.descricao,
                                quantidade: parseFloat(item.quantidade),
                                valor: valorDigitado,
                                valorBase: valorBase,
                                flexGerado: flexItem
                            };
                        })
                    }
                },
                include: {
                    itens: true
                }
            });

            // Atualiza Flex Total do Pedido
            await tx.pedido.update({
                where: { id: novoPedido.id },
                data: { flexTotal: flexTotalPedido }
            });

            // Se passou o vendedor, atualiza o saldo Flex dele (se o pedido for pra enviar/aberto consome saldo)
            if (vendedorId) {
                const vendedor = await tx.vendedor.findUnique({ where: { id: vendedorId } });

                if (vendedor) {
                    const novoFlexDisponivel = parseFloat(vendedor.flexDisponivel) + flexTotalPedido;
                    const limiteFlexAprovado = parseFloat(vendedor.flexMensal);

                    // Regra de Negócio: Se enviar, e o flex final ficar menor que o limite aprovado, bloqueia
                    // Ex: Mensal = 0, Disponivel atual = 10, tentou gastar -20 (ficaria -10). Limite é 0.
                    if (statusEnvio === 'ENVIAR' && novoFlexDisponivel < 0 && Math.abs(novoFlexDisponivel) > limiteFlexAprovado) {
                        throw new Error(`Saldo Flex insuficiente para finalizar. Faltam R$ ${Math.abs(novoFlexDisponivel).toFixed(2)}`);
                    }

                    // Atualiza saldo flex do Vendedor e Saldo Utilizado do Cliente
                    await tx.vendedor.update({
                        where: { id: vendedorId },
                        data: { flexDisponivel: novoFlexDisponivel }
                    });

                    await tx.cliente.update({
                        where: { UUID: clienteId },
                        data: {
                            Flex_utilizado: { increment: Math.abs(flexTotalPedido) }
                        }
                    });
                }
            }

            return novoPedido;
        });
    },

    editar: async (id, dadosPedido) => {
        const { clienteId, vendedorId, itens, statusEnvio, observacoes, dataVenda, opcaoCondicaoPagamento } = dadosPedido;

        return await prisma.$transaction(async (tx) => {
            const pedidoAntigo = await tx.pedido.findUnique({
                where: { id },
                include: { itens: true }
            });

            if (!pedidoAntigo) throw new Error('Pedido não encontrado');

            // Permite edição de 'revisaoPendente' mesmo se o pedido não estiver ABERTO
            const isSomenteRevisao = Object.keys(dadosPedido).length === 1 && typeof dadosPedido.revisaoPendente === 'boolean';

            if (pedidoAntigo.statusEnvio !== 'ABERTO' && !isSomenteRevisao) {
                throw new Error('Só é permitido editar dados de vendas em Rascunho (Em Aberto).');
            }

            let totalPedido = 0;
            let flexTotalPedido = 0;

            const novosItens = (itens || []).map(item => {
                const valorDigitado = parseFloat(item.valor) || 0;
                const valorBase = parseFloat(item.valorBase) || 0;
                const qtd = parseFloat(item.quantidade) || 0;

                const flexItem = (valorDigitado - valorBase) * qtd;

                totalPedido += valorDigitado * qtd;
                flexTotalPedido += flexItem;

                return {
                    produtoId: item.produtoId,
                    quantidade: qtd,
                    valor: valorDigitado,
                    valorBase: valorBase,
                    flexGerado: flexItem
                };
            });

            // Exclui os itens anteriores
            await tx.pedidoItem.deleteMany({
                where: { pedidoId: id }
            });

            const pedidoAtualizado = await tx.pedido.update({
                where: { id },
                data: {
                    cliente: { connect: { UUID: clienteId } },
                    ...(vendedorId ? { vendedor: { connect: { id: vendedorId } } } : {}),
                    flexTotal: flexTotalPedido,
                    statusEnvio,
                    observacoes,
                    opcaoCondicaoPagamento,
                    dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
                    itens: {
                        create: novosItens
                    }
                },
                include: {
                    itens: true
                }
            });

            // Se for finalizado, abate o Flex (visto que antes estava em ABERTO e não abateu)
            if (statusEnvio === 'ENVIAR') {
                const vendedor = await tx.vendedor.findUnique({ where: { id: vendedorId } });
                if (vendedor) {
                    const novoFlexDisponivel = parseFloat(vendedor.flexDisponivel) + flexTotalPedido;
                    const limiteFlexAprovado = parseFloat(vendedor.flexMensal);

                    if (novoFlexDisponivel < 0 && Math.abs(novoFlexDisponivel) > limiteFlexAprovado) {
                        throw new Error(`Saldo Flex insuficiente para finalizar. Faltam R$ ${Math.abs(novoFlexDisponivel).toFixed(2)}`);
                    }

                    await tx.vendedor.update({
                        where: { id: vendedorId },
                        data: { flexDisponivel: novoFlexDisponivel }
                    });

                    await tx.cliente.update({
                        where: { UUID: clienteId },
                        data: {
                            Flex_utilizado: { increment: Math.abs(flexTotalPedido) }
                        }
                    });
                }
            }

            return pedidoAtualizado;
        });
    },

    // 3. Buscar último preço de um produto vendido para um cliente
    obterUltimoPreco: async (clienteId, produtoId) => {
        // Busca o último item de pedido deste produto para este cliente
        const ultimoItem = await prisma.pedidoItem.findFirst({
            where: {
                produtoId: produtoId,
                pedido: {
                    clienteId: clienteId
                }
            },
            orderBy: {
                pedido: {
                    dataVenda: 'desc'
                }
            },
            select: {
                valor: true,
                pedido: { select: { dataVenda: true } }
            }
        });

        return ultimoItem;
    },

    // 4. Detalhar um pedido
    detalhar: async (id) => {
        return await prisma.pedido.findUnique({
            where: { id },
            include: {
                cliente: true,
                vendedor: true,
                itens: {
                    include: { produto: true }
                }
            }
        });
    },

    // 5. Excluir pedido (apenas se não estiver ENVIADO/SINCRONIZADO)
    excluir: async (id) => {
        const pedido = await prisma.pedido.findUnique({ where: { id } });
        if (!pedido) throw new Error("Pedido não encontrado");

        // Regra de negócio: não pode excluir pedido que já foi para o ERP
        if (pedido.statusEnvio !== 'ABERTO' && pedido.statusEnvio !== 'ERRO') {
            throw new Error("Não é possível excluir um pedido que já foi enviado ou está processando.");
        }

        return await prisma.$transaction(async (tx) => {
            // Remove itens primeiro (se não houvesse cascade/referential actions)
            await tx.pedidoItem.deleteMany({
                where: { pedidoId: id }
            });
            // Remove evento de webhook pendente se houver (relacionado ao requestId/referenceId caso existisse, mas não precisa pois não foi enviado)
            // Remove pedido
            return await tx.pedido.delete({
                where: { id }
            });
        });
    }
};

module.exports = pedidoService;
