const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

const syncController = {
    // Disparar sincronização manual de Produtos
    sincronizarProdutos: async (req, res) => {
        // Fire and Forget (Executa em background)
        contaAzulService.syncProdutos().catch(err => console.error("Erro background syncProdutos:", err));

        res.status(202).json({ message: 'Sincronização de Produtos iniciada em background.' });
    },

    // Sync de clientes DESATIVADO (07/2026) — o cadastro agora é 100% do app.
    // Um sync do CA sobrescreveria as edições feitas aqui.
    sincronizarClientes: async (req, res) => {
        res.status(200).json({ message: 'Sincronização de clientes foi desativada — o cadastro de clientes agora é feito e mantido pelo próprio app.' });
    },

    // Buscar Vendas Modificadas no Conta Azul
    sincronizarPedidos: async (req, res) => {
        // Fire and Forget
        contaAzulService.syncPedidosModificados().catch(err => console.error("Erro background syncPedidos:", err));

        res.status(202).json({ message: 'Rastreamento de Pedidos Modificados no Conta Azul iniciado em background.' });
    },

    // Sincronizar Tudo
    sincronizarTudo: async (req, res) => {
        // Fire and Forget
        (async () => {
            try {
                await contaAzulService.syncProdutos();
                // syncClientes desativado (07/2026) — cadastro de clientes é 100% do app
                await contaAzulService.syncVendedores();
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
