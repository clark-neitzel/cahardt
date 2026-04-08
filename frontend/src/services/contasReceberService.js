import api from './api';

const contasReceberService = {
    listar: async (filtros = {}) => {
        const response = await api.get('/contas-receber', { params: filtros });
        return response.data;
    },
    detalhar: async (id) => {
        const response = await api.get(`/contas-receber/${id}`);
        return response.data;
    },
    darBaixa: async (parcelaId, dados) => {
        const response = await api.post(`/contas-receber/${parcelaId}/baixa`, dados);
        return response.data;
    },
    darBaixaLote: async (dados) => {
        const response = await api.post('/contas-receber/baixa-lote', dados);
        return response.data;
    },
    estornarBaixa: async (parcelaId) => {
        const response = await api.delete(`/contas-receber/${parcelaId}/baixa`);
        return response.data;
    },
    cancelar: async (id) => {
        const response = await api.patch(`/contas-receber/${id}/cancelar`);
        return response.data;
    },
    reverterQuitacao: async (id) => {
        const response = await api.put(`/contas-receber/${id}/reverter-quitacao`);
        return response.data;
    },
    reverterCancelamento: async (id) => {
        const response = await api.patch(`/contas-receber/${id}/reverter-cancelamento`);
        return response.data;
    }
};

export default contasReceberService;
