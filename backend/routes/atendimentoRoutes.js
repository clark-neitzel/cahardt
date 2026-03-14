const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');

// IMPORTANTE: rotas fixas devem vir ANTES de /:id para não ser capturado como parâmetro
router.get('/hoje', atendimentoController.listarHojeVendedor);
router.get('/transferidos', atendimentoController.listarTransferidos);
router.get('/alertas-ativos', atendimentoController.listarAlertasAtivos);
router.post('/', atendimentoController.registrar);
router.patch('/:id/alerta-visto', atendimentoController.marcarAlertaVisto);
router.get('/lead/:leadId', atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', atendimentoController.listarPorCliente);

module.exports = router;
