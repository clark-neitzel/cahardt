import api from './api';

// Conferência da Carga pelo motorista (funciona sem internet). Contrato: docs/conferencia-motorista/PLANO.md, seção 5.
// listar / baixar (sem efeito colateral) / sincronizar (o ÚNICO que grava; reenviar é seguro) + resumo para o escritório.
const conferenciaMotoristaService = {
    // O servidor decide: admin recebe todas as cargas pendentes; os demais só as do próprio motorista (sem query).
    listar: () => api.get('/conferencia-motorista/cargas', { timeout: 15000 }).then((r) => r.data),
    baixar: (embarqueId) => api.get(`/conferencia-motorista/cargas/${embarqueId}/baixar`, { timeout: 20000 }).then((r) => r.data),
    // corpo = { loteId, aparelho, ops:[{t:'L'|'P'|'O'|'X', ...}] }
    sincronizar: (embarqueId, corpo) => api.post(`/conferencia-motorista/cargas/${embarqueId}/sincronizar`, corpo, { timeout: 25000 }).then((r) => r.data),
    // Embarque (escritório): ids = array de embarqueId (≤100) → { resumos:{ [id]:{...} } }
    resumo: (ids) => api.get('/conferencia-motorista/resumo', { params: { ids: (ids || []).join(',') }, timeout: 15000 }).then((r) => r.data),
};

export default conferenciaMotoristaService;
