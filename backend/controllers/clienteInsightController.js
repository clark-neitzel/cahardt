const clienteInsightService = require('../services/clienteInsightService');

const getInsightPorCliente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const insight = await clienteInsightService.obterInsightCliente(clienteId);

        if (!insight) {
            // Em vez de 404, retorna 200 com null para o UI saber que não tem
            return res.json(null);
        }

        res.json(insight);
    } catch (error) {
        console.error('Erro ao buscar insight:', error);
        res.status(500).json({ error: 'Falha ao buscar insights do cliente' });
    }
};

const recalcularInsightManualmente = async (req, res) => {
    try {
        const { clienteId } = req.params;
        const novoInsight = await clienteInsightService.recalcularCliente(clienteId);

        if (!novoInsight) {
            return res.status(400).json({ error: 'Não foi possível calcular o insight (cliente inexistente ou erro interno)' });
        }

        res.json(novoInsight);
    } catch (error) {
        console.error('Erro ao recalcular insight:', error);
        res.status(500).json({ error: 'Falha ao recalcular insights' });
    }
};

module.exports = {
    getInsightPorCliente,
    recalcularInsightManualmente
};
