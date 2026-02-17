const prisma = require('../config/database');

const migrationController = {
    // Aplicar migration de NCM
    applyNcmMigration: async (req, res) => {
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

            res.json({
                success: true,
                message: 'Coluna NCM adicionada com sucesso!',
                verification: result
            });

        } catch (error) {
            console.error('❌ Erro ao aplicar migration:', error);
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = migrationController;
