const prisma = require('../config/database');
const clienteInsightService = require('./clienteInsightService');
const tarefaService = require('./tarefaService');

const atendimentoService = {

    // Registra um atendimento (para Lead ou Cliente)
    // Agora aceita: acaoKey, acaoLabel, proximaAcaoKey, proximaAcaoLabel,
    //               proximoResponsavelId, dataVencimento, tarefaResolvidaId
    registrar: async (data) => {
        const { tipo, observacao, etapaAnterior, etapaNova, proximaVisita,
            gpsVendedor, pedidoId, leadId, clienteId, idVendedor,
            acaoKey, acaoLabel, amostraId,
            proximaAcaoKey, proximaAcaoLabel, proximoResponsavelId, dataVencimento,
            tarefaResolvidaId } = data;

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

        // Criar o atendimento
        const novoAtendimento = await prisma.atendimento.create({
            data: {
                tipo,
                observacao: observacao || null,
                etapaAnterior: etapaAnterior || null,
                etapaNova: etapaNova || null,
                proximaVisita: proximaVisita ? new Date(proximaVisita) : null,
                gpsVendedor: gpsVendedor || null,
                pedidoId: pedidoId || null,
                acaoKey: acaoKey || null,
                acaoLabel: acaoLabel || null,
                amostraId: amostraId || null,
                leadId: leadId || null,
                clienteId: clienteId || null,
                idVendedor
            }
        });

        // Resolver tarefa anterior (se veio de uma tarefa)
        if (tarefaResolvidaId) {
            await tarefaService.concluir(tarefaResolvidaId, novoAtendimento.id).catch(err => {
                console.error('Erro ao concluir tarefa:', err);
            });
        }

        // Criar próxima tarefa (se definida)
        if (proximaAcaoKey && dataVencimento) {
            const responsavel = proximoResponsavelId || idVendedor;
            await tarefaService.criar({
                acaoKey: proximaAcaoKey,
                acaoLabel: proximaAcaoLabel || proximaAcaoKey,
                contexto: leadId ? 'LEAD' : (clienteId ? 'CLIENTE' : 'LEAD'),
                leadId: leadId || null,
                clienteId: clienteId || null,
                responsavelId: responsavel,
                criadoPorId: idVendedor,
                dataVencimento,
                atendimentoOrigemId: novoAtendimento.id
            }).catch(err => {
                console.error('Erro ao criar próxima tarefa:', err);
            });
        }

        // Async Detached Trigger para Inteligência Comercial
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
