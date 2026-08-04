import api from './api';

// Serviço do painel de RH (autenticado): funcionários, documentos, ponto.
const funcionarioService = {
    // Funcionários
    listar: async (params) => (await api.get('/rh/funcionarios', { params })).data,
    detalhar: async (id) => (await api.get(`/rh/funcionarios/${id}`)).data,
    criar: async (dados) => (await api.post('/rh/funcionarios', dados)).data,
    atualizar: async (id, dados) => (await api.put(`/rh/funcionarios/${id}`, dados)).data,
    gerarLink: async (id) => (await api.post(`/rh/funcionarios/${id}/gerar-link`)).data,
    definirSenha: async (id, senha) => (await api.put(`/rh/funcionarios/${id}/senha`, { senha })).data,
    salvarJornada: async (id, dados) => (await api.put(`/rh/funcionarios/${id}/jornada`, dados)).data,
    // params: { de, ate } (padrão do sistema) ou { mes: 'YYYY-MM' } (legado)
    cartao: async (id, params) => (await api.get(`/rh/funcionarios/${id}/cartao`, {
        params: typeof params === 'string' ? { mes: params } : (params || {})
    })).data,
    salvarAjusteFolha: async (id, dados) => (await api.put(`/rh/funcionarios/${id}/folha`, dados)).data,

    // Anexos (multipart)
    addDocumento: async (id, form) => (await api.post(`/rh/funcionarios/${id}/documentos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    delDocumento: async (id, docId) => (await api.delete(`/rh/funcionarios/${id}/documentos/${docId}`)).data,
    addExame: async (id, form) => (await api.post(`/rh/funcionarios/${id}/exames`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    delExame: async (id, exameId) => (await api.delete(`/rh/funcionarios/${id}/exames/${exameId}`)).data,
    addAtestado: async (id, form) => (await api.post(`/rh/funcionarios/${id}/atestados`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
    delAtestado: async (id, atestadoId) => (await api.delete(`/rh/funcionarios/${id}/atestados/${atestadoId}`)).data,
    addAvaliacao: async (id, dados) => (await api.post(`/rh/funcionarios/${id}/avaliacoes`, dados)).data,

    // Ponto (painel + ajustes manuais + importação)
    pontoHoje: async () => (await api.get('/rh/ponto/hoje')).data,
    addBatida: async (dados) => (await api.post('/rh/ponto/registros', dados)).data,
    updateBatida: async (id, dados) => (await api.put(`/rh/ponto/registros/${id}`, dados)).data,
    delBatida: async (id) => (await api.delete(`/rh/ponto/registros/${id}`)).data,
    // tipo: 'FALTA' | 'ABONO' | 'ATESTADO' | 'FERIAS' | 'FERIADO' | 'FOLGA' | 'COMPENSADO'
    //       ou null (null = volta ao automático)
    marcarDia: async (dados) => (await api.post('/rh/ponto/marcar-dia', dados)).data,
    // vários dias de uma vez: { funcionarioId, datas: [...], tipo, obs }
    marcarDias: async (dados) => (await api.post('/rh/ponto/marcar-dias', dados)).data,
    // pendências do painel: dias em aberto, quem não bateu hoje, acertos pendentes
    pontoPendencias: async (dias = 15) => (await api.get('/rh/ponto/pendencias', { params: { dias } })).data,
    // pedidos de acerto ("esqueci de bater") feitos pelo funcionário
    listarAcertos: async (status = 'PENDENTE') => (await api.get('/rh/ponto/acertos', { params: { status } })).data,
    // itens: [{ id, aprovado: bool, motivoRecusa? }]
    responderAcerto: async (id, itens) => (await api.post(`/rh/ponto/acertos/${id}/responder`, { itens })).data,
    importarPonto: async (linhas) => (await api.post('/rh/ponto/importar', { linhas })).data
};

export default funcionarioService;
