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
    }
};

export default roteirizacaoService;
