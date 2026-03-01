const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');

// IMPORTANTE: /hoje deve vir ANTES de /:clienteId para não ser capturado como parâmetro
router.get('/hoje', atendimentoController.listarHojeVendedor);
router.post('/', atendimentoController.registrar);
router.get('/lead/:leadId', atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', atendimentoController.listarPorCliente);

module.exports = router;
