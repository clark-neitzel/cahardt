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
const importacaoCaService = require('../services/importacaoCaService');

const CLASSIFICACOES = ['OPERACIONAL', 'FINANCEIRO', 'FORA_DRE', 'A_CLASSIFICAR'];

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

// ── GET /por-conta?de=YYYY-MM-DD&ate=YYYY-MM-DD&saldoCA=1 ──
// Totais por conta financeira (banco/caixa) no período: entradas, saídas, resultado
// e, opcionalmente, o saldo em tempo real no Conta Azul.
router.get('/por-conta', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const comSaldoCA = req.query.saldoCA === '1' || req.query.saldoCA === 'true';
        const dados = await financeiroGerencialService.saldosPorConta(String(de), String(ate), comSaldoCA);
        res.json(dados);
    } catch (error) {
        console.error('Erro no financeiro por conta:', error);
        res.status(500).json({ error: 'Erro ao montar o resumo por conta.' });
    }
});

// ── GET /por-conta/extrato?contaId=UUID|sem&de=YYYY-MM-DD&ate=YYYY-MM-DD ──
// Lançamentos (entradas e saídas) de UMA conta no período. contaId=sem → sem banco informado.
router.get('/por-conta/extrato', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const contaId = (!req.query.contaId || req.query.contaId === 'sem') ? null : String(req.query.contaId);
        const dados = await financeiroGerencialService.extratoPorConta(contaId, String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro no extrato por conta:', error);
        res.status(500).json({ error: 'Erro ao montar o extrato da conta.' });
    }
});

// ── GET /margem-produtos?de=YYYY-MM-DD&ate=YYYY-MM-DD ──
// Margem por produto: vendas do período (mesma regra da DRE) × custo unitário
// (ficha técnica ativa do PCP > custo de compra > custo do CA).
router.get('/margem-produtos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { de, ate } = req.query;
        if (!YMD.test(String(de)) || !YMD.test(String(ate))) {
            return res.status(400).json({ error: 'Informe de e ate no formato YYYY-MM-DD.' });
        }
        if (String(ate) < String(de)) {
            return res.status(400).json({ error: 'A data final precisa ser maior ou igual à inicial.' });
        }
        const dados = await financeiroGerencialService.margemProdutos(String(de), String(ate));
        res.json(dados);
    } catch (error) {
        console.error('Erro na margem por produto:', error);
        res.status(500).json({ error: 'Erro ao montar a margem por produto.' });
    }
});

// ── GET /categorias-despesa — categorias com o "balde" (classificação) e o total gasto ──
// Garante uma linha para toda categoria já vista nas contas (com o palpite padrão),
// para o usuário nunca ficar com categoria "solta" fora da classificação.
router.get('/categorias-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        // Categorias vistas nas contas (rateios + categoria da conta)
        const [rateios, contas] = await Promise.all([
            prisma.contaPagarRateio.groupBy({
                by: ['categoria'],
                _sum: { valor: true },
                where: { contaPagar: { status: { not: 'CANCELADO' } } }
            }),
            prisma.contaPagar.groupBy({
                by: ['categoria'],
                _sum: { valorTotal: true },
                where: { status: { not: 'CANCELADO' }, rateios: { none: {} } }
            })
        ]);

        const totalPorNome = new Map();
        const somar = (nome, v) => {
            const n = (nome || 'Sem categoria').trim() || 'Sem categoria';
            totalPorNome.set(n, Math.round(((totalPorNome.get(n) || 0) + Number(v || 0)) * 100) / 100);
        };
        rateios.forEach((r) => somar(r.categoria, r._sum.valor));
        contas.forEach((c) => somar(c.categoria, c._sum.valorTotal));

        // Cria as que ainda não existem na tabela de classificação
        await importacaoCaService.garantirCategorias([...totalPorNome.keys()]);

        const linhas = await prisma.categoriaDespesa.findMany({ orderBy: { nome: 'asc' } });
        res.json(linhas.map((l) => ({
            id: l.id,
            nome: l.nome,
            classificacao: l.classificacao,
            total: totalPorNome.get(l.nome) || 0
        })));
    } catch (error) {
        console.error('Erro ao listar categorias de despesa:', error);
        res.status(500).json({ error: 'Erro ao listar as categorias de despesa.' });
    }
});

// ── PUT /categorias-despesa — salvar a classificação (baldes) ──
// body: { categorias: [{ nome, classificacao }] }
router.put('/categorias-despesa', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const lista = Array.isArray(req.body?.categorias) ? req.body.categorias : [];
        if (lista.length === 0) return res.status(400).json({ error: 'Nada para salvar.' });
        for (const item of lista) {
            const nome = String(item?.nome || '').trim();
            const classificacao = String(item?.classificacao || '').toUpperCase();
            if (!nome || !CLASSIFICACOES.includes(classificacao)) continue;
            await prisma.categoriaDespesa.upsert({
                where: { nome },
                update: { classificacao },
                create: { nome, classificacao }
            });
        }
        res.json({ message: 'Classificação salva!' });
    } catch (error) {
        console.error('Erro ao salvar classificação de categorias:', error);
        res.status(500).json({ error: 'Erro ao salvar a classificação.' });
    }
});

module.exports = router;
