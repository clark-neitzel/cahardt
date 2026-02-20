const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

// Buscar histórico/último preço
router.get('/ultimo-preco', pedidoController.obterUltimoPreco);

// Listagem de Pedidos
router.get('/', pedidoController.listar);

// Detalhes de um pedido
router.get('/:id', pedidoController.detalhar);

// Criar Novo Pedido
router.post('/', pedidoController.criar);

// Editar Pedido (Apenas ABERTO)
router.put('/:id', pedidoController.atualizar);

// Excluir Pedido Existente (Apenas Rascunho/ABERTO/ERRO)
router.delete('/:id', pedidoController.excluir);

module.exports = router;
