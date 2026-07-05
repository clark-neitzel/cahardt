import api from './api';

const contasPagarService = {
    listar: async (filtros = {}) => {
        const response = await api.get('/contas-pagar', { params: filtros });
        return response.data;
    },
    categorias: async () => {
        const response = await api.get('/contas-pagar/categorias');
        return response.data;
    },
    // Importar o CSV "Contas a pagar" do Conta Azul. dryRun=true → só a prévia (não grava).
    importarCa: async (arquivo, dryRun = false) => {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const response = await api.post('/contas-pagar/importar-ca', form, {
            params: { dryRun: dryRun ? 1 : 0 },
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data; // { message, resumo }
    },
    // Bancos/caixas do CA + formas de pagamento (para o "já paguei" da conferência de nota)
    opcoesBaixa: async () => {
        const response = await api.get('/contas-pagar/opcoes-baixa');
        return response.data; // { contasFinanceiras:[{id,nome,banco,tipo,padrao}], metodosPagamento:[{value,label}] }
    },
    criar: async (dados) => {
        const response = await api.post('/contas-pagar', dados);
        return response.data;
    },
    atualizar: async (id, dados) => {
        const response = await api.put(`/contas-pagar/${id}`, dados);
        return response.data;
    },
    cancelar: async (id) => {
        const response = await api.post(`/contas-pagar/${id}/cancelar`);
        return response.data;
    },
    reenviarCA: async (id) => {
        const response = await api.post(`/contas-pagar/${id}/reenviar-ca`);
        return response.data;
    },
    baixarParcela: async (id, parcelaId, dados) => {
        const response = await api.post(`/contas-pagar/${id}/parcelas/${parcelaId}/baixar`, dados);
        return response.data;
    },
    // Quitar várias parcelas de uma vez (mesma data/forma/banco)
    baixarLote: async (dados) => {
        const response = await api.post('/contas-pagar/baixar-lote', dados);
        return response.data; // { message, baixadas, ignoradas }
    },
    estornarPagamento: async (id, parcelaId, pagamentoId) => {
        const response = await api.post(`/contas-pagar/${id}/parcelas/${parcelaId}/estorno`, { pagamentoId });
        return response.data;
    },
    // Detalhe completo da despesa: nota fiscal + itens/produtos comprados (para o modal de detalhes)
    detalhe: async (id) => {
        const response = await api.get(`/contas-pagar/${id}/detalhe`);
        return response.data; // { origem, numeroNota, chaveNfe, nota, itens:[...] }
    }
};

export default contasPagarService;
