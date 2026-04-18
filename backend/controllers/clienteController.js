const prisma = require('../config/database');
const contaAzulService = require('../services/contaAzulService');

const clienteController = {
    // Listar clientes com paginação e busca
    // Listar clientes com paginação e busca
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '', ativo, idVendedor, diaEntrega, diaVenda } = req.query;
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
                            statusRecompra: true,
                            diasSemComprar: true,
                            scoreRisco: true,
                        }
                    }
                }
            });

            res.json({
                data: clientes,
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
