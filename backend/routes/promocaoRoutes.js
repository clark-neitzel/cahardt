const express = require('express');
const router = express.Router();
const promocaoController = require('../controllers/promocaoController');
const authMiddleware = require('../middlewares/authMiddleware');
// Mesma regra das rotas de escrita de /api/produtos (admin OU produtos.edit)
const { exigeEdicaoProdutos } = require('../middlewares/permissaoProdutos');

// Todas as rotas exigem autenticação
router.use(authMiddleware);

// Listar histórico de promoções de um produto
router.get('/', promocaoController.listarPorProduto);

// Buscar promoção atualmente ativa para produto (pelo período)
router.get('/ativa', promocaoController.buscarAtiva);

// Buscar TODAS as promoções ativas em lote (1 query só, para o NovoPedido)
router.get('/ativas-lote', promocaoController.buscarAtivasLote);

// ESCRITA — exige admin OU produtos.edit.
// Promoção define o PREÇO com que o produto sai no pedido (NovoPedido.jsx usa
// promoAtiva.precoPromocional como preço-base), então criar/encerrar promoção é
// mexer no preço da empresa: mesma trava do cadastro de produto. Até 09/2026
// qualquer usuário logado podia criar promoção — inclusive quem só tinha leitura
// em Produtos, ou nem isso.
// A LEITURA acima continua aberta de propósito: o vendedor precisa ver o preço
// promocional para montar o pedido, e o catálogo/pedido consultam essas rotas.

// Criar nova promoção
router.post('/', exigeEdicaoProdutos, promocaoController.criar);

// Encerrar promoção com auditoria
router.post('/:id/encerrar', exigeEdicaoProdutos, promocaoController.encerrar);

module.exports = router;
