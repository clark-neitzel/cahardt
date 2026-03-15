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
    },

    // Retorna todos os atendimentos de hoje para um vendedor específico (ou todos se não passar ID)
    listarHoje: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const response = await api.get('/atendimentos/hoje', { params });
        return response.data;
    },

    listarTransferidos: async () => {
        const response = await api.get('/atendimentos/transferidos');
        return response.data;
    },

    listarAlertasAtivos: async () => {
        const response = await api.get('/atendimentos/alertas-ativos');
        return response.data;
    },

    marcarAlertaVisto: async (atendimentoId) => {
        const response = await api.patch(`/atendimentos/${atendimentoId}/alerta-visto`);
        return response.data;
    },

    finalizarTransferencia: async (atendimentoId) => {
        const response = await api.patch(`/atendimentos/${atendimentoId}/finalizar-transferencia`);
        return response.data;
    },

    marcarTransferenciaVista: async (atendimentoId) => {
        const response = await api.patch(`/atendimentos/${atendimentoId}/transferencia-vista`);
        return response.data;
    },

    listarTransferenciasResolvidas: async () => {
        const response = await api.get('/atendimentos/transferencias-resolvidas');
        return response.data;
    }
};

export default atendimentoService;
