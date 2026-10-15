import api from './api';

const inadimplenciaService = {
    // Regras de "Venda a inadimplente" (qualquer logado lê; só admin grava)
    getConfig: async () => (await api.get('/inadimplencia/config')).data,
    salvarConfig: async (parcial) => (await api.put('/inadimplencia/config', parcial)).data,
    historico: async () => (await api.get('/inadimplencia/config/historico')).data,
};

export default inadimplenciaService;
