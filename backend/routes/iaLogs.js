const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const iaLogController = require('../controllers/iaLogController');

// Permissão: admin ou Pode_Ver_Analise_IA
const checkPermissao = (req, res, next) => {
    const perms = req.user?.permissoes || {};
    if (perms.admin || perms.Pode_Ver_Analise_IA) return next();
    return res.status(403).json({ error: 'Sem permissão para visualizar logs de IA.' });
};

// GET /api/ia-logs
router.get('/', authMiddleware, checkPermissao, iaLogController.listar);

module.exports = router;
