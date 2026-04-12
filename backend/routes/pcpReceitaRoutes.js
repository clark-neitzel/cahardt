const express = require('express');
const router = express.Router();
const pcpReceitaService = require('../services/pcpReceitaService');
const prisma = require('../config/database');

async function getPermsFromDB(userId) {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
}

function temPermissaoPcp(permissoes) {
    return permissoes.admin || !!permissoes.pcp?.receitas;
}

// GET /api/pcp/receitas — listar receitas
router.get('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { itemPcpId, status } = req.query;
        const receitas = await pcpReceitaService.listar({ itemPcpId, status });
        return res.json(receitas);
    } catch (err) {
        console.error('[PCP Receitas] Erro listar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/receitas/historico/:itemPcpId — todas as versões de um item
router.get('/historico/:itemPcpId', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });
        const versoes = await pcpReceitaService.historicoPorItem(req.params.itemPcpId);
        return res.json(versoes);
    } catch (err) {
        console.error('[PCP Receitas] Erro historico:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/receitas/:id/logs — logs de uma versão específica
router.get('/:id/logs', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });
        const logs = await pcpReceitaService.logsDaReceita(req.params.id);
        return res.json(logs);
    } catch (err) {
        console.error('[PCP Receitas] Erro logs:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/pcp/receitas/:id — detalhe com itens
router.get('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const receita = await pcpReceitaService.buscarPorId(req.params.id);
        if (!receita) return res.status(404).json({ error: 'Receita não encontrada.' });
        return res.json(receita);
    } catch (err) {
        console.error('[PCP Receitas] Erro buscar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/pcp/receitas — criar receita com itens
router.post('/', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { itemPcpId, nome, rendimentoBase, itens } = req.body;
        if (!itemPcpId || !nome || !rendimentoBase) {
            return res.status(400).json({ error: 'itemPcpId, nome e rendimentoBase são obrigatórios.' });
        }
        if (!itens || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({ error: 'Receita deve ter pelo menos 1 item.' });
        }

        const receita = await pcpReceitaService.criar(req.body);
        return res.status(201).json(receita);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Já existe receita com esta versão para o item.' });
        console.error('[PCP Receitas] Erro criar:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /api/pcp/receitas/:id — atualizar (somente rascunho)
router.put('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const vendedor = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
        const receita = await pcpReceitaService.atualizar(req.params.id, req.body, {
            userId: req.user.id,
            userNome: vendedor?.nome
        });
        return res.json(receita);
    } catch (err) {
        console.error('[PCP Receitas] Erro atualizar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/pcp/receitas/:id/nova-versao — clonar como nova versão
router.post('/:id/nova-versao', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const nova = await pcpReceitaService.novaVersao(req.params.id);
        return res.status(201).json(nova);
    } catch (err) {
        console.error('[PCP Receitas] Erro nova versão:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/pcp/receitas/:id/clonar — cria nova receita + novo SUB copiando ingredientes
router.post('/:id/clonar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { novoNome } = req.body;
        if (!novoNome?.trim()) return res.status(400).json({ error: 'novoNome é obrigatório.' });

        const nova = await pcpReceitaService.clonar(req.params.id, { novoNome });
        return res.status(201).json(nova);
    } catch (err) {
        if (err.code === 'P2002') return res.status(409).json({ error: 'Código já existe.' });
        console.error('[PCP Receitas] Erro clonar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// POST /api/pcp/receitas/:id/escalonar — simulador de escalonamento
router.post('/:id/escalonar', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { modo, quantidade, itemPcpIdLimitante, quantidadeDisponivel } = req.body;
        if (!modo) return res.status(400).json({ error: 'modo é obrigatório (por_quantidade ou por_ingrediente).' });

        const resultado = await pcpReceitaService.escalonar(req.params.id, {
            modo, quantidade, itemPcpIdLimitante, quantidadeDisponivel
        });
        return res.json(resultado);
    } catch (err) {
        console.error('[PCP Receitas] Erro escalonar:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// PATCH /api/pcp/receitas/:id/status — alterar status
router.patch('/:id/status', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status é obrigatório.' });

        const receita = await pcpReceitaService.alterarStatus(req.params.id, status);
        return res.json(receita);
    } catch (err) {
        console.error('[PCP Receitas] Erro alterar status:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

// DELETE /api/pcp/receitas/:id — excluir receita
router.delete('/:id', async (req, res) => {
    try {
        const permissoes = await getPermsFromDB(req.user.id);
        if (!temPermissaoPcp(permissoes)) return res.status(403).json({ error: 'Sem permissão PCP.' });

        await pcpReceitaService.excluir(req.params.id);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[PCP Receitas] Erro excluir:', err.message);
        return res.status(400).json({ error: err.message });
    }
});

module.exports = router;
