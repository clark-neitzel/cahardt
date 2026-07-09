import api from './api';

// Datas/horas sempre no relógio LOCAL do aparelho (é ele que dispara o alerta)
export const hojeStr = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const horaStr = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

// texto amigável da repetição (DIAS_SEMANA lista os dias escolhidos)
export const labelRecorrencia = (recorrencia, diasSemana = []) => {
    const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    switch (recorrencia) {
        case 'DIARIA': return 'todo dia';
        case 'DIAS_UTEIS': return 'seg a sex';
        case 'SEMANAL': return 'toda semana';
        case 'MENSAL': return 'todo mês';
        case 'DIAS_SEMANA': return (diasSemana || []).map(d => DIAS[d]).join(', ') || 'dias escolhidos';
        default: return null;
    }
};

const tarefaService = {
    equipe: async () => {
        const response = await api.get('/tarefas/equipe');
        return response.data;
    },

    agenda: async (de, ate, vendedorId) => {
        const response = await api.get('/tarefas', { params: { de, ate, vendedorId } });
        return response.data;
    },

    pendentes: async () => {
        const response = await api.get('/tarefas/pendentes', { params: { data: hojeStr(), hora: horaStr() } });
        return response.data;
    },

    criar: async (dados) => {
        const response = await api.post('/tarefas', dados);
        return response.data;
    },

    atualizar: async (id, dados) => {
        const response = await api.put(`/tarefas/${id}`, dados);
        return response.data;
    },

    excluir: async (id) => {
        const response = await api.delete(`/tarefas/${id}`);
        return response.data;
    },

    concluir: async (id, dataRef) => {
        const response = await api.post(`/tarefas/${id}/concluir`, { dataRef, hora: horaStr() });
        return response.data;
    },

    adiar: async (id, dataRef) => {
        const response = await api.post(`/tarefas/${id}/adiar`, { dataRef });
        return response.data;
    },

    anexarArquivos: async (id, formData) => {
        const response = await api.post(`/tarefas/${id}/anexos`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    anexarLink: async (id, nome, url) => {
        const response = await api.post(`/tarefas/${id}/anexos/link`, { nome, url });
        return response.data;
    },

    removerAnexo: async (anexoId) => {
        const response = await api.delete(`/tarefas/anexos/${anexoId}`);
        return response.data;
    },

    parecer: async (data) => {
        const response = await api.get('/tarefas/parecer', {
            params: { data, horaAtual: horaStr(), dataHoje: hojeStr() },
        });
        return response.data;
    },
};

export default tarefaService;
