import api from './api';

// Integração Asaas — PIX na entrega (QR Code)
const asaasService = {
    // Integração configurada no servidor? (front esconde o botão se não)
    status: async () => {
        const response = await api.get('/asaas/status');
        return response.data;
    },
    // Configuração da integração (validade padrão do PIX, multa/juros...).
    // completo=true inclui o status da conta/webhook (só a tela de Configurações usa).
    config: async (completo = false) => {
        const response = await api.get('/asaas/config', { params: completo ? { completo: '1' } : {} });
        return response.data;
    },
    // Gera (ou reaproveita) um QR Code PIX para o pedido.
    // validadeDias: até quando o QR/link vale. vincularParcela: baixa automática ao pagar (financeiro).
    criarPix: async ({ pedidoId, valor, descricao, validadeDias, vincularParcela }) => {
        const response = await api.post('/asaas/pix', { pedidoId, valor, descricao, validadeDias, vincularParcela });
        return response.data;
    },
    // Envia o link/código PIX ao cliente via BotConversa
    enviarPixWhatsapp: async (cobrancaId) => {
        const response = await api.post(`/asaas/pix/${cobrancaId}/whatsapp`);
        return response.data;
    },
    // Poll de status — o backend confere direto no Asaas se ainda estiver pendente
    consultar: async (cobrancaId) => {
        const response = await api.get(`/asaas/cobrancas/${cobrancaId}`);
        return response.data;
    },
    // Cancela um PIX pendente (desistiu / valor errado)
    cancelar: async (cobrancaId) => {
        const response = await api.delete(`/asaas/cobrancas/${cobrancaId}`);
        return response.data;
    },

    // ── Boletos (Contas a Receber) ──
    boletosDaConta: async (contaReceberId) => {
        const response = await api.get(`/asaas/contas/${contaReceberId}/boletos`);
        return response.data;
    },
    boletosDoPedido: async (pedidoId) => {
        const response = await api.get(`/asaas/pedidos/${pedidoId}/boletos`);
        return response.data;
    },
    // Emite boletos por conta, por parcelas OU por pedidos em lote (janela de impressão).
    // ATENÇÃO: repassar os três — o backend decide qual usar (pedidoIds era descartado
    // aqui e o lote inteiro falhava com "nenhuma parcela em aberto").
    emitirBoletos: async ({ contaReceberId, parcelaIds, pedidoIds }) => {
        const response = await api.post('/asaas/boletos', { contaReceberId, parcelaIds, pedidoIds });
        return response.data;
    },
    consultarBoleto: async (cobrancaId) => {
        const response = await api.get(`/asaas/boletos/${cobrancaId}`);
        return response.data;
    },
    cancelarBoleto: async (cobrancaId) => {
        const response = await api.delete(`/asaas/boletos/${cobrancaId}`);
        return response.data;
    },
    enviarBoletoWhatsapp: async (cobrancaId) => {
        const response = await api.post(`/asaas/boletos/${cobrancaId}/whatsapp`);
        return response.data;
    }
};

export default asaasService;
