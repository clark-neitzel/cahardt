const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/kitFestaController');

// Todas as rotas abaixo já passam pelo authMiddleware (montado no index.js).
// Restrição de permissão: precisa da flag 'kitFesta' ou 'admin'.
function requerKitFesta(req, res, next) {
    const p = req.user?.permissoes || {};
    if (p.admin || p.kitFesta) return next();
    return res.status(403).json({ error: 'Sem permissão para o módulo Kit Festa.' });
}
router.use(requerKitFesta);

// ── Produtos do site ──
router.get('/produtos-app', ctrl.adminProdutosApp);
router.put('/produtos/:produtoId', ctrl.adminSalvarProdutoSite);
router.delete('/produtos/:produtoId', ctrl.adminRemoverProdutoSite);

// ── Categorias do site ──
router.get('/categorias', ctrl.adminCategorias);
router.post('/categorias', ctrl.adminSalvarCategoria);
router.put('/categorias/:id', ctrl.adminSalvarCategoria);
router.delete('/categorias/:id', ctrl.adminRemoverCategoria);

// ── Agenda ──
router.get('/agenda', ctrl.adminAgenda);
router.post('/agenda/dia', ctrl.adminSetStatusDia);
router.post('/agenda/lote', ctrl.adminSetStatusLote);

// ── Horários (template) ──
router.get('/horarios', ctrl.adminHorarios);
router.post('/horarios', ctrl.adminSalvarHorario);
router.put('/horarios/:id', ctrl.adminSalvarHorario);
router.delete('/horarios/:id', ctrl.adminRemoverHorario);

// ── Bairros ──
router.get('/bairros', ctrl.adminBairros);
router.post('/bairros', ctrl.adminSalvarBairro);
router.put('/bairros/:id', ctrl.adminSalvarBairro);
router.delete('/bairros/:id', ctrl.adminRemoverBairro);

// ── Cupons ──
router.get('/cupons', ctrl.adminCupons);
router.post('/cupons', ctrl.adminSalvarCupom);
router.put('/cupons/:id', ctrl.adminSalvarCupom);
router.delete('/cupons/:id', ctrl.adminRemoverCupom);

// ── Avaliações ──
router.get('/avaliacoes', ctrl.adminAvaliacoes);
router.post('/avaliacoes', ctrl.adminSalvarAvaliacao);
router.put('/avaliacoes/:id', ctrl.adminSalvarAvaliacao);
router.delete('/avaliacoes/:id', ctrl.adminRemoverAvaliacao);

// ── Config do site ──
router.get('/config', ctrl.adminGetConfig);
router.put('/config/:chave', ctrl.adminSetConfig);

// ── Pedidos (fila) ──
router.get('/pedidos', ctrl.adminPedidos);
router.post('/pedidos/:id/aprovar', ctrl.adminAprovarPedido);
router.post('/pedidos/:id/recusar', ctrl.adminRecusarPedido);
router.post('/pedidos/:id/vincular', ctrl.adminVincularCliente);

module.exports = router;
