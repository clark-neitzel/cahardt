import api from './api';

const pcpOrdemService = {
    listar: (params) => api.get('/pcp/ordens', { params }).then(r => r.data),
    buscarPorId: (id) => api.get(`/pcp/ordens/${id}`).then(r => r.data),
    criar: (dados) => api.post('/pcp/ordens', dados).then(r => r.data),
    iniciar: (id) => api.patch(`/pcp/ordens/${id}/iniciar`).then(r => r.data),
    apontarConsumo: (id, consumos) => api.patch(`/pcp/ordens/${id}/apontar-consumo`, { consumos }).then(r => r.data),
    finalizar: (id, quantidadeProduzida) => api.patch(`/pcp/ordens/${id}/finalizar`, { quantidadeProduzida }).then(r => r.data),
    cancelar: (id) => api.patch(`/pcp/ordens/${id}/cancelar`).then(r => r.data),
    excluir: (id) => api.delete(`/pcp/ordens/${id}`).then(r => r.data),
};

export default pcpOrdemService;
