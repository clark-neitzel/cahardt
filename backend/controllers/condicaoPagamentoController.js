const prisma = require('../config/database');

const condicaoPagamentoController = {
    listar: async (req, res) => {
        try {
            const condicoes = await prisma.condicaoPagamento.findMany({
                where: { ativo: true },
                orderBy: { nome: 'asc' }
            });
            res.json(condicoes);
        } catch (error) {
            console.error('Erro ao listar condições de pagamento:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    }
};

module.exports = condicaoPagamentoController;
