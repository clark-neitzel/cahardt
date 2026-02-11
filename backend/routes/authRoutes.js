const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/contaazul/url', authController.getAuthUrl);
router.get('/callback', authController.callback);
router.get('/status', authController.status);

module.exports = router;
