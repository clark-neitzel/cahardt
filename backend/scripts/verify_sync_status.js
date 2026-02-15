const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();
const contaAzulService = require('../services/contaAzulService');

async function verifySync() {
    console.log('🔍 Iniciando verificação de Sincronização...');

    try {
        // 1. Obter Token Válido
        console.log('🔑 Obtendo Access Token...');
        const token = await contaAzulService.getAccessToken();
        console.log('✅ Token obtido.');

        // 2. Buscar Produtos Reais na API (Limitado a 5)
        console.log('📡 Buscando 5 produtos recentes na Conta Azul...');
        const url = 'https://api.contaazul.com/v1/products?size=5&sort=name';
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const caProducts = response.data.products || response.data || [];
        console.log(`✅ Encontrados ${caProducts.length} produtos na API.`);

        console.log('\n📊 COMPARAÇÃO (Conta Azul vs Banco de Dados Local):');
        console.log('---------------------------------------------------------------------------------');
        console.log(String('Nome do Produto').padEnd(30), '|', String('Preço CA').padEnd(10), '|', String('Preço DB').padEnd(10), '|', String('Status').padEnd(10));
        console.log('---------------------------------------------------------------------------------');

        for (const caProd of caProducts) {
            // 3. Buscar no Banco Local
            const localProd = await prisma.produto.findUnique({
                where: { contaAzulId: caProd.id }
            });

            const caPrice = Number(caProd.value || caProd.valor_venda || 0).toFixed(2);
            const dbPrice = localProd ? Number(localProd.valorVenda).toFixed(2) : 'N/A';

            // Comparação simples
            let status = 'MISSING';
            if (localProd) {
                status = (caPrice === dbPrice) ? '✅ OK' : '❌ DIF';
            }

            console.log(
                String(caProd.name || caProd.nome).substring(0, 30).padEnd(30), '|',
                String(caPrice).padEnd(10), '|',
                String(dbPrice).padEnd(10), '|',
                status
            );
        }
        console.log('---------------------------------------------------------------------------------');

        if (caProducts.length > 0) {
            console.log('\n📝 Dados Brutos do Primeiro Produto da API (para debug):');
            console.log(JSON.stringify(caProducts[0], null, 2));
        }

    } catch (error) {
        console.error('❌ Erro na verificação:', error.response?.data || error.message);
    } finally {
        await prisma.$disconnect();
    }
}

verifySync();
