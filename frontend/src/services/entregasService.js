import api from './api';

const entregasService = {
    getPendentes: async (responsavelId) => {
        const params = responsavelId ? { responsavelId } : {};
        const response = await api.get('/entregas/pendentes', { params });
        return response.data;
    },
    getConcluidas: async (responsavelId) => {
        const params = responsavelId ? { responsavelId } : {};
        const response = await api.get('/entregas/concluidas', { params });
        return response.data;
    },
    getById: async (id) => {
        const response = await api.get(`/entregas/${id}`);
        return response.data;
    },
    getGerencial: async (params) => {
        const response = await api.get('/entregas/gerencial', { params });
        return response.data;
    },
    concluirEntrega: async (id, dados) => {
        const response = await api.post(`/entregas/${id}/concluir`, dados);
        return response.data;
    },
    estornar: async (id) => {
        await api.delete(`/entregas/${id}/estorno`);
    },
    editarEntrega: async (id, dados) => {
        const response = await api.patch(`/entregas/${id}/editar`, dados);
        return response.data;
    },
    concluirAmostra: async (id) => {
        const response = await api.post(`/entregas/amostra/${id}/concluir`);
        return response.data;
    },
    definirPrioridade: async (id, prioridade) => {
        const response = await api.patch(`/entregas/${id}/prioridade`, { prioridade });
        return response.data;
    },
    reordenarPrioridades: async () => {
        const response = await api.post('/entregas/reordenar-prioridades');
        return response.data;
    }
};

export default entregasService;
