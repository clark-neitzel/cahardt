require('dotenv').config();
const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

async function forceSync() {
    console.log('🚀 Iniciando Sincronização Forçada de Produtos (Com Detalhes)...');
    try {
        await contaAzulService.getAccessToken(); // Garante token
        const result = await contaAzulService.syncProdutos();
        console.log('✅ Sync Concluído!');
        console.log(`📦 Produtos Processados: ${result.count}`);
    } catch (error) {
        console.error('❌ Erro no Sync:', error);
    } finally {
        await prisma.$disconnect();
    }
}

forceSync();
