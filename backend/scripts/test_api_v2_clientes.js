const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testClientSync() {
    try {
        console.log('Using DATABASE_URL:', process.env.DATABASE_URL);
        const config = await prisma.contaAzulConfig.findFirst();

        if (!config || !config.accessToken) {
            console.error('❌ ERRO: Token não encontrado no banco.');
            return;
        }

        const token = config.accessToken;
        console.log('✅ Token recuperado:', token.substring(0, 15) + '...');

        // Parâmetros de Data (Obrigatórios na v2 se usar filtro)
        // Usando datas fixas ou dinâmicas para teste
        // Formato seguro: YYYY-MM-DDTHH:mm:ss (Sem ms, Sem Z)

        const now = new Date();
        const start = new Date();
        start.setDate(now.getDate() - 30); // 30 dias atrás

        const startStr = start.toISOString().split('.')[0];
        const endStr = now.toISOString().split('.')[0];

        // URL da API v2 para CLIENTES (Pessoas com filtro de Perfil)
        // Endpoint: /v1/pessoas
        // Filtro: tipo_perfil=CLIENTE

        const url = `https://api-v2.contaazul.com/v1/pessoas?pagina=1&tamanho_pagina=5&tipo_perfil=CLIENTE&data_alteracao_de=${startStr}&data_alteracao_ate=${endStr}`;

        console.log(`\n🔎 [TESTE] Request URL: ${url}`);
        console.log(`🔑 Authorization: Bearer ${token.substring(0, 10)}...`);

        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log(`\n✅ HTTP ${response.status} OK`);
        console.log('📦 Dados Recebidos (Amostra):');

        const items = response.data.items || response.data || [];

        if (Array.isArray(items)) {
            console.log(`Total de itens retornados: ${items.length}`);
            if (items.length > 0) {
                console.log(JSON.stringify(items[0], null, 2));
            } else {
                console.log('Nenhum cliente encontrado neste período.');
            }
        } else {
            console.log('Resposta inesperada (não é array):', response.data);
        }

    } catch (error) {
        if (error.response) {
            console.error(`\n❌ ERRO API: ${error.response.status} ${error.response.statusText}`);
            console.error('Body:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('\n❌ ERRO SISTEMA:', error.message);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testClientSync();
