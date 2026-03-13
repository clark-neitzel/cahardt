import api from './api';

const amostraService = {
    listar: async (params) => {
        const res = await api.get('/amostras', { params });
        return res.data;
    },

    obter: async (id) => {
        const res = await api.get(`/amostras/${id}`);
        return res.data;
    },

    criar: async (data) => {
        const res = await api.post('/amostras', data);
        return res.data;
    },

    mudarStatus: async (id, status) => {
        const res = await api.patch(`/amostras/${id}/status`, { status });
        return res.data;
    },

    cancelar: async (id) => {
        const res = await api.delete(`/amostras/${id}`);
        return res.data;
    }
};

export default amostraService;
