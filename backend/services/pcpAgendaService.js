const prisma = require('../config/database');

const pcpAgendaService = {

    listar: async ({ dataInicio, dataFim }) => {
        const where = {};
        if (dataInicio || dataFim) {
            where.dataInicio = {};
            if (dataInicio) where.dataInicio.gte = new Date(dataInicio);
            if (dataFim) where.dataInicio.lte = new Date(dataFim);
        }

        return prisma.agendaProducao.findMany({
            where,
            include: {
                ordemProducao: {
                    select: {
                        id: true,
                        numero: true,
                        status: true,
                        quantidadePlanejada: true,
                        receita: {
                            select: { nome: true, itemPcp: { select: { nome: true, unidade: true } } }
                        }
                    }
                }
            },
            orderBy: { dataInicio: 'asc' }
        });
    },

    criar: async (data) => {
        return prisma.agendaProducao.create({
            data: {
                ordemProducaoId: data.ordemProducaoId,
                titulo: data.titulo,
                dataInicio: new Date(data.dataInicio),
                dataFim: new Date(data.dataFim),
                cor: data.cor || '#3B82F6',
                observacoes: data.observacoes || null
            },
            include: {
                ordemProducao: {
                    select: { id: true, numero: true, status: true }
                }
            }
        });
    },

    atualizar: async (id, data) => {
        const updateData = {};
        if (data.titulo !== undefined) updateData.titulo = data.titulo;
        if (data.dataInicio !== undefined) updateData.dataInicio = new Date(data.dataInicio);
        if (data.dataFim !== undefined) updateData.dataFim = new Date(data.dataFim);
        if (data.cor !== undefined) updateData.cor = data.cor;
        if (data.observacoes !== undefined) updateData.observacoes = data.observacoes;

        return prisma.agendaProducao.update({
            where: { id },
            data: updateData,
            include: {
                ordemProducao: {
                    select: { id: true, numero: true, status: true }
                }
            }
        });
    },

    excluir: async (id) => {
        return prisma.agendaProducao.delete({ where: { id } });
    }
};

module.exports = pcpAgendaService;
