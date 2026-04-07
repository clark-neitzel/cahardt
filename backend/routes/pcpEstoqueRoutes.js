const express = require('express');
const router = express.Router();
const pcpEstoqueService = require('../services/pcpEstoqueService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.estoque;
}

// GET /api/pcp/estoque/posicao — posição de estoque dos itens PCP
router.get('/posicao', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { tipo, search, apenasAbaixoMinimo } = req.query;
        const itens = await pcpEstoqueService.posicao({ tipo, search, apenasAbaixoMinimo });
        return res.json(itens);
    } catch (err) {
        console.error('[PCP Estoque] Erro posição:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/estoque/ajuste — ajuste manual de estoque PCP
router.post('/ajuste', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { itemPcpId, tipo, quantidade, observacao } = req.body;
        if (!itemPcpId || !tipo || !quantidade) {
            return res.status(400).json({ error: 'itemPcpId, tipo e quantidade são obrigatórios.' });
        }
        if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
            return res.status(400).json({ error: 'tipo deve ser ENTRADA ou SAIDA.' });
        }
        if (parseFloat(quantidade) <= 0) {
            return res.status(400).json({ error: 'quantidade deve ser maior que zero.' });
        }

        const resultado = await pcpEstoqueService.ajustar({
            itemPcpId,
            tipo,
            quantidade: parseFloat(quantidade),
            observacao,
            criadoPorId: req.user?.id
        });

        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Estoque] Erro ajuste:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/estoque/historico — histórico de movimentações PCP
router.get('/historico', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { itemPcpId, tipo, motivo, dataInicio, dataFim, pagina, tamanhoPagina } = req.query;
        const resultado = await pcpEstoqueService.historico({
            itemPcpId,
            tipo,
            motivo,
            dataInicio,
            dataFim,
            pagina: pagina ? parseInt(pagina) : 1,
            tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina) : 50
        });
        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Estoque] Erro histórico:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
