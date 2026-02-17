const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
    try {
        console.log('🔧 Aplicando migration: Adicionar coluna NCM...');

        // Adicionar coluna NCM
        await prisma.$executeRawUnsafe(`
            ALTER TABLE "produtos" ADD COLUMN IF NOT EXISTS "ncm" TEXT;
        `);

        console.log('✅ Coluna NCM adicionada com sucesso!');

        // Verificar se a coluna foi criada
        const result = await prisma.$queryRawUnsafe(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'produtos' AND column_name = 'ncm';
        `);

        console.log('📋 Verificação:', result);

    } catch (error) {
        console.error('❌ Erro ao aplicar migration:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

applyMigration();
