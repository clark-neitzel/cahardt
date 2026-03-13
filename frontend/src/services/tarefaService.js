import api from './api';

const tarefaService = {
    listarFila: async (params) => {
        const res = await api.get('/tarefas/fila', { params });
        return res.data;
    },

    resumo: async () => {
        const res = await api.get('/tarefas/resumo');
        return res.data;
    },

    obter: async (id) => {
        const res = await api.get(`/tarefas/${id}`);
        return res.data;
    },

    transferir: async (id, novoResponsavelId) => {
        const res = await api.patch(`/tarefas/${id}/transferir`, { novoResponsavelId });
        return res.data;
    },

    cancelar: async (id) => {
        const res = await api.patch(`/tarefas/${id}/cancelar`);
        return res.data;
    },

    listarPendentesDeLeads: async (leadIds) => {
        const res = await api.get('/tarefas/leads-pendentes', { params: { leadIds: leadIds.join(',') } });
        return res.data;
    }
};

export default tarefaService;
