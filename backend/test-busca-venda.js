const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://postgres:postgres@localhost:5432/cahardt' }
  }
});

async function run() {
  try {
    const config = await prisma.contaAzulConfig.findFirst();
    if (!config) return console.log('No config');
    
    const diasAtras = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://api-v2.contaazul.com/v1/venda/busca?data_alteracao_de=${diasAtras}T00:00:00&tamanho_pagina=5`;
    
    console.log('GET', url);
    const res = await axios.get(url, { headers: { Authorization: 'Bearer ' + config.accessToken } });
    console.log(`[OK] ${res.status}`);
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log(`[ERR] ${err.response?.status} - ${JSON.stringify(err.response?.data)}`);
  } finally {
    await prisma.$disconnect();
  }
}

run();
