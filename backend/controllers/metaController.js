const metaService = require('../services/metaService');

const metaController = {
    /**
     * API Admin: Salva ou atualiza os limites de uma meta mensal para um usuário
     */
    salvarMetaMensal: async (req, res) => {
        try {
            const usuarioLogadoId = req.user?.id || 'admin'; // Depende de como a request é populada
            const dados = req.body;

            // Basic validation
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

    /**
     * API Admin: Lista as metas de todos os vendedores para um determinado mês
     */
    listarMetasPorMes: async (req, res) => {
        try {
            const { mesReferencia } = req.query; // Ex: ?mesReferencia=2026-03
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

    /**
     * API App Vendedor: Rota principal do Dashboard Inicial
     */
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

    obterDashboardVendedor: async (req, res) => {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: "Usuário não autenticado." });
            }

            // Admin (pode ver todos os clientes) pode consultar dashboard de outro vendedor
            const isAdmin = req.user?.permissoes?.pedidos?.clientes === 'todos';
            const vendedorId = (isAdmin && req.query.vendedorId) ? req.query.vendedorId : userId;

            const dataAtual = req.query.dataAtual || null;

            const dashboardData = await metaService.calcularDashboardVendedor(vendedorId, dataAtual);
            res.status(200).json(dashboardData);

        } catch (error) {
            console.error("[MetaController - obterDashboardVendedor]", error);
            res.status(500).json({ error: "Erro intero ao computar dashboard do vendedor." });
        }
    }

};

module.exports = metaController;
