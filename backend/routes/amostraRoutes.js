const express = require('express');
const router = express.Router();
const amostraController = require('../controllers/amostraController');

router.post('/', amostraController.criar);
router.get('/', amostraController.listar);
router.get('/:id', amostraController.buscarPorId);
router.patch('/:id/status', amostraController.atualizarStatus);
router.delete('/:id', amostraController.excluir);

module.exports = router;
