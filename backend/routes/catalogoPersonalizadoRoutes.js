const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogoPersonalizadoController');

// Todas privadas — o authMiddleware é aplicado no index.js ao montar esta rota.
router.post('/', ctrl.gerar);          // gerar catálogo personalizado (snapshot + token)
router.get('/', ctrl.listarMeus);      // meus catálogos gerados
router.delete('/:id', ctrl.arquivar);  // arquivar (status REMOVIDO)

module.exports = router;
