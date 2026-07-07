import api from './api';

const cobrancaService = {
    painel: async () => (await api.get('/cobranca/painel')).data,

    listarConfigs: async () => (await api.get('/cobranca/configs')).data,
    criarConfig: async (dados) => (await api.post('/cobranca/configs', dados)).data,
    atualizarConfig: async (id, dados) => (await api.put(`/cobranca/configs/${id}`, dados)).data,
    excluirConfig: async (id) => (await api.delete(`/cobranca/configs/${id}`)).data,

    listarFormas: async () => (await api.get('/cobranca/formas')).data,
    listarEquipe: async () => (await api.get('/cobranca/equipe')).data,

    listarEnvios: async (filtros) => (await api.get('/cobranca/envios', { params: filtros })).data,

    executarRegua: async () => (await api.post('/cobranca/executar')).data,
    cobrarCliente: async (clienteId) => (await api.post(`/cobranca/cobrar/${clienteId}`)).data,
    preview: async (texto) => (await api.post('/cobranca/preview', { texto })).data,

    getConfigGlobal: async () => (await api.get('/cobranca/config-global')).data,
    salvarConfigGlobal: async (dados) => (await api.post('/cobranca/config-global', dados)).data,

    getCanais: async () => (await api.get('/cobranca/canais')).data,
    salvarCanalEmail: async (dados) => (await api.post('/cobranca/canais/email', dados)).data,
    testarEmail: async (para) => (await api.post('/cobranca/canais/email/testar', { para })).data,
    salvarCanalSms: async (dados) => (await api.post('/cobranca/canais/sms', dados)).data,
};

export default cobrancaService;
