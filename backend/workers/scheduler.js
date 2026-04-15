/**
 * Background Schedulers
 * Extraído de index.js — mesmos services, intervalos e ordem de execução.
 */

function startSchedulers() {
    // === 1. KEEP-ALIVE SYSTEM ===
    // Garante que o token nunca expire mesmo se o sistema estiver ocioso.
    // Executa a cada 45 minutos (45 * 60 * 1000 = 2700000 ms)
    console.log('⏰ Iniciando sistema de Keep-Alive do Token Conta Azul...');
    const contaAzulService = require('../services/contaAzulService');

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

    // === 2. AUTO-SYNC SYSTEM (Dados) ===
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

    // === 3. AUTO-SYNC PEDIDOS (Bidirecional) ===
    // Detecta automaticamente pedidos alterados/excluídos no CA a cada 15 minutos.
    // Não depende do usuário clicar no botão — roda em background continuamente.
    console.log('⏰ Iniciando Auto-Sync de Pedidos (CA → App)...');
    const _runSyncPedidos = async () => {
        try {
            await contaAzulService.syncPedidosModificados();
        } catch (err) {
            console.error('⚠️ Auto-Sync Pedidos Error:', err.message);
        }
    };
    // Primeira execução 2min após o start (para o servidor estar estável)
    setTimeout(_runSyncPedidos, 120000);
    // Execuções subsequentes a cada 15min
    setInterval(_runSyncPedidos, 900000); // 15 minutos


    // === 4. WORKER DE PEDIDOS (Upload para CA) ===
    // Checa a fila de pedidos a enviar a cada 30 segundos
    console.log('⏰ Iniciando Worker de Pedidos (Upload para CA)...');
    const syncPedidosService = require('../services/syncPedidosService');
    setInterval(async () => {
        await syncPedidosService.processarFila();
    }, 30000); // 30 segundos

    // === 4.1. AUTO-SYNC BAIXAS (Contas a Receber CA → App) ===
    // A cada 1 hora, verifica se parcelas abertas no app já foram baixadas no Conta Azul
    // e aplica a baixa local (valor, data, forma de pagamento).
    console.log('⏰ Iniciando Auto-Sync de Baixas (Contas a Receber CA → App)...');
    const contasReceberSyncService = require('../services/contasReceberSyncService');
    const _runSyncBaixas = async () => {
        try {
            await contasReceberSyncService.sincronizarTodasAbertas();
        } catch (err) {
            console.error('⚠️ Auto-Sync Baixas Error:', err.message);
        }
    };
    // Primeira execução 5min após o start (p/ outros sincs rodarem antes)
    setTimeout(_runSyncBaixas, 300000);
    // Depois a cada 1 hora
    setInterval(_runSyncBaixas, 3600000); // 60 min

    // === 5. CRON JOB INTELLIGENCE COMERCIAL ===
    // Recalcula todos os clientes 1 vez por dia, na madrugada (aprox 03:00)
    console.log('⏰ Agendando Motor Analítico (Inteligência Comercial)...');
    const clienteInsightService = require('../services/clienteInsightService');

    const scheduleNextRecalculation = () => {
        const now = new Date();
        const night = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1, // Amanhã
            3, 0, 0 // 03:00 AM
        );
        const msToNight = night.getTime() - now.getTime();

        setTimeout(async () => {
            try {
                await clienteInsightService.recalcularTodosClientes();
            } catch (e) { console.error(e); }
            scheduleNextRecalculation(); // re-agenda pro dia seguinte
        }, msToNight);
    };
    scheduleNextRecalculation();
}

module.exports = { startSchedulers };
