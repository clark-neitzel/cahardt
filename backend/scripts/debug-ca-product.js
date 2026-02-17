
const { Client } = require('pg');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Credentials (should rely on DB config, but fallback to env if needed)
const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
    const client = new Client({
        connectionString: DATABASE_URL,
    });

    try {
        console.log('1. Connecting to DB...');
        await client.connect();

        console.log('2. Fetching specific config...');
        const res = await client.query('SELECT * FROM "conta_azul_configs" LIMIT 1');
        const config = res.rows[0];

        if (!config) throw new Error('No config found');

        console.log('3. Refreshing token...');
        const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
        const tokenRes = await axios.post('https://auth.contaazul.com/oauth2/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: config.refreshToken
            }).toString(),
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const token = tokenRes.data.access_token;
        console.log('   Token acquired.');

        console.log('4. Fetching Products (Page 1)...');
        // Fetch only 5 items
        const listRes = await axios.get('https://api-v2.contaazul.com/v1/produtos?pagina=1&tamanho_pagina=5', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const items = listRes.data.items || listRes.data || [];
        console.log(`   Found ${items.length} items.`);

        const debugData = [];

        for (const item of items) {
            console.log(`   Fetching detail for: ${item.nome} (${item.id})`);
            try {
                const detailRes = await axios.get(`https://api-v2.contaazul.com/v1/produtos/${item.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                debugData.push({
                    summary: item,
                    detail: detailRes.data
                });
            } catch (err) {
                console.error('   Error fetching detail:', err.message);
                debugData.push({ summary: item, error: err.message });
            }
            await new Promise(r => setTimeout(r, 500));
        }

        const outPath = path.join(__dirname, '../debug_products_v2.json');
        fs.writeFileSync(outPath, JSON.stringify(debugData, null, 2));
        console.log(`5. Saved debug data to ${outPath}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

main();
