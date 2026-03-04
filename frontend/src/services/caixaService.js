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

    getRelatorio: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/relatorio', { params });
        return response.data;
    }
};

export default caixaService;
