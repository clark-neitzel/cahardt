const amostraService = require('../services/amostraService');

const amostraController = {

    criar: async (req, res) => {
        try {
            const { leadId, clienteId, dataEntrega, observacao, itens } = req.body;
            if (!itens || !Array.isArray(itens) || itens.length === 0) {
                return res.status(400).json({ error: 'Informe pelo menos um item.' });
            }
            const amostra = await amostraService.criar({
                leadId, clienteId, dataEntrega, observacao,
                solicitadoPorId: req.user.id,
                itens
            });
            res.status(201).json(amostra);
        } catch (error) {
            console.error('Erro ao criar amostra:', error);
            res.status(500).json({ error: 'Erro ao criar amostra.' });
        }
    },

    listar: async (req, res) => {
        try {
            const filtros = {};
            if (req.query.status) filtros.status = req.query.status;
            if (req.query.vendedorId) filtros.solicitadoPorId = req.query.vendedorId;
            if (req.query.leadId) filtros.leadId = req.query.leadId;
            if (req.query.clienteId) filtros.clienteId = req.query.clienteId;
            const amostras = await amostraService.listar(filtros);
            res.json(amostras);
        } catch (error) {
            console.error('Erro ao listar amostras:', error);
            res.status(500).json({ error: 'Erro ao listar amostras.' });
        }
    },

    buscarPorId: async (req, res) => {
        try {
            const amostra = await amostraService.buscarPorId(req.params.id);
            if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada.' });
            res.json(amostra);
        } catch (error) {
            console.error('Erro ao buscar amostra:', error);
            res.status(500).json({ error: 'Erro ao buscar amostra.' });
        }
    },

    atualizarStatus: async (req, res) => {
        try {
            const { status } = req.body;
            if (!status) return res.status(400).json({ error: 'Informe o novo status.' });
            const amostra = await amostraService.atualizarStatus(req.params.id, status);
            res.json(amostra);
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            res.status(400).json({ error: error.message || 'Erro ao atualizar status.' });
        }
    },
};

module.exports = amostraController;
