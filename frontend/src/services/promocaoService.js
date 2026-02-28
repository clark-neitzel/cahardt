import api from './api';

const promocaoService = {
    /**
     * Lista todo o histórico de promoções de um produto
     */
    listarPorProduto: async (produtoId) => {
        const response = await api.get('/promocoes', { params: { produtoId } });
        return response.data;
    },

    /**
     * Retorna a promoção atualmente ativa (dentro do período) para o produto
     */
    buscarAtiva: async (produtoId) => {
        const response = await api.get('/promocoes/ativa', { params: { produtoId } });
        return response.data;
    },

    /**
     * Cria nova promoção para o produto
     */
    criar: async (dados) => {
        const response = await api.post('/promocoes', dados);
        return response.data;
    },

    /**
     * Encerra promoção com auditoria
     */
    encerrar: async (id) => {
        const response = await api.post(`/promocoes/${id}/encerrar`);
        return response.data;
    }
};

export default promocaoService;
