const prisma = require('../config/database');

const pcpSugestaoService = {

    listar: async ({ status }) => {
        const where = {};
        if (status) where.status = status;

        return prisma.sugestaoProducao.findMany({
            where,
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true, estoqueAtual: true, estoqueMinimo: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    },

    gerarSugestoes: async () => {
        // Buscar itens PA e SUB com estoque abaixo do mínimo
        const itensAbaixoMinimo = await prisma.itemPcp.findMany({
            where: {
                ativo: true,
                tipo: { in: ['PA', 'SUB'] },
                estoqueMinimo: { gt: 0 }
            }
        });

        const abaixo = itensAbaixoMinimo.filter(i =>
            parseFloat(i.estoqueAtual) < parseFloat(i.estoqueMinimo)
        );

        if (abaixo.length === 0) return { geradas: 0, sugestoes: [] };

        const sugestoesCriadas = [];

        for (const item of abaixo) {
            // Verificar se já existe sugestão PENDENTE para este item
            const existente = await prisma.sugestaoProducao.findFirst({
                where: { itemPcpId: item.id, status: 'PENDENTE' }
            });
            if (existente) continue;

            // Buscar receita ativa
            const receita = await prisma.receita.findFirst({
                where: {
                    itemPcpId: item.id,
                    status: 'ativa',
                    dataInicioVigencia: { lte: new Date() },
                    OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: new Date() } }]
                }
            });
            if (!receita) continue;

            const deficit = parseFloat(item.estoqueMinimo) - parseFloat(item.estoqueAtual);
            const rendimento = parseFloat(receita.rendimentoBase);
            const bateladas = Math.ceil(deficit / rendimento);
            const qtdSugerida = Math.round(bateladas * rendimento * 1000) / 1000;

            const sugestao = await prisma.sugestaoProducao.create({
                data: {
                    itemPcpId: item.id,
                    quantidadeSugerida: qtdSugerida,
                    bateladas,
                    motivo: 'ESTOQUE_MINIMO',
                    status: 'PENDENTE',
                    observacoes: `Déficit: ${deficit.toFixed(3)} ${item.unidade}. Receita: ${receita.nome} (v${receita.versao}), rendimento ${rendimento} por batelada.`
                },
                include: {
                    itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true, estoqueAtual: true, estoqueMinimo: true } }
                }
            });
            sugestoesCriadas.push(sugestao);
        }

        return { geradas: sugestoesCriadas.length, sugestoes: sugestoesCriadas };
    },

    aceitar: async (id, criadoPorId) => {
        const sugestao = await prisma.sugestaoProducao.findUnique({
            where: { id },
            include: { itemPcp: true }
        });
        if (!sugestao) throw new Error('Sugestão não encontrada');
        if (sugestao.status !== 'PENDENTE') throw new Error('Somente sugestões PENDENTE podem ser aceitas');

        // Buscar receita ativa para criar a OP
        const receita = await prisma.receita.findFirst({
            where: {
                itemPcpId: sugestao.itemPcpId,
                status: 'ativa',
                dataInicioVigencia: { lte: new Date() },
                OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: new Date() } }]
            },
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                itens: {
                    include: { itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } } }
                }
            }
        });
        if (!receita) throw new Error('Nenhuma receita ativa encontrada para este item');

        const fator = parseFloat(sugestao.quantidadeSugerida) / parseFloat(receita.rendimentoBase);

        const snapshot = {
            receitaId: receita.id,
            versao: receita.versao,
            nome: receita.nome,
            rendimentoBase: parseFloat(receita.rendimentoBase),
            itemResultante: {
                id: receita.itemPcp.id,
                nome: receita.itemPcp.nome,
                codigo: receita.itemPcp.codigo,
                tipo: receita.itemPcp.tipo,
                unidade: receita.itemPcp.unidade
            },
            itens: receita.itens.map(i => ({
                itemPcpId: i.itemPcpId,
                nome: i.itemPcp.nome,
                codigo: i.itemPcp.codigo,
                tipo: i.tipo,
                unidade: i.itemPcp.unidade,
                quantidadeBase: parseFloat(i.quantidade),
                quantidadeEscalada: Math.round(parseFloat(i.quantidade) * fator * 1000) / 1000
            }))
        };

        return prisma.$transaction(async (tx) => {
            // Criar ordem de produção
            const ordem = await tx.ordemProducao.create({
                data: {
                    receitaId: receita.id,
                    quantidadePlanejada: parseFloat(sugestao.quantidadeSugerida),
                    fatorEscala: Math.round(fator * 10000) / 10000,
                    dataPlanejada: new Date(),
                    receitaSnapshot: snapshot,
                    observacoes: `Gerada a partir de sugestão por estoque mínimo`,
                    criadoPorId
                }
            });

            // Criar itens de consumo
            for (const item of snapshot.itens) {
                await tx.ordemConsumo.create({
                    data: {
                        ordemProducaoId: ordem.id,
                        itemPcpId: item.itemPcpId,
                        quantidadePrevista: item.quantidadeEscalada,
                        tipo: item.tipo
                    }
                });
            }

            // Atualizar sugestão
            await tx.sugestaoProducao.update({
                where: { id },
                data: { status: 'ACEITA', ordemProducaoId: ordem.id }
            });

            return { sugestaoId: id, ordemProducaoId: ordem.id, numero: ordem.numero };
        });
    },

    rejeitar: async (id) => {
        const sugestao = await prisma.sugestaoProducao.findUnique({ where: { id }, select: { status: true } });
        if (!sugestao) throw new Error('Sugestão não encontrada');
        if (sugestao.status !== 'PENDENTE') throw new Error('Somente sugestões PENDENTE podem ser rejeitadas');

        return prisma.sugestaoProducao.update({
            where: { id },
            data: { status: 'REJEITADA' }
        });
    },

    // KPIs para dashboard
    dashboardKpis: async () => {
        const [ordensPorStatus, itensAbaixoMinimo, producaoSemana, sugestoesPendentes] = await Promise.all([
            // Ordens por status
            prisma.ordemProducao.groupBy({
                by: ['status'],
                _count: { id: true }
            }),

            // Itens PA/SUB abaixo do mínimo
            prisma.itemPcp.findMany({
                where: {
                    ativo: true,
                    tipo: { in: ['PA', 'SUB'] },
                    estoqueMinimo: { gt: 0 }
                },
                select: { id: true, nome: true, tipo: true, unidade: true, estoqueAtual: true, estoqueMinimo: true }
            }),

            // Volume produzido esta semana
            (() => {
                const hoje = new Date();
                const inicioSemana = new Date(hoje);
                inicioSemana.setDate(hoje.getDate() - hoje.getDay());
                inicioSemana.setHours(0, 0, 0, 0);
                return prisma.ordemProducao.aggregate({
                    where: {
                        status: 'FINALIZADA',
                        dataFim: { gte: inicioSemana }
                    },
                    _sum: { quantidadeProduzida: true },
                    _count: { id: true }
                });
            })(),

            // Sugestões pendentes
            prisma.sugestaoProducao.count({ where: { status: 'PENDENTE' } })
        ]);

        const statusMap = {};
        ordensPorStatus.forEach(s => { statusMap[s.status] = s._count.id; });

        const abaixo = itensAbaixoMinimo.filter(i =>
            parseFloat(i.estoqueAtual) < parseFloat(i.estoqueMinimo)
        );

        return {
            ordens: {
                planejadas: statusMap['PLANEJADA'] || 0,
                emProducao: statusMap['EM_PRODUCAO'] || 0,
                finalizadas: statusMap['FINALIZADA'] || 0,
                canceladas: statusMap['CANCELADA'] || 0
            },
            itensAbaixoMinimo: abaixo,
            producaoSemana: {
                volume: parseFloat(producaoSemana._sum.quantidadeProduzida || 0),
                ordens: producaoSemana._count.id
            },
            sugestoesPendentes
        };
    }
};

module.exports = pcpSugestaoService;
