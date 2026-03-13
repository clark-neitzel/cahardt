const express = require('express');
const router = express.Router();
const amostraController = require('../controllers/amostraController');

router.get('/', amostraController.listar);
router.get('/:id', amostraController.obterPorId);
router.post('/', amostraController.criar);
router.patch('/:id/status', amostraController.mudarStatus);
router.delete('/:id', amostraController.cancelar);

module.exports = router;
