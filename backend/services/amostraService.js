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
        const { status, solicitadoPorId, leadId, clienteId, dataEntregaDe, dataEntregaAte, createdAtDe, createdAtAte, busca } = filtros;
        
        const where = {};
        if (status) where.status = status;
        if (solicitadoPorId) where.solicitadoPorId = solicitadoPorId;
        if (leadId) where.leadId = leadId;
        if (clienteId) where.clienteId = clienteId;

        // Filtro por Data de Entrega
        if (dataEntregaDe || dataEntregaAte) {
            where.dataEntrega = {};
            if (dataEntregaDe) where.dataEntrega.gte = new Date(dataEntregaDe + 'T00:00:00.000Z');
            if (dataEntregaAte) where.dataEntrega.lte = new Date(dataEntregaAte + 'T23:59:59.999Z');
        }

        // Filtro por Data de Criação
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
                { lead: { nomeEstabelecimento: { contains: termo, mode: 'insensitive' } } },
                { cliente: { Nome: { contains: termo, mode: 'insensitive' } } },
                { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } },
                { cliente: { Documento: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Cidade: { contains: termo, mode: 'insensitive' } } },
                { cliente: { End_Bairro: { contains: termo, mode: 'insensitive' } } },
                { solicitadoPor: { nome: { contains: termo, mode: 'insensitive' } } },
                !isNaN(numBusca) ? { numero: numBusca } : null,
                // Prefixo AM#
                termo.toLowerCase().startsWith('am#') && !isNaN(parseInt(termo.substring(3)))
                    ? { numero: parseInt(termo.substring(3)) } : null,
            ].filter(Boolean);
        }

        return await prisma.amostra.findMany({
            where,
            include: {
                itens: { include: { produto: { select: { nome: true, codigo: true } } } },
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true, End_Bairro: true } },
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

    excluir: async (id) => {
        const amostra = await prisma.amostra.findUnique({ where: { id } });
        if (!amostra) throw new Error('Amostra não encontrada.');
        if (amostra.status === 'ENTREGUE') {
            throw new Error('Não é possível excluir uma amostra já entregue.');
        }
        return await prisma.$transaction(async (tx) => {
            await tx.amostraItem.deleteMany({ where: { amostraId: id } });
            return await tx.amostra.delete({ where: { id } });
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
