import api from './api';

const clienteService = {
    listar: async (params) => {
        const response = await api.get('/clientes', { params });
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

    sincronizar: async () => {
        const response = await api.post('/clientes/sync');
        return response.data;
    }
};

export default clienteService;
