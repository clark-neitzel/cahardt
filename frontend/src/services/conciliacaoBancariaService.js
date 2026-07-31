import api from './api';

// Conciliação bancária — extrato OFX × baixas do app
const conciliacaoBancariaService = {
    // Sobe o arquivo OFX. Retorna { message, novos, duplicados, totalArquivo, periodo }.
    // Se o arquivo for de OUTRA conta bancária, o backend recusa com 409 + { bloqueios,
    // contaSugerida } e NADA é gravado; forcar=true repete a importação assumindo o risco.
    importar: async (contaFinanceiraCaId, arquivo, forcar = false) => {
        const form = new FormData();
        form.append('contaFinanceiraCaId', contaFinanceiraCaId);
        form.append('arquivo', arquivo);
        if (forcar) form.append('forcar', '1');
        const response = await api.post('/conciliacao-bancaria/importar', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
    // Desfaz uma importação inteira (só enquanto nada dela foi conciliado)
    removerImportacao: async (importacaoId) => {
        const response = await api.delete(`/conciliacao-bancaria/importacoes/${importacaoId}`);
        return response.data;
    },
    // { resumo, lancamentos: [{id, data, valor, tipo, descricao, status, sugestoes?/conciliadoCom?}], soNoApp }
    lancamentos: async (contaId, de, ate, status = 'todos') => {
        const response = await api.get('/conciliacao-bancaria/lancamentos', { params: { contaId, de, ate, status } });
        return response.data;
    },
    conciliarAuto: async (contaId, de, ate) => {
        const response = await api.post('/conciliacao-bancaria/conciliar-auto', { contaId, de, ate });
        return response.data;
    },
    // Confirma em lote os créditos IDENTIFICADOS (Venda NNNN = pedido NNNN, valor fechando)
    confirmarIdentificadas: async (contaId, de, ate) => {
        const response = await api.post('/conciliacao-bancaria/confirmar-identificadas', { contaId, de, ate });
        return response.data;
    },
    conciliar: async (lancamentoId, { pagamentoParcelaId, pagamentoParcelaPagarId }) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/conciliar`, { pagamentoParcelaId, pagamentoParcelaPagarId });
        return response.data;
    },
    ignorar: async (lancamentoId, obs) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/ignorar`, { obs });
        return response.data;
    },
    // Dinheiro movido entre contas da própria empresa (não é receita/despesa).
    // outraContaId vazio = conta fora do sistema.
    transferir: async (lancamentoId, outraContaId, obs) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/transferencia`, { outraContaId, obs });
        return response.data;
    },
    desfazer: async (lancamentoId) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/desfazer`);
        return response.data;
    },
    // Baixas do app ainda livres, para o modal de grupo. tipo: CREDITO | DEBITO
    // Com busca, inclui baixas em OUTRAS contas (banco errado?), marcadas com outraConta.
    baixasDisponiveis: async (contaId, de, ate, tipo, busca = '') => {
        const response = await api.get('/conciliacao-bancaria/baixas-disponiveis', { params: { contaId, de, ate, tipo, busca } });
        return response.data;
    },
    // Descobre no CA de quem é cada débito "Nome não encontrado" (roda em 2º plano)
    identificarDebitosCA: async (contaId, de, ate) => {
        const response = await api.post('/conciliacao-bancaria/identificar-debitos-ca', { contaId, de, ate });
        return response.data;
    },
    // Move uma baixa lançada no banco errado para a conta certa (app e, se possível, CA)
    corrigirContaBaixa: async (tipo, pagamentoId, contaId) => {
        const response = await api.post('/conciliacao-bancaria/corrigir-conta-baixa', { tipo, pagamentoId, contaId });
        return response.data;
    },
    // A AÇÃO ÚNICA: "este(s) lançamento(s) do banco é(são) isto no sistema".
    // parcelaPagarIds = boletos em aberto (cria a baixa); pagamentoIds = baixas já feitas (amarra).
    conciliarUnificado: async (dados) => {
        const response = await api.post('/conciliacao-bancaria/conciliar-unificado', dados);
        return response.data;
    },
    motivosDiferenca: async () => {
        const response = await api.get('/conciliacao-bancaria/motivos-diferenca');
        return response.data;
    },
    importacoes: async (contaId) => {
        const response = await api.get('/conciliacao-bancaria/importacoes', { params: { contaId } });
        return response.data;
    },
    // Fornecedores + categorias + formas de pagamento (modal de criar despesa)
    opcoesDespesa: async () => {
        const response = await api.get('/conciliacao-bancaria/opcoes-despesa');
        return response.data;
    },
    // Lança no Contas a Pagar a despesa que faltava, já paga com a data/valor/banco do extrato
    criarDespesa: async (lancamentoId, dados) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/criar-despesa`, dados);
        return response.data;
    },
    // Lote: cria uma despesa por lançamento selecionado (tarifas repetidas) e já concilia.
    // dados: { lancamentoIds, fornecedorId|fornecedorNovo, categoria, categoriaCaId, metodoPagamento }
    criarDespesasLote: async (dados) => {
        const response = await api.post('/conciliacao-bancaria/despesas-lote', dados);
        return response.data;
    },
    // Boletos EM ABERTO, com janela de vencimento de/ate (±15 dias do débito por padrão)
    parcelasPagarAbertas: async (valor, busca, de, ate) => {
        const response = await api.get('/conciliacao-bancaria/parcelas-pagar-abertas', { params: { valor, busca, de, ate } });
        return response.data;
    },
    // Contas a RECEBER em aberto — para dar baixa numa entrada (PIX/transferência) direto na conciliação
    parcelasReceberAbertas: async (valor, busca, de, ate) => {
        const response = await api.get('/conciliacao-bancaria/parcelas-receber-abertas', { params: { valor, busca, de, ate } });
        return response.data;
    },
    // Extrato automático do Asaas: { configurado, contaFinanceiraCaId, ultimaSync }
    asaasInfo: async () => {
        const response = await api.get('/conciliacao-bancaria/asaas-info');
        return response.data;
    },
    // Busca o extrato no Asaas agora (o worker já faz sozinho a cada 30 min)
    sincronizarAsaas: async (dias) => {
        const response = await api.post('/conciliacao-bancaria/sincronizar-asaas', { dias });
        return response.data;
    }
};

export default conciliacaoBancariaService;
