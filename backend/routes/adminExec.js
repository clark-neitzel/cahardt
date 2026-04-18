/**
 * ROTA ADMIN-EXEC
 * Endpoints internos protegidos por ADMIN_SECRET (variável de ambiente).
 * Usados para operações de diagnóstico e manutenção em produção.
 *
 * Header obrigatório: x-admin-secret: <ADMIN_SECRET>
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const clienteInsightService = require('../services/clienteInsightService');
const orientacaoService = require('../services/orientacaoService');
const { execSync } = require('child_process');

// Middleware: valida ADMIN_SECRET
router.use((req, res, next) => {
    const secret = req.headers['x-admin-secret'];
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Não autorizado.' });
    }
    next();
});

// GET /api/admin-exec/ping
// Verifica se o servidor está respondendo e com as variáveis corretas
router.get('/ping', (req, res) => {
    res.json({
        ok: true,
        timestamp: new Date().toISOString(),
        openaiConfigurada: !!process.env.OPENAI_API_KEY,
        node: process.version,
    });
});

// POST /api/admin-exec/recalcular-dia/:diaSigla
// Recalcula insights + orientação para todos os clientes de um dia de rota
router.post('/recalcular-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }

    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true },
        });

        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );

        const resultados = [];
        for (const c of filtrados) {
            const insight = await clienteInsightService.recalcularCliente(c.UUID);
            const cat = insight ? orientacaoService.CATALOGO[insight.insightPrincipalTipo] : null;
            resultados.push({
                clienteId: c.UUID,
                nome: c.NomeFantasia || c.Nome,
                cenario: insight?.insightPrincipalTipo ?? null,
                situacao: cat?.situacao ?? null,
                objetivo: cat?.objetivo ?? null,
                canalRecomendado: cat?.canalRecomendado ?? null,
                acaoSugerida: cat?.acaoSugerida ?? null,
                statusRecompra: insight?.statusRecompra ?? null,
                diasSemComprar: insight?.diasSemComprar ?? null,
                ticketRecente: insight?.ticketMedioRecente ? Number(insight.ticketMedioRecente).toFixed(2) : null,
                variacaoTicket: insight?.variacaoTicketPct ? Number(insight.variacaoTicketPct).toFixed(1) + '%' : null,
                atendimentosSemPedido30d: insight?.qtdAtendimentosSemPedido30d ?? null,
                ok: !!insight,
            });
        }

        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro recalcular-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/dump-db
// Gera pg_dump e retorna como arquivo para download
router.get('/dump-db', (req, res) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL não configurada.' });
    try {
        const dump = execSync(`pg_dump "${dbUrl}" --no-owner --no-acl`, {
            maxBuffer: 100 * 1024 * 1024,
            timeout: 120000,
        });
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', 'attachment; filename="prod_dump.sql"');
        res.send(dump);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/recalcular-todos
// Recalcula insights de TODOS os clientes ativos
router.post('/recalcular-todos', async (req, res) => {
    res.json({ ok: true, mensagem: 'Recálculo iniciado em background.' });
    setImmediate(() => {
        clienteInsightService.recalcularTodosClientes().catch(console.error);
    });
});

module.exports = router;
