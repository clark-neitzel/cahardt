const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
// Rotas
router.get('/contaazul/url', authController.getAuthUrl);
router.get('/callback', authController.callback);
router.get('/status', authController.status);
router.get('/debug', authController.debug); // New

module.exports = router;
