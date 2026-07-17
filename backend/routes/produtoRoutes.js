const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const upload = require('../middlewares/uploadMiddleware');

// Middleware: exige permissão 'produtos' ou admin para rotas de escrita
const exigeAdmin = (req, res, next) => {
    const permissoes = req.user?.permissoes || {};
    if (permissoes.admin || permissoes.produtos) return next();
    return res.status(403).json({ error: 'Sem permissão para gerenciar produtos.' });
};

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

// Escrita (somente admin/produtos)
// Fase 6: criar produto novo — nasce no Conta Azul primeiro, depois local
router.post('/', exigeAdmin, produtoController.criar);
router.put('/:id', exigeAdmin, produtoController.atualizar);
router.patch('/:id/status', exigeAdmin, produtoController.alterarStatus);
router.patch('/:id/custo-ca', exigeAdmin, produtoController.alterarCustoCa);

// Imagens (somente admin/produtos)
router.post('/:id/imagens', exigeAdmin, upload.array('imagens', 5), produtoController.uploadImagem);
router.delete('/imagens/:id', exigeAdmin, produtoController.removerImagem);
router.patch('/:id/imagens/reordenar', exigeAdmin, produtoController.reordenarImagens);
router.patch('/:id/imagens/:imagemId/principal', exigeAdmin, produtoController.definirPrincipal);

module.exports = router;
