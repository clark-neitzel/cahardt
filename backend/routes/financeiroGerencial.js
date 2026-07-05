/**
 * Financeiro Gerencial (Fase 5) — Fluxo de Caixa e DRE.
 * Relatórios SOMENTE LEITURA sobre contas a receber/pagar e pedidos.
 *
 * Permissão: admin ou Pode_Acessar_Financeiro_Gerencial
 */

const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const financeiroGerencialService = require('../services/financeiroGerencialService');

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
        return res.status(403).json({ error: 'Sem permissão para acessar o financeiro gerencial.' });
    }
    next();
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;

// ── GET /fluxo-caixa?de=YYYY-MM-DD&ate=YYYY-MM-DD&granularidade=dia|mes ──
router.get('/fluxo-caixa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        const granularidade = req.query.granularidade === 'mes' ? 'mes' : 'dia';
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const dados = await financeiroGerencialService.fluxoCaixa(String(de), String(ate), granularidade);
        res.json(dados);
    } catch (error) {
        console.error('Erro no fluxo de caixa:', error);
        res.status(500).json({ error: 'Erro ao montar o fluxo de caixa.' });
    }
});

// ── GET /dre?de=YYYY-MM&ate=YYYY-MM ──
router.get('/dre', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YM.test(String(de)) || !YM.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'O mês final precisa ser maior ou igual ao inicial.' });
        }
        const dados = await financeiroGerencialService.dre(String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro na DRE:', error);
        res.status(500).json({ error: 'Erro ao montar a DRE.' });
    }
});

module.exports = router;
