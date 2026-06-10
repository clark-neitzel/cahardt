import api from './api';

const etiquetaService = {
    listar:     (params) => api.get('/pcp/etiquetas', { params }).then(r => r.data),
    buscar:     (id)     => api.get(`/pcp/etiquetas/${id}`).then(r => r.data),
    criar:      (dados)  => api.post('/pcp/etiquetas', dados).then(r => r.data),
    atualizar:  (id, dados) => api.put(`/pcp/etiquetas/${id}`, dados).then(r => r.data),
    remover:    (id)     => api.delete(`/pcp/etiquetas/${id}`).then(r => r.data),
    toggle:     (id)     => api.patch(`/pcp/etiquetas/${id}/toggle`).then(r => r.data),
};

export default etiquetaService;
