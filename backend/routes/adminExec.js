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

// POST /api/admin-exec/ia-dia/:diaSigla
// Gera orientação via IA (GPT-4o-mini) para todos os clientes de um dia de rota
router.post('/ia-dia/:diaSigla', async (req, res) => {
    const sigla = (req.params.diaSigla || '').toUpperCase().trim();
    const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
    if (!DIAS_VALIDOS.includes(sigla)) {
        return res.status(400).json({ error: `Sigla inválida. Use: ${DIAS_VALIDOS.join(', ')}` });
    }
    try {
        const clientes = await prisma.cliente.findMany({
            where: { Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, Nome: true, NomeFantasia: true, Dia_de_venda: true }
        });
        const filtrados = clientes.filter(c =>
            c.Dia_de_venda.toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const resultados = [];
        for (const c of filtrados) {
            try {
                const resultado = await orientacaoService.gerarOrientacaoIA(c.UUID, { disparadoPor: 'MANUAL' });
                resultados.push({ ok: true, ...resultado });
            } catch (err) {
                resultados.push({ ok: false, clienteId: c.UUID, nome: c.NomeFantasia || c.Nome, erro: err.message });
            }
        }
        res.json({ dia: sigla, total: filtrados.length, resultados });
    } catch (error) {
        console.error('[admin-exec] Erro ia-dia:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/admin-exec/migrate-ia-log
// Cria tabela ia_analise_logs se não existir (migração manual)
router.post('/migrate-ia-log', async (req, res) => {
    const steps = [];
    try {
        await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ia_analise_logs" ("id" SERIAL NOT NULL, "cliente_id" TEXT NOT NULL, "vendedor_id" TEXT, "disparado_por" TEXT NOT NULL, "disparado_por_usuario_id" TEXT, "atendimento_id" INTEGER, "modelo" TEXT NOT NULL DEFAULT 'gpt-4o-mini', "prompt_enviado" TEXT NOT NULL, "dados_entrada" JSONB NOT NULL, "resposta_ia" JSONB, "tokens_prompt" INTEGER, "tokens_resposta" INTEGER, "tokens_total" INTEGER, "duracao_ms" INTEGER, "sucesso" BOOLEAN NOT NULL DEFAULT true, "erro_msg" TEXT, "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ia_analise_logs_pkey" PRIMARY KEY ("id"))`);
        steps.push('tabela criada');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_cliente_id_idx" ON "ia_analise_logs"("cliente_id")`);
        steps.push('index cliente_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_criado_em_idx" ON "ia_analise_logs"("criado_em" DESC)`);
        steps.push('index criado_em');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_vendedor_id_idx" ON "ia_analise_logs"("vendedor_id")`);
        steps.push('index vendedor_id');
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ia_analise_logs_disparado_por_idx" ON "ia_analise_logs"("disparado_por")`);
        steps.push('index disparado_por');
        // FK com verificação manual (DO $$ não é prepared statement)
        const [fkExiste] = await prisma.$queryRaw`SELECT COUNT(*) as c FROM information_schema.table_constraints WHERE constraint_name = 'ia_analise_logs_cliente_id_fkey'`;
        if (Number(fkExiste.c) === 0) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ADD CONSTRAINT "ia_analise_logs_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("UUID") ON DELETE RESTRICT ON UPDATE CASCADE`);
            steps.push('FK adicionada');
        } else {
            steps.push('FK já existe');
        }
        // Corrigir tipo da coluna atendimento_id de INTEGER para TEXT (fix UUID)
        try {
            await prisma.$executeRawUnsafe(`ALTER TABLE "ia_analise_logs" ALTER COLUMN "atendimento_id" TYPE TEXT USING "atendimento_id"::text`);
            steps.push('coluna atendimento_id convertida para TEXT');
        } catch (e) {
            steps.push(`atendimento_id já é TEXT ou erro: ${e.message}`);
        }
        res.json({ ok: true, steps, mensagem: 'Tabela ia_analise_logs criada/verificada com sucesso.' });
    } catch (error) {
        console.error('[admin-exec] Erro migrate-ia-log:', error);
        res.status(500).json({ error: error.message, steps });
    }
});

// GET /api/admin-exec/ia-log-status
// Diagnóstico: verifica se iaAnaliseLog está disponível no Prisma e conta registros
router.get('/ia-log-status', async (req, res) => {
    try {
        // 1. Conta via raw SQL (sempre funciona se a tabela existe)
        const [countRaw] = await prisma.$queryRaw`SELECT COUNT(*)::int as total FROM "ia_analise_logs"`;
        // 2. Testa se o model Prisma está disponível
        let prismaModelOk = false;
        let prismaCount = null;
        try {
            prismaCount = await prisma.iaAnaliseLog.count();
            prismaModelOk = true;
        } catch (e) {
            prismaModelOk = false;
        }
        res.json({
            tabelaExiste: true,
            totalRegistrosRaw: countRaw.total,
            prismaModelDisponivel: prismaModelOk,
            prismaCount,
        });
    } catch (error) {
        res.status(500).json({ error: error.message, tabelaExiste: false });
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
