import api from './api';

const syncService = {
    sincronizar: async () => {
        const response = await api.post('/sync/tudo');
        return response.data;
    },

    sincronizarPedidos: async () => {
        const response = await api.post('/sync/pedidos');
        return response.data;
    },

    listarLogs: async () => {
        const response = await api.get('/sync/logs');
        return response.data;
    }
};

export default syncService;
