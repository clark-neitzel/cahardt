const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

// Buscar histórico/último preço
router.get('/ultimo-preco', pedidoController.obterUltimoPreco);

// Buscar histórico de compras por cliente (para novo pedido mobile)
router.get('/historico-cliente', pedidoController.historicoComprasCliente);

// Listagem de Pedidos
router.get('/', pedidoController.listar);

// Detalhes de um pedido
router.get('/:id', pedidoController.detalhar);

// Criar Novo Pedido
router.post('/', pedidoController.criar);

// Editar Pedido (Apenas ABERTO)
router.put('/:id', pedidoController.atualizar);

// Marcar Pedido como Revisado
router.put('/:id/revisado', pedidoController.marcarRevisado);

// Excluir Pedido Existente (Apenas Rascunho/ABERTO/ERRO)
router.delete('/:id', pedidoController.excluir);

module.exports = router;
