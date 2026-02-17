require('dotenv').config();
const contaAzulService = require('../services/contaAzulService');
const prisma = require('../config/database');

async function debug() {
    try {
        console.log('--- STARTING DEBUG ---');
        // Force authentication check first
        await contaAzulService.getAccessToken();

        // Fetch products (List)
        const products = await contaAzulService.fetchProdutosFromAPI();

        if (products.length > 0) {
            console.log('--- FIRST PRODUCT RAW JSON ---');
            console.log(JSON.stringify(products[0], null, 2));
            console.log('--- END RAW JSON ---');
        } else {
            console.log('No products found.');
        }

    } catch (error) {
        console.error('Debug Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
