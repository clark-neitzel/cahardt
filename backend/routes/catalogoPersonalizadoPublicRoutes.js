const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/catalogoPersonalizadoController');

// Página pública da lista de preços — sem login, acessada por token (/lista/<token>).
router.get('/:token', ctrl.publicoPorToken);

module.exports = router;
