import api from './api';

const produtoService = {
    listar: async (params) => {
        const response = await api.get('/produtos', { params });
        return response.data;
    },

    detalhar: async (id) => {
        const response = await api.get(`/produtos/${id}`);
        return response.data;
    },

    atualizar: async (id, data) => {
        const response = await api.put(`/produtos/${id}`, data);
        return response.data;
    },

    uploadImagens: async (id, formData) => {
        const response = await api.post(`/produtos/${id}/imagens`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    removerImagem: async (id) => {
        const response = await api.delete(`/produtos/imagens/${id}`);
        return response.data;
    },

    definirPrincipal: async (id, imagemId) => {
        const response = await api.patch(`/produtos/${id}/imagens/${imagemId}/principal`);
        return response.data;
    },

    alterarStatus: async (id, ativo) => {
        const response = await api.patch(`/produtos/${id}/status`, { ativo });
        return response.data;
    }
};

export default produtoService;
