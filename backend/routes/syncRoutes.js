const express = require('express');
const router = express.Router();
const syncController = require('../controllers/syncController');

router.post('/produtos', syncController.sincronizarProdutos);
router.post('/clientes', syncController.sincronizarClientes);
router.post('/pedidos', syncController.sincronizarPedidos);
router.post('/tudo', syncController.sincronizarTudo);
router.get('/logs', syncController.listarLogs);
router.get('/verify', syncController.verificarSync); // New

module.exports = router;
