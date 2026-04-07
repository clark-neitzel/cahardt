import api from './api';

const caixaService = {
    getResumo: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/resumo', { params });
        return response.data;
    },

    setAdiantamento: async (dados) => {
        const response = await api.patch('/caixa/adiantamento', dados);
        return response.data;
    },

    fecharCaixa: async (dados) => {
        const response = await api.post('/caixa/fechar', dados);
        return response.data;
    },

    conferirCaixa: async (dados) => {
        const response = await api.post('/caixa/conferir', dados);
        return response.data;
    },

    conferirEntrega: async (dados) => {
        const response = await api.patch('/caixa/entrega-conferir', dados);
        return response.data;
    },

    reverterConferencia: async (id) => {
        const response = await api.post('/caixa/reverter-conferencia', { id });
        return response.data;
    },

    reabrirCaixa: async (id) => {
        const response = await api.post('/caixa/reabrir', { id });
        return response.data;
    },

    getPendente: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const response = await api.get('/caixa/pendente', { params });
        return response.data;
    },

    getAuditLogs: async () => {
        const response = await api.get('/caixa/audit-logs');
        return response.data;
    },

    getRelatorio: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/relatorio', { params });
        return response.data;
    }
};

export default caixaService;
