const prisma = require('../config/database');
const cidadeService = require('../services/cidadeService'); // cadastro oficial de cidades (09/2026)

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
                    categoriaCliente: { select: { id: true, nome: true } },
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
                vendedor: { select: { id: true, nome: true } },
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

    // `opcoes.modo`: 'estrito' (padrão — tela: cidade fora da lista = erro 400
    // CIDADE_NAO_CADASTRADA) | 'tolerante' (IA externa: grava normalizado + pendência).
    criar: async (data, opcoes = {}) => {
        const { nomeEstabelecimento, contato, whatsapp, diasVisita, horarioAtendimento,
            horarioEntrega, formasAtendimento, pontoGps, observacoes, idVendedor,
            cidade, origemLead, categoriaClienteId } = data;

        // Cadastro oficial de cidades (09/2026): resolvido ANTES de gravar, fora de transação.
        const modo = opcoes.modo === 'tolerante' ? 'tolerante' : 'estrito';
        const cidadeResolvida = await cidadeService.resolver(cidade, { modo, origem: opcoes.origem || 'IA_LEAD' });

        const lead = await prisma.lead.create({
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
                // Nome oficial da tabela `cidades` (ou normalizado + pendência no modo tolerante).
                // O lead é a fonte com MAIS grafia solta do banco — é digitado à mão em campo e
                // chega também do bot de WhatsApp.
                cidade: cidadeResolvida,
                origemLead,
                categoriaClienteId: categoriaClienteId || null,
                etapa: 'NOVO'
            }
        });
        // Pendência criada no modo tolerante ganha o "exemplo" (leads:<id>) — fora do caminho crítico.
        if (modo === 'tolerante' && cidadeResolvida) {
            await cidadeService.anotarExemploPendencia(cidadeResolvida, `leads:${lead.id}`);
        }
        return lead;
    },

    atualizar: async (id, data, opcoes = {}) => {
        const { nomeEstabelecimento, contato, whatsapp, diasVisita, horarioAtendimento,
            horarioEntrega, formasAtendimento, pontoGps, observacoes, etapa, proximaVisita, fotoFachada,
            cidade, origemLead, categoriaClienteId, idVendedor } = data;

        // Cadastro oficial de cidades (09/2026): só quando o campo veio no corpo.
        const cidadeResolvida = cidade !== undefined
            ? await cidadeService.resolver(cidade, { modo: opcoes.modo === 'tolerante' ? 'tolerante' : 'estrito', origem: opcoes.origem || 'IA_LEAD' })
            : undefined;

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
                ...(cidade !== undefined && { cidade: cidadeResolvida }),
                ...(origemLead !== undefined && { origemLead }),
                ...(categoriaClienteId !== undefined && { categoriaClienteId: categoriaClienteId || null }),
                ...(idVendedor !== undefined && { idVendedor }),
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
        // Verificar se o cliente já tem um lead vinculado
        const existente = await prisma.lead.findFirst({
            where: { clienteId, id: { not: leadId } }
        });
        if (existente) {
            throw { status: 400, message: `Este cliente já está vinculado ao lead #${existente.numero} (${existente.nomeEstabelecimento})` };
        }

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
                    include: {
                        vendedor: { select: { nome: true } },
                        transferidoPara: { select: { nome: true } },
                        amostra: { select: { id: true, numero: true, status: true } },
                    }
                }
            },
            orderBy: [{ createdAt: 'desc' }]
        });
    },

    excluir: async (id) => {
        return await prisma.lead.delete({ where: { id } });
    }
};

module.exports = leadService;
