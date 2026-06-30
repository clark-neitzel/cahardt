const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/curriculoController');
const func = require('../controllers/funcionarioController');
const uploadFuncionario = require('../middlewares/uploadFuncionarioMiddleware');

// Todas as rotas aqui já passam pelo authMiddleware (registrado no index.js)
// Além disso verificamos a permissão Pode_Ver_RH

function isAdmin(p) { return p.admin === true; }

function checkRH(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!isAdmin(p) && !p.Pode_Ver_RH && !p.Pode_Editar_RH) {
    return res.status(403).json({ erro: 'Sem permissão para acessar o RH' });
  }
  next();
}

function checkEditRH(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!isAdmin(p) && !p.Pode_Editar_RH) {
    return res.status(403).json({ erro: 'Sem permissão para editar currículos' });
  }
  next();
}

function checkDeleteRH(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!isAdmin(p) && !p.Pode_Excluir_RH) {
    return res.status(403).json({ erro: 'Sem permissão para excluir currículos' });
  }
  next();
}

// Ponto & Funcionários têm permissão própria (independente de Currículos)
function checkPonto(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!isAdmin(p) && !p.Pode_Ver_Ponto && !p.Pode_Editar_Ponto) {
    return res.status(403).json({ erro: 'Sem permissão para acessar Ponto/Funcionários' });
  }
  next();
}

function checkEditPonto(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!isAdmin(p) && !p.Pode_Editar_Ponto) {
    return res.status(403).json({ erro: 'Sem permissão para editar Ponto/Funcionários' });
  }
  next();
}

router.get('/curriculos/contagens', checkRH, ctrl.contagens);
router.get('/curriculos', checkRH, ctrl.listar);
router.get('/curriculos/:id', checkRH, ctrl.detalhe);
router.put('/curriculos/:id', checkEditRH, ctrl.atualizar);
router.get('/curriculos/:id/whatsapp', checkEditRH, ctrl.linkWhatsapp);
router.delete('/curriculos/:id', checkDeleteRH, ctrl.excluir);

// ─── Ponto: painel e ajustes manuais (rotas fixas antes das com :id) ──────────
router.get('/ponto/hoje', checkPonto, func.pontoHoje);
router.post('/ponto/importar', checkEditPonto, func.importar);
router.post('/ponto/registros', checkEditPonto, func.addBatidaManual);
router.put('/ponto/registros/:id', checkEditPonto, func.updateBatida);
router.delete('/ponto/registros/:id', checkEditPonto, func.delBatida);

// ─── Funcionários ─────────────────────────────────────────────────────────────
router.get('/funcionarios', checkPonto, func.listar);
router.post('/funcionarios', checkEditPonto, func.criar);
router.get('/funcionarios/:id', checkPonto, func.detalhe);
router.put('/funcionarios/:id', checkEditPonto, func.atualizar);
router.post('/funcionarios/:id/gerar-link', checkEditPonto, func.gerarLink);
router.put('/funcionarios/:id/jornada', checkEditPonto, func.salvarJornada);
router.get('/funcionarios/:id/cartao', checkPonto, func.cartao);

router.post('/funcionarios/:id/documentos', checkEditPonto, uploadFuncionario.single('arquivo'), func.addDocumento);
router.delete('/funcionarios/:id/documentos/:docId', checkEditPonto, func.delDocumento);
router.post('/funcionarios/:id/exames', checkEditPonto, uploadFuncionario.single('arquivo'), func.addExame);
router.delete('/funcionarios/:id/exames/:exameId', checkEditPonto, func.delExame);
router.post('/funcionarios/:id/atestados', checkEditPonto, uploadFuncionario.single('arquivo'), func.addAtestado);
router.delete('/funcionarios/:id/atestados/:atestadoId', checkEditPonto, func.delAtestado);
router.post('/funcionarios/:id/avaliacoes', checkEditPonto, func.addAvaliacao);

module.exports = router;
