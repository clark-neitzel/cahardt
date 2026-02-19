const express = require('express');
const router = express.Router();
const contaFinanceiraController = require('../controllers/contaFinanceiraController');

router.get('/', contaFinanceiraController.listar);

module.exports = router;
