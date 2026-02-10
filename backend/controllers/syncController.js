const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

const syncController = {
    // Disparar sincronização manual
    sincronizarProdutos: async (req, res) => {
        try {
            const result = await contaAzulService.syncProdutos();
            res.json({ message: 'Sincronização iniciada com sucesso.', result });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao sincronizar produtos.' });
        }
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
    }
};

module.exports = syncController;
