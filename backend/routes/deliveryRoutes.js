const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/deliveryController');

// Config (admin)
router.get('/config/categorias', ctrl.listarCategorias);
router.patch('/config/categorias/:nome', ctrl.salvarCategoria);
router.get('/config/permissoes', ctrl.listarPermissoes);
router.put('/config/permissoes/:vendedorId', ctrl.salvarPermissao);

// Permissão do usuário atual
router.get('/me', ctrl.minhaPermissao);

// Diagnóstico
router.get('/debug/:numeroOuId', ctrl.diagnosticar);

// Kanban
router.get('/pedidos', ctrl.listarPedidos);
router.patch('/pedidos/:pedidoId/etapa', ctrl.moverEtapa);

module.exports = router;
