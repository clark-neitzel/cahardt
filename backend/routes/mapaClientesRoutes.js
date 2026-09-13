/**
 * /api/mapa-clientes — Mapa de Clientes (Clientes → Mapa).
 * Montado em index.js atrás de authMiddleware. Contrato: docs/mapa-clientes/PLANO.md §3.
 *
 *   GET  /            carga completa (clientes visíveis + opções de filtro + totais)
 *   GET  /vizinhos    pares a ≤ raio m atendidos em dias de entrega diferentes
 *   GET  /config      { raioMetros }
 *   PUT  /config      { raioMetros } — só admin || clientes.edit
 */
const express = require('express');
const router = express.Router();
const svc = require('../services/mapaClientesService');

const getPerms = (req) => {
    const p = req.user?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
};

const parseAtivo = (v) => {
    if (v === undefined || v === null || v === '') return 'true';
    const s = String(v).toLowerCase();
    if (['true', 'false', 'todos'].includes(s)) return s;
    return null;
};

const parseIntFaixa = (v, min, max) => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return null;
    return n;
};

// GET / — carga completa
router.get('/', async (req, res) => {
    try {
        const ativo = parseAtivo(req.query.ativo);
        if (!ativo) return res.status(400).json({ error: "Parâmetro 'ativo' inválido (use true, false ou todos)" });
        const dados = await svc.carregar({ reqUser: req.user, ativo });
        res.json(dados);
    } catch (e) {
        console.error('[MapaClientes] GET / falhou:', e);
        res.status(500).json({ error: 'Não foi possível carregar o mapa de clientes' });
    }
});

// GET /vizinhos — pares em dias diferentes
router.get('/vizinhos', async (req, res) => {
    try {
        const ativo = parseAtivo(req.query.ativo);
        if (!ativo) return res.status(400).json({ error: "Parâmetro 'ativo' inválido (use true, false ou todos)" });
        const raio = parseIntFaixa(req.query.raio, svc.RAIO_MIN_M, svc.RAIO_MAX_M);
        if (raio === null) return res.status(400).json({ error: `Raio inválido: use um inteiro entre ${svc.RAIO_MIN_M} e ${svc.RAIO_MAX_M} metros` });
        const limite = parseIntFaixa(req.query.limite, 1, 500);
        if (limite === null) return res.status(400).json({ error: 'Limite inválido: use um inteiro entre 1 e 500' });
        const dados = await svc.vizinhos({ reqUser: req.user, ativo, raio, limite: limite ?? 200 });
        res.json(dados);
    } catch (e) {
        console.error('[MapaClientes] GET /vizinhos falhou:', e);
        res.status(500).json({ error: 'Não foi possível calcular os vizinhos' });
    }
});

// GET /config
router.get('/config', async (req, res) => {
    try {
        res.json(await svc.getConfig());
    } catch (e) {
        console.error('[MapaClientes] GET /config falhou:', e);
        res.status(500).json({ error: 'Não foi possível ler a configuração do mapa' });
    }
});

// PUT /config — só admin || clientes.edit
router.put('/config', async (req, res) => {
    try {
        const perms = getPerms(req);
        if (!(perms.admin || perms.clientes?.edit)) {
            return res.status(403).json({ error: 'Sem permissão para alterar o raio padrão (precisa de admin ou clientes.edit)' });
        }
        const raio = parseIntFaixa(req.body?.raioMetros, svc.RAIO_MIN_M, svc.RAIO_MAX_M);
        if (raio === undefined || raio === null) {
            return res.status(400).json({ error: `raioMetros inválido: use um inteiro entre ${svc.RAIO_MIN_M} e ${svc.RAIO_MAX_M}` });
        }
        const cfg = await svc.setConfig({ raioMetros: raio });
        res.json({ raioMetros: cfg.raioMetros });
    } catch (e) {
        console.error('[MapaClientes] PUT /config falhou:', e);
        res.status(500).json({ error: 'Não foi possível salvar a configuração do mapa' });
    }
});

module.exports = router;
