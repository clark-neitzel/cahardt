const express = require('express');
const router = express.Router();
const vendedorController = require('../controllers/vendedorController');

router.get('/', vendedorController.listar);
router.get('/:id', vendedorController.obter);
router.put('/:id', vendedorController.atualizar);

module.exports = router;
