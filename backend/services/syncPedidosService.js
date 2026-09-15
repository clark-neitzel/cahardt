const prisma = require('../config/database');
const estoqueService = require('./estoqueService');
const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');

const syncPedidosService = {
    // Flag to prevent overlapping executions if the sync takes longer than the interval
    isRunning: false,

    processarFila: async () => {
        if (syncPedidosService.isRunning) {
            console.log('⏳ Worker de Pedidos já está rodando. Ignorando este ciclo.');
            return;
        }

        syncPedidosService.isRunning = true;

        try {
            // Pick up to 5 orders to process in this cycle to avoid holding the script too long
            const pedidosPendentes = await prisma.pedido.findMany({
                where: {
                    statusEnvio: {
                        in: ['ENVIAR', 'SINCRONIZANDO']
                    },
                    especial: false, // Pedidos especiais não são enviados ao CA
                    bonificacao: false, // Pedidos bonificação não são enviados ao CA
                    cancelado: false // Pedido cancelado não é faturado
                },
                include: {
                    cliente: true,
                    vendedor: true,
                    itens: {
                        include: {
                            produto: true
                        }
                    }
                },
                take: 5,
                orderBy: {
                    // Try SINCRONIZANDO first in case they got stuck
                    statusEnvio: 'desc'
                }
            });

            if (pedidosPendentes.length === 0) {
                // Keep-alive or simply silent
                syncPedidosService.isRunning = false;
                return;
            }

            console.log(`🚀 Iniciando Sync de Pedidos: ${pedidosPendentes.length} pendentes.`);

            for (const pedido of pedidosPendentes) {
                const statusAntes = pedido.statusEnvio;
                await syncPedidosService.enviarPedidoContaAzul(pedido);
                // Verificar se o pedido foi faturado com sucesso (statusEnvio virou RECEBIDO no banco)
                const pedidoAtualizado = await prisma.pedido.findUnique({ where: { id: pedido.id }, select: { statusEnvio: true } });
                if (pedidoAtualizado?.statusEnvio === 'RECEBIDO' && statusAntes !== 'RECEBIDO') {
                    // Deduz do estoqueTotal agora que o pedido foi confirmado
                    estoqueService.faturarPedido(pedido.id).catch(err =>
                        console.error(`[Estoque] Falha ao faturar estoque do pedido ${pedido.id}:`, err.message)
                    );
                }
                // Pausa entre pedidos (mantida do tempo do envio ao CA; inofensiva agora).
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

        } catch (error) {
            console.error('❌ Erro crítico no worker de pedidos:', error);
        } finally {
            syncPedidosService.isRunning = false;
        }
    },

    /**
     * Próximo número de venda gerado PELO APP (continua a sequência que veio do CA).
     * Usado desde que o CA virou somente leitura — o app é o dono da numeração.
     */
    obterProximoNumeroLocal: async () => {
        const agg = await prisma.pedido.aggregate({ _max: { numero: true } });
        return (agg._max.numero || 0) + 1;
    },

    enviarPedidoContaAzul: async (pedido) => {
        console.log(`[Pedido ${pedido.id}] Preparando envio...`);

        // CA somente leitura: "faturar" é local — reserva o número da venda no app e
        // marca RECEBIDO (o worker que chamou dispara a baixa de estoque ao ver RECEBIDO).
        // A conta a receber local já foi criada na finalização do pedido; a NF-e sai
        // pelo app (Focus NFe). Nada é enviado ao Conta Azul.
        if (CA_SOMENTE_LEITURA) {
            try {
                let numeroVenda = pedido.numero;
                if (!numeroVenda) {
                    numeroVenda = await syncPedidosService.obterProximoNumeroLocal();
                    await prisma.pedido.update({
                        where: { id: pedido.id },
                        data: { numero: numeroVenda }
                    });
                }
                await prisma.pedido.update({
                    where: { id: pedido.id },
                    data: { statusEnvio: 'RECEBIDO', erroEnvio: null }
                });
                console.log(`[Pedido ${pedido.id}] Faturado LOCALMENTE (venda nº ${numeroVenda}) — CA somente leitura.`);
            } catch (error) {
                console.error(`[Pedido ${pedido.id}] Erro no faturamento local:`, error.message);
                await prisma.pedido.update({
                    where: { id: pedido.id },
                    data: { statusEnvio: 'ERRO', erroEnvio: error.message || 'Erro no faturamento local' }
                });
            }
            return;
        }
    }
};

module.exports = syncPedidosService;
