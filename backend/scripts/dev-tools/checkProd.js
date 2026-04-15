const prisma = require('./config/database');

async function main() {
    const p = await prisma.produto.findFirst({
        where: { nome: { contains: 'ESPETINHO DE FRANGO BACON' } }
    });
    console.log("DB RESULT:", p);

    // Let's also check if Conta Azul actually returns this product if we fetch!
}
main().catch(console.error).finally(() => prisma.$disconnect());
