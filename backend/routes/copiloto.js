/**
 * Rotas do Clippy — assistente de ajuda do sistema (onde/como fazer cada tarefa).
 * Protegidas por authMiddleware (aplicado no index.js). Disponível a todo usuário
 * logado; o mapa de telas é filtrado pelas permissões de cada um.
 * Exceção: a chave Pode_Ver_Clippy === false (Admin → Usuários → Permissões) desliga o
 * assistente para aquele usuário (403 em /status e /chat). Chave ausente = liberado.
 * Vale para todos, inclusive administrador (o dono pode desligar para si). Regra espelhada no App.jsx.
 */

const express = require('express');
const router = express.Router();
const copilotoService = require('../services/copilotoService');
const ai = require('../services/aiProvider');

// Trava por usuário: só `=== false` desliga (ausente libera); vale também para administrador.
router.use((req, res, next) => {
    const perms = req.user?.permissoes;
    if (perms?.Pode_Ver_Clippy === false) {
        return res.status(403).json({ error: 'Assistente desativado para este usuário.' });
    }
    next();
});

// GET /api/copiloto/status — IA configurada? qual provider/modelo?
router.get('/status', (req, res) => {
    res.json({
        disponivel: ai.isConfigured(),
        provider: ai.providerAtual(),
        modelo: ai.modeloAtual(),
    });
});

// POST /api/copiloto/chat — { pergunta, historico?: [{role, content}] }
router.post('/chat', async (req, res) => {
    try {
        const { pergunta, historico } = req.body || {};
        const perms = req.user?.permissoes || {};
        if (req.user?.id) {
            try {
                const lim = await require('../services/chatLukeService').checarLimiteDuvidas(req.user.id, perms);
                if (!lim.ok) {
                    return res.status(429).json({
                        error: `Você usou as ${lim.limite} dúvidas de hoje. Volta amanhã ou fale com o administrador.`,
                        codigo: 'AJUDA_LIMITE_DIA',
                        limite: lim.limite,
                        usadas: lim.usadas,
                    });
                }
            } catch (eLim) {
                console.error('[copiloto] falha ao conferir limite diário de dúvidas (segue sem bloquear):', eLim.message);
            }
        }
        const data = await copilotoService.responderAjuda({
            pergunta,
            historico: Array.isArray(historico) ? historico : [],
            perms,
            usuarioId: req.user?.id || null,
            usuarioNome: req.user?.nome || null,
        });
        res.json(data);
    } catch (error) {
        console.error('[copiloto] Erro chat:', error.message);
        res.status(error.statusCode || 500).json({ error: 'Falha ao responder.', detalhe: error.message });
    }
});

module.exports = router;
