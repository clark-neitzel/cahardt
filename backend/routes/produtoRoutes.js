const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const upload = require('../middlewares/uploadMiddleware');

// Regra de escrita do cadastro de produtos (admin OU produtos.edit). A mesma regra
// protege as promoções — por isso ela mora em middlewares/permissaoProdutos.js.
const { exigeEdicaoProdutos } = require('../middlewares/permissaoProdutos');

// Leitura (qualquer autenticado)
router.get('/categorias-ca', produtoController.categoriasCA);
router.get('/', produtoController.listar);
router.get('/:id/ficha', produtoController.ficha);

// Fase 6: histórico de compras do produto (entradas por nota fiscal)
router.get('/:id/compras', async (req, res) => {
    try {
        const compraEstoqueService = require('../services/compraEstoqueService');
        const compras = await compraEstoqueService.historicoCompras({ produtoId: req.params.id });
        res.json(compras);
    } catch (err) {
        console.error('[Produtos] Erro histórico de compras:', err.message);
        res.status(500).json({ error: 'Erro ao buscar o histórico de compras.' });
    }
});

router.get('/:id', produtoController.detalhar);

// Escrita (exige admin OU produtos.edit — ver o middleware acima)
// Fase 6: criar produto novo — nasce no Conta Azul primeiro, depois local
router.post('/', exigeEdicaoProdutos, produtoController.criar);
router.put('/:id', exigeEdicaoProdutos, produtoController.atualizar);
router.patch('/:id/status', exigeEdicaoProdutos, produtoController.alterarStatus);
router.patch('/:id/custo-ca', exigeEdicaoProdutos, produtoController.alterarCustoCa);

// Imagens (exige admin OU produtos.edit)
router.post('/:id/imagens', exigeEdicaoProdutos, upload.array('imagens', 5), produtoController.uploadImagem);
router.delete('/imagens/:id', exigeEdicaoProdutos, produtoController.removerImagem);
router.patch('/:id/imagens/reordenar', exigeEdicaoProdutos, produtoController.reordenarImagens);
router.patch('/:id/imagens/:imagemId/principal', exigeEdicaoProdutos, produtoController.definirPrincipal);

module.exports = router;
