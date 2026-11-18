// Separação de Carga (câmara fria). Montada em index.js: app.use('/api/separacao-carga', authMiddleware, rotas).
// Contrato: docs/separacao-carga/PLANO.md seção 2. Regra no service; aqui só permissão + tradução de erro.
const express = require('express');
const router = express.Router();
const svc = require('../services/separacaoCargaService');

function exigirSeparacao(req, res, next) {
    let perms = req.user?.permissoes || {};
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    if (perms.admin || perms.Pode_Separar_Carga === true) return next();
    return res.status(403).json({ error: 'Você não possui permissão para separar cargas.' });
}
router.use(exigirSeparacao);

function responderErro(res, e, rotulo) {
    if (e instanceof svc.ErroSeparacao) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
    console.error(`[SeparacaoCarga] ${rotulo}:`, e);
    return res.status(500).json({ error: 'Erro ao processar a separação da carga.' });
}

router.get('/cargas', async (req, res) => {
    try { res.json(await svc.listarCargas()); } catch (e) { responderErro(res, e, 'GET /cargas'); }
});

router.get('/cargas/:embarqueId/baixar', async (req, res) => {
    try {
        const carga = await svc.montarCarga(req.params.embarqueId);
        if (!carga) return res.status(404).json({ error: 'Carga não encontrada.', codigo: 'CARGA_NAO_ENCONTRADA' });
        const estado = await svc.lerEstado(req.params.embarqueId);
        res.json({ agora: new Date().toISOString(), carga, estado });
    } catch (e) { responderErro(res, e, 'GET baixar'); }
});

router.post('/cargas/:embarqueId/sincronizar', async (req, res) => {
    try {
        svc.validarCorpo(req.body);
        const { loteId, aparelho, ops } = req.body;
        res.json(await svc.sincronizar({ embarqueId: req.params.embarqueId, user: req.user, loteId, aparelho, ops }));
    } catch (e) {
        if (e.code === 'P2023') return res.status(404).json({ error: 'Carga não encontrada.', codigo: 'CARGA_NAO_ENCONTRADA' });
        responderErro(res, e, 'POST sincronizar');
    }
});

module.exports = router;
