const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const ctrl = require('../controllers/congeladosController');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

// Auth do CLIENTE do site de congelados (token tipo 'congelados'). Opcional em algumas rotas.
function clienteAuth(obrigatorio) {
    return (req, res, next) => {
        const h = req.headers.authorization;
        if (h && h.startsWith('Bearer ')) {
            try {
                const dec = jwt.verify(h.split(' ')[1], JWT_SECRET);
                if (dec.tipo === 'congelados') req.congelados = { id: dec.id, documento: dec.documento, nome: dec.nome };
            } catch (_) { /* token inválido: trata como visitante */ }
        }
        if (obrigatorio && !req.congelados) return res.status(401).json({ error: 'Faça login para continuar.' });
        next();
    };
}

// ── Autenticação (público) ──
router.post('/auth/check-doc', ctrl.checkDoc);
router.post('/auth/criar-senha', ctrl.criarSenha);
router.post('/auth/login', ctrl.login);
router.post('/auth/esqueci-senha', ctrl.esqueciSenha);
router.post('/auth/reset-senha', ctrl.resetSenha);

// ── Vitrine / dados do site (público) ──
router.get('/catalogo', ctrl.catalogo);
router.get('/grupos', ctrl.grupos);
router.get('/config', ctrl.config);
router.get('/produto/:id/ficha', ctrl.ficha);

// ── Pedido (visitante ou cliente logado) ──
router.post('/pedido', clienteAuth(false), ctrl.criarPedido);

// ── Área do cliente (requer login) ──
router.get('/perfil', clienteAuth(true), ctrl.perfil);
router.get('/meu-catalogo', clienteAuth(true), ctrl.meuCatalogo);
router.get('/meus-pedidos', clienteAuth(true), ctrl.meusPedidos);

module.exports = router;
