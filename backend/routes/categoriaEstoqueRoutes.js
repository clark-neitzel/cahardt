const express = require('express');
const router = express.Router();
const categoriaEstoqueService = require('../services/categoriaEstoqueService');
const prisma = require('../config/database');

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

// GET /api/categorias-estoque/:nome/impacto — quantos produtos a categoria tem.
// Existe para a confirmação de "desligar o Vende" não ter que contar pelo
// GET /produtos?categorias=<nome>: lá o nome é quebrado por vírgula (categoria
// com vírgula no nome contaria errado) e a contagem inclui produtos INATIVOS,
// que já não aparecem em lugar nenhum e inflam o número mostrado ao usuário.
// Aqui o nome é comparado por igualdade EXATA (canonizado) e os dois números
// vêm separados, para a tela mostrar o que faz sentido.
router.get('/:nome/impacto', async (req, res) => {
    try {
        const nome = await categoriaEstoqueService.canonizarNome(decodeURIComponent(req.params.nome));
        if (!nome) return res.status(400).json({ error: 'Informe o nome da categoria.' });

        const [produtosAtivos, produtosTotal] = await Promise.all([
            prisma.produto.count({ where: { categoria: nome, ativo: true } }),
            prisma.produto.count({ where: { categoria: nome } })
        ]);
        return res.json({ nome, produtosAtivos, produtosTotal });
    } catch (err) {
        console.error('[CategoriasEstoque] Erro ao medir impacto:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/categorias-estoque/:nome — ativa/desativa controle de estoque, flex e "vende"
router.patch('/:nome', async (req, res) => {
    try {
        const permissoes = req.user?.permissoes || {};
        if (!permissoes.admin) return res.status(403).json({ error: 'Apenas administradores.' });

        const { controlaEstoque, contabilizaFlex, vendavel } = req.body;
        if (controlaEstoque !== undefined && typeof controlaEstoque !== 'boolean') {
            return res.status(400).json({ error: 'controlaEstoque deve ser true ou false.' });
        }
        if (contabilizaFlex !== undefined && typeof contabilizaFlex !== 'boolean') {
            return res.status(400).json({ error: 'contabilizaFlex deve ser true ou false.' });
        }
        if (vendavel !== undefined && typeof vendavel !== 'boolean') {
            return res.status(400).json({ error: 'vendavel deve ser true ou false.' });
        }

        const resultado = await categoriaEstoqueService.salvar(
            decodeURIComponent(req.params.nome),
            controlaEstoque,
            contabilizaFlex,
            vendavel
        );
        return res.json(resultado);
    } catch (err) {
        console.error('[CategoriasEstoque] Erro ao salvar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
