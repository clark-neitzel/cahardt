const leadService = require('../services/leadService');

const leadController = {
    listar: async (req, res) => {
        try {
            const { vendedorId, search, etapa, page, limit, mode } = req.query;
            const result = await leadService.listar({
                vendedorId: vendedorId || null,
                search: search || null,
                etapa: etapa || null,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 25,
                mode: mode || null
            });
            res.json(result);
        } catch (error) {
            console.error('[leadController.listar]', error);
            res.status(500).json({ error: 'Erro ao listar leads.' });
        }
    },

    /**
     * Lista simples para a rota (sem paginação, compatível com RotaLeads)
     */
    listarParaRota: async (req, res) => {
        try {
            const vendedorId = req.query.vendedorId || null;
            const leads = await leadService.listarParaRota(vendedorId);
            res.json(leads);
        } catch (error) {
            console.error('[leadController.listarParaRota]', error);
            res.status(500).json({ error: 'Erro ao listar leads da rota.' });
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
            const perms = req.user?.permissoes || {};
            if (!perms.admin && !perms.Pode_Editar_Lead) {
                return res.status(403).json({ error: 'Sem permissão para editar leads.' });
            }
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
    },

    uploadFoto: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
            }
            const leadId = req.params.id;
            const fotoPath = `/uploads/leads/${leadId}/${req.file.filename}`;
            const lead = await leadService.atualizar(leadId, { fotoFachada: fotoPath });
            res.json(lead);
        } catch (error) {
            console.error('[leadController.uploadFoto]', error);
            res.status(500).json({ error: 'Erro ao salvar foto.' });
        }
    },

    referenciarCliente: async (req, res) => {
        try {
            const { clienteId } = req.body;
            if (!clienteId) {
                return res.status(400).json({ error: 'clienteId é obrigatório.' });
            }
            const lead = await leadService.referenciarCliente(req.params.id, clienteId);
            res.json(lead);
        } catch (error) {
            if (error.status === 400) {
                return res.status(400).json({ error: error.message });
            }
            console.error('[leadController.referenciarCliente]', error);
            res.status(500).json({ error: 'Erro ao referenciar cliente.' });
        }
    },

    buscarPorCliente: async (req, res) => {
        try {
            const leads = await leadService.buscarPorCliente(req.params.clienteId);
            res.json(leads);
        } catch (error) {
            console.error('[leadController.buscarPorCliente]', error);
            res.status(500).json({ error: 'Erro ao buscar leads do cliente.' });
        }
    },

    excluir: async (req, res) => {
        try {
            const perms = typeof req.user.permissoes === 'string'
                ? JSON.parse(req.user.permissoes)
                : (req.user.permissoes || {});

            if (!perms.admin && !perms.Pode_Excluir_Lead) {
                return res.status(403).json({ error: 'Você não tem permissão para excluir leads.' });
            }

            await leadService.excluir(req.params.id);
            res.json({ success: true });
        } catch (error) {
            console.error('[leadController.excluir]', error);
            res.status(500).json({ error: 'Erro ao excluir lead.' });
        }
    }
};

module.exports = leadController;
