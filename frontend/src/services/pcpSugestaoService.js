import api from './api';

const pcpSugestaoService = {
    listar: (params) => api.get('/pcp/sugestoes', { params }).then(r => r.data),
    gerar: () => api.post('/pcp/sugestoes/gerar').then(r => r.data),
    aceitar: (id) => api.patch(`/pcp/sugestoes/${id}/aceitar`).then(r => r.data),
    rejeitar: (id) => api.patch(`/pcp/sugestoes/${id}/rejeitar`).then(r => r.data),
    dashboard: () => api.get('/pcp/sugestoes/dashboard').then(r => r.data),
};

export default pcpSugestaoService;
