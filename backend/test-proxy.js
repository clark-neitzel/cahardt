const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@postgresql.xrqvlq.easypanel.host:5432/postgres" }
  },
});

async function run() {
    try {
        const pedidosRecebidos = await prisma.pedido.findMany({
            where: { statusEnvio: 'RECEBIDO' },
            select: { id: true, numero: true, idVendaContaAzul: true, cliente: { select: { nomefantasia: true, razaosocial: true }} }
        });
        
        console.log(`Total Pedidos RECEBIDO locais: ${pedidosRecebidos.length}`);
        pedidosRecebidos.forEach(p => console.log(`- ${p.numero} (CA: ${p.idVendaContaAzul}) [${p.cliente?.nomefantasia || p.cliente?.razaosocial}]`));
    } catch (e) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
