const axios = require('axios');
const prisma = require('./config/database');
const contaAzulService = require('./services/contaAzulService');

async function main() {
    try {
        const token = await contaAzulService.getAccessToken();
        
        // Vamos buscar o cliente GUTE KUCHE (CNPJ: 83.139.832/0001-10) que o usuario mostrou na print
        const res = await axios.get('https://api-v2.contaazul.com/v1/pessoas?documentos=83.139.832/0001-10', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log("CLIENTES ENCONTRADOS:", res.data.items?.length || 0);
        if (res.data.items && res.data.items.length > 0) {
             const cli = res.data.items[0];
             console.log("DADOS DO CLIENTE (BUSCA):", JSON.stringify(cli, null, 2));

             // Vamos buscar o detalhe
             const resDet = await axios.get(`https://api-v2.contaazul.com/v1/pessoas/${cli.id}`, {
                 headers: { Authorization: `Bearer ${token}` }
             });
             console.log("\nDETALHE COMPLETO:", JSON.stringify(resDet.data, null, 2));
        }

    } catch (err) {
        console.error("API ERROR:", err.response?.data || err.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
