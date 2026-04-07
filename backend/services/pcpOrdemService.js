const prisma = require('../config/database');
const pcpEstoqueService = require('./pcpEstoqueService');
const estoqueService = require('./estoqueService');

const pcpOrdemService = {

    listar: async ({ status, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 }) => {
        const where = {};
        if (status) where.status = status;
        if (dataInicio || dataFim) {
            where.dataPlanejada = {};
            if (dataInicio) where.dataPlanejada.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.dataPlanejada.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.ordemProducao.findMany({
                where,
                include: {
                    receita: {
                        select: { id: true, nome: true, versao: true, itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true } } }
                    },
                    _count: { select: { itensConsumo: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.ordemProducao.count({ where })
        ]);

        return { items, total, pagina, tamanhoPagina };
    },

    buscarPorId: async (id) => {
        return prisma.ordemProducao.findUnique({
            where: { id },
            include: {
                receita: {
                    select: { id: true, nome: true, versao: true, itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true, produtoId: true } } }
                },
                itensConsumo: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                    }
                }
            }
        });
    },

    criar: async ({ receitaId, quantidadePlanejada, dataPlanejada, observacoes, criadoPorId }) => {
        const receita = await prisma.receita.findUnique({
            where: { id: receitaId },
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                itens: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                    }
                }
            }
        });
        if (!receita) throw new Error('Receita não encontrada');

        const rendimentoBase = parseFloat(receita.rendimentoBase);
        const fator = parseFloat(quantidadePlanejada) / rendimentoBase;

        // Snapshot da receita
        const snapshot = {
            receitaId: receita.id,
            versao: receita.versao,
            nome: receita.nome,
            rendimentoBase,
            itemResultante: {
                id: receita.itemPcp.id,
                nome: receita.itemPcp.nome,
                codigo: receita.itemPcp.codigo,
                tipo: receita.itemPcp.tipo,
                unidade: receita.itemPcp.unidade
            },
            itens: receita.itens.map(i => ({
                itemPcpId: i.itemPcpId,
                nome: i.itemPcp.nome,
                codigo: i.itemPcp.codigo,
                tipo: i.tipo,
                unidade: i.itemPcp.unidade,
                quantidadeBase: parseFloat(i.quantidade),
                quantidadeEscalada: Math.round(parseFloat(i.quantidade) * fator * 1000) / 1000
            }))
        };

        return prisma.$transaction(async (tx) => {
            const ordem = await tx.ordemProducao.create({
                data: {
                    receitaId,
                    quantidadePlanejada: parseFloat(quantidadePlanejada),
                    fatorEscala: Math.round(fator * 10000) / 10000,
                    dataPlanejada: new Date(dataPlanejada),
                    receitaSnapshot: snapshot,
                    observacoes: observacoes || null,
                    criadoPorId: criadoPorId || null
                }
            });

            // Criar itens de consumo a partir do snapshot
            for (const item of snapshot.itens) {
                await tx.ordemConsumo.create({
                    data: {
                        ordemProducaoId: ordem.id,
                        itemPcpId: item.itemPcpId,
                        quantidadePrevista: item.quantidadeEscalada,
                        tipo: item.tipo
                    }
                });
            }

            return tx.ordemProducao.findUnique({
                where: { id: ordem.id },
                include: {
                    receita: {
                        select: { id: true, nome: true, versao: true, itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true } } }
                    },
                    itensConsumo: {
                        include: { itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } } }
                    }
                }
            });
        });
    },

    iniciar: async (id) => {
        const ordem = await prisma.ordemProducao.findUnique({ where: { id }, select: { status: true } });
        if (!ordem) throw new Error('Ordem não encontrada');
        if (ordem.status !== 'PLANEJADA') throw new Error('Somente ordens PLANEJADA podem ser iniciadas');

        return prisma.ordemProducao.update({
            where: { id },
            data: { status: 'EM_PRODUCAO', dataInicio: new Date() }
        });
    },

    apontarConsumo: async (id, consumos) => {
        // consumos: [{ ordemConsumoId, quantidadeReal }]
        const ordem = await prisma.ordemProducao.findUnique({ where: { id }, select: { status: true } });
        if (!ordem) throw new Error('Ordem não encontrada');
        if (!['EM_PRODUCAO', 'PLANEJADA'].includes(ordem.status)) {
            throw new Error('Só é possível apontar consumo em ordens PLANEJADA ou EM_PRODUCAO');
        }

        return prisma.$transaction(async (tx) => {
            for (const c of consumos) {
                await tx.ordemConsumo.update({
                    where: { id: c.ordemConsumoId },
                    data: { quantidadeReal: parseFloat(c.quantidadeReal) }
                });
            }
            return tx.ordemProducao.findUnique({
                where: { id },
                include: {
                    itensConsumo: {
                        include: { itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } } }
                    }
                }
            });
        });
    },

    finalizar: async (id, { quantidadeProduzida, criadoPorId }) => {
        const ordem = await prisma.ordemProducao.findUnique({
            where: { id },
            include: {
                itensConsumo: { include: { itemPcp: true } },
                receita: { include: { itemPcp: true } }
            }
        });
        if (!ordem) throw new Error('Ordem não encontrada');
        if (!['EM_PRODUCAO', 'PLANEJADA'].includes(ordem.status)) {
            throw new Error('Somente ordens EM_PRODUCAO ou PLANEJADA podem ser finalizadas');
        }

        // Transação PCP: deduzir consumos e adicionar produção
        await prisma.$transaction(async (tx) => {
            // 1. Deduzir cada item consumido
            for (const consumo of ordem.itensConsumo) {
                const qtd = parseFloat(consumo.quantidadeReal) > 0
                    ? parseFloat(consumo.quantidadeReal)
                    : parseFloat(consumo.quantidadePrevista);

                await pcpEstoqueService.ajustar({
                    itemPcpId: consumo.itemPcpId,
                    tipo: 'SAIDA',
                    quantidade: qtd,
                    motivo: 'PRODUCAO_CONSUMO',
                    ordemProducaoId: id,
                    observacao: `Consumo OP #${ordem.numero}`,
                    criadoPorId
                }, tx);
            }

            // 2. Adicionar produção ao item resultante
            const itemPa = ordem.receita.itemPcp;
            await pcpEstoqueService.ajustar({
                itemPcpId: itemPa.id,
                tipo: 'ENTRADA',
                quantidade: parseFloat(quantidadeProduzida),
                motivo: 'PRODUCAO_ENTRADA',
                ordemProducaoId: id,
                observacao: `Produção OP #${ordem.numero}`,
                criadoPorId
            }, tx);

            // 3. Atualizar status da ordem
            await tx.ordemProducao.update({
                where: { id },
                data: {
                    status: 'FINALIZADA',
                    quantidadeProduzida: parseFloat(quantidadeProduzida),
                    dataFim: new Date()
                }
            });
        });

        // 4. Bridge: atualizar estoque comercial se PA tem produtoId
        const itemPa = ordem.receita.itemPcp;
        if (itemPa.produtoId) {
            try {
                await estoqueService.ajustar({
                    produtoId: itemPa.produtoId,
                    tipo: 'ENTRADA',
                    quantidade: parseFloat(quantidadeProduzida),
                    motivo: 'PRODUCAO',
                    observacao: `Produção PCP OP #${ordem.numero}`,
                    vendedorId: criadoPorId
                });
            } catch (err) {
                console.error('[PCP] Erro ao atualizar estoque comercial:', err.message);
                // Não falha a finalização por erro no bridge
            }
        }

        return prisma.ordemProducao.findUnique({
            where: { id },
            include: {
                receita: { select: { nome: true, versao: true, itemPcp: { select: { nome: true, produtoId: true } } } },
                itensConsumo: { include: { itemPcp: { select: { nome: true, unidade: true } } } }
            }
        });
    },

    cancelar: async (id) => {
        const ordem = await prisma.ordemProducao.findUnique({ where: { id }, select: { status: true } });
        if (!ordem) throw new Error('Ordem não encontrada');
        if (ordem.status === 'FINALIZADA') throw new Error('Ordens finalizadas não podem ser canceladas');

        return prisma.ordemProducao.update({
            where: { id },
            data: { status: 'CANCELADA' }
        });
    }
};

module.exports = pcpOrdemService;
