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
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Histórico de atendimentos de um Cliente
    listarPorCliente: async (clienteId) => {
        return await prisma.atendimento.findMany({
            where: { clienteId },
            orderBy: { criadoEm: 'desc' }
        });
    }
};

module.exports = atendimentoService;
