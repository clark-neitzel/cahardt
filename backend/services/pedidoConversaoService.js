// =====================================================================
// Conversão de pedido ESPECIAL → pedido normal (com NF).
// Regra do dono (07/2026): PIX é pagamento rastreado — ao receber qualquer
// valor via PIX Asaas num pedido especial, ele vira pedido normal:
//   - ganha número novo na sequência oficial (Conta Azul)
//   - statusEnvio ENVIAR (o worker cria a venda no CA em ~30s)
//   - mantém datas, itens, valores e vendedor
//   - gera aviso persistente p/ o popup do faturamento (a cada 5 min)
// =====================================================================
const prisma = require('../config/database');

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
                include: { cliente: { select: { Nome: true, NomeFantasia: true } } }
            });
            if (!pedido || !pedido.especial) return { convertido: false };

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
                await tx.contaReceber.updateMany({
                    where: { pedidoId: pedido.id },
                    data: { origem: 'FATURADO_CA' }
                });
                await tx.pedidoConvertidoAviso.create({
                    data: {
                        pedidoId: pedido.id,
                        numeroAntigo,
                        numeroNovo,
                        valorPago: cobranca.valorRecebido ?? cobranca.valor ?? null
                    }
                });
            }, { timeout: 20000, maxWait: 10000 });

            // Log de histórico fora da transação (não pode derrubar a conversão)
            try {
                await prisma.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO',
                        observacao: `Pedido especial ZZ#${numeroAntigo ?? '?'} recebeu PIX e foi CONVERTIDO no pedido #${numeroNovo} (segue p/ faturamento e emissão da NF-e pelo app).`,
                        clienteId: pedido.clienteId,
                        idVendedor: cobranca.criadoPorId || pedido.vendedorId || null,
                        pedidoId: pedido.id
                    }
                });
            } catch (logErr) {
                console.error('[Conversão] Falha no log (conversão já efetivada):', logErr.message);
            }

            console.log(`🔁 [Conversão] Especial ZZ#${numeroAntigo} → pedido #${numeroNovo} (PIX recebido).`);
            return { convertido: true, numeroAntigo, numeroNovo };
        } catch (e) {
            console.error('[Conversão] Erro ao converter pedido especial:', e.message);
            return { convertido: false, erro: e.message };
        }
    }
};

module.exports = pedidoConversaoService;
