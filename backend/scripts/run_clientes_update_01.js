const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Executing Migration Update 01: Add NomeFantasia...');

    const commands = [
        `ALTER TABLE "clientes" ADD COLUMN IF NOT EXISTS "NomeFantasia" TEXT;`,
        // Index for search performance
        `CREATE INDEX IF NOT EXISTS "clientes_NomeFantasia_idx" ON "clientes"("NomeFantasia");`
    ];

    for (const cmd of commands) {
        try {
            await prisma.$executeRawUnsafe(cmd);
            console.log(`✅ Command executed: ${cmd}`);
        } catch (e) {
            console.error(`❌ Error execution ${cmd}:`, e.message);
        }
    }
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
