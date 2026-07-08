import api from './api';

// Catálogo Personalizado (privado) — vendedor monta lista de preços e gera link público.
const catalogoPersonalizadoService = {
    // payload: { clienteUuid, condicaoId, validadeDias, produtoIds:[], titulo?, observacoes? }
    gerar: async (payload) => {
        const response = await api.post('/catalogo-personalizado', payload);
        return response.data; // { ok, id, token, total, validadeEm, qtdItens }
    },

    listar: async () => {
        const response = await api.get('/catalogo-personalizado');
        return response.data;
    },

    remover: async (id) => {
        const response = await api.delete(`/catalogo-personalizado/${id}`);
        return response.data;
    }
};

export default catalogoPersonalizadoService;
