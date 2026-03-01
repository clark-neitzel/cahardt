const atendimentoService = require('../services/atendimentoService');

const atendimentoController = {
    registrar: async (req, res) => {
        try {
            const atendimento = await atendimentoService.registrar(req.body);
            res.status(201).json(atendimento);
        } catch (error) {
            console.error('[atendimentoController.registrar]', error);
            res.status(500).json({ error: 'Erro ao registrar atendimento.' });
        }
    },

    listarPorLead: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarPorLead(req.params.leadId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarPorLead]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos do lead.' });
        }
    },

    listarPorCliente: async (req, res) => {
        try {
            const atendimentos = await atendimentoService.listarPorCliente(req.params.clienteId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarPorCliente]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos do cliente.' });
        }
    },

    listarHojeVendedor: async (req, res) => {
        try {
            const { vendedorId } = req.query;
            if (!vendedorId) return res.status(400).json({ error: 'vendedorId obrigatório.' });
            const atendimentos = await atendimentoService.listarHojeVendedor(vendedorId);
            res.json(atendimentos);
        } catch (error) {
            console.error('[atendimentoController.listarHojeVendedor]', error);
            res.status(500).json({ error: 'Erro ao listar atendimentos de hoje.' });
        }
    }
};

module.exports = atendimentoController;
