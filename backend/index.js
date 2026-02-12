const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const produtoRoutes = require('./routes/produtoRoutes');
const syncRoutes = require('./routes/syncRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const authRoutes = require('./routes/authRoutes'); // New

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    // Log básico para debug
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Arquivos estáticos (Uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas
app.use('/api/produtos', produtoRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/clientes', clienteRoutes);
app.use('/api/auth', authRoutes); // New

// Rota base
app.get('/', (req, res) => {
    res.send('API Hardt Salgados - v1.0.1 (Prod Data Fix)');
});

app.get('/api/debug-version', (req, res) => {
    const service = require('./services/contaAzulService');
    res.json({
        message: 'Debug Code Version',
        mockDataLength: service.fetchProdutosFromAPI ? 'Function Exists' : 'Missing',
        // Execute the function to see what it returns without writing to DB
        previewData: service.fetchProdutosFromAPI().then(data => data.slice(0, 3))
    });
});

const prisma = require('./config/database');

// Inicialização
const startServer = async () => {
    try {
        // Rodar migrações manuais (Garantia de schema) - SAFE RECOVERY
        console.log('🔄 Verificando Schema do Banco de Dados...');
        try {
            // Tenta alterar SyncLog (Nome padrão do Prisma) ou sync_logs
            // POSTGRES CASE SENSITIVE FIX
            try {
                await prisma.$executeRawUnsafe(`ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "request_url" TEXT;`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "request_method" TEXT;`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "response_status" INTEGER;`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "response_body" TEXT;`);
                await prisma.$executeRawUnsafe(`ALTER TABLE "SyncLog" ADD COLUMN IF NOT EXISTS "duration" INTEGER;`);
            } catch (e) {
                console.log('⚠️ Tabela "SyncLog" não encontrada. Tentando "synclog" (lowercase)...');
                try {
                    await prisma.$executeRawUnsafe(`ALTER TABLE "synclog" ADD COLUMN IF NOT EXISTS "request_url" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "synclog" ADD COLUMN IF NOT EXISTS "request_method" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "synclog" ADD COLUMN IF NOT EXISTS "response_status" INTEGER;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "synclog" ADD COLUMN IF NOT EXISTS "response_body" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "synclog" ADD COLUMN IF NOT EXISTS "duration" INTEGER;`);
                } catch (e2) {
                    console.log('⚠️ Tabela "synclog" não encontrada. Tentando "sync_logs" (snake_case)...');
                    await prisma.$executeRawUnsafe(`ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "request_url" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "request_method" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "response_status" INTEGER;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "response_body" TEXT;`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "sync_logs" ADD COLUMN IF NOT EXISTS "duration" INTEGER;`);
                }
            }
            console.log('✅ Schema SyncLog atualizado com sucesso.');
        } catch (error) {
            console.error('❌ Falha na migração manual (SyncLog/synclog/sync_logs):', error.message);
        }
    }
        const migrationService = require('./services/migrationService');
    await migrationService.run();

    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);

        // === KEEP-ALIVE SYSTEM ===
        // Garante que o token nunca expire mesmo se o sistema estiver ocioso.
        // Executa a cada 45 minutos (45 * 60 * 1000 = 2700000 ms)
        console.log('⏰ Iniciando sistema de Keep-Alive do Token Conta Azul...');
        const contaAzulService = require('./services/contaAzulService');

        // Primeira execução imediata (async, não bloqueia)
        contaAzulService.getAccessToken().catch(err => console.error('⚠️ Erro no Keep-Alive inicial:', err.message));

        setInterval(async () => {
            console.log('⏰ Keep-Alive: Verificando Token...');
            try {
                await contaAzulService.getAccessToken();
            } catch (error) {
                console.error('⚠️ Keep-Alive Error:', error.message);
            }
        }, 2700000); // 45 minutos

        // === AUTO-SYNC SYSTEM (Dados) ===
        // Sincroniza produtos e clientes automaticamente a cada 1 Hora
        console.log('⏰ Iniciando sistema de Auto-Sync (Dados)...');
        setInterval(async () => {
            console.log('🔄 Auto-Sync: Buscando novidades na Conta Azul...');
            try {
                // Delta Sync automático
                await contaAzulService.syncProdutos();
                await contaAzulService.syncClientes();
                console.log('✅ Auto-Sync finalizado com sucesso.');
            } catch (error) {
                console.error('⚠️ Auto-Sync Error:', error.message);
            }
        }, 3600000); // 60 minutos (1 hora)
    });
} catch (error) {
    console.error('Erro fatal ao iniciar servidor:', error);
}
};

startServer();
