const prisma = require('../config/database');

const amostraService = {

    criar: async ({ leadId, clienteId, dataEntrega, observacao, solicitadoPorId, itens }) => {
        return await prisma.amostra.create({
            data: {
                leadId: leadId || null,
                clienteId: clienteId || null,
                dataEntrega: dataEntrega ? new Date(dataEntrega) : null,
                observacao: observacao || null,
                solicitadoPorId,
                itens: {
                    create: itens.map(item => ({
                        produtoId: item.produtoId,
                        quantidade: item.quantidade,
                        nomeProduto: item.nomeProduto || `Amostra - ${item.nome || ''}`,
                    }))
                }
            },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            }
        });
    },

    listar: async (filtros = {}) => {
        const where = {};
        if (filtros.status) where.status = filtros.status;
        if (filtros.solicitadoPorId) where.solicitadoPorId = filtros.solicitadoPorId;
        if (filtros.leadId) where.leadId = filtros.leadId;
        if (filtros.clienteId) where.clienteId = filtros.clienteId;

        return await prisma.amostra.findMany({
            where,
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    buscarPorId: async (id) => {
        return await prisma.amostra.findUnique({
            where: { id },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true, unidade: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
            }
        });
    },

    atualizarStatus: async (id, novoStatus) => {
        const statusValidos = ['SOLICITADA', 'PREPARACAO', 'LIBERADO', 'ENTREGUE', 'CANCELADA'];
        if (!statusValidos.includes(novoStatus)) {
            throw new Error(`Status inválido: ${novoStatus}`);
        }
        return await prisma.amostra.update({
            where: { id },
            data: { status: novoStatus }
        });
    },

    // Amostras com status LIBERADO e sem embarque (para embarcar)
    listarDisponiveis: async () => {
        return await prisma.amostra.findMany({
            where: {
                status: 'LIBERADO',
                embarqueId: null
            },
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
            },
            orderBy: { createdAt: 'asc' }
        });
    },
};

module.exports = amostraService;
