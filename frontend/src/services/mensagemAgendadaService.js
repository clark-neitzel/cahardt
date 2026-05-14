import api from './api';

const mensagemAgendadaService = {
    listar: () => api.get('/mensagens-agendadas').then(r => r.data),
    obter: (id) => api.get(`/mensagens-agendadas/${id}`).then(r => r.data),
    criar: (data) => api.post('/mensagens-agendadas', data).then(r => r.data),
    atualizar: (id, data) => api.put(`/mensagens-agendadas/${id}`, data).then(r => r.data),
    deletar: (id) => api.delete(`/mensagens-agendadas/${id}`).then(r => r.data),
    disparar: (id) => api.post(`/mensagens-agendadas/${id}/disparar`).then(r => r.data),
    preview: (vendedorId) => api.get(`/mensagens-agendadas/preview/${vendedorId}`).then(r => r.data),
};

export default mensagemAgendadaService;
