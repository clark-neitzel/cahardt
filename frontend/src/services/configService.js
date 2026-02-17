import api from './api';

const configService = {
    // Buscar uma configuração por chave
    get: async (key) => {
        const response = await api.get(`/config/${key}`);
        return response.data;
    },

    // Salvar uma configuração
    save: async (key, value) => {
        const response = await api.post(`/config/${key}`, value);
        return response.data;
    },

    // Buscar lista de todas as categorias existentes
    getCategorias: async () => {
        const response = await api.get('/config/categorias');
        return response.data;
    }
};

export default configService;
