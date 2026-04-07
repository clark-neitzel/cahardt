const express = require('express');
const router = express.Router();
const pcpAgendaService = require('../services/pcpAgendaService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.agenda;
}

// GET /api/pcp/agenda — listar eventos
router.get('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { dataInicio, dataFim } = req.query;
        const eventos = await pcpAgendaService.listar({ dataInicio, dataFim });
        return res.json(eventos);
    } catch (err) {
        console.error('[PCP Agenda] Erro listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/agenda — criar evento
router.post('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { ordemProducaoId, titulo, dataInicio, dataFim } = req.body;
        if (!ordemProducaoId || !titulo || !dataInicio || !dataFim) {
            return res.status(400).json({ error: 'ordemProducaoId, titulo, dataInicio e dataFim são obrigatórios.' });
        }

        const evento = await pcpAgendaService.criar(req.body);
        return res.status(201).json(evento);
    } catch (err) {
        console.error('[PCP Agenda] Erro criar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PUT /api/pcp/agenda/:id — atualizar (drag-and-drop)
router.put('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const evento = await pcpAgendaService.atualizar(req.params.id, req.body);
        return res.json(evento);
    } catch (err) {
        console.error('[PCP Agenda] Erro atualizar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// DELETE /api/pcp/agenda/:id — remover
router.delete('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        await pcpAgendaService.excluir(req.params.id);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[PCP Agenda] Erro excluir:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

module.exports = router;
