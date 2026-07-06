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

    // === 4.2. CONTAS A PAGAR / FORNECEDORES ↔ CA ===
    // Workers 100% isolados: cada método já engole os próprios erros e, sem token
    // do CA configurado, pula silenciosamente. Nunca derrubam o servidor.
    console.log('⏰ Iniciando Workers de Contas a Pagar/Fornecedores (↔ CA)...');
    const contasPagarCaSync = require('../services/contasPagarCaSyncService');

    // Envio de fornecedores (a cada 60s) — primeira execução 90s após o start
    setTimeout(() => {
        setInterval(() => {
            contasPagarCaSync.processarFilaFornecedores()
                .catch(err => console.error('⚠️ Worker Fornecedores→CA Error:', err.message));
        }, 60000);
    }, 90000);

    // Envio de despesas + consulta de protocolos (a cada 60s) — primeira execução 2min após o start
    setTimeout(() => {
        setInterval(() => {
            contasPagarCaSync.processarFilaDespesas()
                .catch(err => console.error('⚠️ Worker Despesas→CA Error:', err.message));
        }, 60000);
    }, 120000);

    // Conferência de baixas no CA (a cada 30min) — primeira execução 10min após o start
    const _runBaixasPagar = () => {
        contasPagarCaSync.conferirBaixasCA()
            .catch(err => console.error('⚠️ Worker Baixas Contas a Pagar Error:', err.message));
    };
    setTimeout(_runBaixasPagar, 600000);
    setInterval(_runBaixasPagar, 1800000); // 30 minutos

    // Sincronização da lista de contas financeiras (bancos/caixas) do CA — para os
    // relatórios "por conta" mostrarem o nome do banco. 3min após o start, depois a cada 6h.
    const _runContasFin = () => {
        contasPagarCaSync.sincronizarContasFinanceiras()
            .catch(err => console.error('⚠️ Worker Contas Financeiras Error:', err.message));
    };
    setTimeout(_runContasFin, 180000);
    setInterval(_runContasFin, 6 * 3600000); // 6 horas

    // === 4.3. CAPTURA DE NF-e (SEFAZ Distribuição DF-e) ===
    // A cada 1 hora consulta as NF-e emitidas contra o nosso CNPJ e alimenta a
    // caixa de Notas Recebidas. 100% isolado: sem certificado instalado ou com a
    // captura desligada (AppConfig captura_nfe_ativa), o ciclo pula silenciosamente;
    // cStat 656 (consumo indevido) grava bloqueio de 1h15 e o worker respeita.
    console.log('⏰ Iniciando Captura de NF-e (SEFAZ DF-e)...');
    const sefazDfeService = require('../services/sefazDfeService');
    const _runDfe = () => {
        sefazDfeService.executarCiclo()
            .catch(err => console.error('⚠️ Worker SEFAZ DF-e Error:', err.message));
    };
    // Primeira execução 4min após o start (servidor estável, sem competir com os outros syncs)
    setTimeout(_runDfe, 240000);
    setInterval(_runDfe, 3600000); // 60 minutos

    // === 4.4. CAPTURA DE NFS-e (Ambiente de Dados Nacional — serviços tomados) ===
    // A cada 1 hora consulta as NFS-e onde somos tomador no ambiente nacional
    // (mesmo certificado A1). Isolado igual à NF-e: sem certificado ou com a
    // captura desligada (AppConfig captura_nfse_ativa), o ciclo pula em silêncio.
    console.log('⏰ Iniciando Captura de NFS-e (ADN nacional)...');
    const nfseAdnService = require('../services/nfseAdnService');
    const _runNfse = () => {
        nfseAdnService.executarCiclo()
            .catch(err => console.error('⚠️ Worker NFS-e ADN Error:', err.message));
    };
    // 7min após o start (defasado da NF-e para não competir)
    setTimeout(_runNfse, 420000);
    setInterval(_runNfse, 3600000); // 60 minutos

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

    // === 6. IA NOTURNA — Pré-análise dos clientes do dia seguinte ===
    // Às 23:30, analisa clientes com rota amanhã que ainda não têm orientação IA gerada.
    // Cobre clientes novos ou reativados que nunca tiveram análise.
    console.log('⏰ Agendando IA Noturna (Pré-análise rota do dia seguinte)...');
    const orientacaoService = require('../services/orientacaoService');
    const prismaIA = require('../config/database');
    const DIAS_SIGLA_IA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

    const scheduleIANoturna = () => {
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        const msToTarget = target.getTime() - now.getTime();

        setTimeout(async () => {
            try {
                const amanha = new Date();
                amanha.setDate(amanha.getDate() + 1);
                const siglaDia = DIAS_SIGLA_IA[amanha.getDay()];

                const clientes = await prismaIA.cliente.findMany({
                    where: { Ativo: true, insightAtivo: true, Dia_de_venda: { not: null } },
                    select: { UUID: true, Dia_de_venda: true }
                });
                const clientesDoDia = clientes.filter(c =>
                    (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim()).includes(siglaDia)
                );

                // Filtra apenas os que ainda não têm orientação IA
                const insights = await prismaIA.clienteInsight.findMany({
                    where: {
                        clienteId: { in: clientesDoDia.map(c => c.UUID) },
                        orientacaoIaJson: { not: null }
                    },
                    select: { clienteId: true }
                });
                const comIA = new Set(insights.map(i => i.clienteId));
                const semIA = clientesDoDia.filter(c => !comIA.has(c.UUID));

                console.log(`[IA Noturna] ${siglaDia}: ${semIA.length}/${clientesDoDia.length} clientes sem orientação IA — gerando...`);
                for (const c of semIA) {
                    try {
                        await orientacaoService.gerarOrientacaoIA(c.UUID, { disparadoPor: 'NOTURNO' });
                    } catch (err) {
                        console.error(`[IA Noturna] Erro cliente ${c.UUID}:`, err.message);
                    }
                }
                console.log(`[IA Noturna] Concluído para ${siglaDia}.`);
            } catch (e) {
                console.error('[IA Noturna] Erro geral:', e);
            }
            scheduleIANoturna();
        }, msToTarget);
    };
    scheduleIANoturna();

    // === 7. MENSAGENS AGENDADAS ===
    // Verifica a cada minuto se há mensagens para enviar (horário SP).
    console.log('⏰ Iniciando sistema de Mensagens Agendadas...');
    const prisma = require('../config/database');
    const mensagemAgendadaService = require('../services/mensagemAgendadaService');
    const DIAS_SIGLA_MSG = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

    setInterval(async () => {
        try {
            // Horário atual em SP (process.env.TZ já é 'America/Sao_Paulo')
            const agora = new Date();
            const hh = String(agora.getHours()).padStart(2, '0');
            const mm = String(agora.getMinutes()).padStart(2, '0');
            const horaAtual = `${hh}:${mm}`;
            const siglaDia = DIAS_SIGLA_MSG[agora.getDay()];

            const configs = await prisma.mensagemAgendada.findMany({
                where: { ativo: true, hora: horaAtual, diasSemana: { has: siglaDia } },
                include: { vendedor: true }
            });

            for (const config of configs) {
                // Previne reenvio se já foi enviado neste mesmo minuto hoje
                if (config.ultimoEnvio) {
                    const ultimo = new Date(config.ultimoEnvio);
                    const mesmoDia = ultimo.toDateString() === agora.toDateString();
                    const mesmaHora = `${String(ultimo.getHours()).padStart(2,'0')}:${String(ultimo.getMinutes()).padStart(2,'0')}` === horaAtual;
                    if (mesmoDia && mesmaHora) continue;
                }

                console.log(`[MensagemAgendada] Disparando tipo=${config.tipo} para ${config.vendedor.nome} (${horaAtual})`);
                let resultado = { ok: false, motivo: 'Tipo desconhecido' };
                if (config.tipo === 'meta') {
                    resultado = await mensagemAgendadaService.enviarMeta(config.vendedor);
                } else if (config.tipo === 'atendimento') {
                    resultado = await mensagemAgendadaService.enviarAtendimento(config.vendedor);
                }

                if (resultado.ok) {
                    await prisma.mensagemAgendada.update({
                        where: { id: config.id },
                        data: { ultimoEnvio: agora }
                    });
                } else {
                    console.warn(`[MensagemAgendada] Falha para ${config.vendedor.nome}: ${resultado.motivo}`);
                }
            }
        } catch (e) {
            console.error('[MensagemAgendada] Erro no scheduler:', e.message);
        }
    }, 60 * 1000); // a cada 1 minuto

    // === 8. ALERTA DE CERTIFICADO A1 VENCENDO ===
    // 1x/dia (08:00) avisa os admins (com telefone) por WhatsApp nos limiares
    // 30/15/7/3/1 dias e quando vencido. Isolado: nunca derruba nada.
    console.log('⏰ Agendando alerta de validade do Certificado A1...');
    const certificadoService = require('../services/certificadoService');
    const _runCertAlerta = () => {
        certificadoService.alertarValidadeCertificado()
            .catch(err => console.error('⚠️ Alerta Certificado Error:', err.message));
    };
    setTimeout(_runCertAlerta, 300000); // 5min após o start
    const scheduleCertAlerta = () => {
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
        if (target <= now) target.setDate(target.getDate() + 1);
        setTimeout(() => { _runCertAlerta(); scheduleCertAlerta(); }, target.getTime() - now.getTime());
    };
    scheduleCertAlerta();
}

module.exports = { startSchedulers };
