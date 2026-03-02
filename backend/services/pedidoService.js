const prisma = require('../config/database');
const promocaoService = require('./promocaoService');
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
                usuarioLancamento: {
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
            canalOrigem,
            usuarioLancamentoId,
            itens, // array de objetos
            statusEnvio // ABERTO ou ENVIAR
        } = dadosPedido;

        if (!clienteId || !itens || itens.length === 0) {
            throw new Error('Cliente e itens são obrigatórios');
        }

        // Buscar promoções ativas de todos os produtos antes de entrar na transação
        const produtoIds = [...new Set(itens.map(item => item.produtoId))];
        const promocoesAtivas = {};
        for (const prodId of produtoIds) {
            const promo = await promocaoService.buscarAtivaPorProduto(prodId);
            if (promo) promocoesAtivas[prodId] = promo;
        }

        // Calcular valor total para avaliação de condicionais
        const valorTotalEstimado = itens.reduce((acc, item) =>
            acc + parseFloat(item.valor) * parseFloat(item.quantidade), 0
        );

        // A validação de Flex e atualização do vendedor ocorrerá dentro de uma transação
        return await prisma.$transaction(async (tx) => {
            let flexTotalPedido = 0;

            // Montar os itens com avaliação de promoção
            const itensData = itens.map(item => {
                const valorDigitado = parseFloat(item.valor);
                const valorBase = parseFloat(item.valorBase);
                const quantidade = parseFloat(item.quantidade);

                // Verificar promoção ativa para este produto
                const promo = promocoesAtivas[item.produtoId] || null;
                let emPromocao = false;
                let flexItem;

                if (promo) {
                    const liberada = promocaoService.avaliarLiberada(promo, itens, valorTotalEstimado);
                    if (liberada) {
                        emPromocao = true;
                        const precoPromoBase = parseFloat(promo.precoPromocional);
                        flexItem = promocaoService.calcularFlexComPromocao(valorDigitado, valorBase, precoPromoBase, quantidade);
                    } else {
                        flexItem = (valorDigitado - valorBase) * quantidade;
                    }
                } else {
                    flexItem = (valorDigitado - valorBase) * quantidade;
                }

                flexTotalPedido += flexItem;

                return {
                    produtoId: item.produtoId,
                    descricao: item.descricao,
                    quantidade,
                    valor: valorDigitado,
                    valorBase,
                    flexGerado: flexItem,
                    emPromocao,
                    promocaoId: emPromocao && promo ? promo.id : null,
                    nomePromocao: emPromocao && promo ? promo.nome : null,
                    tipoPromocao: emPromocao && promo ? promo.tipo : null
                };
            });

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
                    canalOrigem,
                    usuarioLancamentoId: usuarioLancamentoId || undefined,
                    statusEnvio: statusEnvio || 'ABERTO',
                    itens: {
                        create: itensData
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

            if (isSomenteRevisao) {
                return await tx.pedido.update({
                    where: { id },
                    data: { revisaoPendente: dadosPedido.revisaoPendente },
                    include: { itens: true }
                });
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
                    idContaFinanceira: dadosPedido.idContaFinanceira,
                    dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
                    usuarioLancamentoId: dadosPedido.usuarioLancamentoId || undefined,
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
                    clienteId: clienteId,
                    statusEnvio: { not: 'EXCLUIDO' }
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

    // Retorna os produtos que o cliente já comprou, com as últimas 5 compras de cada
    // Ordenado: os mais recentemente comprados primeiro
    historicoComprasCliente: async (clienteId) => {
        // Busca todos os itens de pedidos fechados deste cliente
        const itens = await prisma.pedidoItem.findMany({
            where: {
                pedido: {
                    clienteId: clienteId,
                    statusEnvio: { not: 'EXCLUIDO' }
                }
            },
            orderBy: { pedido: { dataVenda: 'desc' } },
            select: {
                valor: true,
                quantidade: true,
                produtoId: true,
                pedido: { select: { dataVenda: true, numero: true, canalOrigem: true, usuarioLancamento: { select: { nome: true } } } }
            }
        });

        // Agrupar por produto mantendo as 5 últimas compras
        const porProduto = new Map();
        for (const item of itens) {
            if (!item.produtoId) continue;
            if (!porProduto.has(item.produtoId)) {
                porProduto.set(item.produtoId, {
                    produtoId: item.produtoId,
                    ultimaCompra: item.pedido.dataVenda,
                    ultimoPreco: Number(item.valor),
                    compras: []
                });
            }
            const entry = porProduto.get(item.produtoId);
            if (entry.compras.length < 5) {
                entry.compras.push({
                    data: item.pedido.dataVenda,
                    numero: item.pedido.numero,
                    quantidade: Number(item.quantidade),
                    valor: Number(item.valor)
                });
            }
        }

        // Retornar como array ordenado pela compra mais recente
        return Array.from(porProduto.values()).sort(
            (a, b) => new Date(b.ultimaCompra) - new Date(a.ultimaCompra)
        );
    },



    // 4. Detalhar um pedido
    detalhar: async (id) => {
        return await prisma.pedido.findUnique({
            where: { id },
            include: {
                cliente: true,
                vendedor: true,
                usuarioLancamento: true,
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
