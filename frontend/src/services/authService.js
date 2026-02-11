import api from './api';

const authService = {
    // Obtém a URL de autorização do backend
    getAuthUrl: async () => {
        const response = await api.get('/auth/contaazul/url');
        return response.data.url;
    },

    // Verifica status da conexão
    checkStatus: async () => {
        const response = await api.get('/auth/status');
        return response.data;
    }
};

export default authService;
