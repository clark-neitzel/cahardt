import api from './api';

const pcpItemService = {
    listar: (params) => api.get('/pcp/itens', { params }).then(r => r.data),
    buscarPorId: (id) => api.get(`/pcp/itens/${id}`).then(r => r.data),
    criar: (dados) => api.post('/pcp/itens', dados).then(r => r.data),
    atualizar: (id, dados) => api.put(`/pcp/itens/${id}`, dados).then(r => r.data),
    toggleAtivo: (id) => api.patch(`/pcp/itens/${id}/ativo`).then(r => r.data),
};

export default pcpItemService;
