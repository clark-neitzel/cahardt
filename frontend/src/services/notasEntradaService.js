import api from './api';

const notasEntradaService = {
    // Lista notas + status da captura: { statusCaptura, notas }
    listar: async (params = {}) => {
        const response = await api.get('/notas-entrada', { params });
        return response.data;
    },
    // Detalhe: nota + itens (com vínculo) + duplicatas
    detalhe: async (id) => {
        const response = await api.get(`/notas-entrada/${id}`);
        return response.data;
    },
    // Busca de itens do PCP para vincular: [{ id, codigo, nome, tipo, unidade }]
    itensPcp: async (busca = '') => {
        const response = await api.get('/notas-entrada/itens-pcp', { params: busca ? { busca } : {} });
        return response.data;
    },
    gerarConta: async (id, dados) => {
        const response = await api.post(`/notas-entrada/${id}/gerar-conta`, dados);
        return response.data;
    },
    ignorar: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/ignorar`);
        return response.data;
    },
    reativar: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/reativar`);
        return response.data;
    },
    consultarAgora: async () => {
        const response = await api.post('/notas-entrada/consultar-agora');
        return response.data;
    },
    // XML da nota (blob, para baixar/abrir com o token de auth)
    baixarXml: async (id) => {
        const response = await api.get(`/notas-entrada/${id}/xml`, { responseType: 'blob' });
        return response.data;
    },
    // DANFE para impressão (HTML como texto, com o token de auth)
    danfe: async (id) => {
        const response = await api.get(`/notas-entrada/${id}/danfe`, { responseType: 'text' });
        return response.data;
    }
};

export default notasEntradaService;
