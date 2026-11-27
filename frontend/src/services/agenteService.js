import api from './api';

// Telas administrativas "Agentes de IA" e "Solicitações do Luke".
// Todas as rotas exigem ADMIN humano no backend (o próprio agente nunca chega aqui).
const d = (r) => r.data;

const agenteService = {
    // ── Agentes e tokens ──
    listar: () => api.get('/agentes').then(d),
    criar: (nome) => api.post('/agentes', { nome }).then(d),
    // O token em claro vem SÓ nesta resposta (campo `token`). Quem chama não pode guardá-lo em lugar nenhum.
    criarToken: (agenteId, corpo) => api.post(`/agentes/${agenteId}/tokens`, corpo).then(d),
    revogarToken: (agenteId, tokenId) => api.delete(`/agentes/${agenteId}/tokens/${tokenId}`).then(d),

    // ── Fila de solicitações (o agente pede, o dono autoriza) ──
    solicitacoes: (params) => api.get('/agentes/solicitacoes', { params }).then(d),
    solicitacoesContagem: () => api.get('/agentes/solicitacoes/contagem').then(d),
    solicitacao: (id) => api.get(`/agentes/solicitacoes/${id}`).then(d),
    autorizar: (id, corpo) => api.post(`/agentes/solicitacoes/${id}/autorizar`, corpo || {}).then(d),
    recusar: (id, observacao) => api.post(`/agentes/solicitacoes/${id}/recusar`, { observacao: observacao || '' }).then(d),
    // `corpo` leva { confirmarRepeticao: true } depois que o dono marcou "Entendi"; sem isso o servidor devolve 409 CONFIRMAR_REPETICAO.
    repetir: (id, corpo) => api.post(`/agentes/solicitacoes/${id}/repetir`, corpo || {}).then(d),
};

export default agenteService;

// Mensagem legível de um erro de API (nunca "undefined").
export function mensagemErro(e, padrao = 'Não foi possível concluir. Tente de novo.') {
    return e?.response?.data?.error || e?.response?.data?.message || (e?.response ? padrao : 'Sem conexão com o servidor. Verifique a internet e tente de novo.');
}
