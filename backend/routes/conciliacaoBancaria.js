/**
 * Conciliação bancária — importar extrato OFX e bater com as baixas do app.
 * Permissão: admin ou Pode_Acessar_Financeiro_Gerencial (mesma dos relatórios gerenciais).
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const conciliacaoService = require('../services/conciliacaoBancariaService');

const uploadOfx = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Financeiro_Gerencial) {
        return res.status(403).json({ error: 'Sem permissão para acessar a conciliação bancária.' });
    }
    next();
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validarPeriodo = (req, res) => {
    const { de, ate } = req.query.de ? req.query : req.body;
    if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
        res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        return null;
    }
    if (String(ate) < String(de)) {
        res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        return null;
    }
    return { de: String(de), ate: String(ate) };
};

// ── POST /importar — sobe um arquivo OFX (campo "arquivo") para uma conta ──
router.post('/importar', verificarAuth, checkAcesso, uploadOfx.single('arquivo'), async (req, res) => {
    try {
        const contaFinanceiraCaId = String(req.body.contaFinanceiraCaId || '').trim();
        if (!contaFinanceiraCaId) return res.status(400).json({ error: 'Escolha o banco/caixa do extrato.' });
        if (!req.file?.buffer) return res.status(400).json({ error: 'Envie o arquivo OFX do extrato.' });

        const resultado = await conciliacaoService.importarOfx({
            contaFinanceiraCaId,
            nomeArquivo: req.file.originalname || 'extrato.ofx',
            conteudo: req.file.buffer.toString('utf8'),
            criadoPorId: req.user.id
        });
        res.json({
            message: `${resultado.novos} lançamento(s) novo(s) importado(s)${resultado.duplicados ? `, ${resultado.duplicados} já existiam` : ''}.`,
            ...resultado
        });
    } catch (error) {
        console.error('Erro ao importar OFX:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao importar o extrato.' });
    }
});

// ── GET /lancamentos?contaId&de&ate&status — extrato + sugestões + resumo ──
router.get('/lancamentos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const periodo = validarPeriodo(req, res);
        if (!periodo) return;
        const contaId = String(req.query.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        const status = req.query.status ? String(req.query.status).toUpperCase() : 'todos';
        const dados = await conciliacaoService.listar({
            contaFinanceiraCaId: contaId,
            de: periodo.de,
            ate: periodo.ate,
            status: ['PENDENTE', 'CONCILIADO', 'IGNORADO'].includes(status) ? status : 'todos'
        });
        res.json(dados);
    } catch (error) {
        console.error('Erro ao listar lançamentos do extrato:', error);
        res.status(500).json({ error: 'Erro ao listar o extrato.' });
    }
});

// ── POST /conciliar-auto — fecha sozinho os pendentes com exatamente 1 candidato ──
router.post('/conciliar-auto', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const periodo = validarPeriodo(req, res);
        if (!periodo) return;
        const contaId = String(req.body.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        const r = await conciliacaoService.conciliarAutomatico({
            contaFinanceiraCaId: contaId,
            de: periodo.de,
            ate: periodo.ate,
            userId: req.user.id
        });
        res.json({
            message: r.conciliados > 0
                ? `${r.conciliados} lançamento(s) conciliado(s) automaticamente${r.restantes ? `; ${r.restantes} ficaram para revisão` : ''}.`
                : 'Nenhum lançamento pôde ser conciliado sozinho — revise as sugestões na lista.',
            ...r
        });
    } catch (error) {
        console.error('Erro na conciliação automática:', error);
        res.status(500).json({ error: 'Erro na conciliação automática.' });
    }
});

// ── POST /:id/conciliar — vincula o lançamento à baixa escolhida ──
router.post('/:id/conciliar', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.conciliar({
            lancamentoId: req.params.id,
            pagamentoParcelaId: req.body.pagamentoParcelaId || null,
            pagamentoParcelaPagarId: req.body.pagamentoParcelaPagarId || null,
            userId: req.user.id
        });
        res.json(r);
    } catch (error) {
        console.error('Erro ao conciliar lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao conciliar.' });
    }
});

// ── POST /:id/ignorar — tarifa, transferência interna etc. ──
router.post('/:id/ignorar', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.ignorar({ lancamentoId: req.params.id, obs: req.body.obs, userId: req.user.id });
        res.json(r);
    } catch (error) {
        console.error('Erro ao ignorar lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao ignorar.' });
    }
});

// ── POST /:id/desfazer — volta para pendente ──
router.post('/:id/desfazer', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const r = await conciliacaoService.desfazer({ lancamentoId: req.params.id });
        res.json(r);
    } catch (error) {
        console.error('Erro ao desfazer lançamento:', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Erro ao desfazer.' });
    }
});

// ── GET /importacoes?contaId — histórico de arquivos importados ──
router.get('/importacoes', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const contaId = String(req.query.contaId || '').trim();
        if (!contaId) return res.status(400).json({ error: 'Escolha o banco/caixa.' });
        res.json(await conciliacaoService.listarImportacoes(contaId));
    } catch (error) {
        console.error('Erro ao listar importações:', error);
        res.status(500).json({ error: 'Erro ao listar as importações.' });
    }
});

module.exports = router;
