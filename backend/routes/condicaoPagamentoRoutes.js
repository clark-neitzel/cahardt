const express = require('express');
const router = express.Router();
const condicaoPagamentoController = require('../controllers/condicaoPagamentoController');

router.get('/', condicaoPagamentoController.listar);

module.exports = router;
