const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const contaAzulService = require('../services/contaAzulService');

async function main() {
    console.log('🔄 Iniciando Sincronização de Clientes (Manual)...');

    try {
        const resultado = await contaAzulService.syncClientes();
        console.log(`✅ Sincronização concluída!`);
        console.log(`📊 Clientes processados: ${resultado.count}`);
    } catch (error) {
        console.error('❌ Erro durante a sincronização:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
