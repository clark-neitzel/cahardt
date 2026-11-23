// Conferência da Carga pelo motorista. Montada em index.js: app.use('/api/conferencia-motorista', authMiddleware, rotas).
// Contrato: docs/conferencia-motorista/PLANO.md (seção 5 + ADENDO A). Regra no service; aqui só permissão + tradução de erro.
const express = require('express');
const router = express.Router();
const svc = require('../services/conferenciaMotoristaService');
const { checkAcessoEmbarque } = require('./embarques');

function exigirConferencia(req, res, next) {
    let perms = req.user?.permissoes || {};
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    if (perms.admin || perms.Pode_Conferir_Carga_Motorista === true) return next();
    return res.status(403).json({ error: 'Você não possui permissão para conferir a carga.' });
}

function responderErro(res, e, rotulo) {
    if (e instanceof svc.ErroConferencia) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
    if (e?.code === 'P2023') return res.status(404).json({ error: 'Carga não encontrada.', codigo: 'CARGA_NAO_ENCONTRADA' });
    console.error(`[ConferenciaMotorista] ${rotulo}:`, e);
    return res.status(500).json({ error: 'Erro ao processar a conferência da carga.' });
}

router.get('/cargas', exigirConferencia, async (req, res) => {
    try { res.json(await svc.listarCargas(req.user)); } catch (e) { responderErro(res, e, 'GET /cargas'); }
});

router.get('/cargas/:embarqueId/baixar', exigirConferencia, async (req, res) => {
    try {
        const carga = await svc.montarCarga(req.params.embarqueId, { comAvisos: true });
        if (!carga) return res.status(404).json({ error: 'Carga não encontrada.', codigo: 'CARGA_NAO_ENCONTRADA' });
        svc.exigirAcesso(req.user, carga.motoristaId);
        const estado = await svc.lerEstado(req.params.embarqueId);
        res.json({ agora: new Date().toISOString(), carga, estado });
    } catch (e) { responderErro(res, e, 'GET baixar'); }
});

router.post('/cargas/:embarqueId/sincronizar', exigirConferencia, async (req, res) => {
    try {
        svc.validarCorpo(req.body);
        const { loteId, aparelho, ops } = req.body;
        res.json(await svc.sincronizar({ embarqueId: req.params.embarqueId, user: req.user, loteId, aparelho, ops }));
    } catch (e) { responderErro(res, e, 'POST sincronizar'); }
});

// Comprovante para o escritório (Embarque): gate de acesso ao Embarque, por rota.
router.get('/resumo', checkAcessoEmbarque, async (req, res) => {
    try {
        const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean);
        if (ids.length > 100) return res.status(400).json({ error: 'No máximo 100 cargas por consulta.' });
        res.json(await svc.resumoPorEmbarques(ids));
    } catch (e) { responderErro(res, e, 'GET /resumo'); }
});

module.exports = router;
