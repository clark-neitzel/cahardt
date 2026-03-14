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
};

export default amostraService;
