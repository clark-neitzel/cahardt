import api from './api';

const pedidoService = {
    // Buscar histórico/último preço
    obterUltimoPreco: async (clienteId, produtoId) => {
        const response = await api.get('/pedidos/ultimo-preco', {
            params: { clienteId, produtoId }
        });
        return response.data;
    },

    // Listagem de Pedidos
    listar: async (filtros) => {
        const response = await api.get('/pedidos', { params: filtros });
        return response.data;
    },

    // Detalhes de um pedido
    detalhar: async (id) => {
        const response = await api.get(`/pedidos/${id}`);
        return response.data;
    },

    // Criar Novo Pedido
    criar: async (dadosPedido) => {
        const response = await api.post('/pedidos', dadosPedido);
        return response.data;
    },

    // Atualizar Pedido Existente (Apenas Rascunho/Em Aberto)
    atualizar: async (id, dadosPedido) => {
        const response = await api.put(`/pedidos/${id}`, dadosPedido);
        return response.data;
    }
};

export default pedidoService;
