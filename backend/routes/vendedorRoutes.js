const express = require('express');
const router = express.Router();
const vendedorController = require('../controllers/vendedorController');

router.get('/', vendedorController.listar);
router.get('/:id', vendedorController.obter);
router.post('/', vendedorController.criar); // Novo usuário (25/07/2026 — nasce do app, não mais do sync do CA)
router.put('/:id', vendedorController.atualizar);

module.exports = router;
