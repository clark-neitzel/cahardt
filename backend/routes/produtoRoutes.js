const express = require('express');
const router = express.Router();
const produtoController = require('../controllers/produtoController');
const upload = require('../middlewares/uploadMiddleware');

router.get('/categorias-ca', produtoController.categoriasCA);
router.get('/', produtoController.listar);
router.get('/:id', produtoController.detalhar);
router.put('/:id', produtoController.atualizar); // Atualizar Produto
router.patch('/:id/status', produtoController.alterarStatus);

// Rotas de Imagem
router.post('/:id/imagens', upload.array('imagens', 5), produtoController.uploadImagem);
router.delete('/imagens/:id', produtoController.removerImagem);
router.patch('/:id/imagens/:imagemId/principal', produtoController.definirPrincipal);

module.exports = router;
