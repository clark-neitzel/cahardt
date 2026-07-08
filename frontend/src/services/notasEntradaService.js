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
    // Busca UNIFICADA de produtos + insumos para vincular:
    // [{ tipo:'PRODUTO'|'PCP', id, value:'PROD:<id>'|'PCP:<id>', nome, unidade, sub }]
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
    // Cancela a entrada gerada (Conta a Pagar) e reabre a nota para nova conferência
    cancelarConferencia: async (id) => {
        const response = await api.post(`/notas-entrada/${id}/cancelar-conferencia`);
        return response.data;
    },
    consultarAgora: async () => {
        const response = await api.post('/notas-entrada/consultar-agora');
        return response.data;
    },
    // Importa o XML de UMA nota (NF-e ou NFS-e nacional). Envia o conteúdo cru como texto.
    // Retorna { ok, jaExistia, statusAnterior, nota }.
    importarXml: async (xmlText) => {
        const response = await api.post('/notas-entrada/importar-xml', xmlText, {
            headers: { 'Content-Type': 'text/plain' }
        });
        return response.data;
    },
    // Lança uma nota manualmente (sem XML) — { tipo, fornecedorCnpj, fornecedorNome, numero, emissao, valorTotal }.
    lancarManual: async (dados) => {
        const response = await api.post('/notas-entrada/lancar-manual', dados);
        return response.data;
    },
    // Busca uma NF-e na SEFAZ pela chave de acesso (44 dígitos) — { ok, jaExistia, aguardandoXml, nota }.
    buscarPorChave: async (chave) => {
        const response = await api.post('/notas-entrada/buscar-chave', { chave });
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
