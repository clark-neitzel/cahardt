const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/congeladosController');

// Todas as rotas abaixo já passam pelo authMiddleware (montado no index.js).
// Restrição de permissão: reaproveita a flag 'kitFesta' (módulo do site) ou 'admin'.
function requerSite(req, res, next) {
    const p = req.user?.permissoes || {};
    if (p.admin || p.kitFesta) return next();
    return res.status(403).json({ error: 'Sem permissão para o módulo Site.' });
}
router.use(requerSite);

// ── Produtos do site ──
router.get('/produtos-app', ctrl.adminProdutosApp);
router.put('/produtos/:produtoId', ctrl.adminSalvarProdutoSite);
router.delete('/produtos/:produtoId', ctrl.adminRemoverProdutoSite);

// ── Config do site ──
router.get('/config', ctrl.adminGetConfig);
router.put('/config/:chave', ctrl.adminSetConfig);

// ── Pedidos (fila) ──
router.get('/pedidos', ctrl.adminPedidos);
router.post('/pedidos/:id/aprovar', ctrl.adminAprovarPedido);
router.post('/pedidos/:id/recusar', ctrl.adminRecusarPedido);
router.post('/pedidos/:id/vincular', ctrl.adminVincularCliente);
router.delete('/pedidos/:id', ctrl.adminExcluirPedido);

module.exports = router;
