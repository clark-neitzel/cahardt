const express = require('express');
const router = express.Router();
const pcpOrdemService = require('../services/pcpOrdemService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.ordens;
}

function podeCancelarOrdem(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.cancelarOrdens;
}

// GET /api/pcp/ordens — listar ordens
router.get('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { status, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const resultado = await pcpOrdemService.listar({
            status, dataInicio, dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Ordens] Erro listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/ordens/:id — detalhe com consumos
router.get('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const ordem = await pcpOrdemService.buscarPorId(req.params.id);
        if (!ordem) return res.status(404).json({ error: 'Ordem não encontrada.' });
        return res.json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro buscar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/ordens — criar ordem (snapshot + consumos)
router.post('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { receitaId, quantidadePlanejada, dataPlanejada } = req.body;
        if (!receitaId || !quantidadePlanejada || !dataPlanejada) {
            return res.status(400).json({ error: 'receitaId, quantidadePlanejada e dataPlanejada são obrigatórios.' });
        }

        const ordem = await pcpOrdemService.criar({
            ...req.body,
            criadoPorId: req.user?.id
        });
        return res.status(201).json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro criar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/ordens/:id/iniciar — PLANEJADA → EM_PRODUCAO
router.patch('/:id/iniciar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const ordem = await pcpOrdemService.iniciar(req.params.id);
        return res.json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro iniciar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/ordens/:id/apontar-consumo — registrar qtd real
router.patch('/:id/apontar-consumo', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { consumos } = req.body;
        if (!Array.isArray(consumos) || consumos.length === 0) {
            return res.status(400).json({ error: 'consumos deve ser um array com ordemConsumoId e quantidadeReal.' });
        }

        const ordem = await pcpOrdemService.apontarConsumo(req.params.id, consumos);
        return res.json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro apontar consumo:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/ordens/:id/finalizar — finalizar + movimentar estoque
router.patch('/:id/finalizar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { quantidadeProduzida } = req.body;
        if (!quantidadeProduzida || parseFloat(quantidadeProduzida) <= 0) {
            return res.status(400).json({ error: 'quantidadeProduzida é obrigatória e deve ser > 0.' });
        }

        const ordem = await pcpOrdemService.finalizar(req.params.id, {
            quantidadeProduzida: parseFloat(quantidadeProduzida),
            criadoPorId: req.user?.id
        });
        return res.json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro finalizar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/ordens/:id/cancelar
router.patch('/:id/cancelar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!podeCancelarOrdem(permissoes)) return res.status(403).json({ error: 'Sem permissão para cancelar ordens.' });

        const ordem = await pcpOrdemService.cancelar(req.params.id);
        return res.json(ordem);
    } catch (err) {
        console.error('[PCP Ordens] Erro cancelar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

module.exports = router;
