// /api/agentes-webhook — log e reenvio do webhook de saída para o Luke. SOMENTE admin humano.
// O prefixo `agentes-webhook` casa com o bloqueio FIXO `^/api/agentes` da política do agente: o token cah_ag_ nunca chega aqui,
// e este router ainda recusa req.user.agente. Nunca devolve URL nem segredo (só booleanos em `webhook`).
const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const luke = require('../services/lukeWebhookService');

const router = express.Router();

function exigirAdminHumano(req, res, next) {
    if (req.user?.agente === true || req.user?.permissoes?.admin !== true) {
        return res.status(403).json({ error: 'Apenas administradores podem ver o webhook do Luke.', codigo: 'SEM_PERMISSAO' });
    }
    next();
}

router.use(authMiddleware, exigirAdminHumano);

function tratar(res, e, msg) {
    if (e && e.status) return res.status(e.status).json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) });
    console.error('[LukeWebhook admin]', msg, e && e.message);
    return res.status(500).json({ error: msg });
}

// GET /api/agentes-webhook/eventos?status=&tipo=&solicitacaoId=&conversaId=&page=&limit=
router.get('/eventos', async (req, res) => {
    try { res.json(await luke.listar(req.query || {})); }
    catch (e) { tratar(res, e, 'Erro ao listar os eventos do webhook.'); }
});

// POST /api/agentes-webhook/eventos/:id/reenviar — mesmo eventoId; só sai com o webhook ligado
router.post('/eventos/:id/reenviar', async (req, res) => {
    try {
        const item = await luke.reenviar(req.params.id);
        // auditoria fora do fluxo principal: falha de log nunca desfaz o reenvio
        try {
            await prisma.auditLog.create({
                data: {
                    acao: 'LUKE_WEBHOOK_REENVIADO', entidade: 'LukeWebhookEvento', entidadeId: String(item.id),
                    detalhes: JSON.stringify({ eventoId: item.id, tipo: item.tipo, solicitacaoId: item.solicitacaoId, conversaId: item.conversaId, mensagemId: item.mensagemId }),
                    usuarioId: String(req.user.id), usuarioNome: String(req.user.nome || 'admin'),
                },
            });
        } catch (e) { console.error('[LukeWebhook admin] reenvio feito, mas falhou a auditoria:', e.message); }
        res.json({ ok: true, evento: item });
    } catch (e) { tratar(res, e, 'Erro ao reenviar o evento.'); }
});

module.exports = router;
