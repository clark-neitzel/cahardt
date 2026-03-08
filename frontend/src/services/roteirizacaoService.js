import api from './api';

const roteirizacaoService = {
    /**
     * Verifica se há uma roteirização em andamento.
     */
    verificarStatus: async () => {
        const res = await api.get('/roteirizar/status');
        return res.data; // { ocupado: boolean, iniciadoEm?: string }
    },

    /**
     * Solicita a roteirização das entregas.
     * @param {Object} params
     * @param {number} params.lat - Latitude do motorista
     * @param {number} params.lng - Longitude do motorista
     * @param {string} params.horaSaida - Horário de saída "HH:MM"
     * @param {number} params.tempoParadaMin - Tempo médio por entrega em minutos
     * @param {string} [params.vendedorId] - ID do motorista (admin pode escolher)
     */
    roteirizar: async ({ lat, lng, horaSaida, tempoParadaMin, vendedorId }) => {
        const res = await api.post('/roteirizar', { lat, lng, horaSaida, tempoParadaMin, vendedorId });
        return res.data;
        // Retorna: { sequencia: [...], semGPS: [...], resumo: {...} }
    },

    /**
     * Busca a roteirização salva do usuário logado (ou de um vendedor específico se admin)
     */
    getRotaSalva: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const res = await api.get('/roteirizar', { params });
        // Se retornar 204, res.data é vazio
        return res.status === 204 ? null : res.data;
    },

    /**
     * Limpa a roteirização ativa
     */
    limparRota: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const res = await api.delete('/roteirizar', { params });
        return res.data;
    },

    /**
     * Busca todas as roteirizações (Somente Admin)
     */
    getTodasRotasAdmin: async () => {
        const res = await api.get('/roteirizar/admin/todas');
        return res.data;
    }
};

export default roteirizacaoService;
