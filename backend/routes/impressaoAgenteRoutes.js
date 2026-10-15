// Impressão direta — rotas do AGENTE Windows (SEM authMiddleware; auth própria por token).
// Plano: docs/etiquetas-cozinha/PLANO-ARQUITETO.md 2.4.
// Montada em index.js como: app.use('/api/impressao-agente', impressaoAgenteRoutes) — junto das rotas públicas.
//
// Token inválido/revogado => 401 genérico, sem nenhuma informação. O agente só enxerga trabalhos das
// impressoras do próprio agenteId. Nenhuma outra rota do sistema aceita este token.
const express = require('express');
const router = express.Router();
const svc = require('../services/impressaoService');

// Rate-limit só de TENTATIVAS FALHAS por IP (em memória). Requisição com token válido nunca é limitada:
// atrás do nginx (trust proxy) vários clientes podem ter o mesmo IP, e quem manda token falso não pode
// derrubar o agente verdadeiro com 429.
const JANELA_MS = 60 * 1000;
const MAX_FALHAS = 30;
const mapa = new Map();
setInterval(() => { const agora = Date.now(); for (const [k, v] of mapa) if (agora - v.inicio > JANELA_MS) mapa.delete(k); }, JANELA_MS).unref();

function registrarFalha(ip) {
    const agora = Date.now();
    const r = mapa.get(ip);
    if (!r || agora - r.inicio >= JANELA_MS) { mapa.set(ip, { inicio: agora, n: 1 }); return 1; }
    return ++r.n;
}
function excedeu(ip) {
    const r = mapa.get(ip);
    return !!r && Date.now() - r.inicio < JANELA_MS && r.n >= MAX_FALHAS;
}

async function exigirAgente(req, res, next) {
    try {
        const agente = await svc.autenticarAgente(req.headers['x-agente-token']);
        if (!agente) {
            const ip = req.ip || 'sem-ip';
            if (excedeu(ip)) return res.status(429).json({ error: 'Muitas tentativas.' });
            registrarFalha(ip);
            return res.status(401).json({ error: 'Não autorizado.' });
        }
        req.agente = agente;
        next();
    } catch (e) {
        console.error('[ImpressaoAgente] erro na autenticação:', e.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
}

// Teste de conexão do instalador (não reivindica trabalho).
router.get('/ping', exigirAgente, (req, res) => {
    res.json({ ok: true, nome: req.agente.nome, versaoServidor: svc.VERSAO_SERVIDOR });
});

router.post('/sincronizar', exigirAgente, async (req, res) => {
    try {
        res.json(await svc.sincronizar(req.agente, req.body || {}, req.ip));
    } catch (e) {
        console.error('[ImpressaoAgente] sincronizar:', e.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

router.post('/trabalhos/:id/resultado', exigirAgente, async (req, res) => {
    try {
        const r = await svc.registrarResultado(req.agente, req.params.id, req.body || {});
        res.status(r.http).json(r.corpo);
    } catch (e) {
        console.error('[ImpressaoAgente] resultado:', e.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

router.get('/script', exigirAgente, (req, res) => {
    try {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('x-agente-versao', svc.VERSAO_SERVIDOR);
        res.send(svc.lerScript());
    } catch (e) {
        console.error('[ImpressaoAgente] script:', e.message);
        res.status(500).json({ error: 'Erro interno.' });
    }
});

module.exports = router;
