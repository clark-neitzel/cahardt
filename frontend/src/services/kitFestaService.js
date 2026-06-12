import api from './api';

// Serviço do painel ADMIN do Kit Festa (rotas protegidas /api/kitfesta).
export const kitFestaService = {
    // Produtos do site
    produtosApp: (params) => api.get('/kitfesta/produtos-app', { params }).then(r => r.data),
    salvarProdutoSite: (produtoId, dados) => api.put(`/kitfesta/produtos/${produtoId}`, dados).then(r => r.data),
    removerProdutoSite: (produtoId) => api.delete(`/kitfesta/produtos/${produtoId}`).then(r => r.data),

    // Categorias do site
    categorias: () => api.get('/kitfesta/categorias').then(r => r.data),
    salvarCategoria: (id, dados) => (id ? api.put(`/kitfesta/categorias/${id}`, dados) : api.post('/kitfesta/categorias', dados)).then(r => r.data),
    removerCategoria: (id) => api.delete(`/kitfesta/categorias/${id}`).then(r => r.data),

    // Agenda
    agenda: (inicio, fim) => api.get('/kitfesta/agenda', { params: { inicio, fim } }).then(r => r.data),
    setStatusDia: (dados) => api.post('/kitfesta/agenda/dia', dados).then(r => r.data),
    setStatusLote: (dados) => api.post('/kitfesta/agenda/lote', dados).then(r => r.data),

    // Horários (template)
    horarios: () => api.get('/kitfesta/horarios').then(r => r.data),
    salvarHorario: (id, dados) => (id ? api.put(`/kitfesta/horarios/${id}`, dados) : api.post('/kitfesta/horarios', dados)).then(r => r.data),
    removerHorario: (id) => api.delete(`/kitfesta/horarios/${id}`).then(r => r.data),

    // Bairros
    bairros: () => api.get('/kitfesta/bairros').then(r => r.data),
    salvarBairro: (id, dados) => (id ? api.put(`/kitfesta/bairros/${id}`, dados) : api.post('/kitfesta/bairros', dados)).then(r => r.data),
    removerBairro: (id) => api.delete(`/kitfesta/bairros/${id}`).then(r => r.data),

    // Cupons
    cupons: () => api.get('/kitfesta/cupons').then(r => r.data),
    salvarCupom: (id, dados) => (id ? api.put(`/kitfesta/cupons/${id}`, dados) : api.post('/kitfesta/cupons', dados)).then(r => r.data),
    removerCupom: (id) => api.delete(`/kitfesta/cupons/${id}`).then(r => r.data),

    // Avaliações
    avaliacoes: () => api.get('/kitfesta/avaliacoes').then(r => r.data),
    salvarAvaliacao: (id, dados) => (id ? api.put(`/kitfesta/avaliacoes/${id}`, dados) : api.post('/kitfesta/avaliacoes', dados)).then(r => r.data),
    removerAvaliacao: (id) => api.delete(`/kitfesta/avaliacoes/${id}`).then(r => r.data),

    // Config do site
    getConfig: () => api.get('/kitfesta/config').then(r => r.data),
    setConfig: (chave, valor) => api.put(`/kitfesta/config/${chave}`, { valor }).then(r => r.data),
    uploadLogo: (file) => {
        const fd = new FormData();
        fd.append('logo', file);
        return api.post('/kitfesta/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
    },

    // Pedidos (fila)
    pedidos: (params) => api.get('/kitfesta/pedidos', { params }).then(r => r.data),
    aprovarPedido: (id, dados) => api.post(`/kitfesta/pedidos/${id}/aprovar`, dados).then(r => r.data),
    recusarPedido: (id, motivo) => api.post(`/kitfesta/pedidos/${id}/recusar`, { motivo }).then(r => r.data),
    vincularCliente: (id, clienteUuid) => api.post(`/kitfesta/pedidos/${id}/vincular`, { clienteUuid }).then(r => r.data),
};

export default kitFestaService;
