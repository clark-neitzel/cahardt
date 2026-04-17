const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');

// IMPORTANTE: rotas fixas devem vir ANTES de /:id para não ser capturado como parâmetro
router.get('/hoje', atendimentoController.listarHojeVendedor);
router.get('/hoje-todos', atendimentoController.listarHojeTodos);
router.get('/filtros', atendimentoController.listarComFiltros);
router.get('/pendencias-rota', atendimentoController.buscarPendenciasRota);
router.get('/transferidos', atendimentoController.listarTransferidos);
router.get('/alertas-ativos', atendimentoController.listarAlertasAtivos);
router.post('/', atendimentoController.registrar);
router.patch('/:id/alerta-visto', atendimentoController.marcarAlertaVisto);
router.patch('/:id/finalizar-transferencia', atendimentoController.finalizarTransferencia);
router.patch('/:id/transferencia-vista', atendimentoController.marcarTransferenciaVista);
router.get('/transferencias-resolvidas', atendimentoController.listarTransferenciasResolvidas);
router.get('/lead/:leadId', atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', atendimentoController.listarPorCliente);

module.exports = router;
