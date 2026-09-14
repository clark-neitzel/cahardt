// Serviço isolado para "Repetir último pedido": devolve o ÚLTIMO PEDIDO do cliente
// (o pedido inteiro, com os itens exatos), para a tela Novo Pedido repetir de verdade.
//
// Difere de `pedidoService.historicoComprasCliente` (que devolve a compra mais recente
// de CADA produto já comprado, útil para "última vez que comprou X" mas não representa
// um pedido real). NÃO alterar aquele service — ele é consumido por outras partes da tela.
//
// Regra de "último pedido":
//  - Mais recente por createdAt desc (pedido FEITO por último — mesma regra do histórico).
//  - Exclui statusEnvio = 'EXCLUIDO', pedidos cancelados (campo `cancelado = true`) e
//    bonificação (`bonificacao = true`, não é venda).
//  - Pedido especial CONTA (é venda, só não emite nota).

const prisma = require('../config/database');

const pedidoRepetirService = {
    // Busca o último pedido "de verdade" do cliente, com itens e nome atual do produto.
    ultimoPedido: async (clienteId) => {
        const pedido = await prisma.pedido.findFirst({
            where: {
                clienteId,
                statusEnvio: { not: 'EXCLUIDO' },
                cancelado: false,
                bonificacao: false
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                numero: true,
                dataVenda: true,
                createdAt: true,
                especial: true,
                opcaoCondicaoPagamento: true,
                nomeCondicaoPagamento: true,
                tipoPagamento: true,
                valorFrete: true,
                itens: {
                    select: {
                        produtoId: true,
                        quantidade: true,
                        valor: true,
                        valorBase: true,
                        emPromocao: true,
                        promocaoId: true,
                        produto: { select: { nome: true } }
                    }
                }
            }
        });

        if (!pedido) return null;

        return {
            id: pedido.id,
            numero: pedido.numero,
            dataVenda: pedido.dataVenda,
            createdAt: pedido.createdAt,
            especial: pedido.especial,
            // Não existe um campo de ID de condição de pagamento no Pedido (schema.prisma) —
            // a condição é gravada como par (tipoPagamento + opcaoCondicaoPagamento) + o nome
            // completo no momento da criação. Devolvemos os três para o front reencontrar a
            // condição atual (mesma lógica de NovoPedido.jsx ~linha 322: find por
            // tipoPagamento+opcaoCondicaoPagamento, com fallback por nomeCondicaoPagamento).
            condicaoPagamentoId: null,
            opcaoCondicaoPagamento: pedido.opcaoCondicaoPagamento,
            nomeCondicaoPagamento: pedido.nomeCondicaoPagamento,
            tipoPagamento: pedido.tipoPagamento,
            valorFrete: pedido.valorFrete != null ? Number(pedido.valorFrete) : 0,
            itens: pedido.itens.map(item => ({
                produtoId: item.produtoId,
                nome: item.produto ? item.produto.nome : null,
                quantidade: Number(item.quantidade),
                valor: Number(item.valor),
                valorBase: Number(item.valorBase),
                emPromocao: item.emPromocao,
                promocaoId: item.promocaoId
            }))
        };
    }
};

module.exports = pedidoRepetirService;
