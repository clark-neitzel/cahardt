const prisma = require('../config/database');
const contaAzulService = require('../services/contaAzulService');

const clienteController = {
    // Listar clientes com paginação e busca
    // Listar clientes com paginação e busca
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', ativo, idVendedor, diaEntrega, diaVenda, condicaoPagamento, condicaoPermitida } = req.query;
            const skip = (page - 1) * limit;

            const where = {};

            // Filtro de busca textual expandida
            if (search) {
                where.OR = [
                    { Nome: { contains: search, mode: 'insensitive' } },
                    { NomeFantasia: { contains: search, mode: 'insensitive' } },
                    { Documento: { contains: search, mode: 'insensitive' } },
                    { Codigo: { contains: search, mode: 'insensitive' } },
                    { End_Cidade: { contains: search, mode: 'insensitive' } },
                    { End_Bairro: { contains: search, mode: 'insensitive' } },
                    { End_Logradouro: { contains: search, mode: 'insensitive' } },
                    { Telefone: { contains: search, mode: 'insensitive' } },
                    { Telefone_Celular: { contains: search, mode: 'insensitive' } }
                ];
            }

            // Filtros Específicos
            if (ativo !== undefined) {
                where.Ativo = ativo === 'true';
            }
            if (idVendedor) {
                where.idVendedor = idVendedor;
            }
            if (diaEntrega) {
                where.Dia_de_entrega = { contains: diaEntrega };
            }
            if (diaVenda) {
                where.Dia_de_venda = { contains: diaVenda };
            }
            if (condicaoPagamento) {
                where.Condicao_de_pagamento = condicaoPagamento;
            }
            if (condicaoPermitida) {
                where.condicoes_pagamento_permitidas = { has: condicaoPermitida };
            }

            // Controle de visibilidade com base no nível de permissão (Vendedor/Admin)
            if (req.user) {
                const permissaoPedidos = req.user.permissoes?.pedidos || {};
                // Se NÃO tem permissão explícita para ver TODOS OS CLIENTES (ex: regra imposta),
                // Oculta os clientes e exibe apenas os vinculados a ele
                if (permissaoPedidos.clientes !== 'todos') {
                    where.idVendedor = req.user.id;
                }
            }

            const total = await prisma.cliente.count({ where });
            const clientes = await prisma.cliente.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { Nome: 'asc' },
                include: {
                    vendedor: {
                        select: {
                            id: true,
                            nome: true,
                            ativo: true
                        }
                    },
                    categoriaCliente: {
                        select: {
                            id: true,
                            nome: true,
                            isentoFlex: true,
                            semLimiteDesconto: true
                        }
                    },
                    clienteInsights: {
                        select: {
                            insightPrincipalTipo: true,
                            insightPrincipalResumo: true,
                            proximaAcaoSugerida: true,
                            orientacaoIaJson: true,
                            statusRecompra: true,
                            diasSemComprar: true,
                            scoreRisco: true,
                        }
                    }
                }
            });

            // Flag de inadimplência por cliente (parcelas vencidas não pagas)
            const clienteIds = clientes.map(c => c.UUID);
            let delinqMap = {};
            if (clienteIds.length > 0) {
                const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const hoje = new Date(hojeStr + 'T00:00:00.000Z');
                const contasAbertas = await prisma.contaReceber.findMany({
                    where: {
                        clienteId: { in: clienteIds },
                        status: { in: ['ABERTO', 'PARCIAL'] },
                        parcelas: { some: { status: 'PENDENTE', dataVencimento: { lt: hoje } } }
                    },
                    select: {
                        clienteId: true,
                        parcelas: {
                            where: { status: 'PENDENTE', dataVencimento: { lt: hoje } },
                            select: { valor: true }
                        }
                    }
                });
                for (const cr of contasAbertas) {
                    if (!delinqMap[cr.clienteId]) delinqMap[cr.clienteId] = 0;
                    for (const p of cr.parcelas) delinqMap[cr.clienteId] += Number(p.valor);
                }
            }

            const clientesComFlag = clientes.map(c => ({
                ...c,
                inadimplente: !!delinqMap[c.UUID],
                totalVencido: delinqMap[c.UUID] || 0
            }));

            res.json({
                data: clientesComFlag,
                meta: {
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            console.error('Erro ao listar clientes:', error);
            res.status(500).json({ error: 'Erro interno ao listar clientes' });
        }
    },

    // Busca global leve para "encontrar cliente que pode estar em outra carteira".
    // Retorna apenas campos necessários pra exibição e regras de UI (bloqueio de atendimento).
    // NÃO aplica filtro por idVendedor: qualquer usuário autenticado pode pesquisar,
    // mas o front bloqueia atender/pedido quando o cliente não é dele.
    buscarGlobal: async (req, res) => {
        try {
            const { q = '', limit = 20 } = req.query;
            const termo = String(q).trim();
            if (termo.length < 2) return res.json({ data: [] });

            const clientes = await prisma.cliente.findMany({
                where: {
                    Ativo: true,
                    OR: [
                        { Nome: { contains: termo, mode: 'insensitive' } },
                        { NomeFantasia: { contains: termo, mode: 'insensitive' } },
                        { Documento: { contains: termo, mode: 'insensitive' } },
                        { Codigo: { contains: termo, mode: 'insensitive' } }
                    ]
                },
                take: Math.min(Number(limit) || 20, 50),
                orderBy: { Nome: 'asc' },
                select: {
                    UUID: true,
                    Codigo: true,
                    Nome: true,
                    NomeFantasia: true,
                    Documento: true,
                    Telefone: true,
                    Telefone_Celular: true,
                    Email: true,
                    End_Logradouro: true,
                    End_Numero: true,
                    End_Complemento: true,
                    End_Bairro: true,
                    End_Cidade: true,
                    End_Estado: true,
                    End_CEP: true,
                    Ponto_GPS: true,
                    Dia_de_venda: true,
                    Dia_de_entrega: true,
                    Formas_Atendimento: true,
                    Observacoes_Gerais: true,
                    Situacao_serasa: true,
                    idVendedor: true,
                    vendedor: { select: { id: true, nome: true } }
                }
            });
            res.json({ data: clientes });
        } catch (error) {
            console.error('Erro na busca global de clientes:', error);
            res.status(500).json({ error: 'Erro ao buscar clientes' });
        }
    },

    // Buscar detalhe de um cliente
    detalhar: async (req, res) => {
        try {
            const { uuid } = req.params;
            const cliente = await prisma.cliente.findUnique({
                where: { UUID: uuid },
                include: {
                    arquivos: true,
                    indicacao: {
                        select: { UUID: true, Nome: true, NomeFantasia: true }
                    }
                }
            });

            if (!cliente) {
                return res.status(404).json({ error: 'Cliente não encontrado' });
            }

            res.json(cliente);
        } catch (error) {
            console.error('Erro ao detalhar cliente:', error);
            res.status(500).json({ error: 'Erro interno ao buscar cliente' });
        }
    },

    // Edição manual de dados complementares (do App)
    atualizar: async (req, res) => {
        try {
            const { uuid } = req.params;
            const {
                Dia_de_entrega,
                Dia_de_venda,
                Ponto_GPS,
                Observacoes_Gerais,
                idVendedor,
                Formas_Atendimento,
                Condicao_de_pagamento,
                condicoes_pagamento_permitidas,
                // Indicação
                indicacaoId,
                // Inteligência Comercial
                categoriaClienteId,
                cicloCompraPersonalizadoDias,
                insightAtivo,
                observacaoComercialFixa,
                // WhatsApp
                recebeAvisoPedido
            } = req.body;

            // Verificar permissão para editar GPS
            const perms = typeof req.user.permissoes === 'string'
                ? JSON.parse(req.user.permissoes)
                : (req.user.permissoes || {});
            const podeEditarGPS = perms.admin || perms.Pode_Editar_GPS || perms.clientes?.edit || perms.Pode_Executar_Entregas;

            const cliente = await prisma.cliente.update({
                where: { UUID: uuid },
                data: {
                    Dia_de_entrega,
                    Dia_de_venda,
                    Ponto_GPS: podeEditarGPS ? Ponto_GPS : undefined,
                    Observacoes_Gerais,
                    idVendedor: idVendedor === "" ? null : idVendedor,
                    Formas_Atendimento,
                    Condicao_de_pagamento: Condicao_de_pagamento === "" ? null : Condicao_de_pagamento,
                    condicoes_pagamento_permitidas,
                    // Indicação
                    indicacaoId: indicacaoId === "" ? null : indicacaoId,
                    // Inteligência Comercial
                    categoriaClienteId: categoriaClienteId === "" ? null : categoriaClienteId,
                    cicloCompraPersonalizadoDias: cicloCompraPersonalizadoDias !== undefined && cicloCompraPersonalizadoDias !== ''
                        ? parseInt(cicloCompraPersonalizadoDias)
                        : null,
                    insightAtivo: insightAtivo !== undefined ? insightAtivo : true,
                    observacaoComercialFixa: observacaoComercialFixa || null,
                    recebeAvisoPedido: recebeAvisoPedido !== undefined ? recebeAvisoPedido : undefined
                }
            });

            res.json(cliente);
        } catch (error) {
            console.error('Erro ao atualizar cliente:', error);
            res.status(500).json({ error: 'Erro ao atualizar dados do cliente' });
        }
    },

    // Sincronizar com Conta Azul (Mock)
    sincronizar: async (req, res) => {
        try {
            const resultado = await contaAzulService.syncClientes();
            res.json(resultado);
        } catch (error) {
            console.error('Erro no sync de clientes:', error);
            res.status(500).json({ error: 'Erro ao sincronizar clientes' });
        }
    },

    // Retornar status de inadimplência + contas a receber em aberto de um cliente
    obterInadimplencia: async (req, res) => {
        try {
            const { uuid } = req.params;
            const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            const hoje = new Date(hojeStr + 'T00:00:00.000Z');

            const contas = await prisma.contaReceber.findMany({
                where: {
                    clienteId: uuid,
                    status: { in: ['ABERTO', 'PARCIAL'] }
                },
                include: {
                    pedido: {
                        select: {
                            numero: true, especial: true, dataVenda: true,
                            nomeCondicaoPagamento: true, statusEntrega: true,
                            itensDevolvidos: { select: { valorBaseItem: true, quantidade: true } },
                            devolucoes: { where: { status: 'ATIVA' }, select: { valorTotal: true, escopo: true } }
                        }
                    },
                    parcelas: {
                        orderBy: { numeroParcela: 'asc' },
                        include: { baixadoPor: { select: { nome: true } } }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            let totalVencido = 0;
            let parcelasVencidas = 0;

            const contasFormatadas = contas.map(c => {
                const valorDevolvido = (c.pedido?.itensDevolvidos || [])
                    .reduce((s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0);
                const devolucaoAtiva = c.pedido?.devolucoes?.[0] || null;

                const parcelas = c.parcelas.map(p => {
                    const vencida = p.status === 'PENDENTE' && new Date(p.dataVencimento) < hoje;
                    const diasAtraso = vencida
                        ? Math.floor((hoje - new Date(p.dataVencimento)) / (1000 * 60 * 60 * 24))
                        : 0;
                    if (vencida) { totalVencido += Number(p.valor); parcelasVencidas++; }
                    return {
                        id: p.id,
                        numeroParcela: p.numeroParcela,
                        valor: Number(p.valor),
                        dataVencimento: p.dataVencimento,
                        dataPagamento: p.dataPagamento,
                        valorPago: p.valorPago ? Number(p.valorPago) : null,
                        formaPagamento: p.formaPagamento,
                        status: p.status,
                        diasAtraso,
                        baixadoPorNome: p.baixadoPor?.nome || null
                    };
                });

                return {
                    id: c.id,
                    status: c.status,
                    origem: c.origem,
                    valorTotal: Number(c.valorTotal),
                    valorDevolvido: valorDevolvido > 0 ? Math.round(valorDevolvido * 100) / 100 : 0,
                    devolucaoEscopo: devolucaoAtiva?.escopo || null,
                    pedidoNumero: c.pedido?.numero || null,
                    pedidoEspecial: c.pedido?.especial || false,
                    dataVenda: c.pedido?.dataVenda || null,
                    condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
                    statusEntrega: c.pedido?.statusEntrega || null,
                    parcelasTotal: parcelas.length,
                    parcelasPagas: parcelas.filter(p => p.status === 'PAGO').length,
                    proximoVencimento: parcelas
                        .filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
                        .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0]?.dataVencimento || null,
                    parcelas
                };
            });

            res.json({
                inadimplente: parcelasVencidas > 0,
                totalVencido: Math.round(totalVencido * 100) / 100,
                parcelasVencidas,
                contas: contasFormatadas
            });
        } catch (error) {
            console.error('Erro ao verificar inadimplência:', error);
            res.status(500).json({ error: 'Erro ao verificar inadimplência' });
        }
    },

    // Atualizar clientes em lote
    atualizarLote: async (req, res) => {
        try {
            const { ids, dados } = req.body;

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'Lista de IDs inválida.' });
            }

            if (!dados || Object.keys(dados).length === 0) {
                return res.status(400).json({ error: 'Nenhum dado para atualização fornecido.' });
            }

            // Filtrar apenas campos permitidos para edição em lote
            const dadosAtualizacao = {};
            if (dados.idVendedor !== undefined) dadosAtualizacao.idVendedor = dados.idVendedor;
            if (dados.Dia_de_entrega !== undefined) dadosAtualizacao.Dia_de_entrega = dados.Dia_de_entrega;
            if (dados.Dia_de_venda !== undefined) dadosAtualizacao.Dia_de_venda = dados.Dia_de_venda;
            if (dados.Formas_Atendimento !== undefined) dadosAtualizacao.Formas_Atendimento = dados.Formas_Atendimento;

            if (Object.keys(dadosAtualizacao).length === 0) {
                return res.status(400).json({ error: 'Nenhum campo válido para atualização (Vendedor, Entrega, Venda, Atendimento).' });
            }

            const resultado = await prisma.cliente.updateMany({
                where: {
                    UUID: { in: ids }
                },
                data: dadosAtualizacao
            });

            res.json({
                message: 'Atualização em lote concluída com sucesso.',
                count: resultado.count
            });

        } catch (error) {
            console.error('Erro ao atualizar clientes em lote:', error);
            res.status(500).json({ error: 'Erro interno ao atualizar clientes em lote' });
        }
    }
};

module.exports = clienteController;
