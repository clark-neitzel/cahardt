const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mensagemAgendadaController');

router.get('/', ctrl.listar);
router.get('/preview/:vendedorId', ctrl.preview);
router.get('/:id', ctrl.obter);
router.post('/', ctrl.criar);
router.put('/:id', ctrl.atualizar);
router.delete('/:id', ctrl.deletar);
router.post('/:id/disparar', ctrl.disparar);

module.exports = router;
