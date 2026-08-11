const dayjs = require('dayjs');
const comissaoService = require('../services/comissaoService');

module.exports = {

    // Comissão do próprio vendedor logado (dashboard/popup) — sempre o mês atual
    // por padrão. Gestor pode consultar outro vendedor via ?vendedorId=.
    minha: async (req, res) => {
        try {
            const isGestor = !!req.user?.permissoes?.admin
                || !!req.user?.permissoes?.Pode_Gerenciar_Metas
                || !!req.user?.permissoes?.Pode_Ver_Dashboard_Admin;
            const vendedorId = (isGestor && req.query.vendedorId) ? req.query.vendedorId : req.user?.id;
            const mesReferencia = /^\d{4}-\d{2}$/.test(req.query.mesReferencia || '')
                ? req.query.mesReferencia
                : dayjs().format('YYYY-MM');
            const resultado = await comissaoService.apurarVendedor(vendedorId, mesReferencia);
            res.json(resultado);
        } catch (err) {
            console.error('[comissaoController.minha]', err);
            res.status(500).json({ error: err.message });
        }
    },

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
