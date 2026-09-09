const express = require('express');
const router = express.Router();
const categoriaProdutoService = require('../services/categoriaProdutoService');
const { exigeEdicaoCategoriasProduto } = require('../middlewares/permissaoCategoriasProduto');

// O router é montado com `authMiddleware` em index.js.
// LEITURA (GET): liberada para qualquer autenticado — a lista de categorias
// alimenta filtro, catálogo, tela de produto e Site Admin do time todo.
// ESCRITA (POST/PUT/DELETE): admin ou `Pode_Editar_Categorias_Produto`.

router.get('/', async (req, res) => {
    try {
        const categorias = await categoriaProdutoService.listar();
        res.json(categorias);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaProdutoService.detalhar(id);
        if (!categoria) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        res.json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Quantos produtos usam esta categoria — o que se perde ao apagá-la.
router.get('/:id/uso', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaProdutoService.detalhar(id);
        if (!categoria) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }
        const produtos = await categoriaProdutoService.contarProdutos(id);
        res.json({ id, produtos });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/', exigeEdicaoCategoriasProduto, async (req, res) => {
    try {
        const categoria = await categoriaProdutoService.criar(req.body);
        res.status(201).json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', exigeEdicaoCategoriasProduto, async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaProdutoService.atualizar(id, req.body);
        res.json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', exigeEdicaoCategoriasProduto, async (req, res) => {
    try {
        const { id } = req.params;
        // Confirmação explícita para apagar categoria que ainda tem produtos
        // (a FK é SET NULL: sem isso, os produtos ficariam sem classificação em silêncio).
        const confirmar = req.query.confirmar === 'true' || req.query.confirmar === '1' || req.body?.confirmar === true;
        await categoriaProdutoService.deletar(id, { confirmar });
        res.status(204).send();
    } catch (error) {
        if (error.codigo === 'CATEGORIA_EM_USO') {
            return res.status(409).json({ error: error.message, codigo: error.codigo, produtosVinculados: error.produtosVinculados });
        }
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
