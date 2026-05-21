const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/curriculoController');

// Rotas públicas (sem autenticação) — usadas pela página /candidatura
router.get('/buscar', ctrl.buscarPorCpf);
router.post('/', ctrl.salvar);
router.post('/foto', ctrl.upload.single('foto'), ctrl.uploadFoto);

module.exports = router;
