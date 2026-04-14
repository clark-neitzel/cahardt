const deliveryService = require('../services/deliveryService');

const isAdmin = (req) => !!req.user?.permissoes?.admin;

module.exports = {
    // ── Categorias ──
    listarCategorias: async (req, res) => {
        try {
            const lista = await deliveryService.listarCategorias();
            res.json(lista);
        } catch (err) {
            console.error('[Delivery] listarCategorias:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    salvarCategoria: async (req, res) => {
        try {
            if (!isAdmin(req)) return res.status(403).json({ error: 'Apenas administradores.' });
            const { ativo } = req.body;
            if (typeof ativo !== 'boolean') {
                return res.status(400).json({ error: 'ativo deve ser true ou false.' });
            }
            const out = await deliveryService.salvarCategoria(decodeURIComponent(req.params.nome), ativo);
            res.json(out);
        } catch (err) {
            console.error('[Delivery] salvarCategoria:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // ── Permissões ──
    listarPermissoes: async (req, res) => {
        try {
            if (!isAdmin(req)) return res.status(403).json({ error: 'Apenas administradores.' });
            const lista = await deliveryService.listarPermissoes();
            res.json(lista);
        } catch (err) {
            console.error('[Delivery] listarPermissoes:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    salvarPermissao: async (req, res) => {
        try {
            if (!isAdmin(req)) return res.status(403).json({ error: 'Apenas administradores.' });
            const { podeVer, etapasPermitidas } = req.body;
            const out = await deliveryService.salvarPermissao(req.params.vendedorId, { podeVer, etapasPermitidas });
            res.json(out);
        } catch (err) {
            console.error('[Delivery] salvarPermissao:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    // ── Permissão efetiva do usuário atual ──
    minhaPermissao: async (req, res) => {
        try {
            const perm = await deliveryService.permissaoDoUsuario(req.user);
            res.json(perm);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    // ── Kanban ──
    listarPedidos: async (req, res) => {
        try {
            const perm = await deliveryService.permissaoDoUsuario(req.user);
            if (!perm.podeVer) return res.status(403).json({ error: 'Sem permissão para Delivery.' });
            const buckets = await deliveryService.listarPedidos();
            res.json({ ...buckets, minhaPermissao: perm });
        } catch (err) {
            console.error('[Delivery] listarPedidos:', err.message);
            res.status(500).json({ error: err.message });
        }
    },

    reenviar: async (req, res) => {
        try {
            const out = await deliveryService.reenviarNotificacao({ pedidoId: req.params.pedidoId, user: req.user });
            res.json(out);
        } catch (err) {
            res.status(400).json({ error: err.message });
        }
    },

    diagnosticar: async (req, res) => {
        try {
            const out = await deliveryService.diagnosticar(req.params.numeroOuId);
            res.json(out);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    },

    moverEtapa: async (req, res) => {
        try {
            const { novaEtapa } = req.body;
            const out = await deliveryService.moverEtapa({
                pedidoId: req.params.pedidoId,
                novaEtapa,
                user: req.user
            });
            res.json(out);
        } catch (err) {
            console.error('[Delivery] moverEtapa:', err.message);
            res.status(400).json({ error: err.message });
        }
    }
};
