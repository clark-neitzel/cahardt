const prisma = require('../config/database');

const atendimentoService = {

    // Registra um atendimento (para Lead ou Cliente)
    registrar: async (data) => {
        const { tipo, observacao, etapaAnterior, etapaNova, proximaVisita,
            gpsVendedor, pedidoId, leadId, clienteId, idVendedor } = data;

        // Se for lead, atualizar a etapa e próxima visita
        if (leadId && etapaNova) {
            await prisma.lead.update({
                where: { id: leadId },
                data: {
                    etapa: etapaNova,
                    ...(proximaVisita && { proximaVisita: new Date(proximaVisita) })
                }
            });
        } else if (leadId && proximaVisita) {
            await prisma.lead.update({
                where: { id: leadId },
                data: { proximaVisita: new Date(proximaVisita) }
            });
        }

        return await prisma.atendimento.create({
            data: {
                tipo,
                observacao,
                etapaAnterior: etapaAnterior || null,
                etapaNova: etapaNova || null,
                proximaVisita: proximaVisita ? new Date(proximaVisita) : null,
                gpsVendedor: gpsVendedor || null,
                pedidoId: pedidoId || null,
                leadId: leadId || null,
                clienteId: clienteId || null,
                idVendedor
            }
        });
    },

    // Histórico de atendimentos de um Lead
    listarPorLead: async (leadId) => {
        return await prisma.atendimento.findMany({
            where: { leadId },
            include: { vendedor: { select: { nome: true } } },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Histórico de atendimentos de um Cliente
    listarPorCliente: async (clienteId) => {
        return await prisma.atendimento.findMany({
            where: { clienteId },
            include: { vendedor: { select: { nome: true } } },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Retorna todos os atendimentos registrados HOJE para um vendedor
    listarHojeVendedor: async (vendedorId) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        return await prisma.atendimento.findMany({
            where: {
                idVendedor: vendedorId,
                criadoEm: { gte: hoje, lt: amanha }
            },
            include: { vendedor: { select: { nome: true } } },
            orderBy: { criadoEm: 'desc' }
        });
    }
};

module.exports = atendimentoService;
