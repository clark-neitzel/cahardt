const express = require('express');
const router = express.Router();
const veiculoController = require('../controllers/veiculoController');
const authMiddleware = require('../middlewares/authMiddleware');

// Rotas públicas (para vendedores listarem ao iniciar o dia)
router.get('/', authMiddleware, veiculoController.listarAtivos);
router.get('/:id', authMiddleware, veiculoController.obterPorId);

// Rotas Administrativas (apenas quem gerencia)
router.get('/admin/todos', authMiddleware, veiculoController.listarTodos);
router.post('/', authMiddleware, veiculoController.criar);
router.put('/:id', authMiddleware, veiculoController.atualizar);
router.delete('/:id', authMiddleware, veiculoController.excluir);

module.exports = router;
