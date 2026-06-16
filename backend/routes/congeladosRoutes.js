const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();
const ctrl = require('../controllers/congeladosController');

// Upload do logo do site (salvo em uploads/congelados)
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/congelados');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${path.extname(file.originalname) || '.png'}`),
});
const uploadLogo = multer({
    storage: logoStorage,
    fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Apenas imagens.')),
    limits: { fileSize: 3 * 1024 * 1024 },
});

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
router.post('/logo', uploadLogo.single('logo'), ctrl.adminUploadLogo);

// ── Pedidos (fila) ──
router.get('/pedidos', ctrl.adminPedidos);
router.post('/pedidos/:id/aprovar', ctrl.adminAprovarPedido);
router.post('/pedidos/:id/recusar', ctrl.adminRecusarPedido);
router.post('/pedidos/:id/vincular', ctrl.adminVincularCliente);
router.delete('/pedidos/:id', ctrl.adminExcluirPedido);

module.exports = router;
