import api from './api';

const estoqueService = {
    ajustar: (dados) => api.post('/estoque/ajuste', dados).then(r => r.data),
    listarHistorico: (params) => api.get('/estoque/historico', { params }).then(r => r.data),
    getPermissoes: () => api.get('/estoque/permissoes').then(r => r.data),
    syncProduto: (produtoId) => api.post(`/estoque/sync-produto/${produtoId}`).then(r => r.data),
};

export default estoqueService;
