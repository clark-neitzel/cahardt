// =====================================================================
// Conversão de pedido ESPECIAL → pedido normal (com NF).
// Regra do dono (07/2026): PIX é pagamento rastreado — ao receber qualquer
// valor via PIX Asaas num pedido especial, ele vira pedido normal:
//   - ganha número novo na sequência oficial (Conta Azul)
//   - statusEnvio ENVIAR (o worker cria a venda no CA em ~30s)
//   - mantém datas, itens, valores e vendedor
//   - gera aviso persistente p/ o popup do faturamento (a cada 5 min)
// Desde 07/2026 também existe a conversão MANUAL (botão na aba Especiais,
// permissão Pode_Aprovar_Especial): mesma mecânica, para qualquer forma de
// recebimento (dinheiro, boleto, PIX) ou ainda em aberto — caso do cliente
// que exige a NF. É o MESMO registro que muda de aba: nada duplica, e
// entrega/carga/pagamentos/devoluções continuam no pedido.
// =====================================================================
const prisma = require('../config/database');

// Núcleo compartilhado: executa a conversão de um pedido especial já carregado.
// Retorna { numeroAntigo, numeroNovo }. LANÇA erro se algo falhar (quem chama decide tratar).
async function executarConversao(pedido, { valorPago = null, criadoPorId = null, comoConverteu = 'PIX recebido' } = {}) {
    const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
    const numeroAntigo = pedido.numero;
    const numeroNovo = CA_SOMENTE_LEITURA
        ? await require('./syncPedidosService').obterProximoNumeroLocal()
        : await require('./contaAzulService').obterProximoNumeroPedido();

    await prisma.$transaction(async (tx) => {
        await tx.pedido.update({
            where: { id: pedido.id },
            data: {
                especial: false,
                numero: numeroNovo,
                statusEnvio: 'ENVIAR', // worker fatura (local desde 23/07; NF-e sai pelo app)
                erroEnvio: null
            }
        });
        // Conta a receber acompanha: muda a origem; se não existir (especial antigo
        // criado em aberto), cria agora para o financeiro não ficar sem a conta.
        const contaExistente = await tx.contaReceber.findUnique({ where: { pedidoId: pedido.id } });
        if (contaExistente) {
            await tx.contaReceber.update({
                where: { pedidoId: pedido.id },
                data: { origem: 'FATURADO_CA' }
            });
        } else {
            const itens = pedido.itens || [];
            const valorTotal = itens.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0);
            if (valorTotal > 0) {
                const { gerarParcelasData } = require('./pedidoCalculos');
                const parcelasData = gerarParcelasData({
                    valorTotal,
                    qtdParcelas: pedido.qtdParcelas,
                    intervaloDias: pedido.intervaloDias,
                    primeiroVencimento: pedido.primeiroVencimento,
                    dataVenda: pedido.dataVenda
                });
                await tx.contaReceber.create({
                    data: {
                        pedidoId: pedido.id,
                        clienteId: pedido.clienteId,
                        origem: 'FATURADO_CA',
                        valorTotal: Math.round(valorTotal * 100) / 100,
                        status: 'ABERTO',
                        parcelas: { create: parcelasData }
                    }
                });
            }
        }
        await tx.pedidoConvertidoAviso.create({
            data: {
                pedidoId: pedido.id,
                numeroAntigo,
                numeroNovo,
                valorPago
            }
        });
    }, { timeout: 20000, maxWait: 10000 });

    // Log de histórico fora da transação (não pode derrubar a conversão)
    try {
        await prisma.atendimento.create({
            data: {
                tipo: 'FINANCEIRO',
                observacao: `Pedido especial ZZ#${numeroAntigo ?? '?'} foi CONVERTIDO no pedido #${numeroNovo} (${comoConverteu}; segue p/ faturamento e emissão da NF-e pelo app).`,
                clienteId: pedido.clienteId,
                idVendedor: criadoPorId || pedido.vendedorId || null,
                pedidoId: pedido.id
            }
        });
    } catch (logErr) {
        console.error('[Conversão] Falha no log (conversão já efetivada):', logErr.message);
    }

    console.log(`🔁 [Conversão] Especial ZZ#${numeroAntigo} → pedido #${numeroNovo} (${comoConverteu}).`);
    return { numeroAntigo, numeroNovo };
}

const pedidoConversaoService = {
    /**
     * Converte o pedido da cobrança se (e só se) ele for especial.
     * Idempotente: pedido já convertido não converte de novo.
     * Nunca lança — erro é logado e devolvido (o recebimento do PIX não pode falhar por isso).
     */
    converterSeEspecial: async (cobranca) => {
        try {
            if (!cobranca?.pedidoId) return { convertido: false };

            const pedido = await prisma.pedido.findUnique({
                where: { id: cobranca.pedidoId },
                include: {
                    cliente: { select: { Nome: true, NomeFantasia: true } },
                    itens: { select: { valor: true, quantidade: true } }
                }
            });
            if (!pedido || !pedido.especial) return { convertido: false };

            const { numeroAntigo, numeroNovo } = await executarConversao(pedido, {
                valorPago: cobranca.valorRecebido ?? cobranca.valor ?? null,
                criadoPorId: cobranca.criadoPorId || null,
                comoConverteu: 'recebeu PIX'
            });
            return { convertido: true, numeroAntigo, numeroNovo };
        } catch (e) {
            console.error('[Conversão] Erro ao converter pedido especial:', e.message);
            return { convertido: false, erro: e.message };
        }
    },

    /**
     * Conversão MANUAL (botão da aba Especiais). Valida e LANÇA erro com mensagem
     * amigável — o controller devolve ao usuário. Qualquer forma de recebimento:
     * o que já foi recebido (PIX, dinheiro, boleto) fica no próprio pedido.
     */
    converterManual: async (pedidoId, usuarioId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                cliente: { select: { Nome: true, NomeFantasia: true } },
                itens: { select: { valor: true, quantidade: true } },
                contaReceber: { include: { parcelas: { select: { valorPago: true, status: true } } } },
                cobrancasAsaas: { where: { status: 'RECEBIDO' }, select: { valorRecebido: true, valor: true } }
            }
        });
        if (!pedido) throw new Error('Pedido não encontrado.');
        if (!pedido.especial) throw new Error('Este pedido não é especial (talvez já tenha sido convertido).');
        if (pedido.bonificacao) throw new Error('Pedido de bonificação não pode ser convertido.');

        // Total já recebido, em QUALQUER forma: PIX Asaas + baixas de parcela (dinheiro/boleto/etc.)
        const recebidoAsaas = pedido.cobrancasAsaas.reduce((s, c) => s + Number(c.valorRecebido ?? c.valor ?? 0), 0);
        const recebidoParcelas = (pedido.contaReceber?.parcelas || [])
            .reduce((s, p) => s + Number(p.valorPago || 0), 0);
        const valorPago = Math.max(recebidoAsaas, recebidoParcelas) || null;

        const { numeroAntigo, numeroNovo } = await executarConversao(pedido, {
            valorPago,
            criadoPorId: usuarioId,
            comoConverteu: 'conversão manual'
        });
        return { convertido: true, numeroAntigo, numeroNovo };
    }
};

module.exports = pedidoConversaoService;
