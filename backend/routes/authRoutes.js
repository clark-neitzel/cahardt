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

// Token curto (12h) só para ler arquivos protegidos de /uploads via ?mt=. NÃO vale como login.
router.get('/midia-token', authMiddleware, (req, res) => {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = require('../config/jwtSecret');
    const token = jwt.sign({ tipo: 'midia', uid: req.user.id }, JWT_SECRET, { expiresIn: '12h', algorithm: 'HS256' });
    res.json({ token, expiraEmSegundos: 12 * 60 * 60 });
});

// Telas favoritas do menu (fixadas pelo usuário, máx. 10)
router.get('/menu-favoritos', authMiddleware, appAuthController.menuFavoritosGet);
router.put('/menu-favoritos', authMiddleware, appAuthController.menuFavoritosSalvar);

module.exports = router;
