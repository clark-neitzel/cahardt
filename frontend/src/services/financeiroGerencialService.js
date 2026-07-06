import api from './api';

// Fase 5 — Fluxo de Caixa e DRE (relatórios gerenciais, somente leitura)
const financeiroGerencialService = {
    // { kpis, totais, linhas: [{ chave, entradasPrevistas, entradasRealizadas, ... }] }
    fluxoCaixa: async (de, ate, granularidade = 'dia') => {
        const response = await api.get('/financeiro-gerencial/fluxo-caixa', { params: { de, ate, granularidade } });
        return response.data;
    },
    // { meses, receita: {faturada, especial, devolucoes, liquida}, despesas: {categorias, total}, resultado, margem }
    dre: async (de, ate) => {
        const response = await api.get('/financeiro-gerencial/dre', { params: { de, ate } });
        return response.data;
    },
    // Categorias de despesa com o "balde" (classificação) e o total gasto
    // [{ id, nome, classificacao, total }]
    categoriasDespesa: async () => {
        const response = await api.get('/financeiro-gerencial/categorias-despesa');
        return response.data;
    },
    // Salvar classificação: [{ nome, classificacao }]
    salvarCategoriasDespesa: async (categorias) => {
        const response = await api.put('/financeiro-gerencial/categorias-despesa', { categorias });
        return response.data;
    },
    // Totais por conta financeira (banco/caixa) no período: { contas:[{id,nome,entradas,saidas,resultado,saldoCA}], totais }
    porConta: async (de, ate, saldoCA = false) => {
        const response = await api.get('/financeiro-gerencial/por-conta', { params: { de, ate, saldoCA: saldoCA ? 1 : 0 } });
        return response.data;
    },
    // Extrato (lançamentos) de UMA conta no período. contaId null → sem banco informado
    extratoPorConta: async (contaId, de, ate) => {
        const response = await api.get('/financeiro-gerencial/por-conta/extrato', { params: { contaId: contaId || 'sem', de, ate } });
        return response.data;
    },
    // Margem por produto: { de, ate, linhas:[{produtoId, nome, quantidade, receita, custoUnitario, fonteCusto, margem, margemPct}], totais }
    margemProdutos: async (de, ate) => {
        const response = await api.get('/financeiro-gerencial/margem-produtos', { params: { de, ate } });
        return response.data;
    }
};

export default financeiroGerencialService;
