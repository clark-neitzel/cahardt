import api from './api';

// Módulo "Ponto GPS confiável por cliente"
const gpsClientesService = {
    config: async () => (await api.get('/gps-clientes/config')).data,
    setConfig: async (dados) => (await api.post('/gps-clientes/config', dados)).data,

    validar: async (ponto, clienteUuid) =>
        (await api.get('/gps-clientes/validar', { params: { ponto, clienteUuid } })).data,

    cliente: async (uuid) => (await api.get(`/gps-clientes/cliente/${uuid}`)).data,

    // Distância entre o endereço escrito (geocodificado) e o Ponto_GPS — lote de até 10 UUIDs
    enderecoVsGpsLote: async (uuids) =>
        (await api.post('/gps-clientes/endereco-vs-gps-lote', { uuids })).data,

    salvarPonto: async (uuid, dados) =>
        (await api.post(`/gps-clientes/cliente/${uuid}/ponto`, dados)).data,

    setBalcao: async (uuid, ativo) =>
        (await api.post(`/gps-clientes/cliente/${uuid}/balcao`, { ativo })).data,

    // FormData: foto (arquivo) + ponto + pedidoId
    naPorta: async (uuid, formData) =>
        (await api.post(`/gps-clientes/cliente/${uuid}/na-porta`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })).data,

    saude: async () => (await api.get('/gps-clientes/saude')).data,

    decidirPendencia: async (id, aprovar, motivo) =>
        (await api.post(`/gps-clientes/pendencias/${id}/decidir`, { aprovar, motivo })).data,

    historico: async (clienteUuid) =>
        (await api.get('/gps-clientes/historico', { params: { clienteUuid } })).data,

    desfazer: async (logId) =>
        (await api.post(`/gps-clientes/historico/${logId}/desfazer`)).data,

    minhasDivergencias: async () => (await api.get('/gps-clientes/minhas-divergencias')).data,

    autorizadores: async () => (await api.get('/gps-clientes/autorizadores')).data,

    // ── Fila offline: sem internet, a correção fica no aparelho e sobe sozinha ──
    enfileirarOffline: (uuid, dados) => {
        try {
            const lista = JSON.parse(localStorage.getItem(FILA_KEY) || '[]');
            lista.push({ uuid, dados, em: Date.now() });
            localStorage.setItem(FILA_KEY, JSON.stringify(lista));
        } catch { /* localStorage cheio/indisponível: sem fila */ }
    },

    flushOffline: async () => {
        let lista = [];
        try { lista = JSON.parse(localStorage.getItem(FILA_KEY) || '[]'); } catch { return 0; }
        if (!lista.length) return 0;
        const restantes = [];
        for (const item of lista) {
            try {
                await gpsClientesService.salvarPonto(item.uuid, item.dados);
            } catch (e) {
                // Sem resposta = ainda sem rede → mantém na fila. Com resposta
                // (validação barrou etc.) descarta — repetir não vai mudar o resultado.
                if (!e.response) restantes.push(item);
            }
        }
        localStorage.setItem(FILA_KEY, JSON.stringify(restantes));
        return lista.length - restantes.length;
    },
};

const FILA_KEY = 'gps_pontos_offline';

// Quando a internet volta, envia as correções guardadas no aparelho
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        gpsClientesService.flushOffline().catch(() => { });
    });
    // E tenta uma vez ao carregar o módulo (app abriu já com internet)
    setTimeout(() => gpsClientesService.flushOffline().catch(() => { }), 3000);
}

export default gpsClientesService;
