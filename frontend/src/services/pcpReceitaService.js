import api from './api';

const pcpReceitaService = {
    listar: (params) => api.get('/pcp/receitas', { params }).then(r => r.data),
    buscarPorId: (id) => api.get(`/pcp/receitas/${id}`).then(r => r.data),
    criar: (dados) => api.post('/pcp/receitas', dados).then(r => r.data),
    atualizar: (id, dados) => api.put(`/pcp/receitas/${id}`, dados).then(r => r.data),
    novaVersao: (id) => api.post(`/pcp/receitas/${id}/nova-versao`).then(r => r.data),
    escalonar: (id, dados) => api.post(`/pcp/receitas/${id}/escalonar`, dados).then(r => r.data),
    alterarStatus: (id, status) => api.patch(`/pcp/receitas/${id}/status`, { status }).then(r => r.data),
};

export default pcpReceitaService;
