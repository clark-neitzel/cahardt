const prisma = require('../config/database');

const leadService = {

    /**
     * Lista leads com paginação, filtros e busca.
     * Quando chamado da rota (mode='rota'), exclui leads convertidos e finalizados.
     */
    listar: async ({ vendedorId, search, etapa, page = 1, limit = 25, mode } = {}) => {
        const where = {};

        if (vendedorId) where.idVendedor = vendedorId;
        if (etapa) where.etapa = etapa;
        if (search) {
            where.nomeEstabelecimento = { contains: search, mode: 'insensitive' };
        }

        // Na rota, excluir leads convertidos e finalizados
        if (mode === 'rota') {
            where.clienteId = null;
            where.etapa = { notIn: ['FINALIZADO', 'CONVERTIDO'] };
        }

        const [data, total] = await Promise.all([
            prisma.lead.findMany({
                where,
                include: {
                    vendedor: { select: { id: true, nome: true } },
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                    atendimentos: {
                        orderBy: { criadoEm: 'desc' },
                        take: 1
                    }
                },
                orderBy: [{ createdAt: 'desc' }],
                skip: (page - 1) * limit,
                take: limit
            }),
            prisma.lead.count({ where })
        ]);

        return { data, total, page, totalPages: Math.ceil(total / limit) };
    },

    /**
     * Lista simples para a rota (sem paginação, compatibilidade com RotaLeads)
     */
    listarParaRota: async (vendedorId) => {
        const where = {
            clienteId: null,
            etapa: { notIn: ['FINALIZADO', 'CONVERTIDO'] }
        };
        if (vendedorId) where.idVendedor = vendedorId;

        return await prisma.lead.findMany({
            where,
            include: {
                atendimentos: {
                    orderBy: { criadoEm: 'desc' },
                    take: 1
                }
            },
            orderBy: [{ numero: 'asc' }]
        });
    },

    buscarPorId: async (id) => {
        return await prisma.lead.findUnique({
            where: { id },
            include: {
                vendedor: { select: { id: true, nome: true } },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                atendimentos: {
                    orderBy: { criadoEm: 'desc' },
                    include: { vendedor: { select: { nome: true } } }
                }
            }
        });
    },

    criar: async (data) => {
        const { nomeEstabelecimento, contato, whatsapp, diasVisita, horarioAtendimento,
            horarioEntrega, formasAtendimento, pontoGps, observacoes, idVendedor } = data;

        return await prisma.lead.create({
            data: {
                nomeEstabelecimento,
                contato,
                whatsapp,
                diasVisita,
                horarioAtendimento,
                horarioEntrega,
                formasAtendimento: formasAtendimento || [],
                pontoGps,
                observacoes,
                idVendedor,
                etapa: 'NOVO'
            }
        });
    },

    atualizar: async (id, data) => {
        const { nomeEstabelecimento, contato, whatsapp, diasVisita, horarioAtendimento,
            horarioEntrega, formasAtendimento, pontoGps, observacoes, etapa, proximaVisita, fotoFachada } = data;

        return await prisma.lead.update({
            where: { id },
            data: {
                ...(nomeEstabelecimento !== undefined && { nomeEstabelecimento }),
                ...(contato !== undefined && { contato }),
                ...(whatsapp !== undefined && { whatsapp }),
                ...(diasVisita !== undefined && { diasVisita }),
                ...(horarioAtendimento !== undefined && { horarioAtendimento }),
                ...(horarioEntrega !== undefined && { horarioEntrega }),
                ...(formasAtendimento !== undefined && { formasAtendimento }),
                ...(pontoGps !== undefined && { pontoGps }),
                ...(observacoes !== undefined && { observacoes }),
                ...(etapa !== undefined && { etapa }),
                ...(proximaVisita !== undefined && { proximaVisita: proximaVisita ? new Date(proximaVisita) : null }),
                ...(fotoFachada !== undefined && { fotoFachada }),
            }
        });
    },

    finalizar: async (id) => {
        return await prisma.lead.update({
            where: { id },
            data: { etapa: 'FINALIZADO' }
        });
    },

    /**
     * Vincula um lead a um cliente (conversão)
     */
    referenciarCliente: async (leadId, clienteId) => {
        return await prisma.lead.update({
            where: { id: leadId },
            data: {
                clienteId,
                etapa: 'CONVERTIDO'
            },
            include: {
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } }
            }
        });
    },

    /**
     * Busca leads vinculados a um cliente
     */
    buscarPorCliente: async (clienteId) => {
        return await prisma.lead.findMany({
            where: { clienteId },
            include: {
                vendedor: { select: { id: true, nome: true } },
                atendimentos: {
                    orderBy: { criadoEm: 'desc' },
                    include: { vendedor: { select: { nome: true } } }
                }
            },
            orderBy: [{ createdAt: 'desc' }]
        });
    }
};

module.exports = leadService;
