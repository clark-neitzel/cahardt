import api from './api';

const entregasService = {
    getPendentes: async () => {
        const response = await api.get('/entregas/pendentes');
        return response.data;
    },
    getConcluidas: async () => {
        const response = await api.get('/entregas/concluidas');
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
    }
};

export default entregasService;
