import api from './api';

const tabelaPrecoService = {
    listar: async (ativo) => {
        const params = {};
        if (ativo !== undefined) params.ativo = ativo;

        const response = await api.get('/tabela-precos', { params });
        return response.data;
    },

    atualizar: async (id, dados) => {
        const response = await api.patch(`/tabela-precos/${id}`, dados);
        return response.data;
    }
};

export default tabelaPrecoService;
