const express = require('express');
const router = express.Router();
const tabelaPrecoController = require('../controllers/tabelaPrecoController');

// Rotas: /api/tabela-precos
router.get('/', tabelaPrecoController.listar);

module.exports = router;
