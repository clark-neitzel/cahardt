const express = require('express');
const router = express.Router();
const clienteInsightController = require('../controllers/clienteInsightController');

// Somente ADMIN
// /api/insights/clientes/:clienteId
router.get('/clientes/:clienteId', clienteInsightController.getInsightPorCliente);
router.post('/clientes/:clienteId/recalcular', clienteInsightController.recalcularInsightManualmente);
router.post('/clientes/:clienteId/gerar-ia', clienteInsightController.gerarOrientacaoIAManual);

// Recalcula todos os clientes de um dia de rota específico
// POST /api/insights/recalcular-dia/SEG
router.post('/recalcular-dia/:diaSigla', clienteInsightController.recalcularPorDia);

module.exports = router;
