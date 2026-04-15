const prisma = require('../config/database');
const promocaoService = require('./promocaoService');
const clienteInsightService = require('./clienteInsightService');
const { calcularItensComFlex, calcularDiferencaFlex, gerarParcelasData } = require('./pedidoCalculos');
const estoqueService = require('./estoqueService');

const pedidoService = {
    // Resumo de pendências: conta pedidos por tipo e status (leve, só COUNT)
    resumoPendencias: async (filtros = {}) => {
        const { vendedorId, dataVendaDe, dataVendaAte } = filtros;

        const where = {
            situacaoCA: { not: 'FATURADO' },
        };
        if (vendedorId) where.vendedorId = vendedorId;
        if (dataVendaDe || dataVendaAte) {
            where.dataVenda = {};
            if (dataVendaDe) where.dataVenda.gte = new Date(dataVendaDe + 'T00:00:00.000Z');
            if (dataVendaAte) where.dataVenda.lte = new Date(dataVendaAte + 'T23:59:59.999Z');
        }

        const rows = await prisma.pedido.groupBy({
            by: ['especial', 'bonificacao', 'statusEnvio', 'situacaoCA'],
            where,
            _count: { id: true },
        });

        // Agrupa em estrutura útil para o frontend
        const resultado = { pedidos: {}, especiais: {}, bonificacao: {} };
        for (const r of rows) {
            const tipo = r.bonificacao ? 'bonificacao' : r.especial ? 'especiais' : 'pedidos';
            // Para APROVADO/EM_ABERTO usamos situacaoCA como chave, senão statusEnvio
            const status = ['APROVADO', 'EM_ABERTO'].includes(r.situacaoCA) ? r.situacaoCA : r.statusEnvio;
            resultado[tipo][status] = (resultado[tipo][status] || 0) + r._count.id;
        }
        return resultado;
    },

    // 1. Listagem de pedidos com filtros (para a tela de histórico)
    listar: async (filtros) => {
        const { statusEnvio, vendedorId, clienteId, especial, bonificacao, dataVendaDe, dataVendaAte, createdAtDe, createdAtAte, vencimentoDe, vencimentoAte, embarqueNumero, motorista, busca } = filtros;

        const where = {};
        if (statusEnvio) where.statusEnvio = statusEnvio;
        if (vendedorId) where.vendedorId = vendedorId;
        if (clienteId) where.clienteId = clienteId;

        if (vencimentoDe || vencimentoAte) {
            where.primeiroVencimento = {};
            if (vencimentoDe) where.primeiroVencimento.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) where.primeiroVencimento.lte = new Date(vencimentoAte + 'T23:59:59.999Z');
        }

        if (embarqueNumero) {
            const num = parseInt(embarqueNumero);
            if (!isNaN(num)) where.embarque = { ...(where.embarque || {}), numero: num };
        }

        if (motorista) {
            where.embarque = {
                ...(where.embarque || {}),
                responsavel: { nome: { contains: motorista, mode: 'insensitive' } }
            };
        }

        if (bonificacao !== undefined && bonificacao !== '') {
            where.bonificacao = (bonificacao === 'true' || bonificacao === true);
        }

        if (especial !== undefined && especial !== '') {
            where.especial = (especial === 'true' || especial === true);
        }

        // Filtro por Data de Entrega (dataVenda)
        if (dataVendaDe || dataVendaAte) {
            where.dataVenda = {};
            if (dataVendaDe) where.dataVenda.gte = new Date(dataVendaDe + 'T00:00:00.000Z');
            if (dataVendaAte) where.dataVenda.lte = new Date(dataVendaAte + 'T23:59:59.999Z');
        }

        // Filtro por Data de Criação (createdAt)
        if (createdAtDe || createdAtAte) {
            where.createdAt = {};
            if (createdAtDe) where.createdAt.gte = new Date(createdAtDe + 'T00:00:00.000Z');
            if (createdAtAte) where.createdAt.lte = new Date(createdAtAte + 'T23:59:59.999Z');
        }

        // Busca Genérica
        if (busca && busca.trim() !== '') {
            const termo = busca.trim();
            const numBusca = parseInt(termo);
            
            where.OR = [
                { cliente: { Nome: { contains: termo, mode: 'insensitive' } } },
                { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } },
                { cliente: { Documento: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Cidade: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Bairro: { contains: termo, mode: 'insensitive' } } },
                { vendedor: { nome: { contains: termo, mode: 'insensitive' } } },
                !isNaN(numBusca) ? { numero: numBusca } : null,
                // Suporte para busca por prefixo ZZ#, BN# e #
                termo.toLowerCase().startsWith('zz#') && !isNaN(parseInt(termo.substring(3)))
                    ? { numero: parseInt(termo.substring(3)), especial: true } : null,
                termo.toLowerCase().startsWith('bn#') && !isNaN(parseInt(termo.substring(3)))
                    ? { numero: parseInt(termo.substring(3)), bonificacao: true } : null,
                termo.startsWith('#') && !isNaN(parseInt(termo.substring(1)))
                    ? { numero: parseInt(termo.substring(1)), especial: false, bonificacao: false } : null,
            ].filter(Boolean);
        }

        return await prisma.pedido.findMany({
            where,
            include: {
                cliente: {
                    select: { Nome: true, NomeFantasia: true, Documento: true, End_Cidade: true, End_Bairro: true }
                },
                vendedor: {
                    select: { id: true, nome: true }
                },
                usuarioLancamento: {
                    select: { nome: true }
                },
                itens: {
                    include: {
                        produto: { select: { nome: true, codigo: true } }
                    }
                },
                itensDevolvidos: {
                    include: {
                        produto: { select: { nome: true } }
                    }
                },
                pagamentosReais: {
                    select: { formaPagamentoNome: true, valor: true }
                },
                embarque: {
                    select: { id: true, numero: true, responsavel: { select: { id: true, nome: true } } }
                },
                devolucoes: {
                    where: { status: 'ATIVA' },
                    select: {
                        id: true, numero: true, tipo: true, escopo: true,
                        valorTotal: true, dataDevolucao: true, motivo: true,
                        notaDevolucaoCA: true, pdfDevolucaoUrl: true, pdfBoletoUrl: true, processadoCA: true,
                        itens: { select: { quantidade: true, valorUnitario: true, produto: { select: { nome: true } } } }
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
            nomeCondicaoPagamento,
            qtdParcelas,
            primeiroVencimento,
            intervaloDias,
            idContaFinanceira,
            idCategoria,
            latLng,
            canalOrigem,
            usuarioLancamentoId,
            especial, // Pedido especial (sem nota)
            bonificacao, // Pedido bonificação (não vai pro CA, valor 0)
            itens, // array de objetos
            statusEnvio, // ABERTO ou ENVIAR
            valorFrete
        } = dadosPedido;

        if (!clienteId || !itens || itens.length === 0) {
            throw new Error('Cliente e itens são obrigatórios');
        }

        // Verificar se o vendedor está ativo
        if (vendedorId) {
            const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { ativo: true } });
            if (vendedor && !vendedor.ativo) {
                throw new Error('O vendedor deste cliente está inativo. Atualize o vendedor no cadastro do cliente antes de emitir o pedido.');
            }
        }

        // Buscar categoria do cliente para regras de flex/desconto
        const clienteComCategoria = await prisma.cliente.findUnique({
            where: { UUID: clienteId },
            select: { categoriaCliente: { select: { isentoFlex: true, semLimiteDesconto: true } } }
        });
        const isentoFlex = clienteComCategoria?.categoriaCliente?.isentoFlex || false;

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
            // Montar os itens com avaliação de promoção (função pura)
            const { itensData, flexTotalPedido } = calcularItensComFlex(itens, promocoesAtivas, valorTotalEstimado);

            // Se pedido especial, atribuir número ZZ sequencial
            let numeroEspecial = undefined;
            if (especial && statusEnvio === 'ENVIAR') {
                const ultimoEspecial = await tx.pedido.findFirst({
                    where: { especial: true, numero: { not: null } },
                    orderBy: { numero: 'desc' },
                    select: { numero: true }
                });
                numeroEspecial = (ultimoEspecial?.numero || 0) + 1;
            }

            // Se pedido bonificação, atribuir número BN sequencial
            let numeroBonificacao = undefined;
            if (bonificacao && statusEnvio === 'ENVIAR') {
                const ultimoBonificacao = await tx.pedido.findFirst({
                    where: { bonificacao: true, numero: { not: null } },
                    orderBy: { numero: 'desc' },
                    select: { numero: true }
                });
                numeroBonificacao = (ultimoBonificacao?.numero || 0) + 1;
            }

            // Criação base do pedido
            const novoPedido = await tx.pedido.create({
                data: {
                    clienteId,
                    vendedorId,
                    dataVenda: new Date(dataVenda),
                    observacoes,
                    especial: !!especial,
                    bonificacao: !!bonificacao,
                    numero: numeroBonificacao || numeroEspecial || undefined,
                    tipoPagamento: tipoPagamento || (especial ? 'DINHEIRO' : (bonificacao ? 'DINHEIRO' : undefined)),
                    opcaoCondicaoPagamento: opcaoCondicaoPagamento || undefined,
                    nomeCondicaoPagamento: nomeCondicaoPagamento || (especial ? 'Especial' : (bonificacao ? 'Bonificação' : null)),
                    qtdParcelas: qtdParcelas ? parseInt(qtdParcelas) : 1,
                    primeiroVencimento: primeiroVencimento ? new Date(primeiroVencimento) : undefined,
                    intervaloDias: intervaloDias ? parseInt(intervaloDias) : 0,
                    idContaFinanceira: idContaFinanceira || undefined,
                    idCategoria,
                    latLng,
                    canalOrigem,
                    usuarioLancamentoId: usuarioLancamentoId || undefined,
                    statusEnvio: statusEnvio || 'ABERTO',
                    valorFrete: valorFrete != null && valorFrete !== '' ? Number(valorFrete) : null,
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
            // Pula toda lógica de flex se a categoria do cliente é isenta
            if (vendedorId && !isentoFlex) {
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

            // 🟢 Async Detached Trigger para Etapa 2 Comercial Intelligence
            if (novoPedido.statusEnvio === 'ENVIAR') {
                setTimeout(() => {
                    clienteInsightService.recalcularCliente(clienteId).catch(console.error);
                }, 0);
            }

            // Recalcula reservas de estoque para todos os pedidos criados
            setTimeout(() => {
                estoqueService.recalcularPedido(novoPedido.id).catch(err =>
                    console.error(`[Estoque] Falha ao recalcular estoque do pedido ${novoPedido.id}:`, err.message)
                );
            }, 0);

            // Delivery (Kit Festa): cria delivery_status se houver item de categoria ativa
            setTimeout(() => {
                const deliveryService = require('./deliveryService');
                deliveryService.garantirStatusParaPedido(novoPedido.id).catch(err =>
                    console.error(`[Delivery] Falha ao criar status do pedido ${novoPedido.id}:`, err.message)
                );
            }, 0);

            // Gerar Conta a Receber para todos os pedidos enviados (exceto bonificação)
            if (statusEnvio === 'ENVIAR' && !bonificacao) {
                const valorTotal = itensData.reduce((s, i) => s + (i.valor * i.quantidade), 0);
                const parcelasData = gerarParcelasData({ valorTotal, qtdParcelas, intervaloDias, primeiroVencimento, dataVenda });

                await tx.contaReceber.create({
                    data: {
                        pedidoId: novoPedido.id,
                        clienteId,
                        origem: especial ? 'ESPECIAL' : 'FATURADO_CA',
                        valorTotal: Math.round(valorTotal * 100) / 100,
                        status: 'ABERTO',
                        parcelas: { create: parcelasData }
                    }
                });
            }

            return novoPedido;
        });
    },

    editar: async (id, dadosPedido) => {
        const { clienteId, vendedorId, itens, statusEnvio, observacoes, dataVenda, opcaoCondicaoPagamento, nomeCondicaoPagamento, tipoPagamento, especial, bonificacao, valorFrete } = dadosPedido;

        return await prisma.$transaction(async (tx) => {
            const pedidoAntigo = await tx.pedido.findUnique({
                where: { id },
                include: { itens: true }
            });

            if (!pedidoAntigo) throw new Error('Pedido não encontrado');

            // Permite edição de 'revisaoPendente' mesmo se o pedido não estiver ABERTO
            const isSomenteRevisao = Object.keys(dadosPedido).length === 1 && typeof dadosPedido.revisaoPendente === 'boolean';

            const podeEditarEspecial = pedidoAntigo.especial && pedidoAntigo.statusEnvio === 'ENVIAR';
            const podeEditarBonificacao = pedidoAntigo.bonificacao && pedidoAntigo.statusEnvio === 'ENVIAR';

            if (!['ABERTO', 'ERRO'].includes(pedidoAntigo.statusEnvio) && !isSomenteRevisao && !podeEditarEspecial && !podeEditarBonificacao) {
                throw new Error('Só é permitido editar dados de vendas em Rascunho (Em Aberto), com Erro de Envio ou Especiais/Bonificação Pendentes.');
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

            // Se for enviar pedido especial ou bonificacao e ainda nao tem numero, gera a sequencia
            let numeroGerado = undefined;
            if (statusEnvio === 'ENVIAR') {
                const isEspecial = especial !== undefined ? !!especial : pedidoAntigo.especial;
                const isBonificacao = bonificacao !== undefined ? !!bonificacao : pedidoAntigo.bonificacao;
                
                if (isEspecial && !pedidoAntigo.numero) {
                    const ultimoEspecial = await tx.pedido.findFirst({
                        where: { especial: true, numero: { not: null } },
                        orderBy: { numero: 'desc' },
                        select: { numero: true }
                    });
                    numeroGerado = (ultimoEspecial?.numero || 0) + 1;
                } else if (isBonificacao && !pedidoAntigo.numero) {
                    const ultimoBonificacao = await tx.pedido.findFirst({
                        where: { bonificacao: true, numero: { not: null } },
                        orderBy: { numero: 'desc' },
                        select: { numero: true }
                    });
                    numeroGerado = (ultimoBonificacao?.numero || 0) + 1;
                }
            }

            const pedidoAtualizado = await tx.pedido.update({
                where: { id },
                data: {
                    cliente: { connect: { UUID: clienteId } },
                    ...(vendedorId ? { vendedor: { connect: { id: vendedorId } } } : {}),
                    flexTotal: flexTotalPedido,
                    statusEnvio,
                    observacoes,
                    especial: especial !== undefined ? !!especial : undefined,
                    bonificacao: bonificacao !== undefined ? !!bonificacao : undefined,
                    ...(numeroGerado !== undefined ? { numero: numeroGerado } : {}),
                    opcaoCondicaoPagamento,
                    nomeCondicaoPagamento: nomeCondicaoPagamento || undefined,
                    tipoPagamento: tipoPagamento || undefined,
                    idContaFinanceira: dadosPedido.idContaFinanceira,
                    erroEnvio: statusEnvio === 'ENVIAR' ? null : undefined,
                    dataVenda: dataVenda ? new Date(dataVenda) : new Date(),
                    usuarioLancamentoId: dadosPedido.usuarioLancamentoId || undefined,
                    ...(valorFrete !== undefined ? { valorFrete: valorFrete != null && valorFrete !== '' ? Number(valorFrete) : null } : {}),
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
                    const { diferencaFlex, diferencaModulo } = calcularDiferencaFlex(flexTotalPedido, pedidoAntigo);

                    const novoFlexDisponivel = parseFloat(vendedor.flexDisponivel) + diferencaFlex;
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
                            Flex_utilizado: { increment: diferencaModulo }
                        }
                    });
                }

                if (pedidoAntigo.statusEnvio === 'ENVIAR') {
                    const crExistente = await tx.contaReceber.findUnique({
                        where: { pedidoId: id },
                        include: { parcelas: { select: { status: true } } }
                    });
                    if (crExistente?.parcelas?.some(p => p.status === 'PAGO')) {
                        throw new Error("Não é possível editar: existem parcelas já pagas nesta conta a receber.");
                    }
                    await tx.contaReceber.deleteMany({ where: { pedidoId: id } });

                    const valorTotalCalc = novosItens.reduce((s, i) => s + (i.valor * i.quantidade), 0);
                    const parcelasData = gerarParcelasData({
                        valorTotal: valorTotalCalc,
                        qtdParcelas: dadosPedido.qtdParcelas,
                        intervaloDias: dadosPedido.intervaloDias,
                        primeiroVencimento: dadosPedido.primeiroVencimento,
                        dataVenda: dataVenda || new Date()
                    });

                    await tx.contaReceber.create({
                        data: {
                            pedidoId: id,
                            clienteId,
                            origem: pedidoAntigo.especial ? 'ESPECIAL' : 'FATURADO_CA',
                            valorTotal: Math.round(valorTotalCalc * 100) / 100,
                            status: 'ABERTO',
                            parcelas: { create: parcelasData }
                        }
                    });
                }

                // 🟢 Async Detached Trigger para Etapa 2 Comercial Intelligence
                setTimeout(() => {
                    clienteInsightService.recalcularCliente(clienteId).catch(console.error);
                }, 0);

            }

            // Recalcula reservas de estoque após qualquer edição de pedido
            setTimeout(() => {
                estoqueService.recalcularPedido(id).catch(err =>
                    console.error(`[Estoque] Falha ao recalcular estoque pedido ${id}:`, err.message)
                );
            }, 0);

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
                },
                itensDevolvidos: {
                    include: { produto: { select: { id: true, nome: true } } }
                }
            }
        });
    },

    // 5. Excluir pedido (apenas se não estiver ENVIADO/SINCRONIZADO)
    excluir: async (id) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id },
            include: { contaReceber: { include: { parcelas: { select: { status: true } } } } }
        });
        if (!pedido) throw new Error("Pedido não encontrado");

        // Travas de exclusão
        if (pedido.embarqueId) {
            throw new Error("Não é possível excluir: pedido está vinculado a uma carga/embarque.");
        }
        if (pedido.statusEntrega && pedido.statusEntrega !== 'PENDENTE') {
            throw new Error("Não é possível excluir: pedido já foi entregue ou devolvido.");
        }
        if (['FATURADO', 'EM_ABERTO'].includes(pedido.situacaoCA)) {
            throw new Error("Não é possível excluir: pedido já foi faturado no Conta Azul.");
        }
        if (pedido.contaReceber && pedido.contaReceber.status === 'QUITADO') {
            throw new Error("Não é possível excluir: conta a receber já foi quitada.");
        }
        if (pedido.contaReceber?.parcelas?.some(p => p.status === 'PAGO')) {
            throw new Error("Não é possível excluir: existem parcelas já pagas nesta conta a receber.");
        }

        // Coleta produtos afetados antes de excluir (para recalcular estoque depois)
        const produtosAfetados = pedido.itens
            ? [...new Set(pedido.itens.map(i => i.produtoId))]
            : (await prisma.pedidoItem.findMany({ where: { pedidoId: id }, select: { produtoId: true } })).map(i => i.produtoId);

        const resultado = await prisma.$transaction(async (tx) => {
            // Remove dependências
            await tx.entregaItemDevolvido.deleteMany({ where: { pedidoId: id } });
            await tx.pedidoPagamentoReal.deleteMany({ where: { pedidoId: id } });
            await tx.movimentacaoEstoque.deleteMany({ where: { pedidoId: id } });
            await tx.pedidoItem.deleteMany({ where: { pedidoId: id } });
            // Remove conta a receber e parcelas se existirem
            const cr = await tx.contaReceber.findUnique({ where: { pedidoId: id } });
            if (cr) {
                await tx.parcela.deleteMany({ where: { contaReceberId: cr.id } });
                await tx.contaReceber.delete({ where: { id: cr.id } });
            }
            // Remove conferência de caixa se existir
            await tx.caixaEntregaConferida.deleteMany({ where: { pedidoId: id } });
            // Remove pedido
            return await tx.pedido.delete({ where: { id } });
        });

        // Recalcula estoque dos produtos afetados (a reserva cai porque os itens foram excluídos)
        for (const produtoId of produtosAfetados) {
            estoqueService.recalcularEstoqueProduto(produtoId).catch(err =>
                console.error(`[Estoque] Falha ao recalcular produto ${produtoId} após exclusão do pedido ${id}:`, err.message)
            );
        }

        return resultado;
    }
};

module.exports = pedidoService;
