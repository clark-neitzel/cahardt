const prisma = require('../config/database');
const cidadeService = require('../services/cidadeService'); // cadastro oficial de cidades (09/2026)

const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');
const { fromStr, toStr } = require('../utils/diasUteisCaixa');

// Início (00:00 -03:00) do dia de hoje deslocado N dias.
function inicioDiaMais(n) {
    const d = fromStr(getDataReferencia());
    d.setDate(d.getDate() + n);
    return new Date(`${toStr(d)}T00:00:00.000-03:00`);
}

// Lead "ativo" na rota: não finalizado/convertido E (próxima visita >= hoje-7d OU criado há ≤ 30d).
// Quem não passa é "parado" (ficou esquecido na carteira — a gestão decide o que fazer).
function filtrosLeadAtivo() {
    const h7 = inicioDiaMais(-7), h30 = inicioDiaMais(-30);
    return {
        ativo: { etapa: { notIn: ['FINALIZADO', 'CONVERTIDO'] }, OR: [{ proximaVisita: { gte: h7 } }, { createdAt: { gte: h30 } }] },
        // etapa nunca é null (default NOVO); proximaVisita pode ser — OR explícito (Prisma `lt` não pega null)
        parado: { etapa: { notIn: ['FINALIZADO', 'CONVERTIDO'] }, clienteId: null, createdAt: { lt: h30 }, OR: [{ proximaVisita: null }, { proximaVisita: { lt: h7 } }] },
    };
}

// normaliza: minúsculo, sem acento, sem espaços duplos
const normNome = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const leadService = {

    /**
     * Leads PARADOS (gestão): ?parados=1 em GET /leads. Mais antigos primeiro.
     */
    listarParados: async ({ vendedorId } = {}) => {
        const leads = await prisma.lead.findMany({
            where: { ...filtrosLeadAtivo().parado, ...(vendedorId ? { idVendedor: vendedorId } : {}) },
            select: {
                id: true, numero: true, nomeEstabelecimento: true, cidade: true, etapa: true,
                createdAt: true, proximaVisita: true, idVendedor: true,
                vendedor: { select: { id: true, nome: true } },
                atendimentos: { orderBy: { criadoEm: 'desc' }, take: 1, select: { criadoEm: true, acaoLabel: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 1000,
        });
        const data = leads.map(({ atendimentos, ...l }) => ({
            ...l,
            criadoEm: l.createdAt,
            ultimoAtendimento: atendimentos[0]?.criadoEm || null,
            ultimoAtendimentoAcao: atendimentos[0]?.acaoLabel || null,
        }));
        return { data, total: data.length, page: 1, totalPages: 1, parados: true };
    },

    /**
     * Cadastros parecidos (só consulta, nunca bloqueia): leads abertos e clientes ativos com nome
     * contendo/contido no informado (mín. 4 letras) OU GPS a ≤ 50 m. Máx. 5.
     */
    buscarSimilares: async ({ nome, gps }) => {
        const { parseLatLng, haversineMetros } = require('./pontoService');
        const alvo = normNome(nome);
        const nomeOk = alvo.replace(/\s/g, '').length >= 4;
        const ponto = parseLatLng(gps);
        if (!nomeOk && !ponto) return { similares: [] };

        const [leads, clientes] = await Promise.all([
            prisma.lead.findMany({
                where: { etapa: { notIn: ['FINALIZADO', 'CONVERTIDO'] }, clienteId: null },
                select: { id: true, nomeEstabelecimento: true, cidade: true, pontoGps: true, vendedor: { select: { nome: true } } },
            }),
            prisma.cliente.findMany({
                where: { Ativo: true },
                select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, Ponto_GPS: true, vendedor: { select: { nome: true } } },
            }),
        ]);

        const casaNome = (n) => {
            const x = normNome(n);
            return x.replace(/\s/g, '').length >= 4 && (x.includes(alvo) || alvo.includes(x));
        };
        const dist = (g) => {
            const p = ponto && parseLatLng(g);
            return p ? Math.round(haversineMetros(ponto.lat, ponto.lng, p.lat, p.lng)) : null;
        };

        const achados = [];
        for (const l of leads) {
            const d = dist(l.pontoGps);
            const porNome = nomeOk && casaNome(l.nomeEstabelecimento);
            if (porNome || (d != null && d <= 50)) achados.push({ tipo: 'lead', id: l.id, nome: l.nomeEstabelecimento, cidade: l.cidade || null, distanciaM: d, vendedorNome: l.vendedor?.nome || null, _n: porNome ? 0 : 1 });
        }
        for (const c of clientes) {
            const d = dist(c.Ponto_GPS);
            const porNome = nomeOk && (casaNome(c.NomeFantasia) || casaNome(c.Nome));
            if (porNome || (d != null && d <= 50)) achados.push({ tipo: 'cliente', id: c.UUID, nome: c.NomeFantasia || c.Nome, cidade: c.End_Cidade || null, distanciaM: d, vendedorNome: c.vendedor?.nome || null, _n: porNome ? 0 : 1 });
        }
        // mais perto primeiro (quem não tem distância vai depois), depois por nome
        achados.sort((a, b) => (a.distanciaM ?? 1e9) - (b.distanciaM ?? 1e9) || a._n - b._n);
        return { similares: achados.slice(0, 5).map(({ _n, ...r }) => r) };
    },

    /**
     * Lista leads com paginação, filtros e busca.
     * Quando chamado da rota (mode='rota'), exclui leads convertidos e finalizados.
     */
    listar: async ({ vendedorId, search, etapa, page = 1, limit = 25, mode, parados } = {}) => {
        if (parados) return leadService.listarParados({ vendedorId });
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
        // Só leads "ativos" (ver filtrosLeadAtivo); os parados vão para o painel da gestão (?parados=1).
        const where = { clienteId: null, ...filtrosLeadAtivo().ativo };
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
