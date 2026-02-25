const axios = require('axios');
const prisma = require('../config/database');

async function testFetchVendas() {
    try {
        const tokenData = await prisma.contaAzulToken.findFirst({ orderBy: { id: 'desc' } });
        if (!tokenData) throw new Error("Sem token");

        const dataStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Vendas endpoints: v1/vendas
        let url = `https://api.contaazul.com/v1/vendas?size=5`;

        console.log(`Buscando: ${url}`);
        
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        
        console.log("Status:", response.status);
        if (response.data) {
            console.log(JSON.stringify(response.data).substring(0, 500) + '...');
        }
    } catch (error) {
        console.error("ERRO!");
        console.error(error.response ? error.response.data : error.message);
    }
}

testFetchVendas();
