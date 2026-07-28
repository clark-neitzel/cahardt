import api from './api';

// Cobrança em Rota: títulos em aberto pendurados na carga (ou cobrados por busca livre).
// A baixa oficial da parcela sai SEMPRE pelo Caixa Diário, nunca por aqui.
const cobrancasRotaService = {
    // Busca títulos em aberto por nome do cliente (escritório e cobrador)
    buscarParcelasAbertas: async (q) => {
        const response = await api.get('/cobrancas-rota/parcelas-abertas', { params: { q } });
        return response.data;
    },

    // Cobranças penduradas numa carga
    listarDaCarga: async (embarqueId) => {
        const response = await api.get(`/cobrancas-rota/embarque/${embarqueId}`);
        return response.data;
    },

    // Escritório pendura títulos na carga
    inserirNaCarga: async (embarqueId, parcelaIds) => {
        const response = await api.post(`/cobrancas-rota/embarque/${embarqueId}`, { parcelaIds });
        return response.data;
    },

    // Tira da carga (só se ainda não cobrada)
    remover: async (id) => {
        const response = await api.delete(`/cobrancas-rota/${id}`);
        return response.data;
    },

    // Cobranças do cobrador logado (pendentes das cargas dele + trabalhadas hoje)
    minhas: async () => {
        const response = await api.get('/cobrancas-rota/minhas');
        return response.data;
    },

    // Registra a cobrança feita na rua (total ou parcial)
    cobrar: async (id, dados) => {
        const response = await api.post(`/cobrancas-rota/${id}/cobrar`, dados);
        return response.data;
    },

    // Busca livre: cobra um título na hora, sem carga
    cobrarAvulsa: async (dados) => {
        const response = await api.post('/cobrancas-rota/avulsa/cobrar', dados);
        return response.data;
    },

    // Não conseguiu cobrar: só registro (título continua em aberto)
    naoCobrada: async (id, dados) => {
        const response = await api.post(`/cobrancas-rota/${id}/nao-cobrada`, dados);
        return response.data;
    },

    // Desfaz um registro de rua feito por engano (antes da baixa)
    desfazer: async (id) => {
        const response = await api.post(`/cobrancas-rota/${id}/desfazer`);
        return response.data;
    }
};

export default cobrancasRotaService;
