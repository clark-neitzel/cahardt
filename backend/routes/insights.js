const express = require('express');
const router = express.Router();
const clienteInsightController = require('../controllers/clienteInsightController');

// Somente ADMIN
// /api/insights/clientes/:clienteId
router.get('/clientes/:clienteId', clienteInsightController.getInsightPorCliente);
router.post('/clientes/:clienteId/recalcular', clienteInsightController.recalcularInsightManualmente);

module.exports = router;
