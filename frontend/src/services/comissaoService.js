import api from './api';

export const comissaoService = {
    listarConfigs: (mesReferencia) =>
        api.get('/comissoes/config', { params: { mesReferencia } }).then(r => r.data),

    salvarConfig: (dados) =>
        api.post('/comissoes/config', dados).then(r => r.data),

    apurar: (mesReferencia, vendedorId) =>
        api.get('/comissoes/apuracao', { params: { mesReferencia, vendedorId } }).then(r => r.data),
};
