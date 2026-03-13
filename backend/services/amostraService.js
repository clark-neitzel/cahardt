const prisma = require('../config/database');

const amostraService = {

    async criar({ leadId, clienteId, solicitadoPorId, observacao, itens }) {
        return prisma.amostra.create({
            data: {
                leadId: leadId || null,
                clienteId: clienteId || null,
                solicitadoPorId,
                observacao: observacao || null,
                itens: {
                    create: itens.map(i => ({
                        produtoId: i.produtoId,
                        quantidade: i.quantidade
                    }))
                }
            },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true } },
                solicitadoPor: { select: { id: true, nome: true } }
            }
        });
    },

    async listar({ status, leadId, solicitadoPorId, page = 1, limit = 50 }) {
        const where = {};
        if (status) where.status = status;
        if (leadId) where.leadId = leadId;
        if (solicitadoPorId) where.solicitadoPorId = solicitadoPorId;

        const [amostras, total] = await Promise.all([
            prisma.amostra.findMany({
                where,
                include: {
                    itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } },
                    lead: { select: { id: true, numero: true, nomeEstabelecimento: true } },
                    solicitadoPor: { select: { id: true, nome: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.amostra.count({ where })
        ]);

        return { amostras, total };
    },

    async obterPorId(id) {
        return prisma.amostra.findUnique({
            where: { id },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true, codigoInterno: true } } } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true } },
                solicitadoPor: { select: { id: true, nome: true } }
            }
        });
    },

    async mudarStatus(id, novoStatus) {
        const statusValidos = ['SOLICITADA', 'PREPARANDO', 'ENVIADA', 'ENTREGUE', 'CANCELADA'];
        if (!statusValidos.includes(novoStatus)) {
            throw new Error('Status inválido.');
        }

        return prisma.amostra.update({
            where: { id },
            data: { status: novoStatus },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true } },
                solicitadoPor: { select: { id: true, nome: true } }
            }
        });
    },

    async cancelar(id) {
        const amostra = await prisma.amostra.findUnique({ where: { id } });
        if (!amostra) throw new Error('Amostra não encontrada.');
        if (amostra.status !== 'SOLICITADA') {
            throw new Error('Só é possível cancelar amostras com status SOLICITADA.');
        }
        return prisma.amostra.update({
            where: { id },
            data: { status: 'CANCELADA' }
        });
    }
};

module.exports = amostraService;
