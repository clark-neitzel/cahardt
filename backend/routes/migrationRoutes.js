const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');

// Rota para aplicar migration de NCM
router.post('/apply-ncm', migrationController.applyNcmMigration);

// Rota para aplicar migration de Contas a Receber
router.post('/apply-contas-receber', migrationController.applyContasReceberMigration);

// Rota para sincronizar contas a receber com pedidos existentes
router.post('/sync-contas-receber', migrationController.syncContasReceber);

module.exports = router;
