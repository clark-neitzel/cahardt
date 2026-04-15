const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const contaAzulService = require('./backend/services/contaAzulService');

async function check() {
  const token = await contaAzulService.getAccessToken();
  const res = await contaAzulService._axiosGet('https://api-v2.contaazul.com/v1/venda/busca?numeros=13');
  console.log(JSON.stringify(res.data, null, 2));
  
  if (res.data && res.data[0] || (res.data.itens && res.data.itens[0])) {
      const id = (res.data[0] || res.data.itens[0]).id;
      console.log(`Buscando Venda Detalhada ID: ${id}`);
      const resDet = await contaAzulService._axiosGet(`https://api-v2.contaazul.com/v1/venda/${id}`);
      console.log(JSON.stringify(resDet.data, null, 2));
  }
}
check().catch(console.error).finally(() => process.exit(0));
