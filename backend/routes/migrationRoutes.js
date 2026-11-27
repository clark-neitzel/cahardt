const express = require('express');
const router = express.Router();
const migrationController = require('../controllers/migrationController');

// DDL cru e sincronização em massa: só admin (antes qualquer usuário logado atravessava).
router.use((req, res, next) => {
    if (req.user?.permissoes?.admin !== true) {
        return res.status(403).json({ error: 'Apenas administradores podem executar migrations.' });
    }
    next();
});

// Rota para aplicar migration de NCM
router.post('/apply-ncm', migrationController.applyNcmMigration);

// Rota para aplicar migration de Contas a Receber
router.post('/apply-contas-receber', migrationController.applyContasReceberMigration);

// Rota para sincronizar contas a receber com pedidos existentes
router.post('/sync-contas-receber', migrationController.syncContasReceber);

module.exports = router;
