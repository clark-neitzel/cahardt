const express = require('express');
const router = express.Router();
const pcpSugestaoService = require('../services/pcpSugestaoService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.sugestoes;
}

// GET /api/pcp/sugestoes — listar sugestões
router.get('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { status } = req.query;
        const sugestoes = await pcpSugestaoService.listar({ status });
        return res.json(sugestoes);
    } catch (err) {
        console.error('[PCP Sugestões] Erro listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/sugestoes/gerar — rodar análise e gerar sugestões
router.post('/gerar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const resultado = await pcpSugestaoService.gerarSugestoes();
        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Sugestões] Erro gerar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/pcp/sugestoes/:id/aceitar — aceitar (gera OP)
router.patch('/:id/aceitar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const resultado = await pcpSugestaoService.aceitar(req.params.id, req.user?.id);
        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Sugestões] Erro aceitar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/sugestoes/:id/rejeitar
router.patch('/:id/rejeitar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const sugestao = await pcpSugestaoService.rejeitar(req.params.id);
        return res.json(sugestao);
    } catch (err) {
        console.error('[PCP Sugestões] Erro rejeitar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// GET /api/pcp/sugestoes/dashboard — KPIs
router.get('/dashboard', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!(permissoes.admin || !!permissoes.pcp)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const kpis = await pcpSugestaoService.dashboardKpis();
        return res.json(kpis);
    } catch (err) {
        console.error('[PCP Dashboard] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
