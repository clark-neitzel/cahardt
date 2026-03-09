const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const uploadLead = require('../middlewares/uploadLeadMiddleware');

router.get('/', leadController.listar);
router.get('/rota', leadController.listarParaRota);
router.get('/por-cliente/:clienteId', leadController.buscarPorCliente);
router.get('/:id', leadController.detalhar);
router.post('/', leadController.criar);
router.put('/:id', leadController.atualizar);
router.post('/:id/finalizar', leadController.finalizar);
router.post('/:id/foto', uploadLead.single('foto'), leadController.uploadFoto);
router.post('/:id/referenciar', leadController.referenciarCliente);

module.exports = router;
