import api from './api';

const leadService = {
    listar: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const response = await api.get('/leads', { params });
        return response.data;
    },

    buscarPorId: async (id) => {
        const response = await api.get(`/leads/${id}`);
        return response.data;
    },

    criar: async (data) => {
        const response = await api.post('/leads', data);
        return response.data;
    },

    atualizar: async (id, data) => {
        const response = await api.put(`/leads/${id}`, data);
        return response.data;
    },

    finalizar: async (id) => {
        const response = await api.post(`/leads/${id}/finalizar`);
        return response.data;
    }
};

export default leadService;
