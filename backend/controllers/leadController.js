const leadService = require('../services/leadService');

const leadController = {
    listar: async (req, res) => {
        try {
            const vendedorId = req.query.vendedorId || null;
            const leads = await leadService.listar(vendedorId);
            res.json(leads);
        } catch (error) {
            console.error('[leadController.listar]', error);
            res.status(500).json({ error: 'Erro ao listar leads.' });
        }
    },

    detalhar: async (req, res) => {
        try {
            const lead = await leadService.buscarPorId(req.params.id);
            if (!lead) return res.status(404).json({ error: 'Lead não encontrado.' });
            res.json(lead);
        } catch (error) {
            console.error('[leadController.detalhar]', error);
            res.status(500).json({ error: 'Erro ao buscar lead.' });
        }
    },

    criar: async (req, res) => {
        try {
            const lead = await leadService.criar(req.body);
            res.status(201).json(lead);
        } catch (error) {
            console.error('[leadController.criar]', error);
            res.status(500).json({ error: 'Erro ao criar lead.' });
        }
    },

    atualizar: async (req, res) => {
        try {
            const lead = await leadService.atualizar(req.params.id, req.body);
            res.json(lead);
        } catch (error) {
            console.error('[leadController.atualizar]', error);
            res.status(500).json({ error: 'Erro ao atualizar lead.' });
        }
    },

    finalizar: async (req, res) => {
        try {
            const lead = await leadService.finalizar(req.params.id);
            res.json(lead);
        } catch (error) {
            console.error('[leadController.finalizar]', error);
            res.status(500).json({ error: 'Erro ao finalizar lead.' });
        }
    }
};

module.exports = leadController;
