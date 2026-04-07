import api from './api';

const pcpAgendaService = {
    listar: (params) => api.get('/pcp/agenda', { params }).then(r => r.data),
    criar: (dados) => api.post('/pcp/agenda', dados).then(r => r.data),
    atualizar: (id, dados) => api.put(`/pcp/agenda/${id}`, dados).then(r => r.data),
    excluir: (id) => api.delete(`/pcp/agenda/${id}`).then(r => r.data),
};

export default pcpAgendaService;
