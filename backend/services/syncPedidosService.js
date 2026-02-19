const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

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
                    }
                },
                include: {
                    cliente: true,
                    vendedor: true,
                    itens: {
                        include: {
                            produto: true
                        }
                    },
                    condicaoPag: true
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
                await syncPedidosService.enviarPedidoContaAzul(pedido);
                // Pause slightly to respect API rate limits (10 req/s on CA)
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

        } catch (error) {
            console.error('❌ Erro crítico no worker de pedidos:', error);
        } finally {
            syncPedidosService.isRunning = false;
        }
    },

    enviarPedidoContaAzul: async (pedido) => {
        console.log(`[Pedido ${pedido.id}] Preparando envio...`);

        try {
            // Marca como SINCRONIZANDO se ainda for ENVIAR
            if (pedido.statusEnvio === 'ENVIAR') {
                await prisma.pedido.update({
                    where: { id: pedido.id },
                    data: { statusEnvio: 'SINCRONIZANDO' }
                });
            }

            // Mapeando dados para o Payload
            let numeroVenda = pedido.numero;

            // 1. Resolve Número da Venda (Idempotência Base)
            if (!numeroVenda) {
                numeroVenda = await contaAzulService.obterProximoNumeroPedido();
                console.log(`[Pedido ${pedido.id}] Próximo número reservado: ${numeroVenda}`);
                await prisma.pedido.update({
                    where: { id: pedido.id },
                    data: { numero: numeroVenda }
                });
                pedido.numero = numeroVenda;
            } else {
                // Checa se já existe no CA com este número
                const vendaExistente = await contaAzulService.buscarPedidoPorNumero(numeroVenda);
                if (vendaExistente && vendaExistente.id) {
                    console.log(`[Pedido ${pedido.id}] Venda ${numeroVenda} já existia no CA. Marcando como Recebido.`);
                    await prisma.pedido.update({
                        where: { id: pedido.id },
                        data: {
                            idVendaContaAzul: vendaExistente.id,
                            statusEnvio: 'RECEBIDO',
                            erroEnvio: null
                        }
                    });
                    return;
                }
            }

            // 2. Construir Payload
            const totalPedido = pedido.itens.reduce((acc, current) => {
                return acc + (Number(current.quantidade) * Number(current.valor));
            }, 0);

            // Fetch seller for linking, checking if it exists in CA first
            let vendedorIdCA = null;
            if (pedido.vendedor && pedido.vendedor.id) {
                vendedorIdCA = pedido.vendedor.id; // Usually the internal ID is the ContaAzul ID for Vendedores
                // Could double-check if it's a valid uuid form here if necessary
            }

            // Fallback to simple date parsing using the required CA date format (YYYY-MM-DD)
            const d = new Date(pedido.dataVenda);
            const dataVendaStr = d.toISOString().split('T')[0];

            const condPag = pedido.condicaoPag || {};
            const acrescimoDecimal = Number(condPag.acrescimoPreco || 0);

            // Calculate if there's any addition to create standard descriptions or calculate final installment
            const installmentValue = Number((totalPedido / (Number(pedido.qtdParcelas) || 1)).toFixed(2));

            // Data de vencimento baseada no intervalo
            const dataVenc = new Date(d);
            dataVenc.setDate(dataVenc.getDate() + (pedido.intervaloDias || 0));
            const dataVencStr = dataVenc.toISOString().split('T')[0];

            let contaFinId = pedido.idContaFinanceira || undefined;
            if (!contaFinId && condPag.bancoId) contaFinId = condPag.bancoId; // Use standard bank from Condition

            const payload = {
                id_cliente: pedido.cliente.contaAzulId || pedido.cliente.UUID,
                numero: numeroVenda,
                situacao: "APROVADO", // Envia aprovado pra já reservar estoque
                data_venda: dataVendaStr,
                observacoes: pedido.observacoes ? `${pedido.observacoes}\n(Gerado via App Mobile Hardt - GPS: ${pedido.latLng || 'N/D'})` : `(Gerado via App Mobile Hardt) - GPS: ${pedido.latLng || 'N/D'}`,
                itens: pedido.itens.map(item => ({
                    id: item.produto.contaAzulId, // id real do produto no CA
                    descricao: item.descricao || item.produto.nome,
                    quantidade: Number(item.quantidade),
                    valor: Number(item.valor),
                    tipo: "PRODUTO"
                })),
                condicao_pagamento: {
                    tipo_pagamento: pedido.tipoPagamento || condPag.tipoPagamento || "A_PRAZO",
                    id_conta_financeira: contaFinId,
                    opcao_condicao_pagamento: pedido.opcaoCondicaoPagamento || condPag.opcaoCondicao || "Personalizado",
                    pagamento_a_vista: false, // Pode ser dinâmico em futuras issues
                    parcelas: []
                }
            };

            // Adiciona Id de Vendedor se for um UUID valido (O CA rejeita se for null ou string aleatoria)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (vendedorIdCA && uuidRegex.test(vendedorIdCA)) {
                payload.id_vendedor = vendedorIdCA;
            }

            // Criações das parcelas. Como default vamos mandar 1 parcela pro total.
            // Se o CA pedir multiplas poderemos iterar aqui no futuro:
            for (let i = 1; i <= (Number(pedido.qtdParcelas) || 1); i++) {
                payload.condicao_pagamento.parcelas.push({
                    data_vencimento: dataVencStr, // Simplificação - Todos no mesmo dia da regra pra v1
                    valor: installmentValue,
                    descricao: `Parcela ${i}/${pedido.qtdParcelas || 1}`
                });
            }

            console.log(`[Pedido ${pedido.id}] Payload construído, enviando via POST...`);

            // 3. Submeter via ContaAzul Service
            const resultadoCA = await contaAzulService.enviarPedido(payload);

            console.log(`[Pedido ${pedido.id}] Sucesso ContaAzul ID: ${resultadoCA.id}`);

            // 4. Salvar Sucesso
            await prisma.pedido.update({
                where: { id: pedido.id },
                data: {
                    idVendaContaAzul: resultadoCA.id,
                    statusEnvio: 'RECEBIDO',
                    erroEnvio: null
                }
            });

        } catch (error) {
            console.error(`[Pedido ${pedido.id}] Erro no envio:`, error.message);
            // Salvar erro para tentar depois e mudar pra ERRO (ou deixar SINCRONIZANDO p/ retries dependendo da sua estratégia).
            // Vamos mudar pra ERRO pra não travar a fila com re-tentativas infinitas de payloads quebrados.
            await prisma.pedido.update({
                where: { id: pedido.id },
                data: {
                    statusEnvio: 'ERRO',
                    erroEnvio: error.message || 'Erro desconhecido ao comunicar com CA'
                }
            });
        }
    }
};

module.exports = syncPedidosService;
