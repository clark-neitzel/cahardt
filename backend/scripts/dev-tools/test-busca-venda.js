const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@postgresql.xrqvlq.easypanel.host:5432/postgres" },
  },
});

async function run() {
    try {
        const config = await prisma.contaAzulConfig.findFirst();

        // One of the orders from the screenshot is BROTHAUS 500.00
        // Another is BROTHAUS 825.00
        // I will pull ALL pedidos locally that are RECEBIDO and ask CA directly about them.
        
        const pedidosLocais = await prisma.pedido.findMany({
             where: { statusEnvio: 'RECEBIDO' },
             select: { id: true, idVendaContaAzul: true, numero: true }
        });
        
        console.log(`Pedidos Locais Recebidos: ${pedidosLocais.length}`);
        
        for (const pd of pedidosLocais) {
            if (!pd.idVendaContaAzul) continue;
            try {
               const url = `https://api-v2.contaazul.com/v1/venda/${pd.idVendaContaAzul}`;
               const response = await axios.get(url, { headers: { 'Authorization': `Bearer ${config.accessToken}` } });
               console.log(`[OK] CA tem a Venda ${pd.numero} (${pd.idVendaContaAzul}) - Situacao: ${response.data.situacao?.nome}`);
            } catch(e) {
               console.log(`[FALHA] Buscar Venda ${pd.numero} (${pd.idVendaContaAzul}): ${e.response?.status} - ${e.response?.data?.message || 'Nao encontrada'}`);
            }
        }
        
    } catch (e) {
        console.error("Geral Error:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
