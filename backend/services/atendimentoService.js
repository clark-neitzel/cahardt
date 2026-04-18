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
    },

    // Retorna TODOS os atendimentos de hoje, de todos os vendedores (para saber se outro vendedor já atendeu)
    listarHojeTodos: async () => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        return await prisma.atendimento.findMany({
            where: { criadoEm: { gte: hoje, lt: amanha } },
            select: {
                id: true,
                clienteId: true,
                leadId: true,
                idVendedor: true,
                tipo: true,
                criadoEm: true,
                vendedor: { select: { nome: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Retorna clientes sem atendimento/pedido do dia útil anterior (somente ontem, ou sexta se segunda)
    // Regra ativa a partir de 2026-04-16
    buscarPendenciasRota: async (vendedorId) => {
        const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const DATA_INICIO_REGRA = new Date('2026-04-15T00:00:00');

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Se hoje é antes da data de início da regra, sem pendências
        if (hoje < DATA_INICIO_REGRA) return { pendente: false };

        // Determina o dia útil anterior: ontem, ou sexta se hoje é segunda
        // Se hoje é domingo ou sábado, não cobra (não deveria estar trabalhando)
        const dow = hoje.getDay(); // 0=dom, 6=sáb
        if (dow === 0 || dow === 6) return { pendente: false };

        const diaAnterior = new Date(hoje);
        if (dow === 1) {
            // Segunda → verifica sexta (3 dias atrás)
            diaAnterior.setDate(diaAnterior.getDate() - 3);
        } else {
            // Ter-Sex → verifica ontem
            diaAnterior.setDate(diaAnterior.getDate() - 1);
        }

        // Se o dia anterior é antes da regra, sem pendências
        if (diaAnterior < DATA_INICIO_REGRA) return { pendente: false };

        const sigla = SIGLAS[diaAnterior.getDay()];

        // Busca clientes do vendedor que têm esse dia na rota
        const clientes = await prisma.cliente.findMany({
            where: {
                idVendedor: vendedorId,
                Ativo: true,
                Dia_de_venda: { not: null },
            },
            select: {
                UUID: true,
                Nome: true,
                NomeFantasia: true,
                Dia_de_venda: true,
                Dia_de_entrega: true,
                Formas_Atendimento: true,
                End_Cidade: true,
                Ponto_GPS: true,
            }
        });

        // Filtra clientes que têm o dia anterior na rota
        const clientesDoDia = clientes.filter(c => {
            const dias = (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim());
            return dias.includes(sigla);
        });

        if (clientesDoDia.length === 0) return { pendente: false };

        // Verifica quais tiveram atendimento ou pedido nesse dia OU hoje (atendimento de compensação)
        const inicioDia = new Date(diaAnterior);
        inicioDia.setHours(0, 0, 0, 0);
        const fimHoje = new Date(hoje);
        fimHoje.setHours(23, 59, 59, 999);

        const uuids = clientesDoDia.map(c => c.UUID);

        const [atendimentos, pedidos] = await Promise.all([
            prisma.atendimento.findMany({
                where: {
                    clienteId: { in: uuids },
                    criadoEm: { gte: inicioDia, lte: fimHoje },
                    tipo: { not: 'FINANCEIRO' },
                },
                select: { clienteId: true }
            }),
            prisma.pedido.findMany({
                where: {
                    clienteId: { in: uuids },
                    dataVenda: { gte: inicioDia, lte: fimHoje },
                },
                select: { clienteId: true }
            })
        ]);

        const clientesAtendidos = new Set([
            ...atendimentos.map(a => a.clienteId),
            ...pedidos.map(p => p.clienteId)
        ]);

        const clientesPendentes = clientesDoDia.filter(c => !clientesAtendidos.has(c.UUID));

        if (clientesPendentes.length === 0) return { pendente: false };

        return {
            pendente: true,
            diasPendentes: 1,
            diaPendente: {
                data: diaAnterior.toISOString().split('T')[0],
                diaSigla: sigla,
                clientes: clientesPendentes,
                totalClientes: clientesDoDia.length,
                pendentes: clientesPendentes.length,
            },
        };
    },

    // Lista atendimentos com filtros completos (para página admin)
    listarComFiltros: async ({ vendedorId, clienteId, leadId, tipo, dataInicio, dataFim, page = 1, limit = 50 }) => {
        const where = {};
        if (vendedorId) where.idVendedor = vendedorId;
        if (clienteId) where.clienteId = clienteId;
        if (leadId) where.leadId = leadId;
        if (tipo) {
            where.tipo = tipo;
        } else {
            // Por padrão exclui FINANCEIRO (não é atendimento comercial)
            where.tipo = { not: 'FINANCEIRO' };
        }
        if (dataInicio || dataFim) {
            where.criadoEm = {};
            if (dataInicio) where.criadoEm.gte = new Date(dataInicio);
            if (dataFim) {
                const fim = new Date(dataFim);
                fim.setHours(23, 59, 59, 999);
                where.criadoEm.lte = fim;
            }
        }

        const [total, data] = await Promise.all([
            prisma.atendimento.count({ where }),
            prisma.atendimento.findMany({
                where,
                include: {
                    vendedor: { select: { id: true, nome: true } },
                    transferidoPara: { select: { id: true, nome: true } },
                    cliente: { select: { UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true } },
                    lead: { select: { id: true, nomeEstabelecimento: true, numero: true } },
                    amostra: { select: { id: true, numero: true, status: true } },
                },
                orderBy: { criadoEm: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            })
        ]);

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
};

module.exports = atendimentoService;
