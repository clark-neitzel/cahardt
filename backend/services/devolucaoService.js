const prisma = require('../config/database');
const estoqueService = require('./estoqueService');

const devolucaoService = {

    listar: async (filtros = {}) => {
        const { clienteId, pedidoId, tipo, status, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 } = filtros;
        const where = {};

        if (clienteId) where.clienteId = clienteId;
        if (pedidoId) where.pedidoOriginalId = pedidoId;
        if (tipo) where.tipo = tipo;
        if (status) where.status = status;
        if (dataInicio || dataFim) {
            where.dataDevolucao = {};
            if (dataInicio) where.dataDevolucao.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.dataDevolucao.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.devolucao.findMany({
                where,
                include: {
                    pedidoOriginal: { select: { id: true, numero: true, especial: true, bonificacao: true, statusEntrega: true, nomeCondicaoPagamento: true } },
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                    registradoPor: { select: { id: true, nome: true } },
                    revertidoPor: { select: { id: true, nome: true } },
                    motorista: { select: { id: true, nome: true } },
                    itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } }
                },
                orderBy: { dataDevolucao: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.devolucao.count({ where })
        ]);

        return { items, total, pagina, tamanhoPagina };
    },

    detalhar: async (id) => {
        return prisma.devolucao.findUnique({
            where: { id },
            include: {
                pedidoOriginal: {
                    select: {
                        id: true, numero: true, especial: true, bonificacao: true,
                        statusEntrega: true, motivoDevolucao: true, dataEntrega: true,
                        nomeCondicaoPagamento: true, clienteId: true,
                        itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } },
                        itensDevolvidos: true
                    }
                },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                registradoPor: { select: { id: true, nome: true } },
                revertidoPor: { select: { id: true, nome: true } },
                motorista: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } }
            }
        });
    },

    /**
     * Cria devolução para pedido especial (sem nota CA).
     * @param {Object} params
     * @param {string} params.pedidoId - ID do pedido original
     * @param {Array} params.itens - [{ produtoId, quantidade }]
     * @param {string} params.motivo - Motivo da devolução
     * @param {string} [params.observacao]
     * @param {string} params.registradoPorId - ID do usuário que registrou
     */
    criarEspecial: async ({ pedidoId, itens, motivo, observacao, registradoPorId }) => {
        return devolucaoService._criar({
            pedidoId, itens, motivo, observacao, registradoPorId,
            tipo: 'ESPECIAL'
        });
    },

    /**
     * Cria devolução para pedido que foi pro Conta Azul (com nota).
     */
    criarContaAzul: async ({ pedidoId, itens, motivo, observacao, notaDevolucaoCA, pdfDevolucaoUrl, registradoPorId }) => {
        return devolucaoService._criar({
            pedidoId, itens, motivo, observacao, registradoPorId,
            tipo: 'CONTA_AZUL', notaDevolucaoCA, pdfDevolucaoUrl
        });
    },

    /**
     * Lógica interna de criação de devolução (compartilhada entre especial e CA).
     */
    _criar: async ({ pedidoId, itens, motivo, observacao, registradoPorId, tipo, notaDevolucaoCA, pdfDevolucaoUrl }) => {
        // 1. Buscar pedido original com tudo necessário
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true } } } },
                embarque: { select: { responsavelId: true } },
                contaReceber: { include: { parcelas: true } }
            }
        });

        if (!pedido) throw new Error('Pedido não encontrado.');
        if (!['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(pedido.statusEntrega)) {
            throw new Error('Só é possível fazer devolução de pedidos com status ENTREGUE_PARCIAL ou DEVOLVIDO.');
        }
        if (pedido.devolucaoFinalizada) {
            throw new Error('Este pedido já possui uma devolução finalizada.');
        }

        // 2. Validar itens contra o pedido original
        const itensMap = new Map(pedido.itens.map(i => [i.produtoId, i]));
        const itensValidados = [];
        let valorTotalDevolucao = 0;

        for (const item of itens) {
            const original = itensMap.get(item.produtoId);
            if (!original) throw new Error(`Produto ${item.produtoId} não encontrado no pedido original.`);

            const qtdDevolvida = parseFloat(item.quantidade);
            const qtdOriginal = parseFloat(original.quantidade);
            if (qtdDevolvida <= 0) continue;
            if (qtdDevolvida > qtdOriginal) {
                throw new Error(`Quantidade devolvida (${qtdDevolvida}) excede a quantidade original (${qtdOriginal}) do produto ${original.produto?.nome || item.produtoId}.`);
            }

            const valorUnitario = parseFloat(original.valor);
            const valorTotal = Math.round(qtdDevolvida * valorUnitario * 100) / 100;

            itensValidados.push({
                produtoId: item.produtoId,
                quantidade: qtdDevolvida,
                valorUnitario,
                valorTotal
            });

            valorTotalDevolucao += valorTotal;
        }

        if (itensValidados.length === 0) throw new Error('Nenhum item válido para devolução.');

        // 3. Determinar escopo
        const todosItensDevolvidos = pedido.itens.every(pi => {
            const dev = itensValidados.find(iv => iv.produtoId === pi.produtoId);
            return dev && dev.quantidade >= parseFloat(pi.quantidade);
        });
        const escopo = todosItensDevolvidos ? 'TOTAL' : 'PARCIAL';

        // 4. Contexto da entrega
        const motoristaId = pedido.embarque?.responsavelId || null;
        const dataEntregaOriginal = pedido.dataEntrega || null;
        const caixaDataReferencia = pedido.dataEntrega
            ? pedido.dataEntrega.toISOString().slice(0, 10)
            : null;

        // 5. Snapshot das parcelas antes do ajuste
        const snapshotParcelas = pedido.contaReceber?.parcelas?.map(p => ({
            id: p.id,
            numeroParcela: p.numeroParcela,
            valor: parseFloat(p.valor),
            status: p.status
        })) || null;

        // 6. Executar tudo em transação
        const devolucao = await prisma.$transaction(async (tx) => {
            // 6a. Criar devolução
            const dev = await tx.devolucao.create({
                data: {
                    pedidoOriginalId: pedidoId,
                    clienteId: pedido.clienteId,
                    tipo,
                    escopo,
                    motivo,
                    observacao: observacao || null,
                    notaDevolucaoCA: notaDevolucaoCA || null,
                    pdfDevolucaoUrl: pdfDevolucaoUrl || null,
                    motoristaId,
                    dataEntregaOriginal,
                    caixaDataReferencia,
                    registradoPorId,
                    valorTotal: Math.round(valorTotalDevolucao * 100) / 100,
                    snapshotParcelas,
                    itens: {
                        create: itensValidados.map(iv => ({
                            produtoId: iv.produtoId,
                            quantidade: iv.quantidade,
                            valorUnitario: iv.valorUnitario,
                            valorTotal: iv.valorTotal
                        }))
                    }
                },
                include: {
                    itens: { include: { produto: { select: { id: true, nome: true } } } }
                }
            });

            // 6b. Marcar pedido como devolução finalizada
            await tx.pedido.update({
                where: { id: pedidoId },
                data: { devolucaoFinalizada: true }
            });

            // 6c. Ajustar conta a receber
            if (pedido.contaReceber) {
                const conta = pedido.contaReceber;
                const valorOriginalPedido = parseFloat(conta.valorTotal);

                if (escopo === 'TOTAL') {
                    // Cancelar todas as parcelas pendentes e marcar como DEVOLVIDO
                    await tx.parcela.updateMany({
                        where: { contaReceberId: conta.id, status: { not: 'PAGO' } },
                        data: { status: 'CANCELADO' }
                    });
                    await tx.contaReceber.update({
                        where: { id: conta.id },
                        data: { status: 'DEVOLVIDO' }
                    });
                } else {
                    // Reduzir proporcionalmente as parcelas pendentes
                    const ratio = valorTotalDevolucao / valorOriginalPedido;
                    const parcelasPendentes = conta.parcelas.filter(p => p.status !== 'PAGO' && p.status !== 'CANCELADO');

                    let somaAjustada = 0;
                    for (let i = 0; i < parcelasPendentes.length; i++) {
                        const p = parcelasPendentes[i];
                        const valorOriginal = parseFloat(p.valor);
                        let novoValor;

                        if (i === parcelasPendentes.length - 1) {
                            // Última parcela: ajustar para compensar arredondamento
                            const totalPendentesOriginal = parcelasPendentes.reduce((s, pp) => s + parseFloat(pp.valor), 0);
                            const totalReduzido = totalPendentesOriginal - valorTotalDevolucao;
                            novoValor = Math.max(0, Math.round((totalReduzido - somaAjustada) * 100) / 100);
                        } else {
                            novoValor = Math.max(0, Math.round(valorOriginal * (1 - ratio) * 100) / 100);
                            somaAjustada += novoValor;
                        }

                        await tx.parcela.update({
                            where: { id: p.id },
                            data: { valor: novoValor }
                        });
                    }

                    // Atualizar valor total da conta
                    const novoTotal = Math.max(0, Math.round((valorOriginalPedido - valorTotalDevolucao) * 100) / 100);
                    await tx.contaReceber.update({
                        where: { id: conta.id },
                        data: { valorTotal: novoTotal }
                    });
                }
            }

            return dev;
        });

        // 6d. Creditar estoque (fora da transação principal pois estoqueService tem sua própria)
        try {
            await estoqueService.creditarDevolucao(
                pedidoId,
                itensValidados.map(iv => ({ produtoId: iv.produtoId, quantidade: iv.quantidade })),
                registradoPorId
            );
        } catch (err) {
            console.error(`[Devolucao] Erro ao creditar estoque para devolução ${devolucao.id}:`, err.message);
        }

        return devolucao;
    },

    /**
     * Reverte uma devolução ativa.
     */
    reverter: async ({ devolucaoId, motivoReversao, revertidoPorId }) => {
        const devolucao = await prisma.devolucao.findUnique({
            where: { id: devolucaoId },
            include: {
                itens: true,
                pedidoOriginal: {
                    include: {
                        contaReceber: { include: { parcelas: true } }
                    }
                }
            }
        });

        if (!devolucao) throw new Error('Devolução não encontrada.');
        if (devolucao.status !== 'ATIVA') throw new Error('Só é possível reverter devoluções com status ATIVA.');

        await prisma.$transaction(async (tx) => {
            // 1. Marcar devolução como revertida
            await tx.devolucao.update({
                where: { id: devolucaoId },
                data: {
                    status: 'REVERTIDA',
                    revertidoPorId,
                    revertidoEm: new Date(),
                    motivoReversao: motivoReversao || null
                }
            });

            // 2. Limpar flag no pedido
            await tx.pedido.update({
                where: { id: devolucao.pedidoOriginalId },
                data: { devolucaoFinalizada: false }
            });

            // 3. Restaurar parcelas do snapshot
            if (devolucao.snapshotParcelas && devolucao.pedidoOriginal.contaReceber) {
                const conta = devolucao.pedidoOriginal.contaReceber;
                const snapshot = devolucao.snapshotParcelas;

                for (const snap of snapshot) {
                    await tx.parcela.update({
                        where: { id: snap.id },
                        data: {
                            valor: snap.valor,
                            status: snap.status
                        }
                    });
                }

                // Restaurar valor total e status da conta
                const valorOriginal = snapshot.reduce((s, p) => s + p.valor, 0);
                const pagas = snapshot.filter(p => p.status === 'PAGO').length;
                const novoStatus = pagas > 0 ? 'PARCIAL' : 'ABERTO';

                await tx.contaReceber.update({
                    where: { id: conta.id },
                    data: {
                        valorTotal: Math.round(valorOriginal * 100) / 100,
                        status: novoStatus
                    }
                });
            }
        });

        // 4. Debitar estoque de volta
        try {
            await estoqueService.debitarReversaoDevolucao(
                devolucao.pedidoOriginalId,
                devolucao.itens.map(i => ({ produtoId: i.produtoId, quantidade: parseFloat(i.quantidade) })),
                revertidoPorId
            );
        } catch (err) {
            console.error(`[Devolucao] Erro ao debitar estoque na reversão ${devolucaoId}:`, err.message);
        }

        return { success: true };
    }
};

module.exports = devolucaoService;
