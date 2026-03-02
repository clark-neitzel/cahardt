const diarioService = require('../services/diarioService');

const diarioController = {
    // Retorna o status atual do usuário logado (se tem pendência, se abriu hoje)
    meuStatus: async (req, res) => {
        try {
            const vendedorId = req.user.vendedorId; // do authMiddleware
            if (!vendedorId) return res.status(403).json({ error: 'Apenas vendedores podem ter diário de bordo.' });

            const status = await diarioService.statusDoDia(vendedorId);
            res.json(status);
        } catch (error) {
            console.error('Erro ao verificar status do diário:', error);
            res.status(500).json({ error: 'Erro ao verificar o diário' });
        }
    },

    iniciar: async (req, res) => {
        try {
            const vendedorId = req.user.vendedorId;
            if (!vendedorId) return res.status(403).json({ error: 'Acesso negado.' });

            const diario = await diarioService.iniciarDia(vendedorId, req.body);
            res.status(201).json(diario);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    },

    encerrar: async (req, res) => {
        try {
            const vendedorId = req.user.vendedorId;
            if (!vendedorId) return res.status(403).json({ error: 'Acesso negado.' });

            const diarioFinalizado = await diarioService.encerrarDia(vendedorId, req.body);
            res.json(diarioFinalizado);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    }
};

module.exports = diarioController;
