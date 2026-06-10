const comissaoService = require('../services/comissaoService');

module.exports = {

    listarConfigs: async (req, res) => {
        try {
            const { mesReferencia } = req.query;
            if (!mesReferencia) return res.status(400).json({ error: 'mesReferencia obrigatório' });
            const configs = await comissaoService.listarConfigs(mesReferencia);
            res.json(configs);
        } catch (err) {
            console.error('[comissaoController.listarConfigs]', err);
            res.status(500).json({ error: err.message });
        }
    },

    salvarConfig: async (req, res) => {
        try {
            const usuarioLogadoId = req.user?.id || 'system';
            const config = await comissaoService.salvarConfig(req.body, usuarioLogadoId);
            res.json(config);
        } catch (err) {
            console.error('[comissaoController.salvarConfig]', err);
            res.status(500).json({ error: err.message });
        }
    },

    apurar: async (req, res) => {
        try {
            const { mesReferencia, vendedorId } = req.query;
            if (!mesReferencia) return res.status(400).json({ error: 'mesReferencia obrigatório' });
            if (vendedorId) {
                const resultado = await comissaoService.apurarVendedor(vendedorId, mesReferencia);
                return res.json(resultado);
            }
            const resultados = await comissaoService.apurarTodos(mesReferencia);
            res.json(resultados);
        } catch (err) {
            console.error('[comissaoController.apurar]', err);
            res.status(500).json({ error: err.message });
        }
    }
};
