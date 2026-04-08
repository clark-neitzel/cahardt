import api from './api';

const vendedorService = {
    listar: async () => {
        const response = await api.get('/vendedores');
        return response.data;
    },

    listarAtivos: async () => {
        const response = await api.get('/vendedores', { params: { ativo: 'true' } });
        return response.data;
    },

    obter: async (id) => {
        const response = await api.get(`/vendedores/${id}`);
        return response.data;
    },

    atualizar: async (id, dados) => {
        const response = await api.put(`/vendedores/${id}`, dados);
        return response.data;
    }
};

export default vendedorService;
