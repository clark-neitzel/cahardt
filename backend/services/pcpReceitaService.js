const prisma = require('../config/database');

const pcpReceitaService = {

    listar: async ({ itemPcpId, status, incluirTodas }) => {
        const where = {};
        if (itemPcpId) where.itemPcpId = itemPcpId;
        if (status) where.status = status;
        const receitas = await prisma.receita.findMany({
            where,
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                _count: { select: { itens: true } }
            },
            orderBy: [{ itemPcpId: 'asc' }, { versao: 'desc' }]
        });

        if (incluirTodas || itemPcpId || status) return receitas;

        // Padrão: apenas a versão "principal" por itemPcpId (ativa, ou mais recente se nenhuma ativa)
        const porItem = new Map();
        for (const r of receitas) {
            const atual = porItem.get(r.itemPcpId);
            if (!atual) { porItem.set(r.itemPcpId, r); continue; }
            if (atual.status !== 'ativa' && r.status === 'ativa') porItem.set(r.itemPcpId, r);
        }
        return Array.from(porItem.values());
    },

    buscarPorId: async (id) => {
        return prisma.receita.findUnique({
            where: { id },
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                itens: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                    },
                    orderBy: { ordemEtapa: 'asc' }
                }
            }
        });
    },

    criar: async (data) => {
        return prisma.receita.create({
            data: {
                itemPcpId: data.itemPcpId,
                versao: data.versao || 1,
                nome: data.nome,
                rendimentoBase: parseFloat(data.rendimentoBase),
                perdaPercentual: data.perdaPercentual ? parseFloat(data.perdaPercentual) : null,
                status: data.status || 'ativa',
                dataInicioVigencia: new Date(data.dataInicioVigencia || new Date()),
                dataFimVigencia: data.dataFimVigencia ? new Date(data.dataFimVigencia) : null,
                observacoes: data.observacoes || null,
                itens: {
                    create: (data.itens || []).map(item => ({
                        itemPcpId: item.itemPcpId,
                        quantidade: parseFloat(item.quantidade),
                        tipo: item.tipo,
                        ordemEtapa: item.ordemEtapa || null,
                        observacao: item.observacao || null
                    }))
                }
            },
            include: {
                itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                itens: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                    }
                }
            }
        });
    },

    atualizar: async (id, data, { userId, userNome } = {}) => {
        const original = await prisma.receita.findUnique({
            where: { id },
            include: { itens: { include: { itemPcp: { select: { id: true, nome: true, codigo: true, unidade: true } } } } }
        });
        if (!original) throw new Error('Receita não encontrada');
        if (original.status === 'inativa') throw new Error('Receitas inativas não podem ser editadas.');
        if (!data.motivo?.trim()) throw new Error('Motivo da alteração é obrigatório.');

        const novosItens = (data.itens || []).map(i => ({
            itemPcpId: i.itemPcpId,
            quantidade: parseFloat(i.quantidade),
            tipo: i.tipo,
            ordemEtapa: i.ordemEtapa || null,
            observacao: i.observacao || null
        }));

        // Computar diff
        const alteracoes = { campos: {}, ingredientes: { adicionados: [], removidos: [], alterados: [] } };
        const cmpNum = (a, b) => parseFloat(a || 0) === parseFloat(b || 0);
        if (data.nome !== undefined && data.nome !== original.nome) alteracoes.campos.nome = { de: original.nome, para: data.nome };
        if (data.rendimentoBase !== undefined && !cmpNum(data.rendimentoBase, original.rendimentoBase)) alteracoes.campos.rendimentoBase = { de: parseFloat(original.rendimentoBase), para: parseFloat(data.rendimentoBase) };
        if (data.perdaPercentual !== undefined && !cmpNum(data.perdaPercentual, original.perdaPercentual)) alteracoes.campos.perdaPercentual = { de: original.perdaPercentual ? parseFloat(original.perdaPercentual) : null, para: data.perdaPercentual ? parseFloat(data.perdaPercentual) : null };
        if (data.observacoes !== undefined && (data.observacoes || '') !== (original.observacoes || '')) alteracoes.campos.observacoes = { de: original.observacoes, para: data.observacoes };

        const origMap = new Map(original.itens.map(i => [i.itemPcpId, i]));
        const novoMap = new Map(novosItens.map(i => [i.itemPcpId, i]));
        const idsParaBuscar = novosItens.filter(n => !origMap.has(n.itemPcpId)).map(n => n.itemPcpId);
        const itensInfo = idsParaBuscar.length
            ? await prisma.itemPcp.findMany({ where: { id: { in: idsParaBuscar } }, select: { id: true, nome: true, codigo: true, unidade: true } })
            : [];
        const nomesNovos = new Map(itensInfo.map(i => [i.id, i]));

        for (const novo of novosItens) {
            const antigo = origMap.get(novo.itemPcpId);
            if (!antigo) {
                const info = nomesNovos.get(novo.itemPcpId);
                alteracoes.ingredientes.adicionados.push({
                    itemPcpId: novo.itemPcpId,
                    nome: info?.nome,
                    codigo: info?.codigo,
                    unidade: info?.unidade,
                    quantidade: novo.quantidade,
                    tipo: novo.tipo
                });
            } else if (!cmpNum(antigo.quantidade, novo.quantidade) || antigo.tipo !== novo.tipo || (antigo.ordemEtapa || null) !== (novo.ordemEtapa || null)) {
                alteracoes.ingredientes.alterados.push({
                    itemPcpId: novo.itemPcpId,
                    nome: antigo.itemPcp?.nome,
                    codigo: antigo.itemPcp?.codigo,
                    unidade: antigo.itemPcp?.unidade,
                    quantidade: { de: parseFloat(antigo.quantidade), para: novo.quantidade },
                    tipo: { de: antigo.tipo, para: novo.tipo },
                    etapa: { de: antigo.ordemEtapa, para: novo.ordemEtapa }
                });
            }
        }
        for (const antigo of original.itens) {
            if (!novoMap.has(antigo.itemPcpId)) {
                alteracoes.ingredientes.removidos.push({
                    itemPcpId: antigo.itemPcpId,
                    nome: antigo.itemPcp?.nome,
                    codigo: antigo.itemPcp?.codigo,
                    unidade: antigo.itemPcp?.unidade,
                    quantidade: parseFloat(antigo.quantidade),
                    tipo: antigo.tipo
                });
            }
        }

        const houveMudanca = Object.keys(alteracoes.campos).length > 0
            || alteracoes.ingredientes.adicionados.length > 0
            || alteracoes.ingredientes.removidos.length > 0
            || alteracoes.ingredientes.alterados.length > 0;

        if (!houveMudanca) {
            throw new Error('Nenhuma alteração detectada.');
        }

        // Cria nova versão; inativa a anterior; grava log
        return prisma.$transaction(async (tx) => {
            await tx.receita.update({
                where: { id },
                data: { status: 'inativa', dataFimVigencia: new Date() }
            });

            const nova = await tx.receita.create({
                data: {
                    itemPcpId: original.itemPcpId,
                    versao: original.versao + 1,
                    nome: data.nome ?? original.nome,
                    rendimentoBase: data.rendimentoBase !== undefined ? parseFloat(data.rendimentoBase) : original.rendimentoBase,
                    perdaPercentual: data.perdaPercentual !== undefined ? (data.perdaPercentual ? parseFloat(data.perdaPercentual) : null) : original.perdaPercentual,
                    status: 'ativa',
                    dataInicioVigencia: new Date(),
                    observacoes: data.observacoes !== undefined ? data.observacoes : original.observacoes,
                    itens: { create: novosItens }
                },
                include: {
                    itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                    itens: { include: { itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } } } }
                }
            });

            await tx.receitaVersaoLog.create({
                data: {
                    receitaId: nova.id,
                    versao: nova.versao,
                    motivo: data.motivo.trim(),
                    alteracoes,
                    alteradoPorId: userId || null,
                    alteradoPorNome: userNome || null
                }
            });

            return nova;
        });
    },

    historicoPorItem: async (itemPcpId) => {
        const versoes = await prisma.receita.findMany({
            where: { itemPcpId },
            select: {
                id: true, versao: true, status: true, nome: true,
                dataInicioVigencia: true, dataFimVigencia: true,
                logs: { orderBy: { alteradoEm: 'desc' }, take: 1 }
            },
            orderBy: { versao: 'desc' }
        });
        return versoes;
    },

    logsDaReceita: async (receitaId) => {
        return prisma.receitaVersaoLog.findMany({
            where: { receitaId },
            orderBy: { alteradoEm: 'desc' }
        });
    },

    clonar: async (receitaId, { novoNome }) => {
        if (!novoNome?.trim()) throw new Error('novoNome é obrigatório');
        const original = await prisma.receita.findUnique({
            where: { id: receitaId },
            include: { itens: true, itemPcp: true }
        });
        if (!original) throw new Error('Receita não encontrada');

        const ultimos = await prisma.itemPcp.findMany({
            where: { tipo: 'SUB', codigo: { startsWith: 'SUB-' } },
            select: { codigo: true }
        });
        let maior = 0;
        for (const it of ultimos) {
            const m = /^SUB-(\d+)$/.exec(it.codigo);
            if (m) { const n = parseInt(m[1], 10); if (n > maior) maior = n; }
        }
        const novoCodigo = `SUB-${String(maior + 1).padStart(4, '0')}`;

        return prisma.$transaction(async (tx) => {
            const novoItem = await tx.itemPcp.create({
                data: {
                    codigo: novoCodigo,
                    nome: novoNome.trim(),
                    tipo: 'SUB',
                    unidade: original.itemPcp.unidade,
                    descricao: original.itemPcp.descricao,
                    estoqueMinimo: 0,
                    custoUnitario: original.itemPcp.custoUnitario
                }
            });

            return tx.receita.create({
                data: {
                    itemPcpId: novoItem.id,
                    versao: 1,
                    nome: novoNome.trim(),
                    rendimentoBase: original.rendimentoBase,
                    perdaPercentual: original.perdaPercentual,
                    status: 'ativa',
                    dataInicioVigencia: new Date(),
                    observacoes: original.observacoes,
                    itens: {
                        create: original.itens.map(item => ({
                            itemPcpId: item.itemPcpId,
                            quantidade: item.quantidade,
                            tipo: item.tipo,
                            ordemEtapa: item.ordemEtapa,
                            observacao: item.observacao
                        }))
                    }
                },
                include: {
                    itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                    itens: { include: { itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } } } }
                }
            });
        });
    },

    novaVersao: async (receitaId) => {
        const original = await prisma.receita.findUnique({
            where: { id: receitaId },
            include: { itens: true }
        });
        if (!original) throw new Error('Receita não encontrada');

        return prisma.$transaction(async (tx) => {
            await tx.receita.update({
                where: { id: receitaId },
                data: { status: 'inativa', dataFimVigencia: new Date() }
            });

            const nova = await tx.receita.create({
                data: {
                    itemPcpId: original.itemPcpId,
                    versao: original.versao + 1,
                    nome: original.nome,
                    rendimentoBase: original.rendimentoBase,
                    perdaPercentual: original.perdaPercentual,
                    status: 'ativa',
                    dataInicioVigencia: new Date(),
                    observacoes: original.observacoes,
                    itens: {
                        create: original.itens.map(item => ({
                            itemPcpId: item.itemPcpId,
                            quantidade: item.quantidade,
                            tipo: item.tipo,
                            ordemEtapa: item.ordemEtapa,
                            observacao: item.observacao
                        }))
                    }
                },
                include: {
                    itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } },
                    itens: {
                        include: {
                            itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                        }
                    }
                }
            });

            return nova;
        });
    },

    alterarStatus: async (id, status) => {
        if (!['rascunho', 'ativa', 'inativa'].includes(status)) {
            throw new Error('Status inválido. Use: rascunho, ativa, inativa');
        }
        return prisma.receita.update({ where: { id }, data: { status } });
    },

    escalonar: async (receitaId, { modo, quantidade, itemPcpIdLimitante, quantidadeDisponivel }) => {
        const receita = await prisma.receita.findUnique({
            where: { id: receitaId },
            include: {
                itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true } },
                itens: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true, estoqueAtual: true } }
                    }
                }
            }
        });
        if (!receita) throw new Error('Receita não encontrada');

        const rendimentoBase = parseFloat(receita.rendimentoBase);
        let fator;

        if (modo === 'por_quantidade') {
            if (!quantidade || parseFloat(quantidade) <= 0) throw new Error('Quantidade deve ser maior que zero');
            fator = parseFloat(quantidade) / rendimentoBase;
        } else if (modo === 'por_ingrediente') {
            if (!itemPcpIdLimitante || !quantidadeDisponivel) {
                throw new Error('itemPcpIdLimitante e quantidadeDisponivel são obrigatórios para modo por_ingrediente');
            }
            const itemLimitante = receita.itens.find(i => i.itemPcpId === itemPcpIdLimitante);
            if (!itemLimitante) throw new Error('Ingrediente limitante não encontrado na receita');
            fator = parseFloat(quantidadeDisponivel) / parseFloat(itemLimitante.quantidade);
        } else {
            throw new Error('Modo deve ser: por_quantidade ou por_ingrediente');
        }

        fator = Math.round(fator * 10000) / 10000;
        const rendimentoEscalado = Math.round(rendimentoBase * fator * 1000) / 1000;

        const itensEscalados = [];
        for (const item of receita.itens) {
            const qtdBase = parseFloat(item.quantidade);
            const qtdEscalada = Math.round(qtdBase * fator * 1000) / 1000;

            const entry = {
                itemPcpId: item.itemPcpId,
                nome: item.itemPcp.nome,
                tipo: item.itemPcp.tipo,
                unidade: item.itemPcp.unidade,
                tipoConsumo: item.tipo,
                quantidadeBase: qtdBase,
                quantidadeEscalada: qtdEscalada,
                estoqueAtual: parseFloat(item.itemPcp.estoqueAtual),
                suficiente: parseFloat(item.itemPcp.estoqueAtual) >= qtdEscalada,
                subItens: null
            };

            if (item.itemPcp.tipo === 'SUB') {
                const subReceita = await prisma.receita.findFirst({
                    where: {
                        itemPcpId: item.itemPcpId,
                        status: 'ativa',
                        dataInicioVigencia: { lte: new Date() },
                        OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: new Date() } }]
                    },
                    select: { id: true }
                });
                if (subReceita) {
                    entry.subItens = await pcpReceitaService.escalonar(subReceita.id, {
                        modo: 'por_quantidade',
                        quantidade: qtdEscalada
                    });
                }
            }

            itensEscalados.push(entry);
        }

        return {
            receitaId: receita.id,
            receitaNome: receita.nome,
            itemResultante: receita.itemPcp,
            versao: receita.versao,
            rendimentoBase,
            fator,
            rendimentoEscalado,
            itens: itensEscalados
        };
    },

    excluir: async (id) => {
        const receita = await prisma.receita.findUnique({
            where: { id },
            include: { _count: { select: { ordensProducao: true } } }
        });
        if (!receita) throw new Error('Receita não encontrada');
        if (receita._count.ordensProducao > 0) {
            throw new Error('Receita possui ordens de produção vinculadas e não pode ser excluída.');
        }

        return prisma.$transaction(async (tx) => {
            await tx.receitaItem.deleteMany({ where: { receitaId: id } });
            return tx.receita.delete({ where: { id } });
        });
    },

    buscarReceitaAtiva: async (itemPcpId) => {
        return prisma.receita.findFirst({
            where: {
                itemPcpId,
                status: 'ativa',
                dataInicioVigencia: { lte: new Date() },
                OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: new Date() } }]
            },
            include: {
                itens: {
                    include: {
                        itemPcp: { select: { id: true, nome: true, codigo: true, tipo: true, unidade: true } }
                    }
                }
            },
            orderBy: { versao: 'desc' }
        });
    }
};

module.exports = pcpReceitaService;
