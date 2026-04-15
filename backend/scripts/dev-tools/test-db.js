const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const pedido = await prisma.pedido.findUnique({
        where: { id: "c963ed0f-4e08-4122-93a0-e7588e4d9664" },
        include: { cliente: true }
    });
    console.log(JSON.stringify(pedido, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
