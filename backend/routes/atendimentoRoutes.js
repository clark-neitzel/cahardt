const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');

router.post('/', atendimentoController.registrar);
router.get('/lead/:leadId', atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', atendimentoController.listarPorCliente);

module.exports = router;
