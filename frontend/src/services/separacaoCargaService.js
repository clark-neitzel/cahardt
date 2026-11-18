import api from './api';

// Separação de Carga (câmara fria, funciona sem internet). Contrato: docs/separacao-carga/PLANO.md, seção 2.
// Só 3 rotas: listar, baixar (sem efeito colateral) e sincronizar (o ÚNICO que grava; reenviar é seguro).
const separacaoCargaService = {
    listar: () => api.get('/separacao-carga/cargas', { timeout: 15000 }).then((r) => r.data),
    baixar: (embarqueId) => api.get(`/separacao-carga/cargas/${embarqueId}/baixar`, { timeout: 20000 }).then((r) => r.data),
    // corpo = { loteId, aparelho, ops:[{t:'L'|'P'|'O'|'X', ...}] }
    sincronizar: (embarqueId, corpo) => api.post(`/separacao-carga/cargas/${embarqueId}/sincronizar`, corpo, { timeout: 25000 }).then((r) => r.data),
    // "tem internet de verdade?" — navigator.onLine mente em Wi-Fi sem saída
    ping: () => api.get('/version', { timeout: 6000 }).then(() => true),
};

export default separacaoCargaService;
