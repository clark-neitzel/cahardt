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
    
    console.log('Testing with token:', config.accessToken.substring(0, 30));
    
    const endpoints = [
      'https://api.contaazul.com/v1/vendas?size=1',
      'https://api-v2.contaazul.com/v1/vendas?size=1',
      'https://api.contaazul.com/v1/venda/proximo-numero',
      'https://api-v2.contaazul.com/v1/venda/proximo-numero'
    ];
    
    for (const url of endpoints) {
      try {
        const res = await axios.get(url, { headers: { Authorization: 'Bearer ' + config.accessToken } });
        console.log(`[OK] ${res.status} - ${url}`);
      } catch (err) {
        console.log(`[ERR] ${err.response?.status} - ${url} - ${JSON.stringify(err.response?.data)}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
