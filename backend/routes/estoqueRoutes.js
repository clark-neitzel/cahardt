const express = require('express');
const router = express.Router();
const estoqueService = require('../services/estoqueService');
const prisma = require('../config/database');

// Verifica se o usuário tem permissão de estoque para a categoria e tipo de operação
function verificarPermissaoEstoque(permissoes, categoriasProduto, tipo) {
    if (!permissoes) return false;
    if (permissoes.admin) return true;
    const regraEstoque = permissoes.estoque;
    if (!Array.isArray(regraEstoque)) return false;

    return regraEstoque.some(regra => {
        const categoriaOk = !regra.categoria || categoriasProduto.includes(regra.categoria);
        const tipoOk = Array.isArray(regra.pode) && regra.pode.includes(tipo === 'ENTRADA' ? 'adicionar' : 'diminuir');
        return categoriaOk && tipoOk;
    });
}

// POST /api/estoque/ajuste — ajuste manual de estoque
router.post('/ajuste', async (req, res) => {
    try {
        const { produtoId, tipo, quantidade, observacao } = req.body;
        const vendedorId = req.user?.id;
        const permissoes = req.user?.permissoes || {};

        if (!produtoId || !tipo || !quantidade) {
            return res.status(400).json({ error: 'produtoId, tipo e quantidade são obrigatórios.' });
        }
        if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
            return res.status(400).json({ error: 'tipo deve ser ENTRADA ou SAIDA.' });
        }
        if (parseFloat(quantidade) <= 0) {
            return res.status(400).json({ error: 'quantidade deve ser maior que zero.' });
        }

        // Verifica permissão de estoque
        if (!permissoes.admin) {
            const produto = await prisma.produto.findUnique({
                where: { id: produtoId },
                select: { categoria: true }
            });
            const categorias = produto?.categoria ? [produto.categoria] : [];
            if (!verificarPermissaoEstoque(permissoes, categorias, tipo)) {
                return res.status(403).json({ error: 'Você não tem permissão para realizar este tipo de ajuste nesta categoria.' });
            }
        }

        const resultado = await estoqueService.ajustar({
            produtoId,
            vendedorId,
            tipo,
            quantidade: parseFloat(quantidade),
            motivo: 'AJUSTE_MANUAL',
            observacao
        });

        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro ajuste manual:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/estoque/historico — listagem de movimentações
router.get('/historico', async (req, res) => {
    try {
        const { produtoId, vendedorId, motivo, tipo, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const resultado = await estoqueService.listarMovimentacoes({
            produtoId,
            vendedorId,
            motivo,
            tipo,
            dataInicio,
            dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        return res.json(resultado);
    } catch (err) {
        console.error('[Estoque] Erro listar histórico:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/estoque/sync-produto/:produtoId — sincroniza um produto específico com o CA
router.post('/sync-produto/:produtoId', async (req, res) => {
    try {
        const produto = await prisma.produto.findUnique({
            where: { id: req.params.produtoId },
            select: { contaAzulId: true, nome: true, estoqueDisponivel: true }
        });
        if (!produto) return res.status(404).json({ error: 'Produto não encontrado.' });
        if (!produto.contaAzulId) return res.json({ sincCA: false, motivo: 'Produto sem vínculo CA.' });

        const contaAzulService = require('../services/contaAzulService');
        const resultado = await contaAzulService.syncProdutoIndividual(produto.contaAzulId);
        return res.json({ sincCA: true, estoqueDisponivel: resultado.estoqueDisponivel });
    } catch (err) {
        console.error('[Estoque] Erro sync-produto:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/estoque/permissoes — retorna o que o usuário logado pode fazer
router.get('/permissoes', async (req, res) => {
    const permissoes = req.user?.permissoes || {};
    if (permissoes.admin) {
        return res.json({ admin: true, pode: { adicionar: true, diminuir: true } });
    }
    const regraEstoque = Array.isArray(permissoes.estoque) ? permissoes.estoque : [];
    return res.json({ admin: false, regras: regraEstoque });
});

module.exports = router;
