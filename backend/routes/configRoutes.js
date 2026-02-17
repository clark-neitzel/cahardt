const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');

// Rotas de Configuração
router.get('/', configController.get);
router.get('/categorias', configController.getCategorias);
router.get('/:key', configController.get);
router.post('/:key', configController.save); // Pode ser PUT também, mas Controller usa upsert

module.exports = router;
