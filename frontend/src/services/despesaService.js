import api from './api';

const despesaService = {
    listar: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/despesas', { params });
        return response.data;
    },

    criar: async (dados) => {
        const response = await api.post('/despesas', dados);
        return response.data;
    },

    atualizar: async (id, dados) => {
        const response = await api.put(`/despesas/${id}`, dados);
        return response.data;
    },

    excluir: async (id) => {
        const response = await api.delete(`/despesas/${id}`);
        return response.data;
    }
};

export default despesaService;
