const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const prisma = require('../config/database');
const botWhatsappService = require('../services/botWhatsappService');

// Health-check da integração de WhatsApp (bot da Ana) + estado da fila de reenvio.
// Precisa vir ANTES de '/:key', senão o Express casa 'bot-whatsapp' como uma chave de config.
router.get('/bot-whatsapp/status', async (req, res) => {
    try {
        const [bot, pendentes, comErro] = await Promise.all([
            botWhatsappService.status(),
            prisma.botWhatsappEnvio.count({ where: { status: 'PENDENTE' } }),
            prisma.botWhatsappEnvio.count({
                where: { status: 'ERRO', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } }
            }),
        ]);
        res.json({ bot, fila: { pendentes, comErro24h: comErro } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Status do backup automático (banco 15min + arquivos diário → Google Drive).
// Precisa vir ANTES de '/:key' pelo mesmo motivo da rota acima.
router.get('/backup/status', async (req, res) => {
    try {
        const backupService = require('../services/backupService');
        const { status, driveConfigurado } = await backupService.statusBackup();
        res.json({ status, driveConfigurado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rotas de Configuração
router.get('/', configController.get);
router.get('/categorias', configController.getCategorias);
router.get('/:key', configController.get);
router.post('/:key', configController.save); // Pode ser PUT também, mas Controller usa upsert

module.exports = router;
