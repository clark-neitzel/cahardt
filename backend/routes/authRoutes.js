const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const appAuthController = require('../controllers/appAuthController');
const authMiddleware = require('../middlewares/authMiddleware');
const loginRateLimit = require('../middlewares/loginRateLimit');

// Rotas Conta Azul OAuth
router.get('/contaazul/url', authController.getAuthUrl);
router.get('/callback', authController.callback);
router.get('/status', authController.status);
router.get('/debug', authController.debug);

// Rotas App Login (com trava de força bruta)
router.post('/app-login', loginRateLimit, appAuthController.login);
router.get('/me', authMiddleware, appAuthController.me);

// Telas favoritas do menu (fixadas pelo usuário, máx. 10)
router.get('/menu-favoritos', authMiddleware, appAuthController.menuFavoritosGet);
router.put('/menu-favoritos', authMiddleware, appAuthController.menuFavoritosSalvar);

module.exports = router;
