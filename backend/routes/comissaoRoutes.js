const express = require('express');
const router = express.Router();
const comissaoController = require('../controllers/comissaoController');
const verificarAuth = require('../middlewares/authMiddleware');

router.use(verificarAuth);

// GET  /api/comissoes/config?mesReferencia=YYYY-MM
router.get('/config', comissaoController.listarConfigs);

// POST /api/comissoes/config
router.post('/config', comissaoController.salvarConfig);

// GET  /api/comissoes/apuracao?mesReferencia=YYYY-MM[&vendedorId=xxx]
router.get('/apuracao', comissaoController.apurar);

module.exports = router;
