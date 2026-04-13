import api from './api';

const clienteService = {
    listar: async (params) => {
        const response = await api.get('/clientes', { params });
        return response.data;
    },

    buscarGlobal: async (q, limit = 20) => {
        const response = await api.get('/clientes/buscar-global', { params: { q, limit } });
        return response.data;
    },

    detalhar: async (uuid) => {
        const response = await api.get(`/clientes/${uuid}`);
        return response.data;
    },

    atualizar: async (uuid, dados) => {
        const response = await api.patch(`/clientes/${uuid}`, dados);
        return response.data;
    },

    atualizarLote: async (payload) => {
        const response = await api.put('/clientes/lote', payload);
        return response.data;
    },

    listarCondicoesPagamento: async () => {
        const response = await api.get('/clientes/condicoes-pagamento');
        return response.data;
    },

    sincronizar: async () => {
        const response = await api.post('/clientes/sync');
        return response.data;
    }
};

export default clienteService;
