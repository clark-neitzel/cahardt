// Etiquetas da Cozinha (E2) — montada em index.js: app.use('/api/pcp/etiquetas-cozinha', authMiddleware, ...)
// Permissão: admin || pcp.etiquetas (igual a pcpEtiquetaRoutes.js). Contrato: docs/etiquetas-cozinha/CONTRATO-E2.md
const express = require('express');
const router = express.Router();
const svc = require('../services/etiquetaCozinhaService');

function permsDe(req) {
    const p = req.user?.permissoes;
    if (typeof p === 'string') { try { return JSON.parse(p); } catch (_) { return {}; } }
    return p || {};
}
// pcp.etiquetas é OBJETO de permissões: checa a flag, nunca !!perms.pcp
router.use((req, res, next) => {
    const p = permsDe(req);
    if (p.admin || p.pcp?.etiquetas) return next();
    return res.status(403).json({ error: 'Sem permissão.' });
});

function tratar(res, e, rotulo) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(`[EtiquetaCozinha] ${rotulo}:`, e);
    return res.status(500).json({ error: 'Erro interno. Tente de novo.' });
}

router.get('/itens', async (req, res) => {
    try {
        res.json(await svc.itens({ grupo: req.query.grupo, busca: req.query.busca, userId: req.user.id }));
    } catch (e) { tratar(res, e, 'itens'); }
});

router.get('/favoritos', async (req, res) => {
    try { res.json(await svc.favoritos(req.user.id)); } catch (e) { tratar(res, e, 'favoritos'); }
});

router.get('/equipe', async (req, res) => {
    try { res.json(await svc.equipe(req.user)); } catch (e) { tratar(res, e, 'equipe'); }
});

router.get('/hoje', async (req, res) => {
    try {
        const { data, de, ate, itemPcpId } = req.query;
        res.json(await svc.hoje({ data, de, ate, itemPcpId }));
    } catch (e) { tratar(res, e, 'hoje'); }
});

router.post('/imprimir', async (req, res) => {
    try {
        const r = await svc.imprimir(req.body, req.user);
        res.status(r.status).json(r.corpo);
    } catch (e) { tratar(res, e, 'imprimir'); }
});

router.get('/lotes/:id', async (req, res) => {
    try { res.json(await svc.detalhe(req.params.id)); } catch (e) { tratar(res, e, 'lote'); }
});

router.post('/lotes/:id/reimprimir', async (req, res) => {
    try {
        const r = await svc.reimprimir(req.params.id, req.body || {}, req.user);
        res.status(r.status).json(r.corpo);
    } catch (e) { tratar(res, e, 'reimprimir'); }
});

module.exports = router;
