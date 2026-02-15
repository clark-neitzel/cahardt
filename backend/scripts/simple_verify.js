const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function run() {
    try {
        const config = await prisma.contaAzulConfig.findFirst();
        if (!config) {
            console.log('❌ Sem configuração da Conta Azul no banco.');
            return;
        }

        console.log('🔑 Token encontrado (Início):', config.accessToken.substring(0, 10) + '...');

        // Tenta buscar direto
        console.log('📡 Buscando 5 produtos...');
        try {
            const response = await axios.get('https://api.contaazul.com/v1/products?size=5&sort=name', {
                headers: { 'Authorization': `Bearer ${config.accessToken}` }
            });
            console.log('✅ SUCESSO! Produtos retornados pela API:');
            response.data.forEach(p => {
                console.log(`- ${p.name || p.nome} | R$ ${p.value || p.valor_venda}`);
            });
        } catch (e) {
            console.log('❌ Erro na API (Provavelmente Token Expirado):', e.response?.data || e.message);
        }

    } catch (e) {
        console.error('❌ Erro no Script:', e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
