import api from './api';

// Serviço do painel ADMIN do Site (Congelados) — rotas protegidas /api/congelados.
export const congeladosService = {
    // Produtos do site
    produtosApp: (params) => api.get('/congelados/produtos-app', { params }).then(r => r.data),
    salvarProdutoSite: (produtoId, dados) => api.put(`/congelados/produtos/${produtoId}`, dados).then(r => r.data),
    removerProdutoSite: (produtoId) => api.delete(`/congelados/produtos/${produtoId}`).then(r => r.data),

    // Config do site
    getConfig: () => api.get('/congelados/config').then(r => r.data),
    setConfig: (chave, valor) => api.put(`/congelados/config/${chave}`, { valor }).then(r => r.data),
    uploadLogo: (file) => {
        const fd = new FormData();
        fd.append('logo', file);
        return api.post('/congelados/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },
    // Sobe a foto do produto no app (aparece no site e no resto do sistema)
    uploadFotoProduto: (produtoId, file) => {
        const fd = new FormData();
        fd.append('imagens', file);
        return api.post(`/produtos/${produtoId}/imagens`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },

    // Pedidos (fila)
    pedidos: (params) => api.get('/congelados/pedidos', { params }).then(r => r.data),
    aprovarPedido: (id, dados) => api.post(`/congelados/pedidos/${id}/aprovar`, dados).then(r => r.data),
    recusarPedido: (id, motivo) => api.post(`/congelados/pedidos/${id}/recusar`, { motivo }).then(r => r.data),
    vincularCliente: (id, clienteUuid) => api.post(`/congelados/pedidos/${id}/vincular`, { clienteUuid }).then(r => r.data),
    excluirPedido: (id) => api.delete(`/congelados/pedidos/${id}`).then(r => r.data),
};

export default congeladosService;
