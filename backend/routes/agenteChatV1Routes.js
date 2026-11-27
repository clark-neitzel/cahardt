// /api/agente/v1/chat — o que o Luke (token cah_ag_) alcança do chat. Montado no index.js ANTES de /api/agente/v1, com authMiddleware.
//
//   GET  /conversas                              ?atualizadasDepois=<ISO>&limit (padrão 50, máx. 200)
//   GET  /conversas/:id                          cabeçalho + as 50 mensagens mais recentes (?depoisDe|antesDe&limit para paginar)
//   GET  /conversas/:id/mensagens                ?depoisDe=<criadoEm ISO>|antesDe&limit — com anexos (metadados + url relativa)
//   GET  /anexos/:id                             binário (token no header; nunca na URL)
//   POST /conversas/:id/mensagens                { texto (até 8000), solicitacaoIds?, respondeA?, status? } + Idempotency-Key -> 201
//
// A política do agente libera todo GET de /api/agente/v1 a QUALQUER agente e o POST desta rota por regra exata; por isso este
// router exige que o token seja do agente CONFIGURADO (AppConfig 'chat_luke'.agenteId): outro agente leva 403 AGENTE_CHAT_NAO_HABILITADO.
// JWT de pessoa nunca passa aqui. A resposta do Luke não dispara webhook (sem laço).
const express = require('express');
const chat = require('../services/chatLukeService');

const router = express.Router();
const { ChatErro } = chat;

function tratar(res, e, msg) {
    if (e instanceof ChatErro) return res.status(e.status).json({ error: e.message, codigo: e.codigo, ...(e.extra || {}) });
    console.error('[ChatLuke agente]', msg, e && e.message);
    return res.status(500).json({ error: msg, codigo: 'ERRO_INTERNO' });
}

// só token de agente (o ticket de execução de solicitação também é "agente", mas só vale para a chamada guardada)
router.use(async (req, res, next) => {
    if (req.user?.agente !== true || req.user.agenteSolicitacaoId) {
        return res.status(403).json({ error: 'Somente o agente de IA acessa esta rota (token cah_ag_ no header Authorization).', codigo: 'SOMENTE_AGENTE' });
    }
    try { await chat.agenteHabilitado(req.user.id); next(); }
    catch (e) { tratar(res, e, 'Erro ao conferir o agente do chat.'); }
});

router.get('/conversas', async (req, res) => {
    try { res.json({ data: await chat.listarConversasAgente(req.query || {}) }); }
    catch (e) { tratar(res, e, 'Erro ao listar as conversas.'); }
});

router.get('/conversas/:id', async (req, res) => {
    try { res.json(await chat.mensagensParaAgente(await chat.conversaParaAgente(req.params.id), req.query || {})); }
    catch (e) { tratar(res, e, 'Erro ao ler a conversa.'); }
});

router.get('/conversas/:id/mensagens', async (req, res) => {
    try {
        const r = await chat.mensagensParaAgente(await chat.conversaParaAgente(req.params.id), req.query || {});
        res.json({ mensagens: r.mensagens, cursor: r.cursor, temMais: r.temMais });
    } catch (e) { tratar(res, e, 'Erro ao listar as mensagens.'); }
});

router.get('/anexos/:id', async (req, res) => {
    try { chat.entregarAnexo(res, await chat.anexoParaAgente(req.params.id)); }
    catch (e) { tratar(res, e, 'Erro ao abrir o anexo.'); }
});

router.post('/conversas/:id/mensagens', async (req, res) => {
    try {
        const r = await chat.responderComoLuke({
            agente: { id: req.user.id, nome: req.user.nome }, conversaId: req.params.id,
            corpo: req.body, chaveIdempotencia: req.get('Idempotency-Key'),
        });
        res.status(r.duplicada ? 200 : 201).json({ ok: true, duplicada: r.duplicada, mensagem: r.mensagem });
    } catch (e) { tratar(res, e, 'Erro ao gravar a resposta.'); }
});

module.exports = router;
