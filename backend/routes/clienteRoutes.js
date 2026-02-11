const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const condicaoPagamentoController = require('../controllers/condicaoPagamentoController');

// Rotas para Clientes
router.get('/', clienteController.listar);
router.post('/sync', clienteController.sincronizar); // POST para ações de sync
router.get('/condicoes-pagamento', condicaoPagamentoController.listar); // Nova rota
router.get('/:uuid', clienteController.detalhar);
router.patch('/:uuid', clienteController.atualizar);

// Futuro: PATCH para atualizar dados internos (GPS, Dias, etc)

module.exports = router;
