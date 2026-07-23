process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Rede: teto de 60s em TODA chamada HTTP via axios (Conta Azul, etc.). Sem isso,
// se a API externa travar/ficar lenta, o worker ou a requisição do usuário ficam
// pendurados para sempre. 60s é folgado — nenhuma chamada legítima passa disso.
axios.defaults.timeout = 60000;

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
const adminExecRoutes = require('./routes/adminExec');   // Admin Exec: diagnóstico e manutenção
const adminDashboardRoutes = require('./routes/adminDashboard'); // Novo Dashboard Admin
const dashboardsRoutes = require('./routes/dashboards'); // Dashboards 2026: geral (5 abas), vendedor e entregador
const produtoMargemRoutes = require('./routes/produtoMargem'); // Produtos: margem, custo, markup e variação no tempo
const roteirizacaoRoutes = require('./routes/roteirizacao'); // Roteirizador de Entregas
const metaRoutes = require('./routes/metaRoutes'); // Gestão de Metas e Dashboard Vendas
const categoriasProdutoRoutes = require('./routes/categoriasProduto'); // Inteligência Comercial
const categoriasClienteRoutes = require('./routes/categoriasCliente'); // Inteligência Comercial
const insightRoutes = require('./routes/insights'); // Inteligência Comercial - Insights Analíticos
const amostraRoutes = require('./routes/amostraRoutes'); // Amostras (mini-pedidos)
const contasReceberRoutes = require('./routes/contasReceber'); // Contas a Receber
const estoqueRoutes = require('./routes/estoqueRoutes'); // Módulo de Estoque
const categoriaEstoqueRoutes = require('./routes/categoriaEstoqueRoutes'); // Categorias de Estoque
const pcpItemRoutes = require('./routes/pcpItemRoutes'); // PCP: Itens
const pcpReceitaRoutes = require('./routes/pcpReceitaRoutes'); // PCP: Receitas
const pcpEstoqueRoutes = require('./routes/pcpEstoqueRoutes'); // PCP: Estoque
const pcpOrdemRoutes = require('./routes/pcpOrdemRoutes'); // PCP: Ordens de Produção
const pcpAgendaRoutes = require('./routes/pcpAgendaRoutes'); // PCP: Agenda/Calendário
const pcpSugestaoRoutes = require('./routes/pcpSugestaoRoutes'); // PCP: Sugestões de Produção
const pcpEtiquetaRoutes = require('./routes/pcpEtiquetaRoutes'); // PCP: Etiquetas de Produtos
const devolucaoRoutes = require('./routes/devolucaoRoutes'); // Devoluções
const deliveryRoutes = require('./routes/deliveryRoutes'); // Delivery (Kit Festa)
const iaLogsRoutes = require('./routes/iaLogs'); // Logs de Análise IA
const mensagemAgendadaRoutes = require('./routes/mensagemAgendadaRoutes'); // Mensagens Agendadas
const curriculoRoutes = require('./routes/curriculos'); // Módulo RH: Currículos (público)
const rhRoutes = require('./routes/rh'); // Módulo RH: Painel interno
const copilotoRoutes = require('./routes/copiloto'); // Copiloto (Clippy): assistente de negócio com IA
const comissaoRoutes = require('./routes/comissaoRoutes'); // Módulo de Comissões
const kitFestaRoutes = require('./routes/kitFestaRoutes'); // Kit Festa: painel admin
const kitFestaPublicRoutes = require('./routes/kitFestaPublicRoutes'); // Kit Festa: site público do cliente
const congeladosRoutes = require('./routes/congeladosRoutes'); // Site Congelados: painel admin
const tarefaRoutes = require('./routes/tarefaRoutes'); // Tarefas da Equipe (agenda com alerta sonoro)
const cobrancaRoutes = require('./routes/cobrancaRoutes'); // Régua de Cobrança (inadimplentes)
const congeladosPublicRoutes = require('./routes/congeladosPublicRoutes'); // Site Congelados: site público do cliente
const catalogoPersonalizadoRoutes = require('./routes/catalogoPersonalizadoRoutes'); // Catálogo Personalizado: gerar/listar (privado)
const catalogoPersonalizadoPublicRoutes = require('./routes/catalogoPersonalizadoPublicRoutes'); // Catálogo Personalizado: página pública por token
const visitorRoutes = require('./routes/visitorRoutes'); // Rastreio de visitantes online (ping público + stats admin)
const pontoPublicRoutes = require('./routes/pontoPublicRoutes'); // RH: bater ponto por link público (sem login)
const iaConsultaRoutes = require('./routes/iaConsultaRoutes'); // API de consulta somente-leitura p/ IA externa (ex.: bot WhatsApp)
const asaasRoutes = require('./routes/asaasRoutes'); // Integração Asaas: PIX na entrega + webhook de pagamento
const focusNfeWebhookRoutes = require('./routes/focusNfeWebhookRoutes'); // Focus NFe: webhook público (segredo próprio no header x-focus-secret)
const contasPagarRoutes = require('./routes/contasPagar'); // Financeiro: Contas a Pagar (Fase 1)
const fornecedoresRoutes = require('./routes/fornecedores'); // Financeiro: Fornecedores
const configNotasRoutes = require('./routes/configNotas'); // Configurações: Certificado Digital (notas)
const notasEntradaRoutes = require('./routes/notasEntrada'); // Financeiro: Notas Recebidas — captura NF-e SEFAZ (Fase 2)
const financeiroGerencialRoutes = require('./routes/financeiroGerencial'); // Financeiro: Fluxo de Caixa e DRE (Fase 5)
const conciliacaoBancariaRoutes = require('./routes/conciliacaoBancaria'); // Financeiro: conciliação bancária (extrato OFX)
const authMiddleware = require('./middlewares/authMiddleware'); // Middleware de Autenticação

const app = express();
const PORT = process.env.PORT || 3000;

// Atrás do proxy do EasyPanel — confia em 1 hop para obter o IP real do cliente
// (necessário para a trava de força bruta do login enxergar cada usuário).
app.set('trust proxy', 1);

// CORS aberto (revertido para destravar o app). Restrição por allowlist será
// reintroduzida depois de confirmar a origem exata que o app usa no navegador.
app.use(cors());

// Cabeçalhos de segurança. CSP e cross-origin-resource-policy desligados para não
// bloquear imagens de /uploads (carregadas pelo frontend em outro domínio) nem o
// HTML servido pelo backend.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
}));

app.use(express.json());
app.use((req, res, next) => {
    // Log básico para debug
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Arquivos estáticos (Uploads)
// Certificado digital NUNCA é servido publicamente (mesmo criptografado)
app.use('/uploads/certificado', (req, res) => res.status(403).json({ error: 'Acesso negado.' }));
// XMLs de NF-e capturadas: só via rota autenticada /api/notas-entrada/:id/xml
app.use('/uploads/notas-xml', (req, res) => res.status(403).json({ error: 'Acesso negado.' }));
// Cache de DANFEs/boletos da impressão em lote — documentos de cliente, nunca públicos
app.use('/uploads/cache-fiscal', (req, res) => res.status(403).json({ error: 'Acesso negado.' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Dados vivos NUNCA são cacheados. O Safari do iOS (app PWA instalado na tela
// inicial) guarda GET de API sem Cache-Control e reusa sem revalidar — a tela
// "congela" no número da última vez que foi aberta (sintoma real relatado no
// Dashboard). no-store em TODA resposta /api garante dado sempre fresco. Não
// afeta imagens/JS (servidos pelo nginx, fora de /api).
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

// Rotas
// (auth e sync abertos)
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/kitfesta-publico', kitFestaPublicRoutes); // Kit Festa: site público (auth do cliente é interna)
app.use('/api/congelados-publico', congeladosPublicRoutes); // Site Congelados: site público (auth do cliente é interna)
app.use('/api/catalogo-personalizado-publico', catalogoPersonalizadoPublicRoutes); // Catálogo Personalizado: página pública por token (sem login)
app.use('/api/visitors', visitorRoutes); // ping público + stats protegida (auth interna na rota)
app.use('/api/ponto-publico', pontoPublicRoutes); // RH: bater ponto por link público (token identifica o funcionário)
app.use('/api/ia-consulta', iaConsultaRoutes); // API de consulta somente-leitura p/ IA externa (própria chave x-ia-api-key, não usa admin-secret)
app.use('/api/asaas', asaasRoutes); // Integração Asaas: webhook público (token próprio) + PIX na entrega (auth interna)
app.use('/api/webhooks', focusNfeWebhookRoutes); // Focus NFe: webhook público /api/webhooks/focus-nfe (segredo próprio)


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
app.use('/api/admin', adminResetRoutes);         // Admin: Reset, Utilitários
app.use('/api/admin-exec', adminExecRoutes);    // Admin Exec: diagnóstico protegido por ADMIN_SECRET
app.use('/api/admin-dashboard', adminDashboardRoutes); // Dashboard Admin
app.use('/api/dashboards', dashboardsRoutes); // Dashboards 2026: geral (5 abas), vendedor e entregador
app.use('/api/produtos-margem', produtoMargemRoutes); // Produtos: margem, custo, markup e variação no tempo
app.use('/api/roteirizar', roteirizacaoRoutes); // Roteirizador de Entregas (OSRM)
app.use('/api/categorias-produto', authMiddleware, categoriasProdutoRoutes); // Inteligência Comercial
app.use('/api/categorias-cliente', authMiddleware, categoriasClienteRoutes); // Inteligência Comercial
app.use('/api/insights', authMiddleware, insightRoutes); // Inteligência Comercial - Motor
app.use('/api/amostras', authMiddleware, amostraRoutes); // Amostras (mini-pedidos)
app.use('/api/contas-receber', contasReceberRoutes); // Contas a Receber (auth inside)
app.use('/api/contas-pagar', contasPagarRoutes); // Contas a Pagar (auth inside)
app.use('/api/fornecedores', fornecedoresRoutes); // Fornecedores (auth inside)
app.use('/api/config-notas', configNotasRoutes); // Certificado Digital p/ notas (auth inside)
app.use('/api/notas-entrada', notasEntradaRoutes); // Notas Recebidas — NF-e capturadas na SEFAZ (auth inside)
app.use('/api/financeiro-gerencial', financeiroGerencialRoutes); // Fluxo de Caixa e DRE (auth inside)
app.use('/api/conciliacao-bancaria', conciliacaoBancariaRoutes); // Conciliação bancária — extrato OFX (auth inside)
app.use('/api/estoque', authMiddleware, estoqueRoutes); // Módulo de Estoque
app.use('/api/categorias-estoque', authMiddleware, categoriaEstoqueRoutes); // Categorias de Estoque

// PCP — Planejamento e Controle de Produção
app.use('/api/pcp/itens', authMiddleware, pcpItemRoutes);
app.use('/api/pcp/receitas', authMiddleware, pcpReceitaRoutes);
app.use('/api/pcp/estoque', authMiddleware, pcpEstoqueRoutes);
app.use('/api/pcp/ordens', authMiddleware, pcpOrdemRoutes);
app.use('/api/pcp/agenda', authMiddleware, pcpAgendaRoutes);
app.use('/api/pcp/sugestoes', authMiddleware, pcpSugestaoRoutes);
app.use('/api/pcp/etiquetas', authMiddleware, pcpEtiquetaRoutes);
app.use('/api/devolucoes', authMiddleware, devolucaoRoutes); // Devoluções
app.use('/api/delivery', authMiddleware, deliveryRoutes); // Delivery (Kit Festa)
app.use('/api/ia-logs', iaLogsRoutes); // Logs de Análise IA (auth interno)

app.use('/api/mensagens-agendadas', authMiddleware, mensagemAgendadaRoutes); // Mensagens Agendadas
app.use('/api/migrations', authMiddleware, migrationRoutes); // Migration endpoint (protegido)
app.use('/api/curriculos', curriculoRoutes); // RH: Submissão pública de currículos
app.use('/api/rh', authMiddleware, rhRoutes); // RH: Painel interno (protegido)
app.use('/api/copiloto', authMiddleware, copilotoRoutes); // Copiloto (Clippy): assistente de negócio com IA
app.use('/api/comissoes', authMiddleware, comissaoRoutes); // Módulo de Comissões
app.use('/api/kitfesta', authMiddleware, kitFestaRoutes); // Kit Festa: painel admin (agenda, produtos, pedidos)
app.use('/api/congelados', authMiddleware, congeladosRoutes); // Site Congelados: painel admin (produtos, pedidos)
app.use('/api/catalogo-personalizado', authMiddleware, catalogoPersonalizadoRoutes); // Catálogo Personalizado: montar lista de preços e gerar link
app.use('/api/tarefas', authMiddleware, tarefaRoutes); // Tarefas da Equipe (agenda com alerta sonoro)
app.use('/api/cobranca', cobrancaRoutes); // Régua de Cobrança de inadimplentes (auth inside)

// Rota base
app.get('/', (req, res) => {
    res.send('API Hardt Salgados - v1.0.1');
});

// Versão do build — para detecção de deploy no frontend (PWA sem botão de refresh)
app.get('/api/version', (req, res) => {
    const version = process.env.APP_VERSION || require('./package.json').version || 'unknown';
    res.json({ version });
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
