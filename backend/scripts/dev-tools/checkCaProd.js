const axios = require('axios');
const prisma = require('./config/database');
const contaAzulService = require('./services/contaAzulService');

async function main() {
    try {
        const token = await contaAzulService.getAccessToken();
        
        // Testa buscar todos (sem status)
        const resAll = await axios.get('https://api-v2.contaazul.com/v1/produtos?busca=ESPETINHO', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("SEARCH ALL (no status):", resAll.data.items?.length, "items");
        if (resAll.data.items) {
             console.log("Is Espetinho present?", resAll.data.items.some(i => i.nome.includes('ESPETINHO')));
             console.log("Status:", resAll.data.items.find(i => i.nome.includes('ESPETINHO'))?.status);
        }

        // Testa buscar especificamente INATIVO
        const resInativo = await axios.get('https://api-v2.contaazul.com/v1/produtos?busca=ESPETINHO&status=INATIVO', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("\nSEARCH INATIVO:", resInativo.data.items?.length, "items");
        if (resInativo.data.items) {
            console.log("Is Espetinho present?", resInativo.data.items.some(i => i.nome.includes('ESPETINHO')));
            console.log("Status:", resInativo.data.items.find(i => i.nome.includes('ESPETINHO'))?.status);
        }

    } catch (err) {
        console.error("API ERROR:", err.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
