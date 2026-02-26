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
        if (!config || !config.accessToken) return;

        // Fetching by general date instead of alteracao date
        const url = `https://api-v2.contaazul.com/v1/venda/busca?data_emissao_de=2026-02-01T00:00:00&data_emissao_ate=2026-02-28T23:59:59&tamanho_pagina=50`;
        console.log(`Fetching: ${url}`);
        
        const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${config.accessToken}` }
        });
        
        console.log(`Total Vendas Found (by emissao): ${response.data?.itens?.length || 0}`);
        
        if (response.data && response.data.itens) {
            response.data.itens.forEach(v => {
                // Focus on BROTHAUS orders to find the canceled one
                if (v.cliente && v.cliente.nome && v.cliente.nome.includes("BROTHAUS")) {
                    console.log(`\n--- Venda ${v.numero} (BROTHAUS) ---`);
                    console.log(`ID CA: ${v.id}`);
                    console.log(`Situação: "${v.situacao}"`);
                    console.log(`Status string: "${v.status}"`);
                    console.log(`Data Emissão: ${v.data_emissao}`);
                    console.log(`Data Alteração: ${v.data_alteracao}`);
                    console.log(`Valor Total: ${v.total}`);
                }
            });
        }
    } catch (e) {
        console.error("Fetch Error:", e?.response?.data || e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
