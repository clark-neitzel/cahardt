import api from './api';

// Integração Asaas — PIX na entrega (QR Code)
const asaasService = {
    // Integração configurada no servidor? (front esconde o botão se não)
    status: async () => {
        const response = await api.get('/asaas/status');
        return response.data;
    },
    // Gera (ou reaproveita) um QR Code PIX para o pedido
    criarPix: async ({ pedidoId, valor, descricao }) => {
        const response = await api.post('/asaas/pix', { pedidoId, valor, descricao });
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
    emitirBoletos: async ({ contaReceberId, parcelaIds }) => {
        const response = await api.post('/asaas/boletos', { contaReceberId, parcelaIds });
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
