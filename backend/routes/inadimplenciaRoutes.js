/**
 * /api/inadimplencia — configuração da "Inadimplência visível".
 *   GET  /config            qualquer logado (o checkout do motorista precisa de `motoristaVeAtraso`)
 *   PUT  /config            só admin; valida, trava `siteExigeResponsavel`, grava quem mudou
 *   GET  /config/historico  só admin
 * (O `POST /lote` entra na Entrega 2.)
 */
const express = require('express');
const router = express.Router();
const cfgInad = require('../config/inadimplenciaConfig');

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

module.exports = router;
