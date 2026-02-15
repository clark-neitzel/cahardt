const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testEndpoints() {
    try {
        const config = await prisma.contaAzulConfig.findFirst();
        if (!config || !config.accessToken) {
            console.error('Sem token no banco.');
            return;
        }

        const token = config.accessToken;
        console.log('Token obtido:', token.substring(0, 10) + '...');

        const endpoints = [
            'https://api-v2.contaazul.com/v1/clientes',
            'https://api-v2.contaazul.com/v1/customers',
            'https://api-v2.contaazul.com/v1/contacts',
            'https://api-v2.contaazul.com/v1/pessoas',
            'https://api.contaazul.com/v1/customers', // Test Legacy with v2 token just in case
            'https://api.contaazul.com/v1/clientes'
        ];

        for (const url of endpoints) {
            try {
                process.stdout.write(`Testing ${url} ... `);
                const response = await axios.get(url + '?tamanho_pagina=1', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                console.log(`✅ ${response.status} OK`);
            } catch (error) {
                if (error.response) {
                    console.log(`❌ ${error.response.status} - ${JSON.stringify(error.response.data).substring(0, 100)}`);
                } else {
                    console.log(`❌ Error: ${error.message}`);
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

testEndpoints();
