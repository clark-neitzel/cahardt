import api from './api';

const embarqueService = {
    listar: async (filtros) => {
        const response = await api.get('/embarques', { params: filtros });
        return response.data;
    },
    listarPedidosLivres: async () => {
        const response = await api.get('/embarques/pedidos-disponiveis');
        return response.data;
    },
    detalhar: async (id) => {
        const response = await api.get(`/embarques/${id}`);
        return response.data;
    },
    criar: async (dados) => {
        const response = await api.post('/embarques', dados);
        return response.data;
    },
    inserirPedidos: async (id, pedidosIds) => {
        const response = await api.post(`/embarques/${id}/pedidos`, { pedidosIds });
        return response.data;
    },
    removerPedido: async (id, pedidoId) => {
        const response = await api.delete(`/embarques/${id}/pedidos/${pedidoId}`);
        return response.data;
    },
    listarAmostrasDisponiveis: async () => {
        const response = await api.get('/embarques/amostras-disponiveis');
        return response.data;
    },
    inserirAmostras: async (id, amostrasIds) => {
        const response = await api.post(`/embarques/${id}/amostras`, { amostrasIds });
        return response.data;
    },
    removerAmostra: async (id, amostraId) => {
        const response = await api.delete(`/embarques/${id}/amostras/${amostraId}`);
        return response.data;
    },
    editar: async (id, dados) => {
        const response = await api.patch(`/embarques/${id}`, dados);
        return response.data;
    },
    registrarImpressao: async (id) => {
        const response = await api.post(`/embarques/${id}/impressao`);
        return response.data;
    },

    // ── Conferência de carga por bipagem (doca) ────────────────────────────────
    // ⚠️ Estas quatro respondem HTTP 200 SEMPRE, inclusive nas recusas
    // (JA_CONFERIDA, FORA_DA_CARGA, EM_OUTRA_CARGA, DESCONHECIDO, INVALIDO,
    // PEDE_PREFIXO, FALTAM). Quem chama deve olhar `r.ok`/`r.resultado` — tratar
    // `ok:false` como erro de rede apagaria justamente a mensagem precisa que a
    // pessoa na doca precisa ler.
    conferenciaCarga: async (id) => {
        const response = await api.get(`/embarques/${id}/conferencia`);
        return response.data;
    },
    conferirBipe: async (id, texto, origem = 'LEITOR') => {
        const response = await api.post(`/embarques/${id}/conferir`, { texto, origem });
        return response.data;
    },
    desconferir: async (id, tipo, itemId) => {
        const response = await api.delete(`/embarques/${id}/conferir/${tipo}/${itemId}`);
        return response.data;
    },
    concluirConferencia: async (id, confirmarFaltantes = false) => {
        const response = await api.post(`/embarques/${id}/conferencia/concluir`, { confirmarFaltantes });
        return response.data;
    }
};

export default embarqueService;
