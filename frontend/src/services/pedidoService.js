import api from './api';

const pedidoService = {
    // Buscar histórico/último preço
    obterUltimoPreco: async (clienteId, produtoId) => {
        const response = await api.get('/pedidos/ultimo-preco', {
            params: { clienteId, produtoId }
        });
        return response.data;
    },

    // Buscar histórico de compras do cliente (todos os produtos com 5 últimas compras)
    historicoComprasCliente: async (clienteId) => {
        const response = await api.get('/pedidos/historico-cliente', {
            params: { clienteId }
        });
        return response.data;
    },



    // Resumo de pendências (contagens por tipo e status)
    resumoPendencias: async (filtros = {}) => {
        const response = await api.get('/pedidos/resumo-pendencias', { params: filtros });
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
    },

    // Marcar Pedido Modificado no CA como Revisado pelo Vendedor
    marcarRevisado: async (id) => {
        const response = await api.put(`/pedidos/${id}/revisado`);
        return response.data;
    },

    // Aprovar Pedido Especial (sem nota)
    aprovarEspecial: async (id) => {
        const response = await api.put(`/pedidos/${id}/aprovar-especial`);
        return response.data;
    },

    // Reverter Pedido Especial (desfaz aprovação → volta ABERTO)
    reverterEspecial: async (id) => {
        const response = await api.put(`/pedidos/${id}/reverter-especial`);
        return response.data;
    },

    // Aprovar Pedido Bonificação
    aprovarBonificacao: async (id) => {
        const response = await api.put(`/pedidos/${id}/aprovar-bonificacao`);
        return response.data;
    },

    // Reverter Pedido Bonificação (desfaz aprovação → volta ABERTO)
    reverterBonificacao: async (id) => {
        const response = await api.put(`/pedidos/${id}/reverter-bonificacao`);
        return response.data;
    },

    // Excluir Pedido Existente (Apenas Rascunho/Em Aberto)
    excluir: async (id) => {
        const response = await api.delete(`/pedidos/${id}`);
        return response.data;
    },

    // Enviar pedido via WhatsApp (BotConversa)
    enviarWhatsapp: async (id) => {
        const response = await api.post(`/pedidos/${id}/enviar-whatsapp`);
        return response.data;
    },

    // Reatribuir vendedor de um pedido (ajuste somente no app)
    reatribuirVendedor: async (id, vendedorId) => {
        const response = await api.put(`/pedidos/${id}/reatribuir-vendedor`, { vendedorId });
        return response.data;
    },

    // Registrar data e hora de impressão
    registrarImpressao: async (id) => {
        const response = await api.put(`/pedidos/${id}/impresso`);
        return response.data;
    },

    // Consultar situação atual no Conta Azul (sincroniza este pedido específico)
    consultarCA: async (id) => {
        const response = await api.post(`/pedidos/${id}/consultar-ca`);
        return response.data;
    },

    // Pedidos pendentes de faturamento (criados ontem, entrega hoje)
    pendenteFaturamento: async () => {
        const response = await api.get('/pedidos/pendente-faturamento');
        return response.data;
    }
};

export default pedidoService;
