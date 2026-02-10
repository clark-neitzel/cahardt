import api from './api';

const syncService = {
    sincronizar: async () => {
        const response = await api.post('/sync/produtos');
        return response.data;
    },

    listarLogs: async () => {
        const response = await api.get('/sync/logs');
        return response.data;
    }
};

export default syncService;
