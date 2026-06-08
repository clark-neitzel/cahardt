import api from './api';

const copilotoService = {
    // IA configurada? qual provider/modelo?
    getStatus: () => api.get('/copiloto/status').then(r => r.data),

    // Pergunta de ajuda → { resposta, atalhos: [{ label, rota }] }
    perguntar: (pergunta, historico = []) =>
        api.post('/copiloto/chat', { pergunta, historico }).then(r => r.data),
};

export default copilotoService;
