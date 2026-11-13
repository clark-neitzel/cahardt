import api from './api';

// "Cadastros pra acertar" + fila de pedidos de inativação (feitos pelos agentes).
// Rotas /api/cadastro-pendencias — só quem edita clientes (ou admin) acessa.
const cadastroPendenciasService = {
    // { page, limit, total, totalPages, data: [{ id, nome, cidade, vendedorId, vendedor, completo, faltando: [{ campo, rotulo }] }] }
    pendentes: async ({ vendedorId, page = 1, limit = 50 } = {}) =>
        (await api.get('/cadastro-pendencias/pendentes', { params: { vendedorId: vendedorId || undefined, page, limit } })).data,

    // status: pendente | aprovada | recusada | todas
    inativacoes: async ({ status = 'pendente', page = 1, limit = 50 } = {}) =>
        (await api.get('/cadastro-pendencias/inativacoes', { params: { status, page, limit } })).data,

    // { pendentes: number } — usado no selo do botão
    contagemInativacoes: async () => (await api.get('/cadastro-pendencias/inativacoes/contagem')).data,

    aprovar: async (id, observacao) =>
        (await api.post(`/cadastro-pendencias/inativacoes/${id}/aprovar`, { observacao: observacao || undefined })).data,

    recusar: async (id, observacao) =>
        (await api.post(`/cadastro-pendencias/inativacoes/${id}/recusar`, { observacao: observacao || undefined })).data,
};

export default cadastroPendenciasService;
