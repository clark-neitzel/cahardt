import api from './api';

const pcpEstoqueService = {
    posicao: (params) => api.get('/pcp/estoque/posicao', { params }).then(r => r.data),
    ajustar: (dados) => api.post('/pcp/estoque/ajuste', dados).then(r => r.data),
    historico: (params) => api.get('/pcp/estoque/historico', { params }).then(r => r.data),
};

export default pcpEstoqueService;
