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
                            nome: true
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

    // Buscar detalhe de um cliente
    detalhar: async (req, res) => {
        try {
            const { uuid } = req.params;
            const cliente = await prisma.cliente.findUnique({
                where: { UUID: uuid },
                include: {
                    condicaoPagamento: true,
                    arquivos: true
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
    editar: async (req, res) => {
        try {
            const { uuid } = req.params;
            const { Dia_de_entrega, Dia_de_venda, Ponto_GPS, Observacoes_Gerais, idVendedor, Formas_Atendimento } = req.body;

            const cliente = await prisma.cliente.update({
                where: { UUID: uuid },
                data: {
                    Dia_de_entrega,
                    Dia_de_venda,
                    Ponto_GPS,
                    Observacoes_Gerais,
                    idVendedor,
                    Formas_Atendimento
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
