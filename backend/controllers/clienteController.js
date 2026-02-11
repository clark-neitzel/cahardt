const prisma = require('../config/database');
const contaAzulService = require('../services/contaAzulService');

const clienteController = {
    // Listar clientes com paginação e busca
    listar: async (req, res) => {
        try {
            const { page = 1, limit = 10, search = '' } = req.query;
            const skip = (page - 1) * limit;

            const where = {};
            if (search) {
                where.OR = [
                    { Nome: { contains: search, mode: 'insensitive' } },
                    { Documento: { contains: search, mode: 'insensitive' } },
                    { Codigo: { contains: search, mode: 'insensitive' } }
                ];
            }

            const total = await prisma.cliente.count({ where });
            const clientes = await prisma.cliente.findMany({
                where,
                skip: Number(skip),
                take: Number(limit),
                orderBy: { Nome: 'asc' }
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

    // Sincronizar com Conta Azul (Mock)
    sincronizar: async (req, res) => {
        try {
            const resultado = await contaAzulService.syncClientes();
            res.json(resultado);
        } catch (error) {
            console.error('Erro no sync de clientes:', error);
            res.status(500).json({ error: 'Erro ao sincronizar clientes' });
        }
    }
};

module.exports = clienteController;
