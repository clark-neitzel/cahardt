const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const ctrl = require('../controllers/kitFestaController');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

// Auth do CLIENTE do site (token tipo 'kitfesta'). Opcional em algumas rotas.
function clienteAuth(obrigatorio) {
    return (req, res, next) => {
        const h = req.headers.authorization;
        if (h && h.startsWith('Bearer ')) {
            try {
                const dec = jwt.verify(h.split(' ')[1], JWT_SECRET);
                if (dec.tipo === 'kitfesta') req.kitFesta = { id: dec.id, cpf: dec.cpf, nome: dec.nome };
            } catch (_) { /* token inválido: trata como visitante */ }
        }
        if (obrigatorio && !req.kitFesta) return res.status(401).json({ error: 'Faça login para continuar.' });
        next();
    };
}

// ── Autenticação (público) ──
router.post('/auth/check-cpf', ctrl.checkCpf);
router.post('/auth/criar-senha', ctrl.criarSenha);
router.post('/auth/login', ctrl.login);
router.post('/auth/esqueci-senha', ctrl.esqueciSenha);
router.post('/auth/reset-senha', ctrl.resetSenha);

// ── Vitrine / dados do site (público) ──
router.get('/catalogo', ctrl.catalogo);
router.get('/categorias', ctrl.categorias);
router.get('/avaliacoes', ctrl.avaliacoes);
router.get('/bairros', ctrl.bairros);
router.get('/config', ctrl.config);
router.get('/agenda', ctrl.agenda);
router.get('/slots', ctrl.slots);
router.post('/validar-cupom', ctrl.validarCupom);
router.post('/validar-indicacao', clienteAuth(true), ctrl.validarIndicacao);
router.post('/verificar-entrega', ctrl.verificarEntrega);

// ── Pedido (visitante ou cliente logado) ──
router.post('/pedido', clienteAuth(false), ctrl.criarPedido);

// ── Área do cliente (requer login) ──
router.get('/perfil', clienteAuth(true), ctrl.perfil);
router.get('/meus-pedidos', clienteAuth(true), ctrl.meusPedidos);

module.exports = router;
