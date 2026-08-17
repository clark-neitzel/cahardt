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
        return response.data; // { message, conta, estoque?: { entradas, avisos } }
    },
    // Produtos do catálogo + insumos PCP para lançar compra junto com a despesa manual
    produtosOpcoes: async () => {
        const response = await api.get('/contas-pagar/produtos-opcoes');
        return response.data; // [{ value:'PROD:<id>'|'PCP:<id>', nome, unidade, sub }]
    },
    atualizar: async (id, dados) => {
        const response = await api.put(`/contas-pagar/${id}`, dados);
        return response.data;
    },
    // Corrigir os PRODUTOS de uma despesa já lançada (quantidade errada, produto trocado,
    // produto a mais/a menos). Mexe SÓ em estoque, custo e histórico de compras — nunca no
    // valor da despesa, nas parcelas ou nos pagamentos. Lista vazia = tirar todos os produtos.
    // Exige a permissão Pode_Corrigir_Entrada_Estoque (mesma da correção de entrada de nota).
    atualizarItens: async (id, dados) => {
        const response = await api.put(`/contas-pagar/${id}/itens`, dados);
        return response.data; // { ok, message, antes, depois, custos, avisos }
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
    },

    // ── PDF da despesa (boleto, NF, contrato…) ──
    // Faz upload do arquivo PDF e retorna { temPdf, pdfNome }
    uploadPdf: async (id, arquivo) => {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const response = await api.post(`/contas-pagar/${id}/pdf`, form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data; // { message, temPdf, pdfNome }
    },
    // Abre o PDF em nova aba. Usa a URL da API com o token de autenticação via query param não é
    // necessário aqui pois o header Authorization é enviado pelo axios automaticamente — porém
    // window.open não envia headers. Solução: o backend usa verificarAuth que aceita token no cookie
    // ou header. Para simplificar, usamos a rota autenticada via fetch+Blob no navegador.
    abrirPdf: async (id) => {
        const response = await api.get(`/contas-pagar/${id}/pdf`, { responseType: 'blob' });
        const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
    // Remove o PDF da despesa
    deletarPdf: async (id) => {
        const response = await api.delete(`/contas-pagar/${id}/pdf`);
        return response.data; // { message, temPdf, pdfNome }
    }
};

export default contasPagarService;
