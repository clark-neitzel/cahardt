const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const syncPedidosService = {
    // Flag to prevent overlapping executions if the sync takes longer than the interval
    isRunning: false,
    // Flag para evitar múltiplos timers de syncProdutos em ciclos consecutivos
    _syncProdutosAgendado: false,

    _resolverIndicadorIE: (cliente) => {
        const tipoPessoa = String(cliente?.Tipo_Pessoa || '').toUpperCase();
        const documentoNumerico = String(cliente?.Documento || '').replace(/\D/g, '');
        const ehCnpj = tipoPessoa.includes('JUR') || documentoNumerico.length === 14;
        return ehCnpj ? 'CONTRIBUINTE' : 'NAO_CONTRIBUINTE';
    },

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
                    bonificacao: false // Pedidos bonificação não são enviados ao CA
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

            let pedidosEnviados = 0;
            for (const pedido of pedidosPendentes) {
                const statusAntes = pedido.statusEnvio;
                await syncPedidosService.enviarPedidoContaAzul(pedido);
                // Verificar se o pedido foi enviado com sucesso (statusEnvio virou RECEBIDO no banco)
                const pedidoAtualizado = await prisma.pedido.findUnique({ where: { id: pedido.id }, select: { statusEnvio: true } });
                if (pedidoAtualizado?.statusEnvio === 'RECEBIDO' && statusAntes !== 'RECEBIDO') {
                    pedidosEnviados++;
                }
                // Pause slightly to respect API rate limits (10 req/s on CA)
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // Se houve envio com sucesso, agendar syncProdutos em 60s (estoque mudou)
            if (pedidosEnviados > 0 && !syncPedidosService._syncProdutosAgendado) {
                syncPedidosService._syncProdutosAgendado = true;
                console.log(`📦 [Worker] ${pedidosEnviados} pedido(s) enviado(s) → syncProdutos agendado para 60s (estoque atualizado).`);
                setTimeout(async () => {
                    try {
                        console.log('📦 [Worker] Executando syncProdutos pós-pedido...');
                        await contaAzulService.syncProdutos();
                        console.log('✅ [Worker] syncProdutos pós-pedido concluído.');
                    } catch (e) {
                        console.error('⚠️ [Worker] Erro no syncProdutos pós-pedido:', e.message);
                    } finally {
                        syncPedidosService._syncProdutosAgendado = false;
                    }
                }, 60000); // 60 segundos após o envio
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

            // Antes da venda, tenta manter o indicador de IE coerente no cliente CA
            try {
                const indicadorIE = syncPedidosService._resolverIndicadorIE(pedido.cliente);
                await contaAzulService.atualizarIndicadorIECliente(
                    pedido.cliente.contaAzulId || pedido.cliente.UUID,
                    {
                        inscricoes: [
                            {
                                indicador_inscricao_estadual: indicadorIE
                            }
                        ]
                    }
                );
                console.log(`[Pedido ${pedido.id}] Indicador de IE do cliente atualizado no CA: ${indicadorIE}.`);
            } catch (ieError) {
                console.warn(`[Pedido ${pedido.id}] Falha ao ajustar IE do cliente no CA: ${ieError.message}`);
            }

            // Fetch seller for linking, checking if it exists in CA first
            let vendedorIdCA = null;
            if (pedido.vendedor && pedido.vendedor.id) {
                vendedorIdCA = pedido.vendedor.id; // Usually the internal ID is the ContaAzul ID for Vendedores
                // Could double-check if it's a valid uuid form here if necessary
            }

            // Fallback to simple date parsing using the required CA date format (YYYY-MM-DD)
            const d = new Date(pedido.dataVenda);
            const dataVendaStr = d.toISOString().split('T')[0];

            const qtdParcelas = Math.max(1, Number(pedido.qtdParcelas) || 1);

            // Interpreta opções como "7/14/21" ou "7,14,21" (offsets explícitos por parcela).
            // Só usa se a opção contiver múltiplos números separados — ignora "1x", "2x", "À vista" etc.
            const parseDayOffsets = (opcao) => {
                if (!opcao || typeof opcao !== 'string') return [];
                // Exige pelo menos um separador (, / ; espaço) entre números para ser considerado lista de offsets
                if (!/\d[\s,/;]+\d/.test(opcao)) return [];
                const offsets = (opcao.match(/\d+/g) || [])
                    .map(Number)
                    .filter((n) => Number.isFinite(n) && n >= 0);
                return offsets;
            };

            const offsetsFromOption = parseDayOffsets(pedido.opcaoCondicaoPagamento);
            const intervaloDias = Number(pedido.intervaloDias) || 0;
            const dueDayOffsets = offsetsFromOption.length === qtdParcelas
                ? offsetsFromOption
                : Array.from({ length: qtdParcelas }, (_, index) => Math.max(0, intervaloDias) * (index + 1));

            // Divide o total em centavos para evitar drift de ponto flutuante.
            const totalCentavos = Math.round(Number(totalPedido.toFixed(2)) * 100);
            const baseParcelaCentavos = Math.floor(totalCentavos / qtdParcelas);
            const remainderCentavos = totalCentavos - (baseParcelaCentavos * qtdParcelas);

            let contaFinId = pedido.idContaFinanceira || undefined;

            // Validar compatibilidade entre conta financeira e tipo de pagamento
            // O CA rejeita combinações inválidas (ex: BOLETO_BANCARIO + conta de DINHEIRO)
            if (contaFinId && pedido.tipoPagamento) {
                try {
                    const contaFin = await prisma.contaFinanceira.findUnique({ where: { id: contaFinId } });
                    if (contaFin) {
                        // Mapa de compatibilidade: tipoUso da conta → tipos de pagamento aceitos
                        const compatMap = {
                            'DINHEIRO': ['DINHEIRO'],
                            'PIX': ['PIX', 'PIX_PAGAMENTO_INSTANTANEO'],
                            'BOLETO_BANCARIO': ['BOLETO_BANCARIO', 'A_PRAZO'],
                            'CARTAO': ['CARTAO', 'CARTAO_CREDITO', 'CARTAO_DEBITO'],
                        };
                        const tiposAceitos = compatMap[contaFin.tipoUso] || [];
                        if (tiposAceitos.length > 0 && !tiposAceitos.includes(pedido.tipoPagamento)) {
                            console.warn(`[Pedido ${pedido.id}] ⚠️ Conta "${contaFin.nomeBanco}" (${contaFin.tipoUso}) incompatível com tipoPagamento "${pedido.tipoPagamento}". Omitindo id_conta_financeira do payload.`);
                            contaFinId = undefined;
                        }
                    }
                } catch (contaErr) {
                    console.warn(`[Pedido ${pedido.id}] Erro ao validar conta financeira: ${contaErr.message}`);
                }
            }


            // Montar linha de promoções nos produtos do pedido
            const itensEmPromocao = pedido.itens.filter(item => item.emPromocao && item.nomePromocao);
            const linhaPromo = itensEmPromocao.length > 0
                ? `PROMO - ${itensEmPromocao.map(item => item.produto?.nome || '').filter(Boolean).join('; ')}`
                : null;
            const observacoesFinal = [pedido.observacoes, linhaPromo].filter(Boolean).join('\n') || undefined;

            // Mapear tipos de pagamento internos para os valores aceitos pela API do CA
            const tipoPagamentoMap = {
                'PIX': 'PIX_PAGAMENTO_INSTANTANEO',
                'CARTAO': 'CARTAO_CREDITO',
            };
            const tipoPagamentoCA = tipoPagamentoMap[pedido.tipoPagamento] || pedido.tipoPagamento || "A_PRAZO";

            const payload = {
                id_cliente: pedido.cliente.contaAzulId || pedido.cliente.UUID,
                numero: numeroVenda,
                situacao: "APROVADO",
                data_venda: dataVendaStr,
                id_categoria: pedido.idCategoria || "b2771a7a-2120-4af5-affb-8e6fac7e48af",
                observacoes: observacoesFinal,
                itens: pedido.itens.map(item => ({
                    id: item.produto.contaAzulId, // id real do produto no CA
                    descricao: item.descricao || item.produto.nome,
                    quantidade: Number(item.quantidade),
                    valor: Number(item.valor),
                    tipo: "PRODUTO"
                })),
                condicao_pagamento: {
                    tipo_pagamento: tipoPagamentoCA,
                    id_conta_financeira: contaFinId,
                    opcao_condicao_pagamento: pedido.opcaoCondicaoPagamento || "Personalizado",
                    pagamento_a_vista: false, // Pode ser dinâmico em futuras issues
                    parcelas: []
                }
            };

            // Adiciona Id de Vendedor se for um UUID valido (O CA rejeita se for null ou string aleatoria)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (vendedorIdCA && uuidRegex.test(vendedorIdCA)) {
                payload.id_vendedor = vendedorIdCA;
            }

            for (let i = 1; i <= qtdParcelas; i++) {
                const parcelaCentavos = baseParcelaCentavos + (i === qtdParcelas ? remainderCentavos : 0);
                const dataVenc = new Date(d);
                dataVenc.setDate(dataVenc.getDate() + dueDayOffsets[i - 1]);

                payload.condicao_pagamento.parcelas.push({
                    data_vencimento: dataVenc.toISOString().split('T')[0],
                    valor: Number((parcelaCentavos / 100).toFixed(2)),
                    descricao: `Parcela ${i}/${qtdParcelas}`
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
                    erroEnvio: error.message || 'Erro desconhecido ao comunicar com CA',
                    numero: null // Limpa o número para buscar um novo na próxima tentativa
                }
            });
        }
    }
};

module.exports = syncPedidosService;
