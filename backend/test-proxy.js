const axios = require('axios');

async function run() {
    try {
        console.log("Fetching local DB orders directly through the proxy backend...");
        const response = await axios.get("https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/pedidos");
        
        const pedidos = response.data;
        const brothaus = pedidos.find(p => p.cliente && p.cliente.nomefantasia && p.cliente.nomefantasia.includes("BROTHAUS") && p.status === 'RECEBIDO');
        
        if (brothaus) {
            console.log("Found Local BROTHAUS Order:");
            console.log(`ID Local: ${brothaus.id}`);
            console.log(`Venda CA ID: ${brothaus.idVendaContaAzul}`);
            console.log(`Numero CA: ${brothaus.numero}`);
            console.log(`Status Local: ${brothaus.status}`);
            console.log(`UpdatedAt: ${brothaus.contaAzulUpdatedAt}`);
            
            // Now, we can ask the API to perform a debug fetch if we add a temporary endpoint, 
            // OR even better, we can inject a temporary console.log in the `contaAzulService.js` right now to print the exact object to EasyPanel logs when we hit sync.
        } else {
             console.log("Could not specifically identify the BROTHAUS order via API.");
        }
    } catch(e) {
        console.error(e.message);
    }
}
run();
