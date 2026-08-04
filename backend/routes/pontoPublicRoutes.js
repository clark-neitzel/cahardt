const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const pontoService = require('../services/pontoService');
const acertoService = require('../services/pontoAcertoService');

// Rotas PÚBLICAS (sem login do app) — tela /ponto/:token do funcionário.
// O token pessoal (Funcionario.pontoToken) identifica a pessoa; o acesso para
// bater ponto exige a SENHA do funcionário (mesmo padrão bcrypt+JWT dos sites).
const JWT_SECRET = require('../config/jwtSecret');

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
    const [estado, geo, acertos, limiteDias] = await Promise.all([
        pontoService.statusDoDia(funcionario.id),
        pontoService.getGeofence(),
        acertoService.paraTelaDoFuncionario(funcionario.id),
        acertoService.getLimiteDias()
    ]);
    return {
        nome: funcionario.nome,
        empresa: { geofenceAtivo: geo.ativo, raioMetros: geo.raioMetros, bloquear: geo.bloquear },
        minutosCorrigirUltima: pontoService.MINUTOS_CORRIGIR_ULTIMA,
        acertoDiasParaTras: limiteDias,   // 0 = só o dia de hoje
        acertoMaxItens: acertoService.MAX_ITENS,
        ...acertos,                        // acertoPendente | acertoResposta
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
            bloqueado: !funcionario.ativo,
            // Quem bate no relógio da empresa (ou não bate) não usa este link
            registraPontoEm: funcionario.registraPontoEm || 'APP'
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

        if (funcionario.registraPontoEm && funcionario.registraPontoEm !== 'APP') {
            return res.status(403).json({
                erro: funcionario.registraPontoEm === 'RELOGIO'
                    ? 'Seu ponto é registrado no relógio da empresa, não por aqui.'
                    : 'Você não registra ponto pelo app. Fale com o RH.'
            });
        }

        const { latLng, tipo } = req.body || {};
        const batida = await pontoService.registrarBatida(funcionario, { latLng, origem: 'LINK', tipo });
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

// POST /api/ponto-publico/:token/corrigir-ultima → troca entrada↔saída da última
// batida, só nos primeiros minutos (o "não era isso?" da tela de confirmação)
router.post('/:token/corrigir-ultima', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o RH.' });
        if (!sessaoValida(req, funcionario)) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

        const batida = await pontoService.corrigirUltimaBatida(funcionario.id, req.body?.tipo);
        const estado = await estadoCompleto(funcionario);
        res.json({ batida: pontoService.mapBatida(batida), ...estado });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ erro: error.message });
        console.error('[PontoPublico] corrigir última:', error);
        res.status(500).json({ erro: 'Erro ao corrigir a batida.' });
    }
});

// POST /api/ponto-publico/:token/acertos → "esqueci de bater": vários horários
// num pedido só, que o RH aprova depois
router.post('/:token/acertos', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Acesso bloqueado. Fale com o RH.' });
        if (!sessaoValida(req, funcionario)) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

        const pedido = await acertoService.criarPedido(funcionario.id, req.body || {});
        const estado = await estadoCompleto(funcionario);
        res.status(201).json({ pedido, ...estado });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ erro: error.message });
        console.error('[PontoPublico] criar acerto:', error);
        res.status(500).json({ erro: 'Erro ao enviar o pedido.' });
    }
});

// POST /api/ponto-publico/:token/acertos/:id/lido → "OK, entendi" no aviso
router.post('/:token/acertos/:id/lido', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!sessaoValida(req, funcionario)) return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });

        await acertoService.marcarLido(funcionario.id, req.params.id);
        res.json(await estadoCompleto(funcionario));
    } catch (error) {
        if (error.status) return res.status(error.status).json({ erro: error.message });
        console.error('[PontoPublico] marcar lido:', error);
        res.status(500).json({ erro: 'Erro ao confirmar a leitura.' });
    }
});

module.exports = router;
