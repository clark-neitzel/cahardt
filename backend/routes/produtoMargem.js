/**
 * Produtos · Margem, Custo & Markup — rotas (somente leitura + captura manual).
 * Permissão: admin ou Pode_Acessar_Financeiro_Gerencial (dado de custo/margem).
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const produtoMargemService = require('../services/produtoMargemService');
const categoriaEstoqueService = require('../services/categoriaEstoqueService');

const getPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Acessar_Financeiro_Gerencial) return next();
        return res.status(403).json({ error: 'Sem permissão para ver margem/custo de produtos.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// GET /  ?categoria=&origem=propria|revenda|todos&meses=6
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const categoria = (req.query.categoria || '').trim() || null;
        const origem = ['propria', 'revenda', 'todos'].includes(req.query.origem) ? req.query.origem : 'todos';
        const meses = Math.min(12, Math.max(3, Number(req.query.meses) || 6));
        const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes)) ? String(req.query.mes) : null;
        const dados = await produtoMargemService.listar({ categoria, origem, meses, mes });
        res.json(dados);
    } catch (error) {
        console.error('[ProdutoMargem] Erro ao listar:', error);
        res.status(500).json({ error: 'Erro ao montar a lista de produtos.' });
    }
});

// GET /categorias — categorias de produto disponíveis (para o filtro)
router.get('/categorias', verificarAuth, checkAcesso, async (req, res) => {
    try {
        // Categorias "não vende" (imobilizado) ficam fora do menu do filtro,
        // para bater com a lista — que também não traz esses produtos.
        const naoVendaveis = new Set(await categoriaEstoqueService.nomesNaoVendaveis());
        const rows = await prisma.produto.groupBy({
            by: ['categoria'],
            where: { ativo: true, categoria: { not: null } },
            _count: { _all: true }
        });
        res.json(rows
            .filter((r) => (r.categoria || '').trim() && !naoVendaveis.has(r.categoria))
            .map((r) => ({ categoria: r.categoria, produtos: r._count._all }))
            .sort((a, b) => b.produtos - a.produtos));
    } catch (error) {
        console.error('[ProdutoMargem] Erro nas categorias:', error);
        res.status(500).json({ error: 'Erro ao listar as categorias.' });
    }
});

// GET /:produtoId/arvore?meses=6&mes=YYYY-MM — árvore de custo da ficha técnica
// (componente por componente, com a variação de cada insumo pelas compras da janela)
router.get('/:produtoId/arvore', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const meses = Math.min(12, Math.max(3, Number(req.query.meses) || 6));
        const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes)) ? String(req.query.mes) : null;
        const dados = await produtoMargemService.arvoreCusto(req.params.produtoId, meses, mes);
        if (!dados) return res.status(404).json({ error: 'Produto não encontrado.' });
        res.json(dados);
    } catch (error) {
        console.error('[ProdutoMargem] Erro na árvore de custo:', error);
        res.status(500).json({ error: 'Erro ao montar a árvore de custo.' });
    }
});

// GET /:produtoId?meses=6 — detalhe (variação no tempo + composição do custo)
router.get('/:produtoId', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const meses = Math.min(12, Math.max(3, Number(req.query.meses) || 6));
        const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes)) ? String(req.query.mes) : null;
        const dados = await produtoMargemService.detalhe(req.params.produtoId, meses, mes);
        if (!dados) return res.status(404).json({ error: 'Produto não encontrado.' });
        res.json(dados);
    } catch (error) {
        console.error('[ProdutoMargem] Erro no detalhe:', error);
        res.status(500).json({ error: 'Erro ao montar o detalhe do produto.' });
    }
});

module.exports = router;
