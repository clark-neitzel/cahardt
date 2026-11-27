// /api/chat-luke — chat do usuário com o Luke (BPO financeiro). JWT de usuário HUMANO (authMiddleware no index.js).
//
//   GET  /resumo                  contador do mascote: não lidas (+ pendentes de autorização para admin)
//   GET  /conversa                abre/cria a conversa do usuário + últimas mensagens + saldo do dia
//   GET  /mensagens               ?antesDe=<criadoEm>&limit  (histórico)  |  ?depoisDe=<cursor>  (polling de novas e de mudança de estado)
//   POST /mensagens               multipart (texto + arquivos[]) OU JSON; header Idempotency-Key (gerado no aparelho)
//   POST /lida                    { ate? } marca como lido
//   GET  /nao-lidas
//   GET  /anexos/:id              binário (só o dono da conversa; nosniff; sem cache)
//   --- só administrador ---
//   GET/PUT /config               agente que atende, kill switch (ativo) e limites padrão
//   GET/PUT/DELETE /limites[/:usuarioId]   limite diário individual
//
// Permissão: Pode_Usar_Chat_Luke === true ou admin === true. Token de agente nunca chega aqui (a política do agente bloqueia a
// família /api/chat-luke) e o router ainda recusa req.user.agente. Anexo do chat NÃO abre por /api/anexos (routes/anexos.js bloqueia).
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const router = express.Router();
const anexoService = require('../services/anexoService');
const chat = require('../services/chatLukeService');
const luke = require('../services/lukeWebhookService');
const prisma = require('../config/database');

const { ChatErro } = chat;

function tratar(res, e, msg) {
    if (e instanceof ChatErro) return res.status(e.status).json({ error: e.message, codigo: e.codigo, ...(e.extra || {}) });
    if (e instanceof anexoService.AnexoErro) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
    console.error('[ChatLuke]', msg, e && e.message);
    return res.status(500).json({ error: msg, codigo: 'ERRO_INTERNO' });
}

const usuarioDe = (req) => ({ id: req.user.id, nome: req.user.nome || null });
const permsDe = (req) => req.user?.permissoes || {};

function soHumano(req, res, next) {
    if (req.user?.agente === true) return res.status(403).json({ error: 'O agente de IA não usa este caminho.', codigo: 'AGENTE_BLOQUEADO' });
    next();
}
function exigirAdmin(req, res, next) {
    if (permsDe(req).admin !== true) return res.status(403).json({ error: 'Somente administrador.', codigo: 'SEM_PERMISSAO' });
    next();
}
function exigirPermissao(req, res, next) {
    if (!chat.podeUsar(permsDe(req))) return res.status(403).json({ error: 'Sem permissão para usar o chat do Luke.', codigo: 'SEM_PERMISSAO' });
    next();
}
async function exigirAtivo(req, res, next) {
    try { await chat.exigirAtivo(); next(); } catch (e) { tratar(res, e, 'Erro ao conferir o chat.'); }
}

router.use(soHumano);

// ───────────── administração (admin humano) ─────────────
router.get('/config', exigirAdmin, async (req, res) => {
    try {
        const cfg = await chat.lerConfig({ fresco: true });
        let agenteNome = null;
        if (cfg.agenteId) {
            const v = await prisma.vendedor.findUnique({ where: { id: cfg.agenteId }, select: { nome: true } });
            agenteNome = v ? v.nome : null;
        }
        res.json({ ...cfg, agenteNome, padraoLimites: chat.PADRAO_LIMITES, webhook: luke.estadoPublico() });
    } catch (e) { tratar(res, e, 'Erro ao ler a configuração do chat.'); }
});

router.put('/config', exigirAdmin, async (req, res) => {
    try {
        const cfg = await chat.salvarConfig(req.body || {}, usuarioDe(req));
        res.json({ ok: true, ...cfg });
    } catch (e) { tratar(res, e, 'Erro ao salvar a configuração do chat.'); }
});

router.get('/limites', exigirAdmin, async (req, res) => {
    try { res.json({ data: await chat.listarLimites(), padrao: (await chat.lerConfig({ fresco: true })).limites }); }
    catch (e) { tratar(res, e, 'Erro ao listar os limites.'); }
});

router.put('/limites/:usuarioId', exigirAdmin, async (req, res) => {
    try { res.json({ ok: true, limite: await chat.salvarLimite(req.params.usuarioId, req.body || {}, usuarioDe(req)) }); }
    catch (e) { tratar(res, e, 'Erro ao salvar o limite.'); }
});

router.delete('/limites/:usuarioId', exigirAdmin, async (req, res) => {
    try { res.json({ ok: true, ...(await chat.removerLimite(req.params.usuarioId, usuarioDe(req))) }); }
    catch (e) { tratar(res, e, 'Erro ao remover o limite.'); }
});

// ───────────── uso do chat ─────────────
router.use(exigirPermissao);

// mascote: responde 200 mesmo com o chat desligado (ativo:false), para o contador simplesmente sumir
router.get('/resumo', async (req, res) => {
    try { res.json(await chat.resumo(usuarioDe(req), permsDe(req))); }
    catch (e) { tratar(res, e, 'Erro ao ler o resumo do chat.'); }
});

router.use(exigirAtivo);

router.get('/conversa', async (req, res) => {
    try { res.json(await chat.abrirConversa(usuarioDe(req), permsDe(req))); }
    catch (e) { tratar(res, e, 'Erro ao abrir a conversa.'); }
});

router.get('/mensagens', async (req, res) => {
    try { res.json(await chat.listarDoUsuario(usuarioDe(req), permsDe(req), req.query || {})); }
    catch (e) { tratar(res, e, 'Erro ao listar as mensagens.'); }
});

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            // cria a pasta NA HORA (deploy novo pode ter apagado uploads/anexos/_tmp); sempre sob ../uploads (volume persistido)
            try { fs.mkdirSync(anexoService.TMP_DIR, { recursive: true }); cb(null, anexoService.TMP_DIR); }
            catch (e) { cb(e); }
        },
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.tmp`),
    }),
    limits: { fileSize: chat.LIMITE_ANEXO_BYTES, files: chat.MAX_ANEXOS_MENSAGEM },
});

function receberArquivos(req, res, next) {
    if (!req.is('multipart/form-data')) return next(); // mensagem só de texto pode ir em JSON
    upload.array('arquivos', chat.MAX_ANEXOS_MENSAGEM)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Há arquivo com mais de 10 MB. Reduza o arquivo e tente de novo.', codigo: 'ANEXO_GRANDE' });
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: `Envie no máximo ${chat.MAX_ANEXOS_MENSAGEM} arquivos por mensagem (campo "arquivos").`, codigo: 'LIMITE_ARQUIVOS' });
        }
        console.error('[ChatLuke] erro no upload:', err.message);
        return res.status(400).json({ error: 'Não foi possível receber o arquivo. Tente de novo.', codigo: 'UPLOAD_FALHOU' });
    });
}

router.post('/mensagens', receberArquivos, async (req, res) => {
    const arquivos = req.files || [];
    try {
        const r = await chat.enviarMensagemUsuario({
            usuario: usuarioDe(req), perms: permsDe(req),
            texto: req.body && req.body.texto, assunto: req.body && req.body.assunto,
            arquivos, chaveIdempotencia: req.get('Idempotency-Key'),
        });
        res.status(r.duplicada ? 200 : 201).json({ ok: true, duplicada: r.duplicada, mensagem: r.mensagem, avisos: r.avisos });
    } catch (e) {
        chat.apagarTemps(arquivos); // o serviço já limpa; aqui é a rede de segurança
        tratar(res, e, 'Erro ao enviar a mensagem.');
    }
});

router.post('/lida', async (req, res) => {
    try { res.json(await chat.marcarLida(usuarioDe(req), req.body && req.body.ate)); }
    catch (e) { tratar(res, e, 'Erro ao marcar como lido.'); }
});

router.get('/nao-lidas', async (req, res) => {
    try { res.json({ naoLidas: await chat.naoLidas(req.user.id) }); }
    catch (e) { tratar(res, e, 'Erro ao contar as não lidas.'); }
});

router.get('/anexos/:id', async (req, res) => {
    try {
        const a = await chat.anexoDoUsuario(req.user.id, req.params.id);
        chat.entregarAnexo(res, a);
    } catch (e) { tratar(res, e, 'Erro ao abrir o anexo.'); }
});

module.exports = router;
