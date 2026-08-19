import api from './api';

const contasReceberService = {
    listar: async (filtros = {}) => {
        const response = await api.get('/contas-receber', { params: filtros });
        return response.data;
    },
    detalhar: async (id) => {
        const response = await api.get(`/contas-receber/${id}`);
        return response.data;
    },
    darBaixa: async (parcelaId, dados) => {
        const response = await api.post(`/contas-receber/${parcelaId}/baixa`, dados);
        return response.data;
    },
    contasFinanceiras: async () => {
        const response = await api.get('/contas-receber/contas-financeiras');
        return response.data?.contasFinanceiras || [];
    },
    // Tipos de cobrança (Boleto, Pix, Dinheiro, Cartão) — vêm das condições de pagamento
    tiposCobranca: async () => {
        const response = await api.get('/contas-receber/tipos-cobranca');
        return response.data?.tipos || [];
    },
    // Quem já deu baixa em alguma parcela — opções do filtro "Baixado por"
    baixadoPor: async () => {
        const response = await api.get('/contas-receber/baixado-por');
        return response.data?.usuarios || [];
    },
    // Opções fixas dos filtros (condição, condição na entrega, forma da baixa).
    // Vêm do banco inteiro — se saíssem das linhas já filtradas, as opções sumiriam
    // conforme o usuário filtra e o filtro ficaria impossível de desmarcar.
    opcoesFiltros: async () => {
        const response = await api.get('/contas-receber/opcoes-filtros');
        return {
            condicoes: response.data?.condicoes || [],
            formasEntrega: response.data?.formasEntrega || [],
            formasBaixa: response.data?.formasBaixa || []
        };
    },
    darBaixaLote: async (dados) => {
        const response = await api.post('/contas-receber/baixa-lote', dados);
        return response.data;
    },
    estornarBaixa: async (parcelaId) => {
        const response = await api.delete(`/contas-receber/${parcelaId}/baixa`);
        return response.data;
    },
    listarPagamentos: async (parcelaId) => {
        const response = await api.get(`/contas-receber/${parcelaId}/pagamentos`);
        return response.data;
    },
    estornarPagamento: async (parcelaId, pagamentoId) => {
        const response = await api.delete(`/contas-receber/${parcelaId}/pagamentos/${pagamentoId}`);
        return response.data;
    },
    cancelar: async (id) => {
        const response = await api.patch(`/contas-receber/${id}/cancelar`);
        return response.data;
    },
    reverterQuitacao: async (id) => {
        const response = await api.put(`/contas-receber/${id}/reverter-quitacao`);
        return response.data;
    },
    reverterCancelamento: async (id) => {
        const response = await api.patch(`/contas-receber/${id}/reverter-cancelamento`);
        return response.data;
    },
    syncCA: async (id) => {
        const response = await api.post(`/contas-receber/${id}/sync-ca`);
        return response.data;
    },
    syncCATodas: async () => {
        const response = await api.post('/contas-receber/sync-ca/todas');
        return response.data;
    },
    relatorioItens: async (filtros = {}) => {
        const response = await api.get('/contas-receber/relatorio-itens', { params: filtros });
        return response.data;
    },
    // Opções do filtro "Responsável pela cobrança" — pessoas (vendedor/escritório) que
    // aparecem como responsáveis por algum título. Aceita tanto { responsaveis: [...] }
    // quanto um array puro, para não depender do embrulho da resposta.
    responsaveis: async () => {
        const response = await api.get('/contas-receber/responsaveis');
        const dados = response.data;
        return Array.isArray(dados) ? dados : (dados?.responsaveis || []);
    },
    // Relatório do fechamento (dia 01): títulos em aberto agrupados por responsável.
    // params: { de, ate } — 'YYYY-MM-DD'
    porResponsavel: async (params = {}) => {
        const response = await api.get('/contas-receber/por-responsavel', { params });
        return response.data;
    }
};

export default contasReceberService;
