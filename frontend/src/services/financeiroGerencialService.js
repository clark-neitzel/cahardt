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
    }
};

export default financeiroGerencialService;
