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
    obterDashboardVendedor: async (req, res) => {
        try {
            // Em req.user está o ID do vendedor logado usando o app
            const vendedorId = req.user?.id;
            if (!vendedorId) {
                return res.status(401).json({ error: "Usuário não autenticado." });
            }

            // Permite passar data customizada para debug, senao pega o dia de hoje
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
