const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addTimestampColumn() {
    try {
        console.log('🔧 Adicionando coluna conta_azul_updated_at...');

        await prisma.$executeRawUnsafe(`
            ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "conta_azul_updated_at" TIMESTAMP;
        `);

        console.log('✅ Coluna conta_azul_updated_at adicionada!');

        // Verificar
        const result = await prisma.$queryRawUnsafe(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'produtos' AND column_name IN ('ncm', 'conta_azul_updated_at')
            ORDER BY column_name;
        `);

        console.log('📋 Colunas no banco:', result);

    } catch (error) {
        console.error('❌ Erro:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

addTimestampColumn();
