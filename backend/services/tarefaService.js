const prisma = require('../config/database');

const tarefaService = {

    // Cria uma tarefa (chamado pelo atendimentoService ou manualmente)
    criar: async (data) => {
        const { acaoKey, acaoLabel, descricao, contexto, leadId, clienteId,
            responsavelId, criadoPorId, dataVencimento, atendimentoOrigemId } = data;

        return await prisma.tarefa.create({
            data: {
                acaoKey,
                acaoLabel,
                descricao: descricao || null,
                contexto: contexto || 'LEAD',
                leadId: leadId || null,
                clienteId: clienteId || null,
                responsavelId,
                criadoPorId,
                dataVencimento: new Date(dataVencimento),
                atendimentoOrigemId: atendimentoOrigemId || null
            },
            include: {
                responsavel: { select: { id: true, nome: true } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true } }
            }
        });
    },

    // Conclui uma tarefa (chamado pelo atendimentoService ao resolver)
    concluir: async (tarefaId, atendimentoConclusaoId) => {
        return await prisma.tarefa.update({
            where: { id: tarefaId },
            data: {
                status: 'CONCLUIDA',
                concluidaEm: new Date(),
                atendimentoConclusaoId: atendimentoConclusaoId || null
            }
        });
    },

    // Fila de tarefas do usuário (ou todas se admin)
    listarFila: async ({ responsavelId, status, contexto, page = 1, limit = 50 }) => {
        const where = {};
        if (responsavelId) where.responsavelId = responsavelId;
        if (status) where.status = status;
        else where.status = 'PENDENTE'; // Default: só pendentes
        if (contexto) where.contexto = contexto;

        const [tarefas, total] = await Promise.all([
            prisma.tarefa.findMany({
                where,
                include: {
                    responsavel: { select: { id: true, nome: true } },
                    criadoPor: { select: { id: true, nome: true } },
                    lead: { select: { id: true, numero: true, nomeEstabelecimento: true, etapa: true } }
                },
                orderBy: [
                    { dataVencimento: 'asc' }
                ],
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.tarefa.count({ where })
        ]);

        return { tarefas, total, page, limit };
    },

    // Resumo de tarefas (para dashboard admin)
    resumo: async () => {
        const agora = new Date();
        agora.setHours(0, 0, 0, 0);
        const fimHoje = new Date(agora);
        fimHoje.setDate(fimHoje.getDate() + 1);

        const [vencidas, hoje, porVendedor] = await Promise.all([
            // Tarefas vencidas (pendentes com data < hoje)
            prisma.tarefa.count({
                where: { status: 'PENDENTE', dataVencimento: { lt: agora } }
            }),
            // Tarefas para hoje
            prisma.tarefa.count({
                where: { status: 'PENDENTE', dataVencimento: { gte: agora, lt: fimHoje } }
            }),
            // Contagem por vendedor (pendentes)
            prisma.tarefa.groupBy({
                by: ['responsavelId'],
                where: { status: 'PENDENTE' },
                _count: { id: true }
            })
        ]);

        // Buscar nomes dos vendedores
        let vendedoresMap = {};
        if (porVendedor.length > 0) {
            const ids = porVendedor.map(v => v.responsavelId);
            const vendedores = await prisma.vendedor.findMany({
                where: { id: { in: ids } },
                select: { id: true, nome: true }
            });
            vendedoresMap = Object.fromEntries(vendedores.map(v => [v.id, v.nome]));
        }

        return {
            vencidas,
            hoje,
            porVendedor: porVendedor.map(v => ({
                vendedorId: v.responsavelId,
                nome: vendedoresMap[v.responsavelId] || 'Desconhecido',
                total: v._count.id
            }))
        };
    },

    // Obter tarefa por ID
    obterPorId: async (id) => {
        return await prisma.tarefa.findUnique({
            where: { id },
            include: {
                responsavel: { select: { id: true, nome: true } },
                criadoPor: { select: { id: true, nome: true } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true, etapa: true } }
            }
        });
    },

    // Transferir responsável
    transferir: async (tarefaId, novoResponsavelId) => {
        return await prisma.tarefa.update({
            where: { id: tarefaId },
            data: { responsavelId: novoResponsavelId },
            include: {
                responsavel: { select: { id: true, nome: true } }
            }
        });
    },

    // Cancelar tarefa
    cancelar: async (tarefaId) => {
        return await prisma.tarefa.update({
            where: { id: tarefaId },
            data: { status: 'CANCELADA', concluidaEm: new Date() }
        });
    },

    // Buscar tarefas pendentes de um lead (para badges)
    listarPendentesDoLead: async (leadId) => {
        return await prisma.tarefa.findMany({
            where: { leadId, status: 'PENDENTE' },
            include: {
                responsavel: { select: { id: true, nome: true } }
            },
            orderBy: { dataVencimento: 'asc' },
            take: 5
        });
    },

    // Buscar tarefas pendentes de múltiplos leads (para RotaLeads bulk)
    listarPendentesDeLeads: async (leadIds) => {
        return await prisma.tarefa.findMany({
            where: { leadId: { in: leadIds }, status: 'PENDENTE' },
            include: {
                responsavel: { select: { id: true, nome: true } }
            },
            orderBy: { dataVencimento: 'asc' }
        });
    }
};

module.exports = tarefaService;
