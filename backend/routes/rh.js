const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/curriculoController');

// Todas as rotas aqui já passam pelo authMiddleware (registrado no index.js)
// Além disso verificamos a permissão Pode_Ver_RH

function checkRH(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!p.Pode_Ver_RH && !p.Pode_Editar_RH) {
    return res.status(403).json({ erro: 'Sem permissão para acessar o RH' });
  }
  next();
}

function checkEditRH(req, res, next) {
  const p = req.user?.permissoes || {};
  if (!p.Pode_Editar_RH) {
    return res.status(403).json({ erro: 'Sem permissão para editar currículos' });
  }
  next();
}

router.get('/curriculos/contagens', checkRH, ctrl.contagens);
router.get('/curriculos', checkRH, ctrl.listar);
router.get('/curriculos/:id', checkRH, ctrl.detalhe);
router.put('/curriculos/:id', checkEditRH, ctrl.atualizar);
router.get('/curriculos/:id/whatsapp', checkEditRH, ctrl.linkWhatsapp);

module.exports = router;
