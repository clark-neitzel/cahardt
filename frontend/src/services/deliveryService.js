import api from './api';

const deliveryService = {
    ETAPAS: ['PEDIDO', 'PRODUCAO', 'SAINDO', 'ENTREGUE'],
    LABELS: {
        PEDIDO: 'Pedido',
        PRODUCAO: 'Em Produção',
        SAINDO: 'Saindo Entrega',
        ENTREGUE: 'Entregue'
    },

    listarCategorias: async () => (await api.get('/delivery/config/categorias')).data,
    salvarCategoria: async (nome, ativo) =>
        (await api.patch(`/delivery/config/categorias/${encodeURIComponent(nome)}`, { ativo })).data,

    listarPermissoes: async () => (await api.get('/delivery/config/permissoes')).data,
    salvarPermissao: async (vendedorId, dados) =>
        (await api.put(`/delivery/config/permissoes/${vendedorId}`, dados)).data,

    minhaPermissao: async () => (await api.get('/delivery/me')).data,

    listarPedidos: async () => (await api.get('/delivery/pedidos')).data,
    moverEtapa: async (pedidoId, novaEtapa) =>
        (await api.patch(`/delivery/pedidos/${pedidoId}/etapa`, { novaEtapa })).data,
    reenviar: async (pedidoId) =>
        (await api.post(`/delivery/pedidos/${pedidoId}/reenviar`)).data
};

export default deliveryService;
