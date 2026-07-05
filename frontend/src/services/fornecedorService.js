import api from './api';

const fornecedorService = {
    listar: async (busca = '') => {
        const response = await api.get('/fornecedores', { params: busca ? { busca } : {} });
        return response.data;
    },
    criar: async (dados) => {
        const response = await api.post('/fornecedores', dados);
        return response.data;
    },
    atualizar: async (id, dados) => {
        const response = await api.put(`/fornecedores/${id}`, dados);
        return response.data;
    },
    importarCA: async () => {
        const response = await api.post('/fornecedores/importar-ca');
        return response.data;
    },
    // Exclui um fornecedor. Se tiver despesas/notas ligadas, passe mesclarComId (destino, mesmo CNPJ).
    excluir: async (id, mesclarComId) => {
        const response = await api.post(`/fornecedores/${id}/excluir`, mesclarComId ? { mesclarComId } : {});
        return response.data;
    }
};

export default fornecedorService;
