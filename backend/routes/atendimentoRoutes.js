const express = require('express');
const router = express.Router();
const atendimentoController = require('../controllers/atendimentoController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.post('/', verificarToken, atendimentoController.registrar);
router.get('/lead/:leadId', verificarToken, atendimentoController.listarPorLead);
router.get('/cliente/:clienteId', verificarToken, atendimentoController.listarPorCliente);

module.exports = router;
