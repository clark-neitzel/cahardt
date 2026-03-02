import api from './api';

const formasPagamentoService = {
    listar: async () => {
        const response = await api.get('/pagamentos-entrega');
        return response.data;
    },
    criar: async (dados) => {
        const response = await api.post('/pagamentos-entrega', dados);
        return response.data;
    },
    atualizar: async (id, dados) => {
        const response = await api.put(`/pagamentos-entrega/${id}`, dados);
        return response.data;
    },
    excluir: async (id) => {
        const response = await api.delete(`/pagamentos-entrega/${id}`);
        return response.data;
    }
};

export default formasPagamentoService;
