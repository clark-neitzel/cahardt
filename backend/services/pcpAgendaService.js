const prisma = require('../config/database');

const STATUS_CORES = {
    PLANEJADA: '#3B82F6',
    EM_PRODUCAO: '#EAB308',
    FINALIZADA: '#22C55E',
    CANCELADA: '#EF4444',
};

const pcpAgendaService = {

    listar: async ({ dataInicio, dataFim }) => {
        // 1) Eventos manuais da agenda
        const whereAgenda = {};
        if (dataInicio || dataFim) {
            whereAgenda.dataInicio = {};
            if (dataInicio) whereAgenda.dataInicio.gte = new Date(dataInicio);
            if (dataFim) whereAgenda.dataInicio.lte = new Date(dataFim);
        }

        const eventosAgenda = await prisma.agendaProducao.findMany({
            where: whereAgenda,
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

        // IDs de ordens que ja tem evento manual
        const ordensComEvento = new Set(eventosAgenda.map(e => e.ordemProducaoId));

        // 2) Ordens sem evento manual — aparecem automaticamente pela dataPlanejada
        const whereOrdens = {
            status: { in: ['PLANEJADA', 'EM_PRODUCAO'] },
            id: { notIn: Array.from(ordensComEvento) }
        };
        if (dataInicio || dataFim) {
            whereOrdens.dataPlanejada = {};
            if (dataInicio) whereOrdens.dataPlanejada.gte = new Date(dataInicio);
            if (dataFim) whereOrdens.dataPlanejada.lte = new Date(dataFim);
        }

        const ordensAutomatic = await prisma.ordemProducao.findMany({
            where: whereOrdens,
            select: {
                id: true,
                numero: true,
                status: true,
                quantidadePlanejada: true,
                dataPlanejada: true,
                receita: {
                    select: { nome: true, itemPcp: { select: { nome: true, unidade: true } } }
                }
            },
            orderBy: { dataPlanejada: 'asc' }
        });

        // Converter ordens automaticas para formato de evento
        const eventosAuto = ordensAutomatic.map(op => {
            const inicio = new Date(op.dataPlanejada);
            const fim = new Date(inicio.getTime() + 2 * 60 * 60 * 1000); // 2h default
            return {
                id: 'op-' + op.id,
                ordemProducaoId: op.id,
                titulo: `OP #${op.numero} - ${op.receita?.nome || ''}`,
                dataInicio: inicio.toISOString(),
                dataFim: fim.toISOString(),
                cor: STATUS_CORES[op.status] || '#3B82F6',
                observacoes: null,
                automatico: true,
                ordemProducao: op
            };
        });

        return [...eventosAgenda, ...eventosAuto];
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
