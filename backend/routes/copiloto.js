/**
 * Rotas do Clippy — assistente de ajuda do sistema (onde/como fazer cada tarefa).
 * Protegidas por authMiddleware (aplicado no index.js). Disponível a todo usuário
 * logado; o mapa de telas é filtrado pelas permissões de cada um.
 */

const express = require('express');
const router = express.Router();
const copilotoService = require('../services/copilotoService');
const ai = require('../services/aiProvider');

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
        const data = await copilotoService.responderAjuda({
            pergunta,
            historico: Array.isArray(historico) ? historico : [],
            perms: req.user?.permissoes || {},
        });
        res.json(data);
    } catch (error) {
        console.error('[copiloto] Erro chat:', error.message);
        res.status(error.statusCode || 500).json({ error: 'Falha ao responder.', detalhe: error.message });
    }
});

module.exports = router;
