const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

const syncController = {
    // Disparar sincronização manual de Produtos
    sincronizarProdutos: async (req, res) => {
        // Fire and Forget (Executa em background)
        contaAzulService.syncProdutos().catch(err => console.error("Erro background syncProdutos:", err));

        res.status(202).json({ message: 'Sincronização de Produtos iniciada em background.' });
    },

    // Disparar sincronização manual de Clientes
    sincronizarClientes: async (req, res) => {
        // Fire and Forget
        contaAzulService.syncClientes().catch(err => console.error("Erro background syncClientes:", err));

        res.status(202).json({ message: 'Sincronização de Clientes iniciada em background.' });
    },

    // Sincronizar Tudo
    sincronizarTudo: async (req, res) => {
        // Fire and Forget
        (async () => {
            try {
                await contaAzulService.syncProdutos();
                await contaAzulService.syncClientes();
            } catch (err) {
                console.error("Erro background syncTudo:", err);
            }
        })();

        res.status(202).json({
            message: 'Sincronização Geral iniciada em background.'
        });
    },

    // Listar logs de sincronização
    listarLogs: async (req, res) => {
        try {
            const logs = await prisma.syncLog.findMany({
                orderBy: { dataHora: 'desc' },
                take: 50
            });
            res.json(logs);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao buscar logs.' });
        }
    },

    // Verificar Sincronização (Debug)
    verificarSync: async (req, res) => {
        try {
            const comparison = await contaAzulService.verifySyncProdutos();
            res.json(comparison);
        } catch (error) {
            res.status(500).json({ error: 'Erro ao verificar sync: ' + error.message });
        }
    }
};

module.exports = syncController;
