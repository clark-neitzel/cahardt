const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { verificarToken } = require('../middlewares/authMiddleware');

router.get('/', verificarToken, leadController.listar);
router.get('/:id', verificarToken, leadController.detalhar);
router.post('/', verificarToken, leadController.criar);
router.put('/:id', verificarToken, leadController.atualizar);
router.post('/:id/finalizar', verificarToken, leadController.finalizar);

module.exports = router;
