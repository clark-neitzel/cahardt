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

// POST /api/pcp/itens — criar (apenas SUB)
router.post('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { codigo, nome, unidade } = req.body;
        if (!codigo || !nome || !unidade) {
            return res.status(400).json({ error: 'codigo, nome e unidade são obrigatórios.' });
        }

        const item = await pcpItemService.criar({ ...req.body, tipo: 'SUB' });
        return res.status(201).json(item);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Código já existe.' });
        console.error('[PCP Itens] Erro criar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/pcp/itens/importar — importar produto do cadastro como MP, PA ou EMB
router.post('/importar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { produtoId, tipo } = req.body;
        if (!produtoId || !tipo) {
            return res.status(400).json({ error: 'produtoId e tipo são obrigatórios.' });
        }

        const item = await pcpItemService.importar({ produtoId, tipo });
        return res.status(201).json(item);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Código já existe.' });
        console.error('[PCP Itens] Erro importar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/pcp/itens/importar-lote — importar múltiplos produtos
router.post('/importar-lote', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { itens } = req.body;
        if (!Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ error: 'Envie um array de itens com produtoId e tipo.' });
        }

        const resultados = await pcpItemService.importarLote(itens);
        return res.json(resultados);
    } catch (err) {
        console.error('[PCP Itens] Erro importar lote:', err.message);
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
