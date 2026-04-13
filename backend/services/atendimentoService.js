const prisma = require('../config/database');
const clienteInsightService = require('./clienteInsightService');

const atendimentoService = {

    // Registra um atendimento (para Lead ou Cliente)
    registrar: async (data) => {
        const { tipo, observacao, etapaAnterior, etapaNova, proximaVisita,
            gpsVendedor, pedidoId, leadId, clienteId, idVendedor,
            acaoKey, acaoLabel, transferidoParaId,
            assuntoRetorno, dataRetorno,
            alertaVisualAtivo, alertaVisualCor,
            amostraId, usuarioRegistroId } = data;

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

        const novoAtendimento = await prisma.atendimento.create({
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
                idVendedor,
                usuarioRegistroId: usuarioRegistroId || null,
                acaoKey: acaoKey || null,
                acaoLabel: acaoLabel || null,
                transferidoParaId: transferidoParaId || null,
                assuntoRetorno: assuntoRetorno || null,
                dataRetorno: dataRetorno ? new Date(dataRetorno) : null,
                alertaVisualAtivo: alertaVisualAtivo || false,
                alertaVisualCor: alertaVisualCor || null,
                alertaVisualVisto: false,
                amostraId: amostraId || null,
            }
        });

        // Async: recalcular insights do cliente
        if (clienteId) {
            setTimeout(() => {
                clienteInsightService.recalcularCliente(clienteId).catch(console.error);
            }, 0);
        }

        return novoAtendimento;
    },

    // Histórico de atendimentos de um Lead
    listarPorLead: async (leadId) => {
        return await prisma.atendimento.findMany({
            where: { leadId },
            include: {
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
                amostra: { select: { id: true, numero: true, status: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Histórico de atendimentos de um Cliente
    listarPorCliente: async (clienteId) => {
        return await prisma.atendimento.findMany({
            where: { clienteId },
            include: {
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
                amostra: { select: { id: true, numero: true, status: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Transferências ativas (não finalizadas) para o vendedor
    listarTransferidos: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                transferidoParaId: vendedorId,
                transferenciaFinalizada: false,
            },
            include: {
                vendedor: { select: { id: true, nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            },
            orderBy: [
                { dataRetorno: 'asc' },
                { criadoEm: 'desc' }
            ]
        });
    },

    // Finalizar transferência (receptor marca como resolvida)
    finalizarTransferencia: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: {
                transferenciaFinalizada: true,
                transferenciaFinalizadaEm: new Date(),
            }
        });
    },

    // Marcar transferência finalizada como vista pelo vendedor original
    marcarTransferenciaVista: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: { transferenciaVistaOrigem: true }
        });
    },

    // Transferências finalizadas não vistas pelo vendedor original
    listarTransferenciasResolvidas: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                idVendedor: vendedorId,
                transferidoParaId: { not: null },
                transferenciaFinalizada: true,
                transferenciaVistaOrigem: false,
            },
            include: {
                transferidoPara: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            },
            orderBy: { transferenciaFinalizadaEm: 'desc' }
        });
    },

    // Marcar alerta visual como visto
    marcarAlertaVisto: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: { alertaVisualVisto: true }
        });
    },

    // Alertas visuais ativos (não vistos) + transferências ativas para um vendedor
    listarAlertasAtivos: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                OR: [
                    // Alertas visuais não vistos
                    {
                        alertaVisualAtivo: true,
                        alertaVisualVisto: false,
                        OR: [
                            { idVendedor: vendedorId },
                            { transferidoParaId: vendedorId },
                        ]
                    },
                    // Transferências ativas (não finalizadas) para este vendedor
                    {
                        transferidoParaId: vendedorId,
                        transferenciaFinalizada: false,
                    },
                    // Transferências finalizadas pendentes de vista pelo remetente
                    {
                        idVendedor: vendedorId,
                        transferidoParaId: { not: null },
                        transferenciaFinalizada: true,
                        transferenciaVistaOrigem: false,
                    },
                ]
            },
            select: {
                id: true,
                leadId: true,
                clienteId: true,
                alertaVisualAtivo: true,
                alertaVisualCor: true,
                alertaVisualVisto: true,
                dataRetorno: true,
                assuntoRetorno: true,
                acaoLabel: true,
                observacao: true,
                transferidoParaId: true,
                transferenciaFinalizada: true,
                transferenciaFinalizadaEm: true,
                transferenciaVistaOrigem: true,
                idVendedor: true,
                criadoEm: true,
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
            }
        });
    },

    // Retorna todos os atendimentos registrados HOJE para um vendedor (ou todos se null)
    listarHojeVendedor: async (vendedorId) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const whereCondition = { criadoEm: { gte: hoje, lt: amanha } };
        if (vendedorId) {
            whereCondition.idVendedor = vendedorId;
        }

        return await prisma.atendimento.findMany({
            where: whereCondition,
            include: { vendedor: { select: { nome: true } } },
            orderBy: { criadoEm: 'desc' }
        });
    }
};

module.exports = atendimentoService;
