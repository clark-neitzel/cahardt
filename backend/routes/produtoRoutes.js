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
router.get('/:id', produtoController.detalhar);

// Escrita (somente admin/produtos)
router.put('/:id', exigeAdmin, produtoController.atualizar);
router.patch('/:id/status', exigeAdmin, produtoController.alterarStatus);

// Imagens (somente admin/produtos)
router.post('/:id/imagens', exigeAdmin, upload.array('imagens', 5), produtoController.uploadImagem);
router.delete('/imagens/:id', exigeAdmin, produtoController.removerImagem);
router.patch('/:id/imagens/reordenar', exigeAdmin, produtoController.reordenarImagens);
router.patch('/:id/imagens/:imagemId/principal', exigeAdmin, produtoController.definirPrincipal);

module.exports = router;
