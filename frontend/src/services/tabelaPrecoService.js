import api from './api';

const tabelaPrecoService = {
    listar: async (ativo) => {
        const params = {};
        if (ativo !== undefined) params.ativo = ativo;

        const response = await api.get('/tabela-precos', { params });
        return response.data;
    }
};

export default tabelaPrecoService;
