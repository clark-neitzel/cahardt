const tarefaService = require('../services/tarefaService');

const tarefaController = {

    // GET /tarefas/fila
    listarFila: async (req, res) => {
        try {
            const { status, contexto, page, limit } = req.query;
            const user = req.user;
            const perms = user.permissoes || {};

            // Se não tem permissão de ver todas, filtra pelo próprio usuário
            const responsavelId = perms.Pode_Ver_Todas_Tarefas ? (req.query.responsavelId || null) : user.id;

            const resultado = await tarefaService.listarFila({
                responsavelId,
                status,
                contexto,
                page: parseInt(page) || 1,
                limit: parseInt(limit) || 50
            });

            res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar fila de tarefas:', error);
            res.status(500).json({ error: 'Erro ao listar fila de tarefas.' });
        }
    },

    // GET /tarefas/resumo
    resumo: async (req, res) => {
        try {
            const resultado = await tarefaService.resumo();
            res.json(resultado);
        } catch (error) {
            console.error('Erro ao buscar resumo de tarefas:', error);
            res.status(500).json({ error: 'Erro ao buscar resumo.' });
        }
    },

    // GET /tarefas/:id
    obterPorId: async (req, res) => {
        try {
            const tarefa = await tarefaService.obterPorId(req.params.id);
            if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada.' });
            res.json(tarefa);
        } catch (error) {
            console.error('Erro ao obter tarefa:', error);
            res.status(500).json({ error: 'Erro ao obter tarefa.' });
        }
    },

    // PATCH /tarefas/:id/transferir
    transferir: async (req, res) => {
        try {
            const { novoResponsavelId } = req.body;
            if (!novoResponsavelId) return res.status(400).json({ error: 'Novo responsável obrigatório.' });

            const tarefa = await tarefaService.transferir(req.params.id, novoResponsavelId);
            res.json(tarefa);
        } catch (error) {
            console.error('Erro ao transferir tarefa:', error);
            res.status(500).json({ error: 'Erro ao transferir tarefa.' });
        }
    },

    // PATCH /tarefas/:id/cancelar
    cancelar: async (req, res) => {
        try {
            const tarefa = await tarefaService.cancelar(req.params.id);
            res.json(tarefa);
        } catch (error) {
            console.error('Erro ao cancelar tarefa:', error);
            res.status(500).json({ error: 'Erro ao cancelar tarefa.' });
        }
    },

    // GET /tarefas/leads-pendentes?leadIds=id1,id2,...
    listarPendentesDeLeads: async (req, res) => {
        try {
            const { leadIds } = req.query;
            if (!leadIds) return res.json([]);
            const ids = leadIds.split(',').filter(Boolean);
            const tarefas = await tarefaService.listarPendentesDeLeads(ids);
            res.json(tarefas);
        } catch (error) {
            console.error('Erro ao buscar tarefas de leads:', error);
            res.status(500).json({ error: 'Erro ao buscar tarefas de leads.' });
        }
    }
};

module.exports = tarefaController;
