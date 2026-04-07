const prisma = require('../config/database');

const pcpEstoqueService = {

    posicao: async ({ tipo, search, apenasAbaixoMinimo }) => {
        const where = { ativo: true };
        if (tipo) where.tipo = tipo;
        if (search?.trim()) {
            where.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }

        const itens = await prisma.itemPcp.findMany({
            where,
            select: {
                id: true,
                codigo: true,
                nome: true,
                tipo: true,
                unidade: true,
                estoqueAtual: true,
                estoqueMinimo: true,
                estoqueReservado: true,
                custoUnitario: true
            },
            orderBy: [{ tipo: 'asc' }, { nome: 'asc' }]
        });

        if (apenasAbaixoMinimo === 'true' || apenasAbaixoMinimo === true) {
            return itens.filter(i => parseFloat(i.estoqueAtual) < parseFloat(i.estoqueMinimo) && parseFloat(i.estoqueMinimo) > 0);
        }

        return itens;
    },

    ajustar: async ({ itemPcpId, tipo, quantidade, motivo = 'AJUSTE_MANUAL', observacao = null, criadoPorId = null, ordemProducaoId = null }, tx) => {
        const db = tx || prisma;

        const item = await db.itemPcp.findUnique({
            where: { id: itemPcpId },
            select: { id: true, estoqueAtual: true }
        });
        if (!item) throw new Error('Item PCP não encontrado');

        const delta = tipo === 'ENTRADA' ? Math.abs(quantidade) : -Math.abs(quantidade);
        const antes = parseFloat(item.estoqueAtual);
        const depois = Math.max(0, Math.round((antes + delta) * 1000) / 1000);

        await db.itemPcp.update({
            where: { id: itemPcpId },
            data: { estoqueAtual: depois }
        });

        const mov = await db.movimentacaoPcp.create({
            data: {
                itemPcpId,
                tipo,
                quantidade: Math.abs(quantidade),
                motivo,
                ordemProducaoId,
                observacao,
                estoqueAntes: antes,
                estoqueDepois: depois,
                criadoPorId
            }
        });

        return { movId: mov.id, estoqueAntes: antes, estoqueDepois: depois };
    },

    historico: async ({ itemPcpId, tipo, motivo, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 }) => {
        const where = {};
        if (itemPcpId) where.itemPcpId = itemPcpId;
        if (tipo) where.tipo = tipo;
        if (motivo) where.motivo = motivo;
        if (dataInicio || dataFim) {
            where.createdAt = {};
            if (dataInicio) where.createdAt.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.createdAt.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.movimentacaoPcp.findMany({
                where,
                include: {
                    itemPcp: { select: { nome: true, codigo: true, unidade: true, tipo: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.movimentacaoPcp.count({ where })
        ]);

        return { items, total, pagina, tamanhoPagina };
    }
};

module.exports = pcpEstoqueService;
