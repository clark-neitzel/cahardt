import api from './api';

const clienteService = {
    listar: async (params) => {
        const response = await api.get('/clientes', { params });
        return response.data;
    },

    buscarGlobal: async (q, limit = 20) => {
        const response = await api.get('/clientes/buscar-global', { params: { q, limit } });
        return response.data;
    },

    detalhar: async (uuid) => {
        const response = await api.get(`/clientes/${uuid}`);
        return response.data;
    },

    obterInadimplencia: async (uuid) => {
        const response = await api.get(`/clientes/${uuid}/inadimplencia`);
        return response.data;
    },

    // Situação de inadimplência de vários clientes de uma vez (selo das listas).
    inadimplenciaLote: async (ids) => {
        const response = await api.post('/inadimplencia/lote', { clienteIds: ids });
        return response.data;
    },

    atualizar: async (uuid, dados) => {
        const response = await api.patch(`/clientes/${uuid}`, dados);
        return response.data;
    },

    // Histórico do endereço (texto + ponto): quem/quando/versões antigas
    enderecoHistorico: async (uuid, limite = 50) => {
        const response = await api.get(`/clientes/${uuid}/endereco-historico`, { params: { limite } });
        return response.data;
    },

    // Posição estimada pelo endereço escrito de uma versão (lado: 'antes' | 'depois')
    enderecoHistoricoGeocode: async (uuid, eventoId, lado = 'antes') => {
        const response = await api.get(`/clientes/${uuid}/endereco-historico/${encodeURIComponent(eventoId)}/geocode`, { params: { lado } });
        return response.data;
    },

    // body: { lado, partes: 'tudo'|'texto'|'ponto', autorizacao?, posicaoAutor? }
    enderecoRestaurar: async (uuid, eventoId, body) => {
        const response = await api.post(`/clientes/${uuid}/endereco-historico/${encodeURIComponent(eventoId)}/restaurar`, body);
        return response.data;
    },

    criar: async (dados) => {
        const response = await api.post('/clientes', dados);
        return response.data;
    },

    // Consulta dados públicos do CNPJ (Receita) + IE (SEFAZ) p/ pré-preencher o cadastro
    consultarCnpj: async (cnpj) => {
        const response = await api.get(`/clientes/consulta-cnpj/${encodeURIComponent(cnpj)}`);
        return response.data;
    },

    atualizarLote: async (payload) => {
        const response = await api.put('/clientes/lote', payload);
        return response.data;
    },

    listarCondicoesPagamento: async () => {
        const response = await api.get('/clientes/condicoes-pagamento');
        return response.data;
    },

    sincronizar: async () => {
        const response = await api.post('/clientes/sync');
        return response.data;
    }
};

export default clienteService;
