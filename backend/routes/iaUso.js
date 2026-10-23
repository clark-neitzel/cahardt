const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const iaUsoService = require('../services/iaUsoService');

// Só ADMINISTRADOR. Pode_Ver_Dashboard_Admin / gestor NÃO libera (custo da empresa).
const soAdmin = (req, res, next) => {
    if (req.user?.permissoes?.admin === true) return next();
    return res.status(403).json({ error: 'Sem permissão. Esta consulta é só para administradores.' });
};

// GET /api/ia-uso/resumo?dias=30 (máx 90) ou ?de=YYYY-MM-DD&ate=YYYY-MM-DD
router.get('/resumo', authMiddleware, soAdmin, async (req, res) => {
    try {
        res.json(await iaUsoService.resumo(req.query || {}));
    } catch (error) {
        console.error('[ia-uso] resumo:', error);
        res.status(500).json({ error: 'Falha ao montar o resumo de uso da IA.' });
    }
});

module.exports = router;
