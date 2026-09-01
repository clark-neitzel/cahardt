import api from './api';

const configNotasService = {
    getCertificado: async () => {
        const response = await api.get('/config-notas/certificado');
        return response.data;
    },
    instalarCertificado: async (arquivo, senha) => {
        const fd = new FormData();
        fd.append('arquivo', arquivo);
        fd.append('senha', senha);
        const response = await api.post('/config-notas/certificado', fd, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    // Captura automática de notas: { nfeAtiva, ultimaConsulta, ultimoResultado, totalCapturadas, bloqueadoAte }
    getCaptura: async () => {
        const response = await api.get('/config-notas/captura');
        return response.data;
    },
    setCaptura: async (dados) => {
        const response = await api.put('/config-notas/captura', dados);
        return response.data;
    },
    // Emissão de NF-e (Simples Nacional): { aliquotaCreditoSimples, ncmPadrao, textosLegais, padrao, ... }
    getEmissao: async () => {
        const response = await api.get('/config-notas/emissao');
        return response.data;
    },
    setEmissao: async (dados) => {
        const response = await api.put('/config-notas/emissao', dados);
        return response.data;
    },
    // Referência da nota de origem POR ITEM na NF-e de devolução (NT 2025.002).
    // O GET não exige `configuracoes.edit` (qualquer usuário logado lê o estado — é ele que
    // alimenta o lembrete na tela); o PUT exige, e o próprio GET já avisa isso em `podeEditar`.
    // { chave, modo, modos, ligado, definido, obrigatorioEm, diasRestantes, ambiente,
    //   atualizadoEm, atualizadoPorNome, podeEditar }
    getDevolucaoRefItem: async () => {
        const response = await api.get('/config-notas/devolucao-ref-item');
        return response.data;
    },
    // modo: 'auto' | 'sempre' | 'nunca' → { ok, chave, modo, modoAnterior, ligado, ambiente }
    setDevolucaoRefItem: async (modo) => {
        const response = await api.put('/config-notas/devolucao-ref-item', { modo });
        return response.data;
    }
};

export default configNotasService;
