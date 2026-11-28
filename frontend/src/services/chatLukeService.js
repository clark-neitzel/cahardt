import api from './api';

// Chat do Luke (BPO financeiro). Rotas em backend/routes/chatLukeRoutes.js.
// Exigem Pode_Usar_Chat_Luke === true ou admin. A conversa é UMA por usuário.
const d = (r) => r.data;

const chatLukeService = {
    // { ativo, conectado, naoLidas, pendentesAutorizacao } — responde 200 mesmo com o chat desligado (ativo:false)
    resumo: () => api.get('/chat-luke/resumo').then(d),
    // abre/cria a conversa: { conversa, conectado, ativo, admin, saldo, mensagens, cursor, temMais }
    abrirConversa: () => api.get('/chat-luke/conversa').then(d),
    // ?depoisDe=<cursor> (polling: novas E mudança de estado) | ?antesDe=<criadoEm> (histórico) → { mensagens, cursor, temMais }
    mensagens: (params) => api.get('/chat-luke/mensagens', { params }).then(d),
    // multipart: texto + assunto + arquivos[] (campo "arquivos"). `chave` = Idempotency-Key gerada NO APARELHO;
    // repetir o envio com a MESMA chave não grava de novo (200 duplicada:true).
    enviar: ({ texto, assunto, arquivos = [], chave }) => {
        const form = new FormData();
        if (texto) form.append('texto', texto);
        if (assunto) form.append('assunto', assunto);
        arquivos.forEach((f) => form.append('arquivos', f, f.name));
        return api.post('/chat-luke/mensagens', form, {
            headers: { 'Content-Type': 'multipart/form-data', ...(chave ? { 'Idempotency-Key': chave } : {}) },
            timeout: 120000, // foto na rua (4G fraco) demora; o padrão do axios não tem limite, mas não deixamos pendurar
        }).then(d);
    },
    marcarLida: (ate) => api.post('/chat-luke/lida', ate ? { ate } : {}).then(d),
    // ── só administrador (tela Admin → Agentes de IA → cartão "Chat do Luke") ──
    // { agenteId, ativo, limites:{pedidosDia,anexosDia,duvidasDia}, agenteNome, padraoLimites, webhook:{ligado,modo,urlConfigurada,segredoConfigurado} }
    lerConfig: () => api.get('/chat-luke/config').then(d),
    // merge no servidor: manda só o que mudou ({ ativo } | { agenteId } | { limites })
    salvarConfig: (corpo) => api.put('/chat-luke/config', corpo).then(d),
    // binário do anexo (JWT vai no header, então <img src> direto NÃO funciona): devolve Blob
    anexo: (id) => api.get(`/chat-luke/anexos/${encodeURIComponent(id)}`, { responseType: 'blob' }).then(d),
};

export default chatLukeService;

// Idempotency-Key: 1 a 100 caracteres visíveis, sem espaço. randomUUID quando existe; senão um sorteio com hora.
export function novaChaveEnvio() {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch { /* cai no plano B */ }
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

// Mensagem legível de um erro do chat (nunca "undefined"). `codigo` ajuda a decidir o que a tela faz.
export function erroDoChat(e, padrao = 'Não foi possível enviar. Tente de novo.') {
    const dados = e?.response?.data;
    const status = e?.response?.status;
    const codigo = dados?.codigo || null;
    let mensagem;
    if (!e?.response) mensagem = 'Sem conexão. Sua mensagem não foi enviada.';
    else if (status === 413 && !dados?.error) mensagem = 'O arquivo é grande demais (máximo 10 MB). Reduza e tente de novo.';
    else mensagem = dados?.error || padrao;
    return { mensagem, codigo, status: status || 0, semRede: !e?.response, limite: dados?.limite, usados: dados?.usados };
}
