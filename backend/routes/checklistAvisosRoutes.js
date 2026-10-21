// Config dos avisos de WhatsApp do checklist de veículo. Montado em /api/checklists-veiculo/config/avisos
// (ANTES do router principal, para não cair em /:id). Só administrador.
const express = require('express');
const router = express.Router();
const avisos = require('../services/checklistAvisosService');

const soAdmin = (req, res, next) => {
    const p = req.user?.permissoes;
    const perms = typeof p === 'string' ? (() => { try { return JSON.parse(p); } catch { return {}; } })() : (p || {});
    if (perms.admin !== true) {
        return res.status(403).json({ error: 'Só administrador mexe nos avisos do checklist.', codigo: 'SEM_PERMISSAO' });
    }
    next();
};

const rota = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
        if (e instanceof avisos.ErroAvisos) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
        console.error('[ChecklistAvisos] erro inesperado:', e);
        res.status(500).json({ error: 'Erro interno ao processar os avisos.', codigo: 'ERRO_INTERNO' });
    }
};

router.get('/', soAdmin, rota(async (req, res) => { res.json(await avisos.obterConfig()); }));
router.put('/', soAdmin, rota(async (req, res) => { res.json(await avisos.salvarConfig(req.body)); }));
router.post('/testar', soAdmin, rota(async (req, res) => { res.json(await avisos.testar(req.user)); }));

module.exports = router;
