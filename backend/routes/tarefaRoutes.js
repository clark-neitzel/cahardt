const express = require('express');
const router = express.Router();
const tarefaController = require('../controllers/tarefaController');

// Rotas específicas antes de /:id
router.get('/fila', tarefaController.listarFila);
router.get('/resumo', tarefaController.resumo);
router.get('/leads-pendentes', tarefaController.listarPendentesDeLeads);

// Rotas com :id
router.get('/:id', tarefaController.obterPorId);
router.patch('/:id/transferir', tarefaController.transferir);
router.patch('/:id/cancelar', tarefaController.cancelar);

module.exports = router;
