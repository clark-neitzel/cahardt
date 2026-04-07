const prisma = require('../config/database');

const pcpItemService = {

    listar: async ({ tipo, search, ativo }) => {
        const where = {};
        if (tipo) where.tipo = tipo;
        if (ativo !== undefined) where.ativo = ativo === 'true' || ativo === true;
        if (search?.trim()) {
            where.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }
        return prisma.itemPcp.findMany({
            where,
            include: { produto: { select: { id: true, nome: true, codigo: true } } },
            orderBy: [{ tipo: 'asc' }, { nome: 'asc' }]
        });
    },

    buscarPorId: async (id) => {
        return prisma.itemPcp.findUnique({
            where: { id },
            include: {
                produto: { select: { id: true, nome: true, codigo: true } },
                receitasComoResultado: {
                    where: { status: 'ativa' },
                    select: { id: true, versao: true, nome: true, rendimentoBase: true, status: true }
                }
            }
        });
    },

    criar: async (data) => {
        return prisma.itemPcp.create({
            data: {
                codigo: data.codigo,
                nome: data.nome,
                tipo: data.tipo,
                unidade: data.unidade,
                descricao: data.descricao || null,
                produtoId: data.produtoId || null,
                custoUnitario: data.custoUnitario ? parseFloat(data.custoUnitario) : null,
                estoqueMinimo: data.estoqueMinimo ? parseFloat(data.estoqueMinimo) : 0
            }
        });
    },

    atualizar: async (id, data) => {
        const updateData = {};
        if (data.codigo !== undefined) updateData.codigo = data.codigo;
        if (data.nome !== undefined) updateData.nome = data.nome;
        if (data.tipo !== undefined) updateData.tipo = data.tipo;
        if (data.unidade !== undefined) updateData.unidade = data.unidade;
        if (data.descricao !== undefined) updateData.descricao = data.descricao;
        if (data.produtoId !== undefined) updateData.produtoId = data.produtoId || null;
        if (data.custoUnitario !== undefined) updateData.custoUnitario = data.custoUnitario ? parseFloat(data.custoUnitario) : null;
        if (data.estoqueMinimo !== undefined) updateData.estoqueMinimo = parseFloat(data.estoqueMinimo);

        return prisma.itemPcp.update({ where: { id }, data: updateData });
    },

    toggleAtivo: async (id) => {
        const item = await prisma.itemPcp.findUnique({ where: { id }, select: { ativo: true } });
        if (!item) throw new Error('Item não encontrado');
        return prisma.itemPcp.update({ where: { id }, data: { ativo: !item.ativo } });
    }
};

module.exports = pcpItemService;
