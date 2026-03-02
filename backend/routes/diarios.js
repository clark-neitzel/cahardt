const express = require('express');
const router = express.Router();
const diarioController = require('../controllers/diarioController');

// Status atual do vendedor
router.get('/status', diarioController.meuStatus);

// Checkins
router.post('/iniciar', diarioController.iniciar);
router.post('/encerrar', diarioController.encerrar);

module.exports = router;
