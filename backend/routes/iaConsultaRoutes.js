// API de consulta somente-leitura para assistentes de IA externos (ex.: bot de WhatsApp / Antigravity).
// Reaproveita a mesma lógica pública já usada pelo site do Kit Festa, atrás de uma chave própria
// (x-ia-api-key) para permitir auditoria e revogação independentes do site.
//
// Contrato versionado por caminho (/v1). Ver regras completas em backend/docs/ia-consulta-api.md:
// não remover/renomear campo já existente em /v1 — mudança que quebra o formato exige um novo /v2
// mantendo /v1 no ar até o app consumidor migrar.
const express = require('express');
const router = express.Router();
const kitFestaCtrl = require('../controllers/kitFestaController');
const congeladosCtrl = require('../controllers/congeladosController');
const { verificarChaveIA, envelopeVersao } = require('../middlewares/iaConsultaMiddleware');

const v1 = express.Router();
v1.use(verificarChaveIA, envelopeVersao);

// Health-check — o app consumidor deve chamar isso antes de responder ao cliente (ou periodicamente)
// para saber se a API está no ar e se há avisos de mudança futura em `meta.avisos`.
v1.get('/status', (req, res) => res.json({ ok: true }));

// Kit Festa — catálogo, agenda e condições de entrega
v1.get('/kitfesta/catalogo', kitFestaCtrl.catalogo);
v1.get('/kitfesta/categorias', kitFestaCtrl.categorias);
v1.get('/kitfesta/config', kitFestaCtrl.config);
v1.get('/kitfesta/agenda', kitFestaCtrl.agenda);
v1.get('/kitfesta/slots', kitFestaCtrl.slots);
v1.post('/kitfesta/validar-cupom', kitFestaCtrl.validarCupom);
v1.post('/kitfesta/verificar-entrega', kitFestaCtrl.verificarEntrega);

// Congelados — catálogo (genérico e por cliente), grupos, ficha técnica e condição comercial
v1.get('/congelados/catalogo', congeladosCtrl.catalogo);
v1.get('/congelados/grupos', congeladosCtrl.grupos);
v1.get('/congelados/config', congeladosCtrl.config);
v1.get('/congelados/produto/:id/ficha', congeladosCtrl.ficha);
v1.post('/congelados/check-doc', congeladosCtrl.checkDoc);
// Catálogo já com o preço/condição/dias de entrega do cliente, identificado só pelo CPF/CNPJ
// (sem exigir senha do site — apropriado aqui pois só o backend do bot, dono da x-ia-api-key,
// chama este endpoint; nunca expor isto nas rotas públicas do site sem senha).
v1.post('/congelados/cliente-catalogo', congeladosCtrl.catalogoPorDocumento);

router.use('/v1', v1);

module.exports = router;
