import api from './api';

// Conciliação bancária — extrato OFX × baixas do app
const conciliacaoBancariaService = {
    // Sobe o arquivo OFX. Retorna { message, novos, duplicados, totalArquivo, periodo }
    importar: async (contaFinanceiraCaId, arquivo) => {
        const form = new FormData();
        form.append('contaFinanceiraCaId', contaFinanceiraCaId);
        form.append('arquivo', arquivo);
        const response = await api.post('/conciliacao-bancaria/importar', form, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
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
    conciliar: async (lancamentoId, { pagamentoParcelaId, pagamentoParcelaPagarId }) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/conciliar`, { pagamentoParcelaId, pagamentoParcelaPagarId });
        return response.data;
    },
    ignorar: async (lancamentoId, obs) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/ignorar`, { obs });
        return response.data;
    },
    desfazer: async (lancamentoId) => {
        const response = await api.post(`/conciliacao-bancaria/${lancamentoId}/desfazer`);
        return response.data;
    },
    // Baixas do app ainda livres, para o modal de grupo. tipo: CREDITO | DEBITO
    baixasDisponiveis: async (contaId, de, ate, tipo) => {
        const response = await api.get('/conciliacao-bancaria/baixas-disponiveis', { params: { contaId, de, ate, tipo } });
        return response.data;
    },
    // N lançamentos do extrato ↔ M baixas do app (soma exata)
    conciliarGrupo: async (contaId, lancamentoIds, pagamentoIds) => {
        const response = await api.post('/conciliacao-bancaria/conciliar-grupo', { contaId, lancamentoIds, pagamentoIds });
        return response.data;
    },
    importacoes: async (contaId) => {
        const response = await api.get('/conciliacao-bancaria/importacoes', { params: { contaId } });
        return response.data;
    }
};

export default conciliacaoBancariaService;
