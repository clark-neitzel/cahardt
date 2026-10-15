import api from './api';

// Impressão direta (fila + agente no PC da cozinha). Contrato: docs/etiquetas-cozinha/PLANO-ARQUITETO.md §2.3
// O token do agente só vem na criação/rotação — nunca guardar em localStorage nem logar.
const impressaoService = {
    listarAgentes: () => api.get('/impressao/agentes').then(r => r.data),
    criarAgente: (nome) => api.post('/impressao/agentes', { nome }).then(r => r.data),
    rotacionarToken: (id) => api.post(`/impressao/agentes/${id}/rotacionar-token`).then(r => r.data),
    revogarAgente: (id) => api.post(`/impressao/agentes/${id}/revogar`).then(r => r.data),
    atualizarImpressorasWindows: (id) => api.post(`/impressao/agentes/${id}/atualizar-impressoras`).then(r => r.data),

    listarImpressoras: () => api.get('/impressao/impressoras').then(r => r.data),
    criarImpressora: (dados) => api.post('/impressao/impressoras', dados).then(r => r.data),
    atualizarImpressora: (id, dados) => api.put(`/impressao/impressoras/${id}`, dados).then(r => r.data),
    desativarImpressora: (id) => api.delete(`/impressao/impressoras/${id}`).then(r => r.data),
    testar: (id, tipo) => api.post(`/impressao/impressoras/${id}/teste`, { tipo }).then(r => r.data),

    listarFila: (status, limit = 50) =>
        api.get('/impressao/fila', { params: { status: status && status !== 'TODOS' ? status : undefined, limit } }).then(r => r.data),
    obterTrabalho: (id) => api.get(`/impressao/trabalhos/${id}`).then(r => r.data),
    reenviar: (id, requisicaoId) => api.post(`/impressao/trabalhos/${id}/reenviar`, { requisicaoId }).then(r => r.data),
    cancelar: (id) => api.post(`/impressao/trabalhos/${id}/cancelar`).then(r => r.data),
};

export default impressaoService;
