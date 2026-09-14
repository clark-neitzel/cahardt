import api from './api';

// Serviço isolado para "Repetir último pedido" (NovoPedido.jsx): busca o ÚLTIMO PEDIDO de
// verdade do cliente (o pedido inteiro, com os itens exatos) — não confundir com
// `pedidoService.historicoComprasCliente`, que devolve a compra mais recente de CADA produto
// já comprado (útil pra "última vez que comprou X", mas não representa um pedido real).
const repetirPedidoService = {
    // Devolve { pedido: null } quando o cliente não tem pedido válido, ou { pedido: {...} }
    // com id, numero, dataVenda, createdAt, especial, condicaoPagamentoId (sempre null —
    // reencontrar a condição por nomeCondicaoPagamento/tipoPagamento+opcaoCondicaoPagamento),
    // opcaoCondicaoPagamento, nomeCondicaoPagamento, tipoPagamento, valorFrete, itens[].
    obterUltimoPedido: async (clienteId) => {
        const response = await api.get('/pedidos/ultimo-pedido', { params: { clienteId } });
        return response.data;
    }
};

export default repetirPedidoService;
