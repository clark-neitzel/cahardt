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
    cartao: async (id, mes) => (await api.get(`/rh/funcionarios/${id}/cartao`, { params: { mes } })).data,

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
    importarPonto: async (linhas) => (await api.post('/rh/ponto/importar', { linhas })).data
};

export default funcionarioService;
