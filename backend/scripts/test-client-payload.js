const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();
const contaAzulService = require('../services/contaAzulService');

async function testClientPayload() {
    try {
        console.log('Obtendo token da CA...');
        const token = await contaAzulService.getAccessToken();

        console.log('Buscando payload do cliente SIMPLE COFFEE ...');
        const response = await axios.get('https://api-v2.contaazul.com/v1/pessoas?busca=SIMPLE+COFFEE', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('PAYLOAD LISTAGEM (V1/PESSOAS):');
        console.log(JSON.stringify(response.data.items[0], null, 2));

        if (response.data.items && response.data.items.length > 0) {
            const id = response.data.items[0].id;
            console.log(`\n\nBuscando PAYLOAD DETALHES (V1/PESSOAS/${id}):`);
            const detalhes = await axios.get(`https://api-v2.contaazul.com/v1/pessoas/${id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            console.log(JSON.stringify(detalhes.data, null, 2));
        }

    } catch (e) {
        console.error('Erro na chamada da API:', e.message);
        if (e.response) {
            console.error('Resposta do Servidor:', e.response.data);
        }
    } finally {
        await prisma.$disconnect();
    }
}

testClientPayload();
