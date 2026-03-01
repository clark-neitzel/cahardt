const prisma = require('../config/database');

const leadService = {

    // Lista leads de um vendedor com atendimentos recentes
    listar: async (vendedorId) => {
        const where = vendedorId ? { idVendedor: vendedorId } : {};
        const leads = await prisma.lead.findMany({
            where,
            include: {
                atendimentos: {
                    orderBy: { criadoEm: 'desc' },
                    take: 1 // somente o mais recente para saber se foi atendido hoje
                }
            },
            orderBy: [{ numero: 'asc' }]
        });
        return leads;
    },

    // Busca um lead pelo ID
    buscarPorId: async (id) => {
        return await prisma.lead.findUnique({
            where: { id },
            include: {
                atendimentos: {
                    orderBy: { criadoEm: 'desc' }
                }
            }
        });
    },

    // Cria novo lead — número é autoincrement pelo banco
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

    // Atualiza dados do lead
    atualizar: async (id, data) => {
        const { nomeEstabelecimento, contato, whatsapp, diasVisita, horarioAtendimento,
            horarioEntrega, formasAtendimento, pontoGps, observacoes, etapa, proximaVisita } = data;

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
            }
        });
    },

    // Finaliza um lead (soft-delete: apenas muda etapa para FINALIZADO)
    finalizar: async (id) => {
        return await prisma.lead.update({
            where: { id },
            data: { etapa: 'FINALIZADO' }
        });
    }
};

module.exports = leadService;
