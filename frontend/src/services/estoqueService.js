import api from './api';

const estoqueService = {
    ajustar: (dados) => api.post('/estoque/ajuste', dados).then(r => r.data),
    listarHistorico: (params) => api.get('/estoque/historico', { params }).then(r => r.data),
    getPermissoes: () => api.get('/estoque/permissoes').then(r => r.data),
    getPosicao: (params) => api.get('/estoque/posicao', { params }).then(r => r.data),
    atualizarMinimo: (produtoId, estoqueMinimo) => api.patch(`/estoque/produto/${produtoId}/minimo`, { estoqueMinimo }).then(r => r.data),
    recalcular: (produtoId) => api.post(`/estoque/produto/${produtoId}/recalcular`).then(r => r.data),
};

export default estoqueService;
