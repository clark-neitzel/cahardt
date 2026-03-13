const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const syncPedidosService = {
    // Flag to prevent overlapping executions if the sync takes longer than the interval
    isRunning: false,

    _resolverNaturezaOperacao: async (cliente) => {
        const normalizeUuid = (value) => {
            if (!value) return null;
            if (typeof value === 'string') {
                const trimmed = value.trim();
                return trimmed || null;
            }
            if (typeof value === 'object') {
                const candidate = value.id || value.uuid || value.value || value.naturezaOperacaoId;
                if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
            }
            return null;
        };

        const resolveConfigValue = async (keys) => {
            const envHit = keys.map((key) => normalizeUuid(process.env[key])).find(Boolean);
            if (envHit) return envHit;

            const rows = await prisma.appConfig.findMany({
                where: { key: { in: keys } },
                select: { key: true, value: true }
            });

            for (const key of keys) {
                const row = rows.find((item) => item.key === key);
                const parsed = normalizeUuid(row?.value);
                if (parsed) return parsed;
            }
            return null;
        };

        const naturezaCnpj = await resolveConfigValue([
            'CA_NATUREZA_OPERACAO_CNPJ',
            'ca_natureza_operacao_cnpj',
            'natureza_operacao_cnpj'
        ]) || '915a96fe-d5ca-11f0-8ea0-e7ffa7159b62';
        const naturezaCpf = await resolveConfigValue([
            'CA_NATUREZA_OPERACAO_CPF',
            'ca_natureza_operacao_cpf',
            'natureza_operacao_cpf'
        ]) || '915b1e44-d5ca-11f0-8ea0-1fd3a2d60f8b';

        const tipoPessoa = String(cliente?.Tipo_Pessoa || '').toUpperCase();
        const documentoNumerico = String(cliente?.Documento || '').replace(/\D/g, '');

        const ehCnpj = tipoPessoa.includes('JUR') || documentoNumerico.length === 14;
        const ehCpf = tipoPessoa.includes('FIS') || documentoNumerico.length === 11;

        if (ehCnpj) return naturezaCnpj;
        if (ehCpf) return naturezaCpf;
        return null;
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
                    especial: false // Pedidos especiais não são enviados ao CA
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

            const qtdParcelas = Math.max(1, Number(pedido.qtdParcelas) || 1);

            // Interpreta opções como "7, 14" (ou com separadores comuns) para usar vencimentos reais por parcela.
            const parseDayOffsets = (opcao) => {
                if (!opcao || typeof opcao !== 'string') return [];
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
                            'PIX': ['PIX'],
                            'BOLETO_BANCARIO': ['BOLETO_BANCARIO', 'A_PRAZO'],
                            'CARTAO': ['CARTAO'],
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
                    tipo_pagamento: pedido.tipoPagamento || "A_PRAZO",
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
            const naturezaOperacaoId = await syncPedidosService._resolverNaturezaOperacao(pedido.cliente);

            if (naturezaOperacaoId) {
                try {
                    await contaAzulService.atualizarPedido(resultadoCA.id, {
                        id_natureza_operacao: naturezaOperacaoId
                    });
                    console.log(`[Pedido ${pedido.id}] Natureza de operação aplicada no CA.`);
                } catch (updateError) {
                    console.warn(`[Pedido ${pedido.id}] Falha ao aplicar natureza de operação: ${updateError.message}`);
                }
            } else {
                const tipoPessoaDebug = pedido?.cliente?.Tipo_Pessoa || 'N/D';
                const docDebug = pedido?.cliente?.Documento || 'N/D';
                console.warn(`[Pedido ${pedido.id}] Natureza de operação não configurada para o tipo de cliente. Tipo: ${tipoPessoaDebug}, Documento: ${docDebug}`);
            }

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
