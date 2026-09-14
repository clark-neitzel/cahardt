// Router isolado para GET /api/pedidos/ultimo-pedido — ver backend/services/pedidoRepetirService.js.
// Montado em backend/index.js ANTES de pedidoRoutes (que tem GET /:id, e capturaria
// "ultimo-pedido" como um id se viesse depois).

const express = require('express');
const router = express.Router();
const pedidoRepetirService = require('../services/pedidoRepetirService');

// GET /api/pedidos/ultimo-pedido?clienteId=<uuid>
router.get('/ultimo-pedido', async (req, res) => {
    const { clienteId } = req.query;

    if (!clienteId) {
        return res.status(400).json({ error: 'clienteId é obrigatório.' });
    }

    try {
        const pedido = await pedidoRepetirService.ultimoPedido(clienteId);
        res.json({ pedido });
    } catch (error) {
        console.error('[pedidoRepetirRoutes] Erro ao buscar último pedido:', error);
        res.status(500).json({ error: 'Erro ao buscar último pedido.' });
    }
});

module.exports = router;
