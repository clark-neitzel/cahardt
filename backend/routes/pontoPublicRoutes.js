const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const pontoService = require('../services/pontoService');

// Rotas PÚBLICAS (sem login do app) — tela /ponto/:token do funcionário.
// O token pessoal (Funcionario.pontoToken) identifica a pessoa; o acesso para
// bater ponto exige a SENHA do funcionário (mesmo padrão bcrypt+JWT dos sites).
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

async function buscarPorToken(token) {
    if (!token) return null;
    return prisma.funcionario.findUnique({ where: { pontoToken: token } });
}

function gerarTokenSessao(funcionario) {
    return jwt.sign({ tipo: 'ponto', funcionarioId: funcionario.id }, JWT_SECRET, { expiresIn: '7d' });
}

// Confere o Bearer da sessão do ponto e se ele é do funcionário do link
function sessaoValida(req, funcionario) {
    const h = req.headers.authorization || '';
    const tk = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!tk) return false;
    try {
        const p = jwt.verify(tk, JWT_SECRET);
        return p.tipo === 'ponto' && p.funcionarioId === funcionario.id;
    } catch {
        return false;
    }
}

async function estadoCompleto(funcionario) {
    const estado = await pontoService.statusDoDia(funcionario.id);
    const geo = await pontoService.getGeofence();
    return {
        nome: funcionario.nome,
        empresa: { geofenceAtivo: geo.ativo, raioMetros: geo.raioMetros, bloquear: geo.bloquear },
        ...estado
    };
}

// GET /api/ponto-publico/:token → metadados públicos (sem expor batidas)
router.get('/:token', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        res.json({
            nome: funcionario.nome,
            temSenha: !!funcionario.senhaHash,
            bloqueado: !funcionario.ativo
        });
    } catch (error) {
        console.error('[PontoPublico] meta:', error);
        res.status(500).json({ erro: 'Erro ao carregar o ponto.' });
    }
});

// POST /api/ponto-publico/:token/login → valida a senha e devolve a sessão
router.post('/:token/login', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o RH.' });
        if (!funcionario.senhaHash) return res.status(403).json({ erro: 'Acesso ainda não liberado. Peça ao RH para definir sua senha.' });

        const { senha } = req.body || {};
        const ok = senha && await bcrypt.compare(String(senha), funcionario.senhaHash);
        if (!ok) return res.status(401).json({ erro: 'Senha incorreta.' });

        const sessao = gerarTokenSessao(funcionario);
        const estado = await estadoCompleto(funcionario);
        res.json({ sessao, ...estado });
    } catch (error) {
        console.error('[PontoPublico] login:', error);
        res.status(500).json({ erro: 'Erro ao entrar.' });
    }
});

// GET /api/ponto-publico/:token/estado → estado + batidas (requer sessão)
router.get('/:token/estado', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o RH.' });
        if (!sessaoValida(req, funcionario)) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

        res.json(await estadoCompleto(funcionario));
    } catch (error) {
        console.error('[PontoPublico] estado:', error);
        res.status(500).json({ erro: 'Erro ao carregar o ponto.' });
    }
});

// POST /api/ponto-publico/:token/registrar → grava a batida (requer sessão)
router.post('/:token/registrar', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o RH.' });
        if (!sessaoValida(req, funcionario)) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

        const { latLng } = req.body || {};
        const batida = await pontoService.registrarBatida(funcionario, { latLng, origem: 'LINK' });
        const estado = await estadoCompleto(funcionario);

        res.status(201).json({ batida: pontoService.mapBatida(batida), ...estado });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ erro: error.message, distancia: error.distancia });
        }
        console.error('[PontoPublico] registrar:', error);
        res.status(500).json({ erro: 'Erro ao registrar o ponto.' });
    }
});

module.exports = router;
