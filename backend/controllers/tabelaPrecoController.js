const prisma = require('../config/database');

const tabelaPrecoController = {
    // Listar todas as condições da tabela de preços
    listar: async (req, res) => {
        try {
            const { ativo } = req.query;
            const where = {};

            if (ativo !== undefined) {
                where.ativo = ativo === 'true';
            }

            const condicoes = await prisma.tabelaPreco.findMany({
                where,
                orderBy: { id: 'asc' } // Ordenar por ID (1000, 1001...)
            });

            res.json(condicoes);
        } catch (error) {
            console.error('Erro ao listar tabela de preços:', error);
            res.status(500).json({ error: 'Erro interno ao buscar tabela de preços' });
        }
    }
};

module.exports = tabelaPrecoController;
