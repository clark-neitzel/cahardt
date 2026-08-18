import api from './api';

// Mapa de divisão de cargas da expedição (contrato fechado com o backend).
// Nada aqui grava sozinho: sugerir/estimar só calculam; quem grava é aplicarDivisao.
const mapaExpedicaoService = {
    // Entregas do dia + cargas + base da empresa. data = 'YYYY-MM-DD'.
    mapa: async (data) => {
        const response = await api.get('/embarques/mapa', { params: { data } });
        return response.data;
    },
    // Proposta de divisão (não grava). Pode devolver 423 se outro cálculo estiver rodando.
    sugerirDivisao: async (dados) => {
        const response = await api.post('/embarques/sugerir-divisao', dados);
        return response.data;
    },
    // Números precisos (km/duração/volta) para o arranjo montado na mão (não grava).
    estimarRotas: async (dados) => {
        const response = await api.post('/embarques/estimar-rotas', dados);
        return response.data;
    },
    // Aplica o rascunho. 409 = alguém mudou pedidos no meio tempo (nada foi aplicado).
    aplicarDivisao: async (dados) => {
        const response = await api.post('/embarques/aplicar-divisao', dados);
        return response.data;
    }
};

export default mapaExpedicaoService;
