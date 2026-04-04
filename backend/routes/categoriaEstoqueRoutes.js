const express = require('express');
const router = express.Router();
const categoriaEstoqueService = require('../services/categoriaEstoqueService');

// GET /api/categorias-estoque — lista todas com flag controlaEstoque
router.get('/', async (req, res) => {
    try {
        const lista = await categoriaEstoqueService.listarComProdutos();
        return res.json(lista);
    } catch (err) {
        console.error('[CategoriasEstoque] Erro ao listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/categorias-estoque/:nome — ativa/desativa controle de estoque
router.patch('/:nome', async (req, res) => {
    try {
        const permissoes = req.user?.permissoes || {};
        if (!permissoes.admin) return res.status(403).json({ error: 'Apenas administradores.' });

        const { controlaEstoque } = req.body;
        if (typeof controlaEstoque !== 'boolean') {
            return res.status(400).json({ error: 'controlaEstoque deve ser true ou false.' });
        }

        const resultado = await categoriaEstoqueService.salvar(
            decodeURIComponent(req.params.nome),
            controlaEstoque
        );
        return res.json(resultado);
    } catch (err) {
        console.error('[CategoriasEstoque] Erro ao salvar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
