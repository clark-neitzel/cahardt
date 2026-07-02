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
const { verificarChaveIA, envelopeVersao, exigirClienteCongelados } = require('../middlewares/iaConsultaMiddleware');

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

// Congelados — catálogo, grupos e ficha técnica (preço GENÉRICO, tabela "Site")
v1.get('/congelados/catalogo', congeladosCtrl.catalogo);
v1.get('/congelados/grupos', congeladosCtrl.grupos);
v1.get('/congelados/config', congeladosCtrl.config);
v1.get('/congelados/produto/:id/ficha', congeladosCtrl.ficha);

// Congelados — reconhecimento automático pelo telefone de quem manda a mensagem (nenhum dado
// sensível é liberado sem essa checagem bater com o cadastro real do cliente).
v1.post('/congelados/reconhecer-telefone', congeladosCtrl.catalogoPorTelefone);
v1.post('/congelados/criar-senha-telefone', congeladosCtrl.criarSenhaPorTelefone);

// Congelados — fluxo manual por CPF/CNPJ (quando o telefone não bate com o cadastro): descobre a
// situação, faz login com a senha existente, cria senha (só se ainda não tiver) ou envia/confirma
// um código de verificação — o código só vai para o telefone JÁ CADASTRADO, nunca pra quem pediu.
v1.post('/congelados/check-doc', congeladosCtrl.checkDoc);
v1.post('/congelados/login', congeladosCtrl.login);
v1.post('/congelados/criar-senha', congeladosCtrl.criarSenha);
v1.post('/congelados/esqueci-senha', congeladosCtrl.esqueciSenha);
v1.post('/congelados/reset-senha', congeladosCtrl.resetSenha);

// Congelados — dados do cliente já autenticado (por telefone, senha ou código) via
// Authorization: Bearer <token> retornado por login/criarSenha/criarSenhaPorTelefone/resetSenha.
v1.get('/congelados/meu-catalogo', exigirClienteCongelados, congeladosCtrl.meuCatalogo);
v1.get('/congelados/perfil', exigirClienteCongelados, congeladosCtrl.perfil);

router.use('/v1', v1);

module.exports = router;
