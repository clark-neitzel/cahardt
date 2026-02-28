const express = require('express');
const router = express.Router();
const promocaoController = require('../controllers/promocaoController');
const authMiddleware = require('../middlewares/authMiddleware');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// Listar histórico de promoções de um produto
router.get('/', promocaoController.listarPorProduto);

// Buscar promoção atualmente ativa para produto (pelo período)
router.get('/ativa', promocaoController.buscarAtiva);

// Buscar TODAS as promoções ativas em lote (1 query só, para o NovoPedido)
router.get('/ativas-lote', promocaoController.buscarAtivasLote);

// Criar nova promoção
router.post('/', promocaoController.criar);

// Encerrar promoção com auditoria
router.post('/:id/encerrar', promocaoController.encerrar);

module.exports = router;
