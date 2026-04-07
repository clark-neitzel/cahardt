const express = require('express');
const router = express.Router();
const pcpItemService = require('../services/pcpItemService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.itens;
}

// GET /api/pcp/itens — listar itens PCP
router.get('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { tipo, search, ativo } = req.query;
        const itens = await pcpItemService.listar({ tipo, search, ativo });
        return res.json(itens);
    } catch (err) {
        console.error('[PCP Itens] Erro listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/itens/:id — detalhe
router.get('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const item = await pcpItemService.buscarPorId(req.params.id);
        if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
        return res.json(item);
    } catch (err) {
        console.error('[PCP Itens] Erro buscar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/itens — criar
router.post('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { codigo, nome, tipo, unidade } = req.body;
        if (!codigo || !nome || !tipo || !unidade) {
            return res.status(400).json({ error: 'codigo, nome, tipo e unidade são obrigatórios.' });
        }
        if (!['MP', 'SUB', 'PA', 'EMB'].includes(tipo)) {
            return res.status(400).json({ error: 'tipo deve ser: MP, SUB, PA ou EMB.' });
        }

        const item = await pcpItemService.criar(req.body);
        return res.status(201).json(item);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Código já existe.' });
        console.error('[PCP Itens] Erro criar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/pcp/itens/:id — atualizar
router.put('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        if (req.body.tipo && !['MP', 'SUB', 'PA', 'EMB'].includes(req.body.tipo)) {
            return res.status(400).json({ error: 'tipo deve ser: MP, SUB, PA ou EMB.' });
        }

        const item = await pcpItemService.atualizar(req.params.id, req.body);
        return res.json(item);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Código já existe.' });
        console.error('[PCP Itens] Erro atualizar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PATCH /api/pcp/itens/:id/ativo — toggle ativo
router.patch('/:id/ativo', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const item = await pcpItemService.toggleAtivo(req.params.id);
        return res.json(item);
    } catch (err) {
        console.error('[PCP Itens] Erro toggle ativo:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
