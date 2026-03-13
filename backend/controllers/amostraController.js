const amostraService = require('../services/amostraService');

const amostraController = {

    // GET /amostras
    listar: async (req, res) => {
        try {
            const { status, leadId, page, limit } = req.query;
            const user = req.user;
            const perms = user.permissoes || {};

            const params = {
                status: status || undefined,
                leadId: leadId || undefined,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 50
            };

            // Se não é admin/gerenciador, filtra pelo próprio usuário
            if (!perms.Pode_Gerenciar_Amostras && !perms.admin) {
                params.solicitadoPorId = user.id;
            }

            const resultado = await amostraService.listar(params);
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar amostras:', error);
            res.status(500).json({ error: 'Erro ao listar amostras.' });
        }
    },

    // GET /amostras/:id
    obterPorId: async (req, res) => {
        try {
            const amostra = await amostraService.obterPorId(req.params.id);
            if (!amostra) return res.status(404).json({ error: 'Amostra não encontrada.' });
            res.json(amostra);
        } catch (error) {
            console.error('Erro ao obter amostra:', error);
            res.status(500).json({ error: 'Erro ao obter amostra.' });
        }
    },

    // POST /amostras
    criar: async (req, res) => {
        try {
            const { leadId, clienteId, observacao, itens } = req.body;
            if (!itens || !itens.length) {
                return res.status(400).json({ error: 'Amostra precisa ter pelo menos 1 item.' });
            }

            const amostra = await amostraService.criar({
                leadId,
                clienteId,
                solicitadoPorId: req.user.id,
                observacao,
                itens
            });

            res.status(201).json(amostra);
        } catch (error) {
            console.error('Erro ao criar amostra:', error);
            res.status(500).json({ error: 'Erro ao criar amostra.' });
        }
    },

    // PATCH /amostras/:id/status
    mudarStatus: async (req, res) => {
        try {
            const { status } = req.body;
            if (!status) return res.status(400).json({ error: 'Status obrigatório.' });

            const amostra = await amostraService.mudarStatus(req.params.id, status);
            res.json(amostra);
        } catch (error) {
            console.error('Erro ao mudar status da amostra:', error);
            res.status(400).json({ error: error.message || 'Erro ao mudar status.' });
        }
    },

    // DELETE /amostras/:id
    cancelar: async (req, res) => {
        try {
            await amostraService.cancelar(req.params.id);
            res.json({ message: 'Amostra cancelada.' });
        } catch (error) {
            console.error('Erro ao cancelar amostra:', error);
            res.status(400).json({ error: error.message || 'Erro ao cancelar amostra.' });
        }
    }
};

module.exports = amostraController;
