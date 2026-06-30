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

router.get('/curriculos/contagens', checkRH, ctrl.contagens);
router.get('/curriculos', checkRH, ctrl.listar);
router.get('/curriculos/:id', checkRH, ctrl.detalhe);
router.put('/curriculos/:id', checkEditRH, ctrl.atualizar);
router.get('/curriculos/:id/whatsapp', checkEditRH, ctrl.linkWhatsapp);
router.delete('/curriculos/:id', checkDeleteRH, ctrl.excluir);

// ─── Ponto: painel e ajustes manuais (rotas fixas antes das com :id) ──────────
router.get('/ponto/hoje', checkRH, func.pontoHoje);
router.post('/ponto/importar', checkEditRH, func.importar);
router.post('/ponto/registros', checkEditRH, func.addBatidaManual);
router.put('/ponto/registros/:id', checkEditRH, func.updateBatida);
router.delete('/ponto/registros/:id', checkEditRH, func.delBatida);

// ─── Funcionários ─────────────────────────────────────────────────────────────
router.get('/funcionarios', checkRH, func.listar);
router.post('/funcionarios', checkEditRH, func.criar);
router.get('/funcionarios/:id', checkRH, func.detalhe);
router.put('/funcionarios/:id', checkEditRH, func.atualizar);
router.post('/funcionarios/:id/gerar-link', checkEditRH, func.gerarLink);
router.put('/funcionarios/:id/jornada', checkEditRH, func.salvarJornada);
router.get('/funcionarios/:id/cartao', checkRH, func.cartao);

router.post('/funcionarios/:id/documentos', checkEditRH, uploadFuncionario.single('arquivo'), func.addDocumento);
router.delete('/funcionarios/:id/documentos/:docId', checkEditRH, func.delDocumento);
router.post('/funcionarios/:id/exames', checkEditRH, uploadFuncionario.single('arquivo'), func.addExame);
router.delete('/funcionarios/:id/exames/:exameId', checkEditRH, func.delExame);
router.post('/funcionarios/:id/atestados', checkEditRH, uploadFuncionario.single('arquivo'), func.addAtestado);
router.delete('/funcionarios/:id/atestados/:atestadoId', checkEditRH, func.delAtestado);
router.post('/funcionarios/:id/avaliacoes', checkEditRH, func.addAvaliacao);

module.exports = router;
