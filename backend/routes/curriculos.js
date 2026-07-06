const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/curriculoController');

// Rotas públicas (sem autenticação) — usadas pela página /candidatura
// Acesso a currículo existente é protegido por código enviado ao WhatsApp cadastrado.
router.post('/solicitar-acesso', ctrl.solicitarAcesso);
router.post('/validar-acesso', ctrl.validarAcesso);
router.post('/', ctrl.salvar);
router.post('/foto', ctrl.upload.single('foto'), ctrl.uploadFoto);

module.exports = router;
