const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const produtoRoutes = require('./routes/produtoRoutes');
const syncRoutes = require('./routes/syncRoutes');
const clienteRoutes = require('./routes/clienteRoutes');
const authRoutes = require('./routes/authRoutes'); // New
const vendedorRoutes = require('./routes/vendedorRoutes'); // New
const configRoutes = require('./routes/configRoutes'); // New
const tabelaPrecoRoutes = require('./routes/tabelaPrecoRoutes'); // New
const contaFinanceiraRoutes = require('./routes/contaFinanceiraRoutes'); // New
const condicaoPagamentoRoutes = require('./routes/condicaoPagamentoRoutes');
const migrationRoutes = require('./routes/migrationRoutes'); // Migration endpoint
const pedidoRoutes = require('./routes/pedidoRoutes'); // New Pedidos Module
const promocaoRoutes = require('./routes/promocaoRoutes'); // Sistema de Promoções
const leadRoutes = require('./routes/leadRoutes'); // CRM: Leads
const atendimentoRoutes = require('./routes/atendimentoRoutes'); // CRM: Atendimentos
const veiculoRoutes = require('./routes/veiculos'); // Módulo de Veículos
const diarioRoutes = require('./routes/diarios'); // Módulo do Diário/Ponto
const formasPagamentoEntregaRoutes = require('./routes/formasPagamentoEntrega'); // Módulo Pagamento Embarque
const embarqueRoutes = require('./routes/embarques'); // Módulo de Formação de Carga/Expedição
const entregasRoutes = require('./routes/entregas'); // Módulo Mobile do Entregador
const despesasRoutes = require('./routes/despesas'); // Módulo de Despesas
const caixaRoutes = require('./routes/caixa'); // Módulo Caixa Diário
const adminResetRoutes = require('./routes/adminReset'); // Reset Transacional (Admin)
const adminDashboardRoutes = require('./routes/adminDashboard'); // Novo Dashboard Admin
const roteirizacaoRoutes = require('./routes/roteirizacao'); // Roteirizador de Entregas
const metaRoutes = require('./routes/metaRoutes'); // Gestão de Metas e Dashboard Vendas
const categoriasProdutoRoutes = require('./routes/categoriasProduto'); // Inteligência Comercial
const categoriasClienteRoutes = require('./routes/categoriasCliente'); // Inteligência Comercial
const insightRoutes = require('./routes/insights'); // Inteligência Comercial - Insights Analíticos
const amostraRoutes = require('./routes/amostraRoutes'); // Amostras (mini-pedidos)
const contasReceberRoutes = require('./routes/contasReceber'); // Contas a Receber
const estoqueRoutes = require('./routes/estoqueRoutes'); // Módulo de Estoque
const authMiddleware = require('./middlewares/authMiddleware'); // Middleware de Autenticação

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
// (auth e sync abertos)
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);

// (Protegidas)
app.use('/api/produtos', authMiddleware, produtoRoutes);
app.use('/api/clientes', authMiddleware, clienteRoutes);
app.use('/api/vendedores', authMiddleware, vendedorRoutes);
app.use('/api/config', authMiddleware, configRoutes);
app.use('/api/tabela-precos', authMiddleware, tabelaPrecoRoutes);
app.use('/api/condicoes-pagamento', authMiddleware, condicaoPagamentoRoutes);
app.use('/api/contas-financeiras', authMiddleware, contaFinanceiraRoutes);
app.use('/api/pedidos', authMiddleware, pedidoRoutes);
app.use('/api/promocoes', promocaoRoutes); // authMiddleware já aplicado internamente na rota
app.use('/api/leads', authMiddleware, leadRoutes); // CRM: Leads
app.use('/api/atendimentos', authMiddleware, atendimentoRoutes); // CRM: Atendimentos
app.use('/api/veiculos', authMiddleware, veiculoRoutes); // Módulo de Veículos
app.use('/api/diarios', authMiddleware, diarioRoutes); // Relatório Diário / Ponto
app.use('/api/pagamentos-entrega', formasPagamentoEntregaRoutes); // Pagamentos de Entrega
app.use('/api/embarques', embarqueRoutes); // Montagem Cargas e Despacho Logístico
app.use('/api/entregas', entregasRoutes); // App Motorista
app.use('/api/despesas', despesasRoutes); // Módulo de Despesas
app.use('/api/caixa', caixaRoutes); // Módulo Caixa Diário
app.use('/api/metas', metaRoutes); // Módulo de Metas e Dashboard
app.use('/api/admin', adminResetRoutes); // Admin: Reset, Utilitários
app.use('/api/admin-dashboard', adminDashboardRoutes); // Dashboard Admin
app.use('/api/roteirizar', roteirizacaoRoutes); // Roteirizador de Entregas (OSRM)
app.use('/api/categorias-produto', authMiddleware, categoriasProdutoRoutes); // Inteligência Comercial
app.use('/api/categorias-cliente', authMiddleware, categoriasClienteRoutes); // Inteligência Comercial
app.use('/api/insights', authMiddleware, insightRoutes); // Inteligência Comercial - Motor
app.use('/api/amostras', authMiddleware, amostraRoutes); // Amostras (mini-pedidos)
app.use('/api/contas-receber', contasReceberRoutes); // Contas a Receber (auth inside)
app.use('/api/estoque', authMiddleware, estoqueRoutes); // Módulo de Estoque

app.use('/api/migrations', authMiddleware, migrationRoutes); // Migration endpoint (protegido)

// Rota base
app.get('/', (req, res) => {
    res.send('API Hardt Salgados - v1.0.1');
});

const prisma = require('./config/database');

// Inicialização
const startServer = async () => {
    try {
        // Rodar migrações manuais (Garantia de schema) - SAFE RECOVERY
        console.log('🔄 Verificando Schema do Banco de Dados...');
        // A tabela SyncLog já está coberta pelo Prisma db push. 
        // Queries raw desabilitadas para não poluir os logs de erro do Postgres.
        console.log('✅ Schema gerenciado pelo Prisma.');

        const migrationService = require('./services/migrationService');
        await migrationService.run();

        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);

            // Inicia todos os jobs background (keep-alive, syncs, worker, cron)
            const { startSchedulers } = require('./workers/scheduler');
            startSchedulers();
        });
    } catch (error) {
        console.error('Erro fatal ao iniciar servidor:', error);
    }
};

startServer();
