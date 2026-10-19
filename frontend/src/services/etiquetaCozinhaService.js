import api from './api';

// Etiquetas da Cozinha (E2). Contrato: docs/etiquetas-cozinha/PLANO-ARQUITETO.md §2.5
const BASE = '/pcp/etiquetas-cozinha';

const etiquetaCozinhaService = {
    itens: (params) => api.get(`${BASE}/itens`, { params }).then(r => r.data),
    favoritos: () => api.get(`${BASE}/favoritos`).then(r => r.data),
    equipe: () => api.get(`${BASE}/equipe`).then(r => r.data),
    hoje: (data) => api.get(`${BASE}/hoje`, { params: data ? { data } : undefined }).then(r => r.data),
    imprimir: (dados) => api.post(`${BASE}/imprimir`, dados).then(r => r.data),
    reimprimir: (loteId, dados) => api.post(`${BASE}/lotes/${loteId}/reimprimir`, dados || {}).then(r => r.data),
    // Impressoras ativas (não-admin com pcp.etiquetas recebe só as ativas, campos mínimos)
    impressoras: () => api.get('/impressao/impressoras').then(r => r.data),
};

export default etiquetaCozinhaService;
