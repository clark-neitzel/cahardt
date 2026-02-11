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

    sincronizar: async () => {
        const response = await api.post('/clientes/sync');
        return response.data;
    }
};

export default clienteService;
