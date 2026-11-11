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
            if (req.query.leadId) filtros.leadId = req.query.leadId;
            if (req.query.clienteId) filtros.clienteId = req.query.clienteId;
            if (req.query.semCarga === '1' || req.query.semCarga === 'true') filtros.semCarga = true;

            if (req.user) {
                const permissoes = req.user.permissoes || {};
                const permissaoPedidos = permissoes.pedidos || {};
                const podeVerTodos = permissoes.admin || permissaoPedidos.clientes === 'todos';

                if (!podeVerTodos) {
                    filtros.solicitadoPorId = req.user.id;
                } else if (req.query.vendedorId) {
                    filtros.solicitadoPorId = req.query.vendedorId;
                }
            } else if (req.query.vendedorId) {
                filtros.solicitadoPorId = req.query.vendedorId;
            }
            const amostras = await amostraService.listar(filtros);
            res.json(amostras);
        } catch (error) {
            console.error('Erro ao listar amostras:', error);
            res.status(500).json({ error: 'Erro ao listar amostras.' });
        }
    },

    // Visibilidade igual à do listar: vendedor sem pedidos.clientes==='todos' só enxerga as suas.
    _filtroVisibilidade: (req) => {
        const permissoes = req.user?.permissoes || {};
        const podeVerTodos = permissoes.admin === true || permissoes.pedidos?.clientes === 'todos';
        return podeVerTodos ? {} : { solicitadoPorId: req.user.id };
    },

    resumoAbertas: async (req, res) => {
        try {
            const { hoje, amostras } = await amostraService.listarAbertasSemCarga(amostraController._filtroVisibilidade(req));
            res.json({
                hoje,
                semCarga: amostras.length,
                vermelhas: amostras.filter(a => a.urgencia === 'vermelho').length,
                ids: amostras.slice(0, 200).map(a => a.id),
            });
        } catch (error) {
            console.error('Erro no resumo de amostras abertas:', error);
            res.status(500).json({ error: 'Erro ao resumir amostras.' });
        }
    },

    liberar: async (req, res) => {
        try {
            const p = req.user?.permissoes || {};
            const pode = p.admin === true || p.Pode_Acessar_Embarque === true || p.Pode_Ver_Pendencias === true
                || p.Pode_Acessar_Financeiro_Gerencial === true;
            if (!pode) return res.status(403).json({ error: 'Você não tem permissão para liberar amostras.' });
            const { codigo, ...corpo } = await amostraService.liberar(req.params.id);
            res.status(codigo).json(corpo);
        } catch (error) {
            console.error('Erro ao liberar amostra:', error);
            res.status(500).json({ error: 'Erro ao liberar amostra.' });
        }
    },

    etiquetaImpressa: async (req, res) => {
        try {
            const { codigo, ...corpo } = await amostraService.marcarEtiquetaImpressa(req.params.id);
            res.status(codigo).json(corpo);
        } catch (error) {
            console.error('Erro ao marcar etiqueta impressa:', error);
            res.status(500).json({ error: 'Erro ao registrar a impressão.' });
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

    excluir: async (req, res) => {
        try {
            const permissoes = req.user?.permissoes || {};
            if (!permissoes.Pode_Excluir_Amostra && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para excluir amostras.' });
            }
            const isAdmin = !!permissoes.admin;
            const deletada = await amostraService.excluir(req.params.id, { forceAdmin: isAdmin });
            res.json({ message: 'Amostra excluída com sucesso', id: deletada.id });
        } catch (error) {
            console.error('Erro ao excluir amostra:', error);
            res.status(400).json({ error: error.message || 'Erro ao excluir amostra.' });
        }
    },

    enviarWhatsapp: async (req, res) => {
        try {
            const webhookService = require('../services/webhookService');
            const result = await webhookService.notificarAmostra(req.params.id, { forceManual: true });
            if (result.ok) {
                res.json({ ok: true });
            } else {
                res.status(400).json({ ok: false, motivo: result.motivo });
            }
        } catch (error) {
            console.error('Erro ao enviar WhatsApp amostra:', error);
            res.status(500).json({ ok: false, motivo: error.message });
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
