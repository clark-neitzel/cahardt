/**
 * /api/inadimplencia — configuração da "Inadimplência visível".
 *   GET  /config            qualquer logado (o checkout do motorista precisa de `motoristaVeAtraso`)
 *   PUT  /config            só admin; valida, trava `siteExigeResponsavel`, grava quem mudou
 *   GET  /config/historico  só admin
 *   POST /lote              qualquer logado; { clienteIds:[...] } (máx. 500) -> { data: { [clienteId]: Situacao-resumida } }
 */
const express = require('express');
const router = express.Router();
const cfgInad = require('../config/inadimplenciaConfig');
const inadService = require('../services/inadimplenciaService');

// Permissões vêm do authMiddleware (lidas do banco a cada request, não do token).
const ehAdmin = (req) => {
    const p = req.user?.permissoes;
    const obj = typeof p === 'string' ? (() => { try { return JSON.parse(p); } catch (_) { return {}; } })() : (p || {});
    return !!obj.admin;
};

router.get('/config', async (req, res) => {
    try {
        const cfg = await cfgInad.get({ fresh: true });
        const ultimaMudanca = await cfgInad.ultimaMudancaPorChave().catch(() => ({}));
        res.json({ ...cfg, ultimaMudanca });
    } catch (e) {
        console.error('[Inadimplencia] GET /config:', e);
        res.status(500).json({ error: 'Erro ao ler a configuração.' });
    }
});

router.put('/config', async (req, res) => {
    try {
        if (!ehAdmin(req)) return res.status(403).json({ error: 'Só o administrador muda esta regra.' });
        const r = await cfgInad.salvar(req.body || {}, { id: req.user.id, nome: req.user.nome });
        if (r.erros.length) return res.status(400).json({ error: r.erros.join(' '), erros: r.erros });
        const ultimaMudanca = await cfgInad.ultimaMudancaPorChave().catch(() => ({}));
        res.json({ ...r.cfg, ultimaMudanca, ignoradas: r.ignoradas });
    } catch (e) {
        console.error('[Inadimplencia] PUT /config:', e);
        res.status(500).json({ error: 'Erro ao salvar a configuração.' });
    }
});

router.get('/config/historico', async (req, res) => {
    try {
        if (!ehAdmin(req)) return res.status(403).json({ error: 'Só o administrador vê o histórico.' });
        res.json(await cfgInad.historico(100));
    } catch (e) {
        console.error('[Inadimplencia] GET /config/historico:', e);
        res.status(500).json({ error: 'Erro ao ler o histórico.' });
    }
});

const MAX_LOTE = 500;

/**
 * POST /lote — situação de VÁRIOS clientes de uma vez (selo nas listas). Uma consulta só (sem N+1).
 * Aceita `clienteIds` (contrato) ou `ids` (apelido do plano). Só leitura, qualquer usuário logado.
 */
router.post('/lote', async (req, res) => {
    try {
        const bruto = req.body?.clienteIds ?? req.body?.ids;
        if (!Array.isArray(bruto)) return res.status(400).json({ error: 'Informe clienteIds como lista.' });
        const ids = [...new Set(bruto.filter((x) => typeof x === 'string' && x.trim()))];
        if (ids.length > MAX_LOTE) return res.status(400).json({ error: `No máximo ${MAX_LOTE} clientes por consulta.` });
        const mapa = await inadService.situacaoPorClientes(ids);
        const data = {};
        for (const id of ids) data[id] = inadService.resumir(mapa.get(id));
        res.json({ data });
    } catch (e) {
        console.error('[Inadimplencia] POST /lote:', e);
        res.status(500).json({ error: 'Erro ao consultar a inadimplência.' });
    }
});

module.exports = router;
