const express = require('express');
const router = express.Router();
const categoriaProdutoService = require('../services/categoriaProdutoService');

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

router.post('/', async (req, res) => {
    try {
        const categoria = await categoriaProdutoService.criar(req.body);
        res.status(201).json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const categoria = await categoriaProdutoService.atualizar(id, req.body);
        res.json(categoria);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await categoriaProdutoService.deletar(id);
        res.status(204).send();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
