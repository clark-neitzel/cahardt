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
    },

    // Novo usuário (nasce do cadastro de pessoas — sync com o CA desligado em 25/07/2026)
    criar: async (dados) => {
        const response = await api.post('/vendedores', dados);
        return response.data;
    }
};

export default vendedorService;
