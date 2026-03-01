const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

router.get('/', leadController.listar);
router.get('/:id', leadController.detalhar);
router.post('/', leadController.criar);
router.put('/:id', leadController.atualizar);
router.post('/:id/finalizar', leadController.finalizar);

module.exports = router;
