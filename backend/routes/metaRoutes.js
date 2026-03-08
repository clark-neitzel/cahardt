const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');

// Define middlewares
const verificarAuth = require('../middlewares/verificarAuth');
const logFunction = (req, res, next) => {
    console.log(`[Router Metas] ${req.method} ${req.url}`);
    next();
};

router.use(logFunction);
router.use(verificarAuth); // Todas as rotas de metas exigem autenticação

// ==========================================
// Rotas ADMIN (Gestão de Metas)
// ==========================================

// GET /api/metas?mesReferencia=2026-03
router.get('/', metaController.listarMetasPorMes);

// POST /api/metas
router.post('/', metaController.salvarMetaMensal);


// ==========================================
// Rotas APP VENDEDOR (Dashboard)
// ==========================================

// GET /api/metas/dashboard
router.get('/dashboard', metaController.obterDashboardVendedor);


module.exports = router;
