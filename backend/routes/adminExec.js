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
        'meta_mensal_vendedor', 'meta_produtos', 'meta_promocoes',
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

module.exports = router;
