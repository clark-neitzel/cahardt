/**
 * ROTA ADMIN-EXEC
 * Endpoints internos protegidos por ADMIN_SECRET (variável de ambiente).
 * Usados para operações de diagnóstico e manutenção em produção.
 *
 * Header obrigatório: x-admin-secret: <ADMIN_SECRET>
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');
const clienteInsightService = require('../services/clienteInsightService');
const orientacaoService = require('../services/orientacaoService');
const estoqueService = require('../services/estoqueService');
const contaAzulService = require('../services/contaAzulService');

// Estado do backfill assíncrono da conta financeira em Contas a Receber (varre em segundo plano)
const _backfillReceber = { rodando: false, progresso: null };

// Comparação em tempo constante (evita ataque de timing). Usa hash SHA-256 para
// os buffers terem sempre o mesmo tamanho, sem vazar o comprimento do segredo.
function segredoConfere(recebido, esperado) {
    if (typeof recebido !== 'string' || typeof esperado !== 'string') return false;
    const a = crypto.createHash('sha256').update(recebido).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

// Middleware: valida ADMIN_SECRET
router.use((req, res, next) => {
    const esperado = process.env.ADMIN_SECRET;
    // Fail-closed: sem segredo configurado no ambiente, ninguém entra (evita
    // comparar contra undefined e deixar a rota aberta por engano).
    if (!esperado) {
        console.error('[admin-exec] ADMIN_SECRET não configurado no ambiente — acesso bloqueado.');
        return res.status(503).json({ error: 'Servidor sem ADMIN_SECRET configurado.' });
    }
    const secret = req.headers['x-admin-secret'];
    if (!secret || !segredoConfere(String(secret), esperado)) {
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

// GET /api/admin-exec/diag-parcela-ca?nota=1802  — diagnóstico de edição de vencimento no CA
router.get('/diag-parcela-ca', async (req, res) => {
    try {
        const { nota } = req.query;
        if (!nota) return res.status(400).json({ error: 'Informe ?nota=NUMERO' });

        const conta = await prisma.contaPagar.findFirst({
            where: { OR: [{ numeroNota: String(nota) }, { descricao: { contains: String(nota) } }] },
            include: { parcelas: { orderBy: { numeroParcela: 'asc' } } },
            orderBy: { criadoEm: 'desc' }
        });
        if (!conta) return res.json({ ok: false, motivo: `Nenhuma conta com nota "${nota}"` });

        const parcelasLocal = conta.parcelas.map((p) => ({
            id: p.id, numeroParcela: p.numeroParcela, status: p.status,
            dataVencimentoLocal: p.dataVencimento, valorLocal: p.valor, idParcelaCA: p.idParcelaCA
        }));

        // Estado REAL no CA da 1ª parcela mapeada (mostra o nome/valor do campo de vencimento no CA)
        let parcelaCA = null;
        const mapeada = conta.parcelas.find((p) => p.idParcelaCA);
        if (mapeada) {
            try {
                const det = await contaAzulService.buscarParcelaDetalhe(mapeada.idParcelaCA);
                parcelaCA = {
                    idParcelaCA: mapeada.idParcelaCA,
                    versao: det?.versao,
                    status: det?.status, status_traduzido: det?.status_traduzido,
                    data_vencimento: det?.data_vencimento, vencimento: det?.vencimento,
                    total: det?.total, valor_composicao: det?.valor_composicao,
                    _chaves: Object.keys(det || {})
                };
            } catch (e) {
                parcelaCA = { erro: e.response?.data || e.message };
            }
        }

        const logs = await prisma.syncLog.findMany({
            where: { tipo: { in: ['PARCELA_ATUALIZAR', 'PARCELA_DETALHE'] } },
            orderBy: { dataHora: 'desc' }, take: 8,
            select: { tipo: true, status: true, mensagem: true, requestMethod: true, responseStatus: true, responseBody: true, dataHora: true }
        });

        res.json({
            ok: true,
            conta: { id: conta.id, descricao: conta.descricao, numeroNota: conta.numeroNota, statusEnvioCA: conta.statusEnvioCA, idEventoCA: conta.idEventoCA },
            parcelasLocal, parcelaCA, logsRecentes: logs
        });
    } catch (error) {
        console.error('[admin-exec] Erro diag-parcela-ca:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/diag-conciliacao?nota=858860  (ou ?busca=produpan)
// SOMENTE LEITURA: refaz a busca de conciliação ao vivo no CA e mostra por que casou/ não casou.
router.get('/diag-conciliacao', async (req, res) => {
    try {
        const { nota, busca } = req.query;
        const BASE = 'https://api-v2.contaazul.com';
        const fmtDataCA = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const round2 = (v) => Math.round(Number(v) * 100) / 100;

        const where = nota
            ? { numeroNota: { contains: String(nota) } }
            : { OR: [
                { descricao: { contains: String(busca || ''), mode: 'insensitive' } },
                { fornecedor: { razaoSocial: { contains: String(busca || ''), mode: 'insensitive' } } }
              ] };
        const contas = await prisma.contaPagar.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 3, include: { fornecedor: true, parcelas: true } });
        if (contas.length === 0) return res.json({ erro: 'Nenhuma conta encontrada no app', where });

        const info = {
            contasApp: contas.map(c => ({
                id: c.id, numeroNota: c.numeroNota, valorTotal: Number(c.valorTotal),
                statusEnvioCA: c.statusEnvioCA, idEventoCA: c.idEventoCA, erroEnvioCA: c.erroEnvioCA,
                fornecedorCaId: c.fornecedor?.contaAzulId,
                vencs: c.parcelas.map(p => fmtDataCA(p.dataVencimento))
            }))
        };

        const conta = contas[0];
        const numero = String(conta.numeroNota || '').trim();
        const datas = conta.parcelas.map(p => new Date(p.dataVencimento).getTime()).filter(t => !isNaN(t));
        const bc = new Date(conta.competencia || Date.now()).getTime(); if (!isNaN(bc)) datas.push(bc);
        const JAN = 45 * 24 * 60 * 60 * 1000;
        const de = fmtDataCA(new Date(Math.min(...datas) - JAN));
        const ate = fmtDataCA(new Date(Math.max(...datas) + JAN));
        const statusQS = ['RECEBIDO', 'EM_ABERTO', 'ATRASADO', 'RECEBIDO_PARCIAL', 'RENEGOCIADO', 'PERDIDO'].map(s => `&status=${s}`).join('');
        const url = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=1&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;

        const valorConta = round2(Number(conta.valorTotal || 0));
        const alvoForn = String(conta.fornecedor?.razaoSocial || 'produpan').toLowerCase().split(' ')[0];
        const candidatos = [];
        let pagina = 1, totalItens = null, itensVarridos = 0;
        try {
            while (pagina <= 10) {
                const purl = `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=${pagina}&tamanho_pagina=100&data_vencimento_de=${de}&data_vencimento_ate=${ate}${statusQS}`;
                const resp = await contaAzulService._axiosGet(purl, 'DIAG_CONCILIA');
                const itens = resp.data?.itens || resp.data?.items || [];
                totalItens = Number(resp.data?.itens_totais || totalItens || 0);
                itensVarridos += itens.length;
                for (const it of itens) {
                    const totalIt = round2(Number(it.total ?? it.nao_pago ?? 0));
                    const desc = String(it.descricao || '');
                    const forn = String(it.fornecedor?.nome || '');
                    const valorBate = Math.abs(totalIt - valorConta) < 0.01;
                    const numNaDesc = numero && desc.includes(numero);
                    const pareceForn = forn.toLowerCase().includes(alvoForn) || desc.toLowerCase().includes('produpan') || desc.includes('858860');
                    if (valorBate || numNaDesc || pareceForn) {
                        let det = {};
                        try {
                            const d = await contaAzulService._axiosGet(`${BASE}/v1/financeiro/eventos-financeiros/parcelas/${it.id}`, 'DIAG_DET');
                            const ev = d.data?.evento || {};
                            det = { evento_id: ev.id, codigo_referencia: ev.codigo_referencia, origem: ev.origem, evento_descricao: ev.descricao };
                        } catch (e) { det = { erroDetalhe: e.message }; }
                        candidatos.push({ parcelaId: it.id, total: totalIt, descricao: desc, fornecedor: forn, valorBate, numeroAppNaDesc: numNaDesc, ...det });
                    }
                }
                if (itens.length < 100) break;
                if (totalItens && pagina * 100 >= totalItens) break;
                pagina++;
            }
        } catch (e) {
            info.buscaErro = e.response?.status ? `HTTP ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 300)}` : e.message;
        }
        info.busca = { numeroApp: numero, de, ate, itens_totais: totalItens, itensVarridos, paginas: pagina };
        info.candidatos = candidatos;

        // Chama a função REAL de conciliação para confirmar o que ela adotaria hoje (só leitura).
        try {
            const contasPagarCaSyncService = require('../services/contasPagarCaSyncService');
            const adotaria = await contasPagarCaSyncService._encontrarEventoPorNumeroNota(conta);
            info.conciliacaoReal = { adotariaEventoId: adotaria || null };
        } catch (e) {
            info.conciliacaoReal = { erro: e.message };
        }

        // Testa a busca de fornecedor por documento (dedup de cadastro no CA).
        try {
            const cnpj = conta.fornecedor?.cnpjCpf;
            const achado = cnpj ? await contaAzulService.buscarFornecedorPorDocumento(cnpj) : null;
            info.fornecedorNoCA = { cnpj: cnpj || null, appUsaContaAzulId: conta.fornecedor?.contaAzulId || null, buscaPorDocumentoRetornou: achado };
        } catch (e) {
            info.fornecedorNoCA = { erro: e.message };
        }
        res.json(info);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: (error.stack || '').split('\n').slice(0, 5) });
    }
});

// POST /api/admin-exec/kitfesta-reenviar-whatsapp/:numero
// Reenvia (ou envia) ao celular do cliente a confirmação de um pedido do Kit Festa.
// Útil para pedidos criados antes do recurso entrar no ar ou que falharam no envio.
router.post('/kitfesta-reenviar-whatsapp/:numero', async (req, res) => {
    try {
        const numero = parseInt(req.params.numero, 10);
        if (!numero) return res.status(400).json({ error: 'Número de pedido inválido.' });
        const pedido = await prisma.kitFestaPedido.findUnique({ where: { numero } });
        if (!pedido) return res.status(404).json({ error: 'Pedido Kit Festa não encontrado.' });
        const webhookService = require('../services/webhookService');
        const result = await webhookService.notificarPedidoKitFesta(pedido.id);
        res.json({ numero, telefoneCliente: pedido.telefoneCliente, ...result });
    } catch (error) {
        console.error('[admin-exec] Erro kitfesta-reenviar-whatsapp:', error);
        res.status(500).json({ ok: false, motivo: error.message });
    }
});

// GET /api/admin-exec/diag-colunas
// SOMENTE LEITURA. Conta, por tabela, colunas vivas vs "fantasma" (dropped) que
// ainda ocupam vaga no limite de 1600 do Postgres. Usado para diagnosticar o
// estoque de colunas mortas (ex.: tabela "clientes" no teto).
router.get('/diag-colunas', async (req, res) => {
    try {
        const linhas = await prisma.$queryRawUnsafe(`
            SELECT
                c.relname AS tabela,
                count(*) FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped)::int AS colunas_vivas,
                count(*) FILTER (WHERE a.attnum > 0 AND a.attisdropped)::int     AS colunas_fantasma,
                count(*) FILTER (WHERE a.attnum > 0)::int                        AS total_slots
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            GROUP BY c.relname
            ORDER BY total_slots DESC
            LIMIT 40
        `);
        res.json({ ok: true, limiteMaximo: 1600, tabelas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
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

// POST /api/admin-exec/limpar-atendimentos-pedido
// Remove atendimentos auto-criados do tipo PEDIDO (gerados erroneamente ao criar pedido)
router.post('/limpar-atendimentos-pedido', async (req, res) => {
    try {
        const result = await prisma.atendimento.deleteMany({ where: { tipo: 'PEDIDO' } });
        res.json({ ok: true, removidos: result.count });
    } catch (error) {
        console.error('[admin-exec] Erro limpar-atendimentos-pedido:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-pendencias?email=xxx&data=2026-04-21
// Diagnostica o que existe no banco para um vendedor em uma data
router.get('/debug-pendencias', async (req, res) => {
    try {
        const { email, data } = req.query;
        if (!email || !data) return res.status(400).json({ error: 'email e data obrigatórios' });

        const vendedor = await prisma.vendedor.findFirst({ where: { email } });
        if (!vendedor) return res.status(404).json({ error: 'Vendedor não encontrado', email });

        const vendedorId = vendedor.id;
        const inicioDia = new Date(data + 'T00:00:00Z');
        const fimAmanha = new Date(data + 'T23:59:59.999Z');
        fimAmanha.setDate(fimAmanha.getDate() + 1);

        // Clientes da rota do dia
        const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const sigla = SIGLAS[new Date(data + 'T12:00:00Z').getDay()];
        const todosClientes = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Ativo: true, Dia_de_venda: { not: null } },
            select: { UUID: true, NomeFantasia: true, Nome: true, Dia_de_venda: true },
        });
        const clientesDoDia = todosClientes.filter(c =>
            (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim()).includes(sigla)
        );
        const uuids = clientesDoDia.map(c => c.UUID);

        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId: { in: uuids }, criadoEm: { gte: inicioDia, lte: fimAmanha }, tipo: { not: 'FINANCEIRO' } },
            select: { id: true, tipo: true, criadoEm: true, observacao: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });
        const pedidos = await prisma.pedido.findMany({
            where: { clienteId: { in: uuids }, createdAt: { gte: inicioDia, lte: fimAmanha } },
            select: { id: true, createdAt: true, dataVenda: true, clienteId: true, cliente: { select: { NomeFantasia: true } } },
        });

        const atendidos = new Set([...atendimentos.map(a => a.clienteId), ...pedidos.map(p => p.clienteId)]);
        const pendentes = clientesDoDia.filter(c => !atendidos.has(c.UUID));

        res.json({
            vendedor: vendedor.nome || vendedor.email,
            vendedorId,
            sigla,
            totalRota: clientesDoDia.length,
            atendimentos: atendimentos.length,
            pedidos: pedidos.length,
            pendentes: pendentes.length,
            clientesPendentes: pendentes.map(c => c.NomeFantasia || c.Nome),
            detalheAtendimentos: atendimentos,
            detalhePedidos: pedidos,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin-exec/debug-cliente-atendimentos?clienteId=xxx
// Últimos atendimentos de um cliente (sem filtro de data)
router.get('/debug-cliente-atendimentos', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const atendimentos = await prisma.atendimento.findMany({
            where: { clienteId },
            select: { id: true, tipo: true, acaoKey: true, acaoLabel: true, observacao: true, criadoEm: true, idVendedor: true },
            orderBy: { criadoEm: 'desc' },
            take: 10,
        });
        res.json({ total: atendimentos.length, atendimentos });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

// GET /api/admin-exec/debug-contas-receber-abertas — diagnóstico de contas ABERTO/PARCIAL por status do pedido
router.get('/debug-contas-receber-abertas', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] } },
            select: {
                id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true, especial: true } }
            },
            orderBy: { createdAt: 'asc' }
        });

        const agrupado = {};
        for (const c of contas) {
            const key = c.pedido
                ? `pedido: statusEnvio=${c.pedido.statusEnvio} | situacaoCA=${c.pedido.situacaoCA} | bonificacao=${c.pedido.bonificacao} | especial=${c.pedido.especial}`
                : 'sem pedido (ESPECIAL)';
            if (!agrupado[key]) agrupado[key] = { count: 0, exemplos: [] };
            agrupado[key].count++;
            if (agrupado[key].exemplos.length < 5) {
                agrupado[key].exemplos.push({
                    contaStatus: c.status,
                    pedidoNumero: c.pedido?.numero || null
                });
            }
        }

        res.json({ total: contas.length, agrupado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-pedido-excluido — cancela contas cujo pedido foi excluído/cancelado no CA
router.post('/cancelar-contas-pedido-excluido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    OR: [
                        { statusEnvio: 'EXCLUIDO' },
                        { situacaoCA: { in: ['CANCELADO', 'EXCLUIDO'] } }
                    ]
                }
            },
            select: { id: true, pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true, bonificacao: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({
                    where: { id: c.id },
                    data: { status: 'CANCELADO' }
                })
            ]);
            canceladas++;
        }

        res.json({
            ok: true,
            canceladas,
            detalhes: contas.map(c => ({ pedidoNumero: c.pedido?.numero, statusEnvio: c.pedido?.statusEnvio, situacaoCA: c.pedido?.situacaoCA, bonificacao: c.pedido?.bonificacao }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-inadimplencia?clienteId=xxx — parcelas vencidas PENDENTES de um cliente
router.get('/debug-inadimplencia', async (req, res) => {
    try {
        const { clienteId } = req.query;
        if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

        const parcelas = await prisma.parcela.findMany({
            where: {
                status: 'PENDENTE',
                dataVencimento: { lt: hoje },
                contaReceber: { clienteId, status: { in: ['ABERTO', 'PARCIAL'] } }
            },
            include: {
                contaReceber: {
                    select: { id: true, status: true, origem: true, pedidoId: true,
                        pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } } }
                }
            }
        });

        const todasContas = await prisma.contaReceber.findMany({
            where: { clienteId },
            select: { id: true, status: true, origem: true,
                pedido: { select: { numero: true, statusEnvio: true, situacaoCA: true } },
                parcelas: { select: { status: true, dataVencimento: true, valor: true } }
            }
        });

        res.json({ parcelasVencidasPendentes: parcelas.length, parcelas, todasContas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/cancelar-contas-bonificacao — cancela contasReceber de pedidos bonificação (não deveriam existir)
router.post('/cancelar-contas-bonificacao', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { status: { in: ['ABERTO', 'PARCIAL'] }, pedido: { bonificacao: true } },
            select: { id: true, pedido: { select: { numero: true } } }
        });

        let canceladas = 0;
        for (const c of contas) {
            await prisma.$transaction([
                prisma.parcela.updateMany({
                    where: { contaReceberId: c.id, status: { notIn: ['PAGO'] } },
                    data: { status: 'CANCELADO' }
                }),
                prisma.contaReceber.update({ where: { id: c.id }, data: { status: 'CANCELADO' } })
            ]);
            canceladas++;
        }

        res.json({ ok: true, canceladas, pedidos: contas.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/listar-contas-sem-pedido — lista todas as contas sem pedido vinculado (especial de teste)
router.get('/listar-contas-sem-pedido', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: { pedidoId: null },
            select: {
                id: true, status: true, origem: true,
                valorTotal: true, createdAt: true,
                cliente: { select: { Nome: true, NomeFantasia: true } },
                parcelas: { select: { id: true, status: true, valor: true, dataVencimento: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json({ total: contas.length, contas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/deletar-contas-ids — deleta permanentemente contas a receber por IDs
// Body: { ids: ["id1","id2",...] }
router.post('/deletar-contas-ids', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Body deve conter { ids: [...] }' });
        }
        const deletadas = [];
        for (const id of ids) {
            const conta = await prisma.contaReceber.findUnique({
                where: { id },
                select: { id: true, status: true, cliente: { select: { Nome: true } }, pedidoId: true }
            });
            if (!conta) { deletadas.push({ id, status: 'não encontrada' }); continue; }
            await prisma.$transaction([
                prisma.parcela.deleteMany({ where: { contaReceberId: id } }),
                prisma.contaReceber.delete({ where: { id } })
            ]);
            deletadas.push({ id, cliente: conta.cliente?.Nome, status: 'deletada' });
        }
        res.json({ ok: true, deletadas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/setar-combustivel — define tipoCombustivel em veículos pelo array {placa, tipo}
router.post('/setar-combustivel', async (req, res) => {
    try {
        const { veiculos } = req.body; // [{ placa: 'RLB6E01', tipo: 'DIESEL' }, ...]
        if (!Array.isArray(veiculos)) return res.status(400).json({ error: 'veiculos deve ser array' });
        const resultados = [];
        for (const { placa, tipo } of veiculos) {
            const v = await prisma.veiculo.findUnique({ where: { placa: placa.toUpperCase() } });
            if (!v) { resultados.push({ placa, ok: false, erro: 'não encontrado' }); continue; }
            await prisma.veiculo.update({ where: { id: v.id }, data: { tipoCombustivel: tipo } });
            resultados.push({ placa, ok: true, tipo });
        }
        res.json({ ok: true, resultados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/debug-charge/:pedidoId — retorna raw do CA para cobranças do pedido
router.get('/debug-charge/:pedidoId', async (req, res) => {
    try {
        const contaAzulService = require('../services/contaAzulService');
        const axios = require('axios');

        const pedido = await prisma.pedido.findUnique({
            where: { id: req.params.pedidoId },
            include: { cliente: { select: { UUID: true } } }
        });
        if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
        if (!pedido.idVendaContaAzul) return res.status(400).json({ error: 'Pedido sem idVendaContaAzul' });

        const dataVendaStr = new Date(pedido.dataVenda).toISOString().split('T')[0];
        const parcelas = await contaAzulService.encontrarParcelasDeVenda(
            pedido.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
        );

        const token = await contaAzulService.getAccessToken();
        const resultado = [];

        for (const parcela of parcelas) {
            const solicitacoes = parcela.solicitacoes_cobrancas || [];
            for (const cob of solicitacoes) {
                if (!cob?.id) continue;
                try {
                    const r = await axios.get(`https://api-v2.contaazul.com/v1/charge/${cob.id}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    resultado.push({ cobObj: cob, chargeRaw: r.data });
                } catch (e) {
                    resultado.push({ cobObj: cob, erro: e.response?.data || e.message });
                }
            }
        }

        res.json({ pedidoId: pedido.id, idVendaCA: pedido.idVendaContaAzul, parcelas: parcelas.length, cobranças: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/export-full-db
// Exporta todas as tabelas como JSON para backup/sync local.
// Query param opcional: ?skip=sync_logs,ia_analise_logs
router.get('/export-full-db', async (req, res) => {
    const skip = (req.query.skip || '').split(',').filter(Boolean);

    const ALL_TABLES = [
        'categorias_produto', 'categorias_estoque', 'categorias_cliente',
        'condicoes_pagamento', 'tabela_precos', 'contas_financeiras',
        'formas_pagamento_entrega', 'delivery_categorias',
        'app_configs', 'conta_azul_config',
        'vendedores', 'veiculos',
        'produtos', 'produto_imagens',
        'clientes', 'cliente_arquivos',
        'leads', 'embarques',
        'amostras', 'amostra_itens',
        'pedidos', 'pedido_itens', 'pedido_pagamentos_reais',
        'entrega_itens_devolvidos', 'movimentacoes_estoque',
        'atendimentos',
        'devolucoes', 'devolucao_itens',
        'diario_vendedor', 'despesas',
        'caixa_diario', 'caixa_entrega_conferida',
        'contas_receber', 'parcelas',
        'promocoes', 'promocao_condicao_grupos', 'promocao_condicoes',
        'cliente_insights', 'ia_analise_logs',
        'roteirizacoes',
        'meta_mensal_vendedor', 'meta_cidades', 'meta_produtos', 'meta_promocoes',
        'delivery_status', 'delivery_permissoes', 'delivery_webhook_logs',
        'audit_logs', 'manutencao_alertas',
        'itens_pcp', 'receitas', 'receita_itens', 'receita_versao_log',
        'ordens_producao', 'ordens_consumo', 'agenda_producao',
        'movimentacoes_pcp', 'sugestoes_producao',
        'sync_logs',
    ];

    const tables = ALL_TABLES.filter(t => !skip.includes(t));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="backup.json"');

    res.write('{"_exportedAt":"' + new Date().toISOString() + '"');

    for (const table of tables) {
        try {
            const rows = await prisma.$queryRawUnsafe(
                `SELECT row_to_json(t)::text AS r FROM (SELECT * FROM "${table}") t`
            );
            const parsed = rows.map(r => { try { return JSON.parse(r.r); } catch { return r.r; } });
            res.write(',\n"' + table + '":' + JSON.stringify(parsed));
            console.log(`[export-full-db] ${table}: ${rows.length} rows`);
        } catch (e) {
            console.error(`[export-full-db] Erro em ${table}:`, e.message);
            res.write(',\n"' + table + '_error":"' + e.message.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
        }
    }

    res.end('\n}');
});

// GET /api/admin-exec/especiais-abertos — lista pedidos especiais entregues com conta ainda aberta
router.get('/especiais-abertos', async (req, res) => {
    try {
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: {
                    especial: true,
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] }
                }
            },
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        numero: true, statusEntrega: true, dataEntrega: true,
                        pagamentosReais: { where: { valor: { gt: 0 } }, select: { formaPagamentoNome: true, valor: true, escritorioResponsavel: true } }
                    }
                },
                parcelas: { where: { status: { not: 'CANCELADO' } }, select: { id: true, numeroParcela: true, status: true, valor: true } }
            }
        });

        const resultado = contas.map(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalParcelas = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return {
                contaId: c.id,
                pedidoNumero: c.pedido?.numero,
                cliente: c.cliente?.NomeFantasia || c.cliente?.Nome,
                statusEntrega: c.pedido?.statusEntrega,
                dataEntrega: c.pedido?.dataEntrega,
                totalCaixa,
                totalParcelasAbertas: totalParcelas,
                cobreTotal: totalCaixa >= totalParcelas - 0.05,
                pagamentos: pgtos,
                parcelas: c.parcelas
            };
        });

        res.json({ total: resultado.length, casos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/corrigir-especiais-abertos — baixa automaticamente as contas elegíveis
router.post('/corrigir-especiais-abertos', async (req, res) => {
    try {
        const { executar = false } = req.body;
        const contas = await prisma.contaReceber.findMany({
            where: {
                status: { in: ['ABERTO', 'PARCIAL'] },
                pedido: { especial: true, statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] } }
            },
            include: {
                pedido: { select: { numero: true, vendedorId: true, pagamentosReais: { where: { valor: { gt: 0 } } } } },
                parcelas: { where: { status: { not: 'CANCELADO' } } }
            }
        });

        const elegíveis = contas.filter(c => {
            const pgtos = c.pedido?.pagamentosReais || [];
            const totalCaixa = pgtos.filter(p => !p.escritorioResponsavel).reduce((s, p) => s + Number(p.valor), 0);
            const totalAberto = c.parcelas.filter(p => p.status !== 'PAGO').reduce((s, p) => s + Number(p.valor), 0);
            return totalAberto > 0 && totalCaixa >= totalAberto - 0.05;
        });

        if (!executar) {
            return res.json({ simulacao: true, totalElegíveis: elegíveis.length, pedidos: elegíveis.map(c => c.pedido?.numero) });
        }

        let corrigidos = 0;
        for (const conta of elegíveis) {
            const pgtos = conta.pedido?.pagamentosReais || [];
            const forma = pgtos.filter(p => !p.escritorioResponsavel)[0]?.formaPagamentoNome || 'Dinheiro';
            const baixadoPorId = conta.pedido?.vendedorId;
            const hoje = new Date();

            await prisma.$transaction(async (tx) => {
                for (const parcela of conta.parcelas) {
                    if (parcela.status === 'PAGO') continue;
                    await tx.parcela.update({
                        where: { id: parcela.id },
                        data: {
                            status: 'PAGO',
                            valorPago: Number(parcela.valor),
                            formaPagamento: forma,
                            dataPagamento: hoje,
                            baixadoPorId: baixadoPorId || null,
                            observacao: 'Correção retroativa — pagamento já registrado na entrega'
                        }
                    });
                }
                await tx.contaReceber.update({ where: { id: conta.id }, data: { status: 'QUITADO' } });
            });
            corrigidos++;
        }

        res.json({ corrigidos, pedidos: elegíveis.map(c => c.pedido?.numero) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/db-push — executa prisma db push (cria tabelas novas sem migration)
router.post('/db-push', async (req, res) => {
    const { execSync } = require('child_process');
    try {
        const out = execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
            cwd: process.cwd(),
            timeout: 60000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// POST /api/admin-exec/import-curriculos — importa os currículos do CSV incluído no repositório
router.post('/import-curriculos', async (req, res) => {
    const { execSync } = require('child_process');
    const path = require('path');
    const csvPath = path.join(process.cwd(), 'scripts', 'Curriculos.csv');
    try {
        const out = execSync(`node scripts/importarCurriculos.js "${csvPath}" 2>&1`, {
            cwd: process.cwd(),
            timeout: 120000,
            env: { ...process.env },
        }).toString();
        res.json({ ok: true, output: out });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message, output: e.stdout?.toString() });
    }
});

// GET /api/admin-exec/estoque-reconciliacao — reconciliação completa por produto desde uma data
// Query param: ?desde=2026-04-01
router.get('/estoque-reconciliacao', async (req, res) => {
    try {
        const desde = req.query.desde || '2026-04-01';

        // Última movimentação ANTES de 'desde' → estoque_depois é o saldo inicial do período
        const iniciais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at < $1::timestamp
            ORDER BY produto_id, created_at DESC
        `, desde + 'T00:00:00');

        // Se produto não tem movimento antes de 'desde', pegar estoque_antes do primeiro movimento no período
        const primeiros = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_antes AS estoque_inicial
            FROM movimentacoes_estoque
            WHERE created_at >= $1::timestamp
            ORDER BY produto_id, created_at ASC
        `, desde + 'T00:00:00');

        // Movimentos por produto/tipo/motivo NO período
        const movimentos = await prisma.$queryRawUnsafe(`
            SELECT
                m.produto_id,
                p.nome AS produto_nome,
                m.tipo,
                m.motivo,
                SUM(m.quantidade) AS total_qtd,
                COUNT(*) AS num_movs
            FROM movimentacoes_estoque m
            JOIN produtos p ON p.id = m.produto_id
            WHERE m.created_at >= $1::timestamp
            GROUP BY m.produto_id, p.nome, m.tipo, m.motivo
            ORDER BY p.nome, m.tipo, m.motivo
        `, desde + 'T00:00:00');

        // Estoque atual (último movimento de todos os tempos)
        const atuais = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT ON (produto_id)
                produto_id,
                estoque_depois AS estoque_atual,
                created_at AS ultima_mov
            FROM movimentacoes_estoque
            ORDER BY produto_id, created_at DESC
        `);

        // Montar mapa
        const mapaInicial = {};
        for (const r of iniciais) mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        for (const r of primeiros) {
            if (mapaInicial[r.produto_id] === undefined)
                mapaInicial[r.produto_id] = Number(r.estoque_inicial);
        }
        const mapaAtual = {};
        for (const r of atuais) mapaAtual[r.produto_id] = { estoque: Number(r.estoque_atual), ultimaMov: r.ultima_mov };

        // Agrupar por produto
        const porProduto = {};
        for (const m of movimentos) {
            const pid = m.produto_id;
            if (!porProduto[pid]) {
                porProduto[pid] = {
                    nome: m.produto_nome,
                    estoqueInicial: mapaInicial[pid] ?? 0,
                    estoqueAtual: mapaAtual[pid]?.estoque ?? 0,
                    ultimaMov: mapaAtual[pid]?.ultimaMov,
                    entradas: {},
                    saidas: {},
                    totalEntradas: 0,
                    totalSaidas: 0,
                };
            }
            const qtd = Number(m.total_qtd);
            if (m.tipo === 'ENTRADA') {
                porProduto[pid].entradas[m.motivo] = (porProduto[pid].entradas[m.motivo] || 0) + qtd;
                porProduto[pid].totalEntradas += qtd;
            } else {
                porProduto[pid].saidas[m.motivo] = (porProduto[pid].saidas[m.motivo] || 0) + qtd;
                porProduto[pid].totalSaidas += qtd;
            }
        }

        // Verificar equação: inicial + entradas - saidas = atual
        const resultado = Object.values(porProduto).map(p => {
            const calculado = p.estoqueInicial + p.totalEntradas - p.totalSaidas;
            return {
                ...p,
                calculado,
                bate: Math.abs(calculado - p.estoqueAtual) < 0.001,
                diferenca: p.estoqueAtual - calculado,
            };
        });

        const inconsistentes = resultado.filter(p => !p.bate);
        const negativos = resultado.filter(p => p.estoqueAtual < 0);

        res.json({ desde, totalProdutos: resultado.length, inconsistentes: inconsistentes.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin-exec/estoque-status — resumo do estoque atual (último movimento por produto)
router.get('/estoque-status', async (req, res) => {
    try {
        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                p.nome,
                p.id AS produto_id,
                m.tipo,
                m.motivo,
                m.estoque_depois AS estoque_atual,
                m.created_at AS ultima_mov,
                tot.total_entradas,
                tot.total_saidas
            FROM (
                SELECT DISTINCT ON (produto_id)
                    produto_id, tipo, motivo,
                    estoque_depois,
                    created_at
                FROM movimentacoes_estoque
                ORDER BY produto_id, created_at DESC
            ) m
            JOIN produtos p ON p.id = m.produto_id
            LEFT JOIN (
                SELECT
                    produto_id,
                    SUM(CASE WHEN tipo = 'ENTRADA' THEN quantidade ELSE 0 END) AS total_entradas,
                    SUM(CASE WHEN tipo = 'SAIDA'   THEN quantidade ELSE 0 END) AS total_saidas
                FROM movimentacoes_estoque
                GROUP BY produto_id
            ) tot ON tot.produto_id = m.produto_id
            ORDER BY p.nome
        `);
        const resultado = rows.map(r => ({
            nome: r.nome,
            estoqueAtual: Number(r.estoque_atual),
            ultimaMov: r.ultima_mov,
            totalEntradas: Number(r.total_entradas || 0),
            totalSaidas: Number(r.total_saidas || 0),
        }));
        const negativos = resultado.filter(r => r.estoqueAtual < 0);
        res.json({ total: resultado.length, negativos: negativos.length, produtos: resultado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/estoque-ajuste-batch — aplica ajustes manuais em lote
// Body: { ajustes: [{ nomeProduto, quantidade, tipo, observacao }] }
router.post('/estoque-ajuste-batch', async (req, res) => {
    const { ajustes } = req.body;
    if (!Array.isArray(ajustes) || ajustes.length === 0) {
        return res.status(400).json({ error: 'ajustes deve ser um array não vazio.' });
    }
    const resultados = [];
    const erros = [];

    for (const aj of ajustes) {
        try {
            const produto = await prisma.produto.findFirst({
                where: { nome: aj.nomeProduto },
                select: { id: true, nome: true }
            });
            if (!produto) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Produto não encontrado' });
                continue;
            }
            const qtd = parseFloat(aj.quantidade);
            if (!qtd || qtd <= 0) {
                erros.push({ nomeProduto: aj.nomeProduto, erro: 'Quantidade inválida' });
                continue;
            }
            const resultado = await estoqueService.ajustar({
                produtoId: produto.id,
                vendedorId: null,
                tipo: aj.tipo || 'ENTRADA',
                quantidade: qtd,
                motivo: 'AJUSTE_MANUAL',
                observacao: aj.observacao || 'Correção de estoque via admin'
            });
            resultados.push({ nomeProduto: produto.nome, tipo: aj.tipo || 'ENTRADA', quantidade: qtd, estoqueDepois: resultado.estoqueDepois });
        } catch (err) {
            erros.push({ nomeProduto: aj.nomeProduto, erro: err.message });
        }
    }

    return res.json({ ok: true, aplicados: resultados.length, erros: erros.length, resultados, erros });
});

// POST /api/admin-exec/import-etiquetas — upsert em lote de etiquetas (por codigoProduto)
router.post('/import-etiquetas', async (req, res) => {
    try {
        const { etiquetas, limparVazios } = req.body;

        if (limparVazios) {
            const del = await prisma.etiquetaProduto.deleteMany({
                where: { OR: [{ codigoProduto: '' }, { nomeProduto: '' }] }
            });
            if (!etiquetas?.length) return res.json({ ok: true, deletados: del.count });
        }

        // Pré-carrega produtos do catálogo para auto-vincular por código
        const todosProdutos = await prisma.produto.findMany({ select: { id: true, codigo: true } });
        if (!Array.isArray(etiquetas) || etiquetas.length === 0)
            return res.status(400).json({ error: 'Array etiquetas vazio.' });

        const criados = [], atualizados = [], erros = [];

        for (const et of etiquetas) {
            try {
                // Match por codigoProduto + pesoUnitario para não sobrescrever versões diferentes
                const existente = await prisma.etiquetaProduto.findFirst({
                    where: {
                        codigoProduto: String(et.codigoProduto),
                        pesoUnitario: parseInt(et.pesoUnitario) || 0,
                    }
                });
                // Auto-link: procura produto no catálogo, respeita unique constraint (produtoId)
                const produtoCat = todosProdutos.find(p => String(p.codigo).trim() === String(et.codigoProduto).trim());
                let produtoIdFinal = undefined;
                if (produtoCat?.id) {
                    const jaOcupado = await prisma.etiquetaProduto.findFirst({
                        where: { produtoId: produtoCat.id, id: { not: existente?.id ?? 'none' } }
                    });
                    if (!jaOcupado) produtoIdFinal = produtoCat.id;
                }
                const data = {
                    codigoProduto:         String(et.codigoProduto || ''),
                    nomeProduto:           String(et.nomeProduto || ''),
                    pesoUnitario:          parseInt(et.pesoUnitario) || 0,
                    pesoTabelaNutricional: parseInt(et.pesoTabelaNutricional) || 0,
                    valorEnergetico:       et.valorEnergetico   || null,
                    carboidratos:          et.carboidratos       || null,
                    acucaresTotais:        et.acucaresTotais      || null,
                    acucaresAdicionados:   et.acucaresAdicionados || null,
                    proteinas:             et.proteinas          || null,
                    gordurasTotais:        et.gordurasTotais     || null,
                    gordurasSaturadas:     et.gordurasSaturadas  || null,
                    gordurasTrans:         et.gordurasTrans      || null,
                    fibraAlimentar:        et.fibraAlimentar     || null,
                    sodio:                 et.sodio              || null,
                    produtoId:             produtoIdFinal,
                    quantidadeEmbalagem:   parseInt(et.quantidadeEmbalagem) || 1,
                    quantidadeAproximada:  Boolean(et.quantidadeAproximada),
                    composicao:            String(et.composicao  || ''),
                    modoPreparo:           String(et.modoPreparo || ''),
                    codigoBarras:          et.codigoBarras       || null,
                    contemLeite:           Boolean(et.contemLeite),
                    contemGluten:          Boolean(et.contemGluten),
                    contemLactose:         Boolean(et.contemLactose),
                    contemOvo:             Boolean(et.contemOvo),
                    alergenos:             Array.isArray(et.alergenos) ? et.alergenos.filter(Boolean) : [],
                    especieCrustaceos:     et.especieCrustaceos   || null,
                    especiePeixes:         et.especiePeixes        || null,
                    outrosAlergenos:       et.outrosAlergenos    || null,
                    avisosRotulo:          et.avisosRotulo        || null,
                    armazenamento:         et.armazenamento       || null,
                    validadeDias:          parseInt(et.validadeDias) || 90,
                    ativo:                 et.ativo !== false,
                    tipoProduto:           et.tipoProduto         || null,
                    tarjaPreta:            Boolean(et.tarjaPreta),
                };
                if (existente) {
                    await prisma.etiquetaProduto.update({ where: { id: existente.id }, data });
                    atualizados.push(et.codigoProduto);
                } else {
                    await prisma.etiquetaProduto.create({ data });
                    criados.push(et.codigoProduto);
                }
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }
        return res.json({ ok: true, criados: criados.length, atualizados: atualizados.length, erros, detalhe: { criados, atualizados } });
    } catch (err) {
        console.error('[import-etiquetas]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/migrar-alergenos
// Converte os booleans antigos (contemLeite/contemOvo) para a lista alergenos[]
router.post('/migrar-alergenos', async (req, res) => {
    try {
        const todas = await prisma.etiquetaProduto.findMany({
            select: { id: true, nomeProduto: true, contemLeite: true, contemOvo: true, alergenos: true }
        });
        const atualizadas = [];
        for (const et of todas) {
            if (Array.isArray(et.alergenos) && et.alergenos.length > 0) continue; // já tem
            const lista = [];
            if (et.contemLeite) lista.push('Leite');
            if (et.contemOvo)   lista.push('Ovos');
            if (lista.length === 0) continue;
            await prisma.etiquetaProduto.update({ where: { id: et.id }, data: { alergenos: lista } });
            atualizadas.push({ nome: et.nomeProduto, alergenos: lista });
        }
        return res.json({ ok: true, atualizadas: atualizadas.length, detalhe: atualizadas });
    } catch (err) {
        console.error('[migrar-alergenos]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/fix-km-combustivel — corrige km errado em abastecimento
// Body: { veiculoId, kmErrado, kmCorreto }
router.post('/fix-km-combustivel', async (req, res) => {
    try {
        const { veiculoId, kmErrado, kmCorreto } = req.body;
        if (!veiculoId || kmErrado === undefined) {
            return res.status(400).json({ error: 'veiculoId e kmErrado obrigatórios' });
        }
        const registros = await prisma.despesa.findMany({
            where: { veiculoId, categoria: 'COMBUSTIVEL', kmNoAbastecimento: Number(kmErrado) },
            select: { id: true, dataReferencia: true, kmNoAbastecimento: true, litros: true, valor: true }
        });
        if (registros.length === 0) {
            return res.json({ ok: false, mensagem: 'Nenhum registro encontrado com esse km.' });
        }
        if (kmCorreto === null || kmCorreto === undefined) {
            // Sem kmCorreto: apenas lista os registros encontrados
            return res.json({ ok: true, encontrados: registros.length, registros });
        }
        const atualizados = [];
        for (const r of registros) {
            await prisma.despesa.update({ where: { id: r.id }, data: { kmNoAbastecimento: Number(kmCorreto) } });
            atualizados.push(r.id);
        }
        res.json({ ok: true, corrigidos: atualizados.length, ids: atualizados });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/recalcular-flex-historico
// Recalcula flexGerado por item e flexTotal dos pedidos dos últimos 30 dias
// aplicando as regras atuais de categoria (flexPositivo, flexNegativo, contabilizaFlex, isentoFlex)
router.post('/recalcular-flex-historico', async (req, res) => {
    try {
        const diasParam = parseInt(req.query.dias) || 30;
        const apenasSimular = req.query.simular === 'true';

        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - diasParam);

        // Carrega regras de categorias CA
        const catEstoque = await prisma.categoriaEstoque.findMany({ select: { nome: true, contabilizaFlex: true } });
        const catEstoqueMap = new Map(catEstoque.map(c => [c.nome, c.contabilizaFlex]));

        // Carrega regras de categorias comerciais
        const catProduto = await prisma.categoriaProduto.findMany({ select: { id: true, flexPositivo: true, flexNegativo: true } });
        const catProdutoMap = new Map(catProduto.map(c => [c.id, { flexPositivo: c.flexPositivo, flexNegativo: c.flexNegativo }]));

        // Busca produtos com suas categorias
        const produtos = await prisma.produto.findMany({ select: { id: true, categoria: true, categoriaProdutoId: true } });
        const produtoMap = new Map(produtos.map(p => {
            const contabilizaFlex = p.categoria ? (catEstoqueMap.get(p.categoria) ?? true) : true;
            const catComercial = p.categoriaProdutoId ? catProdutoMap.get(p.categoriaProdutoId) : null;
            return [p.id, { contabilizaFlex, flexPositivo: catComercial?.flexPositivo ?? true, flexNegativo: catComercial?.flexNegativo ?? true }];
        }));

        // Busca pedidos do período
        const pedidos = await prisma.pedido.findMany({
            where: {
                createdAt: { gte: trintaDiasAtras },
                statusEnvio: { not: 'EXCLUIDO' }
            },
            include: {
                itens: { select: { id: true, produtoId: true, valor: true, valorBase: true, quantidade: true, flexGerado: true } },
                cliente: { select: { categoriaCliente: { select: { isentoFlex: true } } } }
            }
        });

        const resultados = [];
        let pedidosAlterados = 0;
        let itensAlterados = 0;

        for (const pedido of pedidos) {
            const isentoFlex = pedido.cliente?.categoriaCliente?.isentoFlex || false;
            let novoFlexTotal = 0;
            const itensParaAtualizar = [];

            for (const item of pedido.itens) {
                let novoFlexGerado;

                if (isentoFlex || pedido.bonificacao) {
                    novoFlexGerado = 0;
                } else {
                    const flexBruto = (Number(item.valor) - Number(item.valorBase)) * Number(item.quantidade);
                    const regra = produtoMap.get(item.produtoId);
                    if (!regra || !regra.contabilizaFlex) {
                        novoFlexGerado = 0;
                    } else if (flexBruto > 0 && !regra.flexPositivo) {
                        novoFlexGerado = 0;
                    } else if (flexBruto < 0 && !regra.flexNegativo) {
                        novoFlexGerado = 0;
                    } else {
                        novoFlexGerado = flexBruto;
                    }
                }

                novoFlexTotal += novoFlexGerado;

                const flexAtual = Number(item.flexGerado || 0);
                if (Math.abs(flexAtual - novoFlexGerado) > 0.001) {
                    itensParaAtualizar.push({ id: item.id, novoFlexGerado, flexAtual });
                }
            }

            const flexTotalAtual = Number(pedido.flexTotal || 0);
            const mudouTotal = Math.abs(flexTotalAtual - novoFlexTotal) > 0.001;
            const mudouItens = itensParaAtualizar.length > 0;

            if (mudouTotal || mudouItens) {
                pedidosAlterados++;
                itensAlterados += itensParaAtualizar.length;
                resultados.push({
                    pedidoId: pedido.id,
                    numero: pedido.numero,
                    especial: pedido.especial,
                    flexAntes: flexTotalAtual,
                    flexDepois: novoFlexTotal,
                    itensMudados: itensParaAtualizar.length
                });

                if (!apenasSimular) {
                    // Atualiza itens
                    for (const it of itensParaAtualizar) {
                        await prisma.pedidoItem.update({ where: { id: it.id }, data: { flexGerado: it.novoFlexGerado } });
                    }
                    // Atualiza flexTotal do pedido
                    await prisma.pedido.update({ where: { id: pedido.id }, data: { flexTotal: novoFlexTotal } });
                }
            }
        }

        res.json({
            ok: true,
            simulacao: apenasSimular,
            diasConsiderados: diasParam,
            totalPedidos: pedidos.length,
            pedidosAlterados,
            itensAlterados,
            detalhes: resultados
        });
    } catch (e) {
        console.error('[admin-exec] recalcular-flex-historico:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin-exec/autolink-etiquetas-ean
// Vincula etiquetas sem produtoId procurando produto pelo EAN (codigoBarras == produto.ean)
router.post('/autolink-etiquetas-ean', async (req, res) => {
    try {
        const etiquetasSemLink = await prisma.etiquetaProduto.findMany({
            where: { produtoId: null },
            select: { id: true, codigoBarras: true, codigoProduto: true, nomeProduto: true }
        });

        const vinculadas = [], semMatch = [], erros = [];

        for (const et of etiquetasSemLink) {
            if (!et.codigoBarras) { semMatch.push(et.codigoProduto); continue; }
            try {
                const produto = await prisma.produto.findFirst({
                    where: { ean: et.codigoBarras },
                    select: { id: true, codigo: true, nome: true }
                });
                if (!produto) { semMatch.push(`${et.codigoProduto} (EAN ${et.codigoBarras})`); continue; }

                await prisma.etiquetaProduto.update({
                    where: { id: et.id },
                    data: { produtoId: produto.id }
                });
                vinculadas.push({ etiqueta: et.nomeProduto, produto: produto.nome, sku: produto.codigo });
            } catch (e) {
                erros.push({ codigo: et.codigoProduto, erro: e.message });
            }
        }

        return res.json({ ok: true, vinculadas: vinculadas.length, semMatch: semMatch.length, erros: erros.length, detalhe: { vinculadas, semMatch, erros } });
    } catch (err) {
        console.error('[autolink-etiquetas-ean]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/admin-exec/sync-itempcp-nomes
// Corrige nomes defasados: faz o nome de cada ItemPcp (usado nas receitas)
// espelhar o nome atual do Produto vinculado. Idempotente.
router.post('/sync-itempcp-nomes', async (req, res) => {
    try {
        const itens = await prisma.itemPcp.findMany({
            where: { produtoId: { not: null } },
            select: { id: true, nome: true, produto: { select: { nome: true } } }
        });
        const corrigidos = [];
        for (const it of itens) {
            const nomeProduto = it.produto?.nome;
            if (nomeProduto && nomeProduto !== it.nome) {
                await prisma.itemPcp.update({ where: { id: it.id }, data: { nome: nomeProduto } });
                corrigidos.push({ de: it.nome, para: nomeProduto });
            }
        }
        return res.json({ ok: true, verificados: itens.length, corrigidos: corrigidos.length, detalhe: corrigidos });
    } catch (err) {
        console.error('[sync-itempcp-nomes]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/admin-exec/dfe-status
// Diagnóstico da captura de NF-e (SEFAZ DF-e): controle de NSU, contagens por
// status e as 5 notas mais recentes.
router.get('/dfe-status', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const [controle, ativa, porStatus, recentes] = await Promise.all([
            prisma.dfeControle.findUnique({ where: { id: 'dfe' } }),
            sefazDfeService.capturaAtiva(),
            prisma.notaEntrada.groupBy({ by: ['status'], _count: { _all: true } }),
            prisma.notaEntrada.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: {
                    id: true, chave: true, numero: true, fornecedorNome: true,
                    emissao: true, valorTotal: true, status: true, manifestada: true, criadoEm: true
                }
            })
        ]);
        res.json({
            ok: true,
            capturaAtiva: ativa,
            controle,
            contagens: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
            notasRecentes: recentes
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/dfe-consultar
// Força um ciclo de captura de NF-e agora. Resposta síncrona resumida
// (timeout de 60s — se estourar, o ciclo continua em background).
router.post('/dfe-consultar', async (req, res) => {
    try {
        const sefazDfeService = require('../services/sefazDfeService');
        const timeout = new Promise((resolve) => setTimeout(
            () => resolve({ ok: true, timeout: true, motivo: 'Ciclo ainda em execução após 60s — segue em background (veja /dfe-status).' }),
            60000
        ));
        const resultado = await Promise.race([sefazDfeService.executarCiclo(), timeout]);
        res.json(resultado);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/contas-pagar-status
// Diagnóstico do envio de Contas a Pagar → Conta Azul: contagens por status de
// envio, fornecedores pendentes/erro e as contas mais recentes com o motivo do erro.
router.get('/contas-pagar-status', async (req, res) => {
    try {
        const [porStatusConta, porStatusForn, contas, fornPend] = await Promise.all([
            prisma.contaPagar.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.fornecedor.groupBy({ by: ['statusEnvioCA'], _count: { _all: true } }),
            prisma.contaPagar.findMany({
                orderBy: { criadoEm: 'desc' },
                take: 10,
                select: {
                    id: true, descricao: true, valorTotal: true, origem: true,
                    statusEnvioCA: true, erroEnvioCA: true, idEventoCA: true, protocoloCA: true,
                    criadoEm: true,
                    fornecedor: { select: { razaoSocial: true, contaAzulId: true, statusEnvioCA: true, erroEnvioCA: true } }
                }
            }),
            prisma.fornecedor.findMany({
                where: { statusEnvioCA: { in: ['ENVIAR', 'ENVIANDO', 'ERRO'] } },
                take: 10,
                select: { id: true, razaoSocial: true, cnpjCpf: true, statusEnvioCA: true, erroEnvioCA: true, contaAzulId: true }
            })
        ]);
        const caConfig = await prisma.contaAzulConfig.findFirst({ select: { id: true, updatedAt: true } }).catch(() => null);
        res.json({
            ok: true,
            caConectada: !!caConfig,
            contasPorStatusEnvio: Object.fromEntries(porStatusConta.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPorStatusEnvio: Object.fromEntries(porStatusForn.map((s) => [s.statusEnvioCA, s._count._all])),
            fornecedoresPendentes: fornPend,
            contasRecentes: contas
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reenviar
// Re-enfileira para o CA todas as Contas a Pagar que ficaram em ERRO
// (equivale ao botão "reenviar" da tela, em lote). Diagnóstico/manutenção.
router.post('/contas-pagar-reenviar', async (req, res) => {
    try {
        const r = await prisma.contaPagar.updateMany({
            where: { statusEnvioCA: 'ERRO' },
            data: { statusEnvioCA: 'ENVIAR', erroEnvioCA: null }
        });
        res.json({ ok: true, reenfileiradas: r.count });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-pagar-reconciliar
// Conserta contas que ficaram em ERRO mas cujo erro menciona "protocolo" (indício de que o CA
// aceitou/criou o evento apesar do erro). Para cada uma, tenta localizar o evento no CA pelo
// codigo_referencia (id da conta). Se achar → adota (idEventoCA + mapeia parcelas + ENVIADO),
// SEM duplicar. Se não achar com segurança, deixa como está e reporta.
// Recupera casos como a despesa da "BERNADETE" (existe no CA, ERRO no app).
router.post('/contas-pagar-reconciliar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        const candidatas = await prisma.contaPagar.findMany({
            where: {
                statusEnvioCA: 'ERRO',
                erroEnvioCA: { contains: 'protocolo', mode: 'insensitive' }
            },
            include: { fornecedor: true, parcelas: true },
            orderBy: { criadoEm: 'asc' },
            take: 100
        });

        let reconciliadas = 0;
        const detalhes = [];
        for (const conta of candidatas) {
            try {
                const eventoId = await caSync._encontrarEventoPorReferencia(conta.id, conta);
                if (eventoId) {
                    await prisma.contaPagar.update({
                        where: { id: conta.id },
                        data: { idEventoCA: eventoId, erroEnvioCA: null }
                    });
                    await caSync._mapearParcelasCA(conta.id, eventoId); // fecha em ENVIADO ao casar as parcelas
                    reconciliadas++;
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'RECONCILIADA', eventoId });
                } else {
                    detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'NAO_ENCONTRADA' });
                }
            } catch (err) {
                detalhes.push({ id: conta.id, descricao: conta.descricao, resultado: 'ERRO_BUSCA', erro: err.message });
            }
        }

        res.json({ ok: true, verificadas: candidatas.length, reconciliadas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Financeiro POR CONTA (banco/caixa) — diagnóstico e backfill ──

// GET /api/admin-exec/financeiro-contas-diag — quanto de cada lado já tem a conta financeira preenchida
router.get('/financeiro-contas-diag', async (req, res) => {
    try {
        const [contasFin, pagTotal, pagSemConta, recPagas, recSemConta] = await Promise.all([
            prisma.contaFinanceira.count(),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false } }),
            prisma.pagamentoParcelaPagar.count({ where: { estornado: false, contaFinanceiraCaId: null } }),
            prisma.parcela.count({ where: { status: 'PAGO' } }),
            prisma.parcela.count({ where: { status: 'PAGO', contaFinanceiraCaId: null } })
        ]);
        const bancos = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true, tipoUso: true, ativo: true }, orderBy: { nomeBanco: 'asc' } });
        res.json({
            ok: true,
            contasFinanceirasCadastradas: contasFin,
            pagar: { totalBaixas: pagTotal, semConta: pagSemConta, comConta: pagTotal - pagSemConta },
            receber: { totalPagas: recPagas, semConta: recSemConta, comConta: recPagas - recSemConta },
            backfillReceber: _backfillReceber,
            bancos
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/contas-financeiras-sync — puxa a lista de bancos/caixas do CA para a tabela local
router.post('/contas-financeiras-sync', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const r = await caSync.sincronizarContasFinanceiras();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-pagar?limite=300 — preenche o banco nas baixas antigas de contas a PAGAR
router.post('/backfill-conta-pagar', async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const limite = Math.min(1000, Math.max(1, parseInt(req.query.limite, 10) || 300));
        const r = await caSync.backfillContasFinanceirasPagar(limite);
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/backfill-conta-receber?limite=40 — re-sincroniza do CA as contas a RECEBER
// pagas que estão sem banco, para preencher contaFinanceiraCaId. Limitado (cada conta bate no CA).
router.post('/backfill-conta-receber', async (req, res) => {
    try {
        const receberSync = require('../services/contasReceberSyncService');
        const caConfig = await prisma.contaAzulConfig.findFirst().catch(() => null);
        if (!caConfig) return res.status(400).json({ ok: false, error: 'Conta Azul não conectada (sem token).' });

        // Modo assíncrono (?async=1): dispara o processamento no servidor e responde na hora,
        // varrendo TODAS as contas em segundo plano (evita timeout do proxy em lotes grandes).
        // Acompanhe pela rota financeiro-contas-diag (receber.semConta cai até zerar).
        if (req.query.async === '1' || req.query.async === 'true') {
            if (_backfillReceber.rodando) {
                return res.json({ ok: true, jaRodando: true, progresso: _backfillReceber.progresso });
            }
            _backfillReceber.rodando = true;
            _backfillReceber.progresso = { processadas: 0, erros: 0, iniciadoEm: new Date().toISOString() };
            (async () => {
                try {
                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const parcelas = await prisma.parcela.findMany({
                            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
                            select: { contaReceberId: true },
                            take: 400
                        });
                        const ids = [...new Set(parcelas.map((p) => p.contaReceberId))];
                        if (ids.length === 0) break;
                        let algumPreenchido = false;
                        for (const contaId of ids) {
                            try {
                                await receberSync.sincronizarConta(contaId, { semLog: true });
                                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                                if (cheias > 0) algumPreenchido = true;
                                _backfillReceber.progresso.processadas++;
                            } catch (err) {
                                _backfillReceber.progresso.erros++;
                            }
                        }
                        // Se uma varredura inteira não preencheu nada, o restante não tem banco no CA — para.
                        if (!algumPreenchido) break;
                    }
                    console.log('[admin-exec] Backfill receber (async) concluído:', _backfillReceber.progresso);
                } catch (e) {
                    console.error('[admin-exec] Backfill receber (async) erro:', e.message);
                } finally {
                    _backfillReceber.rodando = false;
                }
            })();
            return res.json({ ok: true, iniciado: true, aviso: 'Rodando em segundo plano; acompanhe em financeiro-contas-diag.' });
        }

        const limite = Math.min(50, Math.max(1, parseInt(req.query.limite, 10) || 40));
        // Contas com alguma parcela PAGA sem banco, cujo pedido já tem espelho no CA
        const parcelas = await prisma.parcela.findMany({
            where: { status: 'PAGO', contaFinanceiraCaId: null, contaReceber: { pedido: { idVendaContaAzul: { not: null }, especial: false } } },
            select: { contaReceberId: true },
            take: limite * 8
        });
        const contaIds = [...new Set(parcelas.map((p) => p.contaReceberId))].slice(0, limite);

        let reSincronizadas = 0, preenchidas = 0;
        const detalhes = [];
        for (const contaId of contaIds) {
            try {
                await receberSync.sincronizarConta(contaId, { semLog: true });
                reSincronizadas++;
                const restam = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: null } });
                const cheias = await prisma.parcela.count({ where: { contaReceberId: contaId, status: 'PAGO', contaFinanceiraCaId: { not: null } } });
                if (cheias > 0) preenchidas++;
                detalhes.push({ contaId, restamSemConta: restam, comConta: cheias });
            } catch (err) {
                detalhes.push({ contaId, erro: err.message });
            }
        }
        res.json({ ok: true, contasAlvo: contaIds.length, reSincronizadas, comAlgumBanco: preenchidas, detalhes });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/compras-estoque-check
// SOMENTE LEITURA. Para CADA nota CONFERIDA: quantos itens tinha, quantos estavam
// vinculados a produto/insumo (de-para memorizado) e quantas entradas de estoque
// (compras_itens ativas) foram registradas — mostra quem alimentou o estoque e quem não.
router.get('/compras-estoque-check', async (req, res) => {
    try {
        const notas = await prisma.notaEntrada.findMany({
            where: { status: 'CONFERIDA' },
            orderBy: { atualizadoEm: 'desc' },
            select: {
                id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
                emissao: true, valorTotal: true, atualizadoEm: true,
                itens: { select: { codigoFornecedor: true, descricao: true } }
            }
        });

        // Compras ativas por nota
        const compras = await prisma.compraItem.groupBy({
            by: ['notaEntradaId'],
            where: { estornado: false },
            _count: { id: true }
        });
        const comprasPorNota = new Map(compras.map((c) => [c.notaEntradaId, c._count.id]));

        // Vínculos memorizados (produto OU insumo) por fornecedor+código
        const cnpjs = [...new Set(notas.map((n) => n.fornecedorCnpj).filter(Boolean))];
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: { in: cnpjs },
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { fornecedorCnpj: true, codigoFornecedor: true }
        });
        const temVinculo = new Set(vinculos.map((v) => `${v.fornecedorCnpj}|${v.codigoFornecedor}`));

        const linhas = notas.map((n) => {
            const itens = n.itens.length;
            const itensVinculados = n.tipo === 'NFSE' ? 0 : n.itens
                .filter((i) => temVinculo.has(`${n.fornecedorCnpj}|${i.codigoFornecedor}`)).length;
            const entradas = comprasPorNota.get(n.id) || 0;
            let situacao;
            if (n.tipo === 'NFSE') situacao = 'SERVICO_SEM_ESTOQUE';       // serviço nunca movimenta
            else if (entradas > 0 && entradas >= itensVinculados) situacao = 'ALIMENTOU_ESTOQUE';
            else if (entradas > 0) situacao = 'PARCIAL';
            else if (itensVinculados > 0) situacao = 'SEM_ENTRADA_COM_VINCULO'; // conferida antes da Fase 6?
            else situacao = 'SEM_ENTRADA_SEM_VINCULO';
            return {
                numero: n.numero, tipo: n.tipo, fornecedor: n.fornecedorNome,
                emissao: n.emissao, valorTotal: n.valorTotal, conferidaEm: n.atualizadoEm,
                itens, itensVinculados, entradasEstoque: entradas, situacao
            };
        });

        const resumo = {};
        for (const l of linhas) resumo[l.situacao] = (resumo[l.situacao] || 0) + 1;

        res.json({ totalConferidas: linhas.length, resumo, notas: linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Fase 6: entrada RETROATIVA de compras (notas conferidas antes da fase) ──
// Monta, por nota CONFERIDA sem compras ativas, as entradas a partir do vínculo
// memorizado (fornecedor+cProd → produto/insumo + fator). Idempotente.
async function _montarEntradasRetroativas() {
    const notas = await prisma.notaEntrada.findMany({
        where: { status: 'CONFERIDA', tipo: { not: 'NFSE' } },
        select: {
            id: true, tipo: true, numero: true, fornecedorNome: true, fornecedorCnpj: true,
            fornecedorId: true, emissao: true, contaPagarId: true,
            itens: true,
            compras: { where: { estornado: false }, select: { id: true } }
        }
    });
    const pendentes = notas.filter((n) => n.compras.length === 0 && n.fornecedorCnpj);

    const resultado = [];
    for (const nota of pendentes) {
        const vinculos = await prisma.fornecedorProdutoVinculo.findMany({
            where: {
                fornecedorCnpj: nota.fornecedorCnpj,
                OR: [{ produtoId: { not: null } }, { itemPcpId: { not: null } }]
            },
            select: { codigoFornecedor: true, produtoId: true, itemPcpId: true, fatorConversao: true }
        });
        const porCodigo = new Map(vinculos.map((v) => [v.codigoFornecedor, v]));
        const entradas = [];
        for (const itemNota of nota.itens) {
            const v = porCodigo.get(itemNota.codigoFornecedor);
            if (!v) continue;
            entradas.push({
                itemNota,
                produtoId: v.produtoId || null,
                itemPcpId: v.produtoId ? null : v.itemPcpId,
                fator: Number(v.fatorConversao) > 0 ? Number(v.fatorConversao) : 1
            });
        }
        if (entradas.length > 0) resultado.push({ nota, entradas });
    }
    return resultado;
}

// GET /api/admin-exec/compras-retroativas-simulacao — SOMENTE LEITURA: o que seria lançado
router.get('/compras-retroativas-simulacao', async (req, res) => {
    try {
        const estoqueService = require('../services/estoqueService');
        const planos = await _montarEntradasRetroativas();
        const linhas = [];
        for (const { nota, entradas } of planos) {
            for (const e of entradas) {
                let alvo = null;
                let controla = null;
                if (e.produtoId) {
                    const p = await prisma.produto.findUnique({
                        where: { id: e.produtoId },
                        select: { nome: true, unidade: true, categoria: true, controlaEstoque: true }
                    });
                    alvo = p ? `PRODUTO: ${p.nome}` : 'PRODUTO (não encontrado)';
                    controla = p ? await estoqueService.produtoControlaEstoque(p) : false;
                } else if (e.itemPcpId) {
                    const i = await prisma.itemPcp.findUnique({ where: { id: e.itemPcpId }, select: { nome: true } });
                    alvo = i ? `INSUMO: ${i.nome}` : 'INSUMO (não encontrado)';
                    controla = true;
                }
                const qtd = Number(e.itemNota.quantidade) * e.fator;
                linhas.push({
                    nota: nota.numero,
                    fornecedor: nota.fornecedorNome,
                    item: e.itemNota.descricao,
                    alvo,
                    quantidadeConvertida: Math.round(qtd * 1000) / 1000,
                    valor: Number(e.itemNota.valorTotal),
                    custoUnitario: qtd > 0 ? Math.round((Number(e.itemNota.valorTotal) / qtd) * 10000) / 10000 : null,
                    movimentaEstoque: controla,
                    efeito: controla ? 'entrada de estoque + custo + histórico' : 'só custo + histórico (não controla estoque)'
                });
            }
        }
        res.json({ notasPendentes: planos.length, itens: linhas.length, linhas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/compras-retroativas — EXECUTA as entradas retroativas (idempotente)
router.post('/compras-retroativas', async (req, res) => {
    try {
        const compraEstoqueService = require('../services/compraEstoqueService');
        const planos = await _montarEntradasRetroativas();
        let totalRegistradas = 0;
        const avisos = [];
        const porNota = [];
        for (const { nota, entradas } of planos) {
            const r = await compraEstoqueService.registrarEntradasCompra(nota, nota.contaPagarId, entradas, null);
            totalRegistradas += r.registradas;
            avisos.push(...r.avisos.map((a) => `Nota ${nota.numero}: ${a}`));
            porNota.push({ nota: nota.numero, fornecedor: nota.fornecedorNome, registradas: r.registradas });
        }
        res.json({ ok: true, notasProcessadas: planos.length, totalRegistradas, porNota, avisos });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gerencial-diag
// SOMENTE LEITURA. Roda o Fluxo de Caixa e a DRE (Fase 5) e devolve um resumo
// compacto — validar os números reais em produção logo após o deploy.
router.get('/gerencial-diag', async (req, res) => {
    try {
        const svc = require('../services/financeiroGerencialService');
        const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        const mes = hoje.slice(0, 7);
        const [fluxo, dreDados] = await Promise.all([
            svc.fluxoCaixa(`${mes}-01`, hoje, 'dia'),
            svc.dre(`${mes.slice(0, 4)}-01`, mes)
        ]);
        res.json({
            fluxo: { kpis: fluxo.kpis, totais: fluxo.totais, dias: fluxo.linhas.length },
            dre: {
                meses: dreDados.meses,
                receitaLiquida: dreDados.receita.liquida.valores,
                totalDespesas: dreDados.despesas.total.valores,
                resultado: dreDados.resultado.valores,
                topCategorias: dreDados.despesas.categorias.slice(0, 8).map((c) => `${c.nome}: ${c.total}`)
            }
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/nfse-status
// SOMENTE LEITURA. Status da captura de NFS-e (linha 'nfse' da dfe_controle) +
// contagem de notas NFSE — acompanhar o primeiro ciclo real em produção.
router.get('/nfse-status', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const status = await nfseAdnService.statusCaptura();
        const [notasNfse, ultimas] = await Promise.all([
            prisma.notaEntrada.count({ where: { tipo: 'NFSE' } }),
            prisma.notaEntrada.findMany({
                where: { tipo: 'NFSE' },
                orderBy: { criadoEm: 'desc' },
                take: 5,
                select: { numero: true, fornecedorNome: true, valorTotal: true, emissao: true, status: true }
            })
        ]);
        res.json({ status, notasNfse, ultimas });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/nfse-ciclo
// Dispara UM ciclo de captura de NFS-e no ADN (síncrono) e devolve o resultado +
// status do controle. Diagnóstico da Fase 4 — validar o formato real da resposta
// do ambiente nacional sem depender do worker de 60min.
router.post('/nfse-ciclo', async (req, res) => {
    try {
        const nfseAdnService = require('../services/nfseAdnService');
        const resultado = await nfseAdnService.executarCiclo();
        const status = await nfseAdnService.statusCaptura();
        const notasNfse = await prisma.notaEntrada.count({ where: { tipo: 'NFSE' } });
        res.json({ resultado, status, notasNfse });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/admin-exec/gdrive-config
// Grava (upsert) a config do Google Drive em app_configs (chave gdrive_config).
// Body: { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId }
// Nunca devolve os segredos — só confirma o que ficou salvo (mascarado).
router.post('/gdrive-config', async (req, res) => {
    try {
        const { ativo, clientId, clientSecret, refreshToken, envioContabilidadeId } = req.body || {};
        if (!clientId || !clientSecret || !refreshToken) {
            return res.status(400).json({ ok: false, error: 'clientId, clientSecret e refreshToken são obrigatórios.' });
        }
        const value = {
            ativo: ativo !== false,
            clientId, clientSecret, refreshToken,
            ...(envioContabilidadeId ? { envioContabilidadeId } : {}),
        };
        await prisma.appConfig.upsert({
            where: { key: 'gdrive_config' },
            update: { value },
            create: { key: 'gdrive_config', value },
        });
        try { require('../services/googleDriveService').limparCacheConfig(); } catch (_) {}
        const mask = (s) => (s ? `${String(s).slice(0, 6)}…${String(s).slice(-4)}` : null);
        res.json({ ok: true, salvo: { ativo: value.ativo, clientId: mask(clientId), refreshToken: mask(refreshToken), envioContabilidadeId: value.envioContabilidadeId || '(padrão)' } });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/admin-exec/gdrive-status
// Testa o acesso ao Drive com as credenciais atuais (não expõe segredos).
router.get('/gdrive-status', async (req, res) => {
    try {
        const googleDriveService = require('../services/googleDriveService');
        const r = await googleDriveService.testarAcesso();
        res.json(r);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
