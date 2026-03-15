import api from './api';

const embarqueService = {
    listar: async (filtros) => {
        const response = await api.get('/embarques', { params: filtros });
        return response.data;
    },
    listarPedidosLivres: async () => {
        const response = await api.get('/embarques/pedidos-disponiveis');
        return response.data;
    },
    detalhar: async (id) => {
        const response = await api.get(`/embarques/${id}`);
        return response.data;
    },
    criar: async (dados) => {
        const response = await api.post('/embarques', dados);
        return response.data;
    },
    inserirPedidos: async (id, pedidosIds) => {
        const response = await api.post(`/embarques/${id}/pedidos`, { pedidosIds });
        return response.data;
    },
    removerPedido: async (id, pedidoId) => {
        const response = await api.delete(`/embarques/${id}/pedidos/${pedidoId}`);
        return response.data;
    },
    listarAmostrasDisponiveis: async () => {
        const response = await api.get('/embarques/amostras-disponiveis');
        return response.data;
    },
    inserirAmostras: async (id, amostrasIds) => {
        const response = await api.post(`/embarques/${id}/amostras`, { amostrasIds });
        return response.data;
    },
    removerAmostra: async (id, amostraId) => {
        const response = await api.delete(`/embarques/${id}/amostras/${amostraId}`);
        return response.data;
    }
};

export default embarqueService;
