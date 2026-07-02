// API de consulta somente-leitura para assistentes de IA externos (ex.: bot de WhatsApp / Antigravity).
// Reaproveita a mesma lógica pública já usada pelo site do Kit Festa, atrás de uma chave própria
// (x-ia-api-key) para permitir auditoria e revogação independentes do site.
//
// Contrato versionado por caminho (/v1). Ver regras completas em backend/docs/ia-consulta-api.md:
// não remover/renomear campo já existente em /v1 — mudança que quebra o formato exige um novo /v2
// mantendo /v1 no ar até o app consumidor migrar.
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/kitFestaController');
const { verificarChaveIA, envelopeVersao } = require('../middlewares/iaConsultaMiddleware');
const { VERSAO_API, AVISOS } = require('../config/iaConsultaVersao');

const v1 = express.Router();
v1.use(verificarChaveIA, envelopeVersao);

// Health-check — o app consumidor deve chamar isso antes de responder ao cliente (ou periodicamente)
// para saber se a API está no ar e se há avisos de mudança futura em `meta.avisos`.
v1.get('/status', (req, res) => res.json({ ok: true }));

// Kit Festa — catálogo, agenda e condições de entrega
v1.get('/kitfesta/catalogo', ctrl.catalogo);
v1.get('/kitfesta/categorias', ctrl.categorias);
v1.get('/kitfesta/config', ctrl.config);
v1.get('/kitfesta/agenda', ctrl.agenda);
v1.get('/kitfesta/slots', ctrl.slots);
v1.post('/kitfesta/validar-cupom', ctrl.validarCupom);
v1.post('/kitfesta/verificar-entrega', ctrl.verificarEntrega);

router.use('/v1', v1);

module.exports = router;
