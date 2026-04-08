const express = require('express');
const router = express.Router();
const devolucaoService = require('../services/devolucaoService');
const uploadDevolucao = require('../middlewares/uploadDevolucaoMiddleware');

// Helper: verificar permissão
const checkPermissao = (permissao) => (req, res, next) => {
    const perms = req.user?.permissoes || {};
    if (perms.admin || perms[permissao]) return next();
    return res.status(403).json({ error: 'Sem permissão para esta ação.' });
};

// ── GET / — Listar devoluções ──
router.get('/', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const { clienteId, pedidoId, tipo, status, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const result = await devolucaoService.listar({
            clienteId, pedidoId, tipo, status, dataInicio, dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        res.json(result);
    } catch (error) {
        console.error('Erro ao listar devoluções:', error);
        res.status(500).json({ error: 'Erro ao listar devoluções.' });
    }
});

// ── GET /:id — Detalhar devolução ──
router.get('/:id', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const devolucao = await devolucaoService.detalhar(req.params.id);
        if (!devolucao) return res.status(404).json({ error: 'Devolução não encontrada.' });
        res.json(devolucao);
    } catch (error) {
        console.error('Erro ao detalhar devolução:', error);
        res.status(500).json({ error: 'Erro ao detalhar devolução.' });
    }
});

// ── POST /especial — Criar devolução de pedido especial ──
router.post('/especial', checkPermissao('Pode_Fazer_Devolucao'), async (req, res) => {
    try {
        const { pedidoId, itens, motivo, observacao } = req.body;
        if (!pedidoId || !itens?.length || !motivo) {
            return res.status(400).json({ error: 'pedidoId, itens e motivo são obrigatórios.' });
        }

        const devolucao = await devolucaoService.criarEspecial({
            pedidoId, itens, motivo, observacao,
            registradoPorId: req.user.id
        });
        res.status(201).json(devolucao);
    } catch (error) {
        console.error('Erro ao criar devolução especial:', error);
        res.status(400).json({ error: error.message });
    }
});

// ── POST /conta-azul — Criar devolução de pedido CA (com upload PDF) ──
router.post('/conta-azul', checkPermissao('Pode_Fazer_Devolucao'), uploadDevolucao.single('pdf'), async (req, res) => {
    try {
        const { pedidoId, motivo, observacao, notaDevolucaoCA } = req.body;
        let itens;
        try {
            itens = typeof req.body.itens === 'string' ? JSON.parse(req.body.itens) : req.body.itens;
        } catch {
            return res.status(400).json({ error: 'Formato inválido para itens.' });
        }

        if (!pedidoId || !itens?.length || !motivo || !notaDevolucaoCA) {
            return res.status(400).json({ error: 'pedidoId, itens, motivo e notaDevolucaoCA são obrigatórios.' });
        }

        const pdfDevolucaoUrl = req.file ? `/uploads/devolucoes/${req.file.filename}` : null;

        const devolucao = await devolucaoService.criarContaAzul({
            pedidoId, itens, motivo, observacao, notaDevolucaoCA, pdfDevolucaoUrl,
            registradoPorId: req.user.id
        });
        res.status(201).json(devolucao);
    } catch (error) {
        console.error('Erro ao criar devolução CA:', error);
        res.status(400).json({ error: error.message });
    }
});

// ── POST /:id/reverter — Reverter devolução ──
router.post('/:id/reverter', checkPermissao('Pode_Reverter_Devolucao'), async (req, res) => {
    try {
        const { motivoReversao } = req.body;
        const result = await devolucaoService.reverter({
            devolucaoId: req.params.id,
            motivoReversao,
            revertidoPorId: req.user.id
        });
        res.json(result);
    } catch (error) {
        console.error('Erro ao reverter devolução:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
