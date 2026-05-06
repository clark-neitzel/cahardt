const metaService = require('../services/metaService');

const metaController = {
    salvarMetaMensal: async (req, res) => {
        try {
            const permissoes = req.user?.permissoes || {};
            if (!permissoes.Pode_Gerenciar_Metas && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para gerenciar metas.' });
            }

            const usuarioLogadoId = req.user?.id || 'admin';
            const dados = req.body;

            if (!dados.vendedorId || !dados.mesReferencia || !dados.diasTrabalho || !dados.valorMensal) {
                return res.status(400).json({ error: "Campos obrigatórios: vendedorId, mesReferencia, diasTrabalho, valorMensal" });
            }

            const meta = await metaService.salvarMetaMensal(dados, usuarioLogadoId);
            res.status(200).json(meta);
        } catch (error) {
            console.error("[MetaController - salvarMetaMensal]", error);
            res.status(500).json({ error: "Erro interno ao salvar meta." });
        }
    },

    listarMetasPorMes: async (req, res) => {
        try {
            const { mesReferencia } = req.query;
            if (!mesReferencia) {
                return res.status(400).json({ error: "mesReferencia query param é obrigatório." });
            }
            const metas = await metaService.listarMetasMensais(mesReferencia);
            res.status(200).json(metas);
        } catch (error) {
            console.error("[MetaController - listarMetasPorMes]", error);
            res.status(500).json({ error: "Erro interno ao buscar metas." });
        }
    },

    excluir: async (req, res) => {
        try {
            const permissoes = req.user?.permissoes || {};
            if (!permissoes.Pode_Gerenciar_Metas && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para excluir metas.' });
            }
            const deletada = await metaService.excluir(req.params.id);
            res.json({ message: 'Meta excluída com sucesso', id: deletada.id });
        } catch (error) {
            console.error('[MetaController - excluir]', error);
            res.status(400).json({ error: error.message || 'Erro ao excluir meta.' });
        }
    },

    obterSugestaoMeta: async (req, res) => {
        try {
            const permissoes = req.user?.permissoes || {};
            if (!permissoes.Pode_Gerenciar_Metas && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para consultar sugestões de meta.' });
            }

            const { vendedorId, fatorCrescimento } = req.query;
            if (!vendedorId) {
                return res.status(400).json({ error: "vendedorId é obrigatório." });
            }

            const fator = fatorCrescimento ? parseFloat(fatorCrescimento) : 1.0;
            if (isNaN(fator) || fator <= 0) {
                return res.status(400).json({ error: "fatorCrescimento deve ser um número positivo (ex: 1.10 para +10%)." });
            }

            const sugestao = await metaService.calcularSugestaoMeta(vendedorId, fator);
            res.status(200).json(sugestao);
        } catch (error) {
            console.error("[MetaController - obterSugestaoMeta]", error);
            res.status(500).json({ error: "Erro interno ao calcular sugestão de meta." });
        }
    },

    obterDashboardVendedor: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: "Usuário não autenticado." });
            }

            const isAdmin = req.user?.permissoes?.pedidos?.clientes === 'todos';
            const vendedorId = (isAdmin && req.query.vendedorId) ? req.query.vendedorId : userId;
            const dataAtual = req.query.dataAtual || null;

            const dashboardData = await metaService.calcularDashboardVendedor(vendedorId, dataAtual);
            res.status(200).json(dashboardData);
        } catch (error) {
            console.error("[MetaController - obterDashboardVendedor]", error);
            res.status(500).json({ error: "Erro interno ao computar dashboard do vendedor." });
        }
    }
};

module.exports = metaController;
