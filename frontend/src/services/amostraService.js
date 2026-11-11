import api from './api';

const amostraService = {
    criar: async (data) => {
        const response = await api.post('/amostras', data);
        return response.data;
    },

    listar: async (filtros = {}) => {
        const response = await api.get('/amostras', { params: filtros });
        return response.data;
    },

    buscarPorId: async (id) => {
        const response = await api.get(`/amostras/${id}`);
        return response.data;
    },

    atualizarStatus: async (id, status) => {
        const response = await api.patch(`/amostras/${id}/status`, { status });
        return response.data;
    },

    enviarWhatsapp: async (id) => {
        const response = await api.post(`/amostras/${id}/enviar-whatsapp`);
        return response.data;
    },

    // Vai direto a LIBERADO (idempotente). Quem pode: expedição / Central de Pendências.
    liberar: async (id) => {
        const response = await api.post(`/amostras/${id}/liberar`);
        return response.data;
    },

    // Chamado depois de imprimir a etiqueta: SOLICITADA -> PREPARACAO (nunca regride)
    marcarEtiquetaImpressa: async (id) => {
        const response = await api.post(`/amostras/${id}/etiqueta-impressa`);
        return response.data;
    },

    // Contador da sub-aba: { hoje, semCarga, vermelhas, ids }
    resumoAbertas: async () => {
        const response = await api.get('/amostras/resumo-abertas');
        return response.data;
    },

    // Cancela com motivo (3–500 chars). Registro continua visível como CANCELADA; se estava numa
    // carga, sai dela. Resposta: { ok, removidaDaCarga, cargaNumero, amostra }
    cancelar: async (id, motivo) => {
        const response = await api.post(`/amostras/${id}/cancelar`, { motivo });
        return response.data;
    },

    excluir: async (id) => {
        const response = await api.delete(`/amostras/${id}`);
        return response.data;
    },
};

export default amostraService;
