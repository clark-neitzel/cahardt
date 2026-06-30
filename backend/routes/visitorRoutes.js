const express = require('express');
const router = express.Router();
const { ping, getStats } = require('../services/visitorService');
const authMiddleware = require('../middlewares/authMiddleware');

// Público: recebe heartbeat das páginas do site
router.post('/ping', (req, res) => {
  const { sessionId, pagina, temCarrinho } = req.body || {};
  if (sessionId && pagina) ping(sessionId, pagina, !!temCarrinho);
  res.json({ ok: true });
});

// Protegido: retorna contagens para a barra do admin
router.get('/stats', authMiddleware, (req, res) => {
  res.json(getStats());
});

module.exports = router;
