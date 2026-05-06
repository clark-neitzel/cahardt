const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const verificarAuth = require('../middlewares/authMiddleware');

router.use((req, res, next) => {
    console.log(`[Router Metas] ${req.method} ${req.url}`);
    next();
});
router.use(verificarAuth);

// GET /api/metas?mesReferencia=2026-03
router.get('/', metaController.listarMetasPorMes);

// POST /api/metas
router.post('/', metaController.salvarMetaMensal);

// DELETE /api/metas/:id
router.delete('/:id', metaController.excluir);

// GET /api/metas/sugestao?vendedorId=xxx&fatorCrescimento=1.10
// Deve vir antes de /dashboard para não conflitar
router.get('/sugestao', metaController.obterSugestaoMeta);

// GET /api/metas/dashboard
router.get('/dashboard', metaController.obterDashboardVendedor);

module.exports = router;
