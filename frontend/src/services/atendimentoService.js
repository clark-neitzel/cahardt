import api from './api';

const atendimentoService = {
    registrar: async (data) => {
        const response = await api.post('/atendimentos', data);
        return response.data;
    },

    listarPorLead: async (leadId) => {
        const response = await api.get(`/atendimentos/lead/${leadId}`);
        return response.data;
    },

    listarPorCliente: async (clienteId) => {
        const response = await api.get(`/atendimentos/cliente/${clienteId}`);
        return response.data;
    }
};

export default atendimentoService;
