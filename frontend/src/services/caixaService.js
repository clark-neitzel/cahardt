import api from './api';

const caixaService = {
    getResumo: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/resumo', { params });
        return response.data;
    },

    setAdiantamento: async (dados) => {
        const response = await api.patch('/caixa/adiantamento', dados);
        return response.data;
    },

    fecharCaixa: async (dados) => {
        const response = await api.post('/caixa/fechar', dados);
        return response.data;
    },

    conferirCaixa: async (dados) => {
        const response = await api.post('/caixa/conferir', dados);
        return response.data;
    },

    conferirEntrega: async (dados) => {
        const response = await api.patch('/caixa/entrega-conferir', dados);
        return response.data;
    },

    reverterConferencia: async (id) => {
        const response = await api.post('/caixa/reverter-conferencia', { id });
        return response.data;
    },

    reabrirCaixa: async (id, motivo) => {
        const response = await api.post('/caixa/reabrir', { id, motivo });
        return response.data;
    },

    // ── Conferência do DINHEIRO (passo antes de fechar) ──
    enviarParaConferencia: async (dados) => {
        const response = await api.post('/caixa/conferencia-dinheiro/enviar', dados);
        return response.data;
    },

    conferirDinheiro: async (dados) => {
        const response = await api.post('/caixa/conferencia-dinheiro/conferir', dados);
        return response.data;
    },

    desfazerConferenciaDinheiro: async (dados) => {
        const response = await api.post('/caixa/conferencia-dinheiro/desfazer', dados);
        return response.data;
    },

    getCaixasAConferir: async (incluirHoje = false) => {
        const response = await api.get('/caixa/conferencia-dinheiro/a-conferir', {
            params: incluirHoje ? { hoje: 1 } : {},
        });
        return response.data;
    },

    getCaixasAFechar: async () => {
        const response = await api.get('/caixa/conferencia-dinheiro/a-fechar');
        return response.data;
    },

    getMinhasConferencias: async (de, ate) => {
        const response = await api.get('/caixa/conferencia-dinheiro/minhas', { params: { de, ate } });
        return response.data;
    },

    getAutorizadoresDiferenca: async () => {
        const response = await api.get('/caixa/conferencia-dinheiro/autorizadores');
        return response.data;
    },

    getConfigConferencia: async () => {
        const response = await api.get('/caixa/conferencia-dinheiro/config');
        return response.data;
    },

    salvarConfigConferencia: async (dados) => {
        const response = await api.put('/caixa/conferencia-dinheiro/config', dados);
        return response.data;
    },

    getPendente: async (vendedorId) => {
        const params = vendedorId ? { vendedorId } : {};
        const response = await api.get('/caixa/pendente', { params });
        return response.data;
    },

    getAuditLogs: async () => {
        const response = await api.get('/caixa/audit-logs');
        return response.data;
    },

    getRelatorio: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/relatorio', { params });
        return response.data;
    },

    quitarCA: async (pedidoIds, dataPagamento) => {
        const response = await api.post('/caixa/quitar-ca', { pedidoIds, dataPagamento });
        return response.data;
    },

    // Baixa oficial dos títulos cobrados na rua (Cobrança em Rota)
    baixarCobrancasRota: async (ids) => {
        const response = await api.post('/caixa/cobrancas-rota/baixar', { ids });
        return response.data;
    },

    // Seletor do caixa: só ativos + inativos com movimento no dia
    getVendedoresDoDia: async (data) => {
        const response = await api.get('/caixa/vendedores-do-dia', { params: { data } });
        return response.data;
    },

    // Conferência de devoluções (mercadoria que voltou fisicamente)
    getConferenciaDevolucao: async (data, vendedorId) => {
        const params = { data };
        if (vendedorId) params.vendedorId = vendedorId;
        const response = await api.get('/caixa/conferencia-devolucao', { params });
        return response.data;
    },

    // "Autorizar eu mesmo" — quem confere e tem a permissão libera com a própria senha
    autorizarDesconsiderarDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/autorizar', dados);
        return response.data;
    },

    // Autorização à distância: quem confere pede; o responsável autoriza no próprio app
    solicitarAutorizacaoDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/solicitar-autorizacao', dados);
        return response.data;
    },

    cancelarSolicitacaoDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/cancelar-solicitacao', dados);
        return response.data;
    },

    // Pop-up global do responsável: pedidos aguardando ESTE usuário
    getAutorizacoesDevolucaoPendentes: async () => {
        const response = await api.get('/caixa/autorizacoes-devolucao/pendentes');
        return response.data;
    },

    responderAutorizacaoDevolucao: async (id, dados) => {
        const response = await api.post(`/caixa/autorizacoes-devolucao/${id}/responder`, dados);
        return response.data;
    },

    confirmarConferenciaDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/confirmar', dados);
        return response.data;
    },

    reabrirConferenciaDevolucao: async (dados) => {
        const response = await api.post('/caixa/conferencia-devolucao/reabrir', dados);
        return response.data;
    }
};

export default caixaService;
