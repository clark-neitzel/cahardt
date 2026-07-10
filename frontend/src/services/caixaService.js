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
    },

    quitarCA: async (pedidoIds, dataPagamento) => {
        const response = await api.post('/caixa/quitar-ca', { pedidoIds, dataPagamento });
        return response.data;
    },

    // Seletor do caixa: só ativos + inativos com movimento no dia
    getVendedoresDoDia: async (data) => {
        const response = await api.get('/caixa/vendedores-do-dia', { params: { data } });
        return response.data;
    },

    // Conferência de devoluções (mercadoria que voltou fisicamente)
    getConferenciaDevolucao: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/conferencia-devolucao', { params });
        return response.data;
    },

    autorizarDesconsiderarDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/autorizar', dados);
        return response.data;
    },

    confirmarConferenciaDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/confirmar', dados);
        return response.data;
    },

    reabrirConferenciaDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/reabrir', dados);
        return response.data;
    }
};

export default caixaService;
