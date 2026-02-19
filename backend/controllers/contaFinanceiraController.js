const prisma = require('../config/database');

const contaFinanceiraController = {
    listar: async (req, res) => {
        try {
            const contas = await prisma.contaFinanceira.findMany({
                orderBy: {
                    nomeBanco: 'asc'
                }
            });
            res.json(contas);
        } catch (error) {
            console.error('Erro ao listar contas financeiras:', error);
            res.status(500).json({ error: 'Erro ao listar contas financeiras' });
        }
    }
};

module.exports = contaFinanceiraController;
