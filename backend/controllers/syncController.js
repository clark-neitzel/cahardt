const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

const syncController = {
    // Disparar sincronização manual de Produtos
    sincronizarProdutos: async (req, res) => {
        try {
            const result = await contaAzulService.syncProdutos();
            res.json({ message: 'Sincronização de Produtos finalizada.', result });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao sincronizar produtos.' });
        }
    },

    // Disparar sincronização manual de Clientes
    sincronizarClientes: async (req, res) => {
        try {
            const result = await contaAzulService.syncClientes();
            res.json({ message: 'Sincronização de Clientes finalizada.', result });
        } catch (error) {
            res.status(500).json({ error: 'Erro ao sincronizar clientes.' });
        }
    },

    // Sincronizar Tudo
    sincronizarTudo: async (req, res) => {
        try {
            const p = await contaAzulService.syncProdutos();
            const c = await contaAzulService.syncClientes();
            res.json({
                message: 'Sincronização Geral finalizada.',
                detalhes: { produtos: p, clientes: c }
            });
        } catch (error) {
            res.status(500).json({ error: 'Erro na sincronização geral.' });
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
