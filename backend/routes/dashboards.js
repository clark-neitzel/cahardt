/**
 * Dashboards novos (2026-07) — um para cada perfil:
 *   /geral/*     → dono/gestão (5 abas: visão geral, vendas, recorrência, atendimentos, resultado)
 *   /vendedor    → extras do vendedor (hoje, ranking, quem visitar primeiro)
 *   /entregador  → rota do dia do motorista (progresso, dinheiro a receber, semana)
 *
 * Regra de receita = mesma da DRE (financeiroGerencialService): pedidos FATURADO ou
 * especial, sem bonificação, Σ itens (valor × quantidade), menos devoluções ATIVAS.
 * Filtro opcional ?categoria= usa produto.categoria (texto do CA, ex.: "Produto Acabado").
 *
 * Somente leitura — nenhuma escrita no banco.
 */

const express = require('express');
const router = express.Router();
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const financeiroGerencialService = require('../services/financeiroGerencialService');

const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
const TZ = 'America/Sao_Paulo';

// ── datas (fuso de São Paulo) — espelham adminDashboard.js ──
const isoNowTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const inicioDiaSP = (ymd) => new Date(`${ymd}T00:00:00-03:00`);
const fimDiaSP = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);
const somaDiasISO = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00-03:00`);
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
};
const somaMesesYM = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const segundaDaSemana = (ymd) => {
    const d = new Date(`${ymd}T12:00:00-03:00`);
    const dow = d.getDay(); // 0=dom..6=sab
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d.toLocaleDateString('en-CA', { timeZone: TZ });
};
const diasNoMes = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
};
const YM = /^\d{4}-\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_SEMANA_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// ── permissões ──
const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true, email: true, login: true, nome: true }
    });
    const perms = typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
    const isClark = vendedor?.email === 'clarksonneitzel@gmail.com'
        || (vendedor?.login && vendedor.login.toLowerCase().includes('clark'));
    return { perms, isClark, nome: vendedor?.nome || null };
};

const checkGestor = async (req, res, next) => {
    try {
        const { perms, isClark } = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Ver_Dashboard_Admin || isClark) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para ver o dashboard da gestão.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// ── filtro de categoria nas queries cruas ──
const filtroCategoriaItem = (categoria) => (categoria
    ? Prisma.sql`AND pr.categoria = ${categoria}`
    : Prisma.empty);

/** Vendas (Σ valor×qtd) e nº de pedidos num intervalo, na regra da DRE. */
async function vendasPeriodo(gte, lte, categoria, apenasFaturado = true) {
    const situacao = apenasFaturado
        ? Prisma.sql`AND (p.situacao_ca = 'FATURADO' OR p.especial = true)`
        : Prisma.empty;
    const rows = await prisma.$queryRaw`
        SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total,
               COUNT(DISTINCT p.id)::int AS pedidos
        FROM pedidos p
        JOIN pedido_itens i ON i.pedido_id = p.id
        JOIN produtos pr ON pr.id = i.produto_id
        WHERE p.bonificacao = false
          ${situacao}
          AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
          ${filtroCategoriaItem(categoria)}
    `;
    return { total: num(rows[0]?.total), pedidos: num(rows[0]?.pedidos) };
}

/** Devoluções ATIVAS no intervalo (com categoria → via itens da devolução). */
async function devolucoesPeriodo(gte, lte, categoria) {
    if (!categoria) {
        const agg = await prisma.devolucao.aggregate({
            _sum: { valorTotal: true },
            where: { status: 'ATIVA', dataDevolucao: { gte, lte } }
        });
        return num(agg._sum.valorTotal);
    }
    const rows = await prisma.$queryRaw`
        SELECT COALESCE(SUM(di.valor_total), 0)::float AS total
        FROM devolucao_itens di
        JOIN devolucoes d ON d.id = di.devolucao_id
        JOIN produtos pr ON pr.id = di.produto_id
        WHERE d.status = 'ATIVA'
          AND d.data_devolucao >= ${gte} AND d.data_devolucao <= ${lte}
          ${filtroCategoriaItem(categoria)}
    `;
    return num(rows[0]?.total);
}

/** Estimativa de compra mensal de um cliente a partir do insight (ticket × frequência). */
const compraMensalEstimada = (insight) => {
    const ticket = num(insight.ticketMedioBase);
    const ciclo = Math.max(1, num(insight.cicloReferenciaDias) || 7);
    return round2(ticket * Math.min(30, 30 / ciclo));
};

// ════════════════════════════════════════════════════════════════
// GERAL — filtro de categorias disponível
// ════════════════════════════════════════════════════════════════
router.get('/geral/categorias', verificarAuth, checkGestor, async (req, res) => {
    try {
        const rows = await prisma.produto.groupBy({
            by: ['categoria'],
            where: { ativo: true, categoria: { not: null } },
            _count: { _all: true }
        });
        res.json(rows
            .filter((r) => (r.categoria || '').trim())
            .map((r) => ({ categoria: r.categoria, produtos: r._count._all }))
            .sort((a, b) => b.produtos - a.produtos));
    } catch (error) {
        console.error('[Dashboards] Erro nas categorias:', error);
        res.status(500).json({ error: 'Erro ao listar as categorias.' });
    }
});

// ════════════════════════════════════════════════════════════════
// GERAL · ABA 1 — VISÃO GERAL
// ════════════════════════════════════════════════════════════════
router.get('/geral/visao-geral', verificarAuth, checkGestor, async (req, res) => {
    try {
        const categoria = (req.query.categoria || '').trim() || null;
        const hoje = isoNowTZ();
        const mes = hoje.slice(0, 7);
        const inicioMes = inicioDiaSP(`${mes}-01`);
        const fimHoje = fimDiaSP(hoje);
        const inicioHoje = inicioDiaSP(hoje);
        const diaAtual = Number(hoje.slice(8, 10));
        const totalDias = diasNoMes(mes);

        const [vendasMes, devolMes, metaAgg, vendasHoje, atendHoje, margem, fluxo, aging] = await Promise.all([
            vendasPeriodo(inicioMes, fimHoje, categoria),
            devolucoesPeriodo(inicioMes, fimHoje, categoria),
            prisma.metaMensalVendedor.aggregate({ _sum: { valorMensal: true }, where: { mesReferencia: mes } }),
            vendasPeriodo(inicioHoje, fimHoje, categoria, false), // hoje: tudo que foi lançado, faturado ou não
            prisma.atendimento.findMany({
                where: { criadoEm: { gte: inicioHoje, lte: fimHoje } },
                select: { pedidoId: true, clienteId: true, leadId: true }
            }),
            financeiroGerencialService.margemProdutos(`${mes}-01`, hoje),
            financeiroGerencialService.fluxoCaixa(hoje, somaDiasISO(hoje, 29), 'dia'),
            financeiroGerencialService.agingRecebiveis()
        ]);

        // Alertas de ação (contagens leves)
        const [criticos, retornosVencidos, vencidosParcelas, pedidosErro] = await Promise.all([
            prisma.clienteInsight.count({
                where: { statusRecompra: 'CRITICO', cliente: { Ativo: true, insightAtivo: true } }
            }),
            prisma.atendimento.count({
                where: { dataRetorno: { gte: inicioDiaSP(somaDiasISO(hoje, -60)), lt: inicioHoje } }
            }),
            prisma.parcela.findMany({
                where: {
                    status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] },
                    dataVencimento: { lt: inicioHoje },
                    contaReceber: { status: { not: 'CANCELADO' } }
                },
                select: { contaReceber: { select: { clienteId: true } } }
            }),
            prisma.pedido.count({ where: { statusEnvio: 'ERRO' } })
        ]);

        // Margem bruta do mês (linhas da margem filtradas pela categoria, se houver)
        const linhasMargem = (margem.linhas || []).filter((l) => !categoria || l.categoria === categoria);
        const custoMargem = linhasMargem.reduce((s, l) => s + num(l.custoTotal), 0);
        const receitaComCusto = linhasMargem.filter((l) => l.custoTotal != null).reduce((s, l) => s + num(l.receita), 0);
        const margemBrutaPct = receitaComCusto > 0 ? round2(((receitaComCusto - custoMargem) / receitaComCusto) * 100) : null;

        const liquida = round2(vendasMes.total - devolMes);
        const meta = num(metaAgg._sum.valorMensal);
        const projecao = diaAtual > 0 ? round2((liquida / diaAtual) * totalDias) : 0;

        // A pagar nos próximos 7 dias (linhas do fluxo previsto)
        const aPagar7 = round2((fluxo.linhas || []).slice(0, 7).reduce((s, l) => s + num(l.saidasPrevistas), 0));

        res.json({
            mes,
            hojeISO: hoje,
            categoria,
            vendasMes: {
                bruto: round2(vendasMes.total),
                devolucoes: round2(devolMes),
                liquida,
                pedidos: vendasMes.pedidos,
                ticketMedio: vendasMes.pedidos > 0 ? round2(liquida / vendasMes.pedidos) : 0,
                meta: round2(meta),
                pctMeta: meta > 0 ? round2((liquida / meta) * 100) : null,
                projecao,
                projecaoBateMeta: meta > 0 ? projecao >= meta : null,
                diaAtual,
                totalDias,
                margemBrutaPct
            },
            hoje: {
                vendas: round2(vendasHoje.total),
                pedidos: vendasHoje.pedidos,
                atendimentos: atendHoje.length,
                atendimentosComPedido: atendHoje.filter((a) => a.pedidoId).length,
                clientesAtendidos: new Set(atendHoje.map((a) => a.clienteId || `lead:${a.leadId}`)).size
            },
            alertas: {
                recompraCritica: criticos,
                retornosVencidos,
                clientesVencidos: new Set(vencidosParcelas.map((p) => p.contaReceber?.clienteId).filter(Boolean)).size,
                valorVencido: aging.totalVencido,
                pedidosErroEnvio: pedidosErro
            },
            caixa: {
                aReceberVencido: aging.totalVencido,
                aPagar7dias: aPagar7,
                entradasPrevistas30: round2(num(fluxo.totais?.entradasPrevistas)),
                saidasPrevistas30: round2(num(fluxo.totais?.saidasPrevistas)),
                saldoPrevisto30: fluxo.kpis?.saldoPrevistoPeriodo ?? null
            }
        });
    } catch (error) {
        console.error('[Dashboards] Erro na visão geral:', error);
        res.status(500).json({ error: 'Erro ao montar a visão geral.' });
    }
});

// ════════════════════════════════════════════════════════════════
// GERAL · ABA 2 — VENDAS & PEDIDOS
// ════════════════════════════════════════════════════════════════
router.get('/geral/vendas', verificarAuth, checkGestor, async (req, res) => {
    try {
        const categoria = (req.query.categoria || '').trim() || null;
        const semanas = Math.min(26, Math.max(4, Number(req.query.semanas) || 12));
        const hoje = isoNowTZ();
        const mes = hoje.slice(0, 7);
        const inicioMes = inicioDiaSP(`${mes}-01`);
        const fimHoje = fimDiaSP(hoje);
        const inicioSerie = inicioDiaSP(segundaDaSemana(somaDiasISO(hoje, -7 * (semanas - 1))));
        const ini30 = inicioDiaSP(somaDiasISO(hoje, -29));
        const ini60 = inicioDiaSP(somaDiasISO(hoje, -59));
        const fim31 = fimDiaSP(somaDiasISO(hoje, -30));

        const [brutoSemanaRaw, devolSemanaRaw, realizadoVendRaw, metas, devolucoesMes, topRaw, devolProdRaw, quedaRaw, cidadesRaw] = await Promise.all([
            prisma.$queryRaw`
                SELECT to_char(date_trunc('week', (p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS semana,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total
                FROM pedidos p
                JOIN pedido_itens i ON i.pedido_id = p.id
                JOIN produtos pr ON pr.id = i.produto_id
                WHERE p.bonificacao = false
                  AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${inicioSerie} AND p.data_venda <= ${fimHoje}
                  ${filtroCategoriaItem(categoria)}
                GROUP BY 1 ORDER BY 1
            `,
            categoria
                ? prisma.$queryRaw`
                    SELECT to_char(date_trunc('week', (d.data_devolucao AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS semana,
                           COALESCE(SUM(di.valor_total), 0)::float AS total
                    FROM devolucao_itens di
                    JOIN devolucoes d ON d.id = di.devolucao_id
                    JOIN produtos pr ON pr.id = di.produto_id
                    WHERE d.status = 'ATIVA'
                      AND d.data_devolucao >= ${inicioSerie} AND d.data_devolucao <= ${fimHoje}
                      ${filtroCategoriaItem(categoria)}
                    GROUP BY 1
                `
                : prisma.$queryRaw`
                    SELECT to_char(date_trunc('week', (d.data_devolucao AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS semana,
                           COALESCE(SUM(d.valor_total), 0)::float AS total
                    FROM devolucoes d
                    WHERE d.status = 'ATIVA'
                      AND d.data_devolucao >= ${inicioSerie} AND d.data_devolucao <= ${fimHoje}
                    GROUP BY 1
                `,
            prisma.$queryRaw`
                SELECT p.vendedor_id AS vendedor_id,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total,
                       COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p
                JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false
                  AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${inicioMes} AND p.data_venda <= ${fimHoje}
                GROUP BY 1
            `,
            prisma.metaMensalVendedor.findMany({
                where: { mesReferencia: mes },
                select: { vendedorId: true, valorMensal: true, vendedor: { select: { nome: true, ativo: true } } }
            }),
            prisma.devolucao.findMany({
                where: { status: 'ATIVA', dataDevolucao: { gte: inicioMes, lte: fimHoje } },
                select: { valorTotal: true, pedidoOriginal: { select: { vendedorId: true } } }
            }),
            prisma.$queryRaw`
                SELECT pr.id AS produto_id, pr.nome AS nome,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total,
                       COALESCE(SUM(i.quantidade), 0)::float AS quantidade
                FROM pedidos p
                JOIN pedido_itens i ON i.pedido_id = p.id
                JOIN produtos pr ON pr.id = i.produto_id
                WHERE p.bonificacao = false
                  AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${ini30} AND p.data_venda <= ${fimHoje}
                  ${filtroCategoriaItem(categoria)}
                GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10
            `,
            prisma.$queryRaw`
                SELECT di.produto_id AS produto_id, COALESCE(SUM(di.valor_total), 0)::float AS total
                FROM devolucao_itens di
                JOIN devolucoes d ON d.id = di.devolucao_id
                WHERE d.status = 'ATIVA'
                  AND d.data_devolucao >= ${ini30} AND d.data_devolucao <= ${fimHoje}
                GROUP BY 1
            `,
            prisma.$queryRaw`
                SELECT pr.id AS produto_id, pr.nome AS nome,
                       COALESCE(SUM(CASE WHEN p.data_venda >= ${ini30} THEN i.valor * i.quantidade ELSE 0 END), 0)::float AS atual,
                       COALESCE(SUM(CASE WHEN p.data_venda < ${ini30} THEN i.valor * i.quantidade ELSE 0 END), 0)::float AS anterior
                FROM pedidos p
                JOIN pedido_itens i ON i.pedido_id = p.id
                JOIN produtos pr ON pr.id = i.produto_id
                WHERE p.bonificacao = false
                  AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${ini60} AND p.data_venda <= ${fimHoje}
                  ${filtroCategoriaItem(categoria)}
                GROUP BY 1, 2
            `,
            prisma.$queryRaw`
                SELECT COALESCE(NULLIF(TRIM(c."End_Cidade"), ''), 'Sem cidade') AS cidade,
                       COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total,
                       COUNT(DISTINCT p.cliente_id)::int AS clientes
                FROM pedidos p
                JOIN pedido_itens i ON i.pedido_id = p.id
                JOIN produtos pr ON pr.id = i.produto_id
                JOIN clientes c ON c."UUID" = p.cliente_id
                WHERE p.bonificacao = false
                  AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${inicioMes} AND p.data_venda <= ${fimHoje}
                  ${filtroCategoriaItem(categoria)}
                GROUP BY 1 ORDER BY 2 DESC LIMIT 8
            `
        ]);

        // Série semanal líquida
        const devolPorSemana = new Map(devolSemanaRaw.map((d) => [d.semana, num(d.total)]));
        const serieMap = new Map(brutoSemanaRaw.map((s) => [s.semana, num(s.total)]));
        const semanasSerie = [];
        for (let i = semanas - 1; i >= 0; i--) {
            const seg = segundaDaSemana(somaDiasISO(hoje, -7 * i));
            semanasSerie.push({
                semana: seg,
                total: round2((serieMap.get(seg) || 0) - (devolPorSemana.get(seg) || 0)),
                atual: i === 0
            });
        }

        // Vendedores × meta (mês) — realizado líquido de devoluções
        const devolPorVend = new Map();
        for (const d of devolucoesMes) {
            const id = d.pedidoOriginal?.vendedorId;
            if (id) devolPorVend.set(id, (devolPorVend.get(id) || 0) + num(d.valorTotal));
        }
        const realPorVend = new Map(realizadoVendRaw.map((r) => [r.vendedor_id, { total: num(r.total), pedidos: num(r.pedidos) }]));
        const diaAtual = Number(hoje.slice(8, 10));
        const totalDias = diasNoMes(mes);
        const idsVend = new Set([...metas.map((m) => m.vendedorId), ...realPorVend.keys()].filter(Boolean));
        const nomesFaltantes = [...idsVend].filter((id) => !metas.find((m) => m.vendedorId === id));
        const vendedoresExtra = nomesFaltantes.length
            ? await prisma.vendedor.findMany({ where: { id: { in: nomesFaltantes } }, select: { id: true, nome: true, ativo: true } })
            : [];
        const nomeVend = new Map([
            ...metas.map((m) => [m.vendedorId, m.vendedor]),
            ...vendedoresExtra.map((v) => [v.id, v])
        ]);
        const vendedores = [...idsVend].map((id) => {
            const meta = num(metas.find((m) => m.vendedorId === id)?.valorMensal);
            const real = realPorVend.get(id) || { total: 0, pedidos: 0 };
            const liquido = round2(real.total - (devolPorVend.get(id) || 0));
            const projecao = diaAtual > 0 ? round2((liquido / diaAtual) * totalDias) : 0;
            return {
                vendedorId: id,
                nome: nomeVend.get(id)?.nome || 'Sem vendedor',
                ativo: nomeVend.get(id)?.ativo !== false,
                meta: round2(meta),
                realizado: liquido,
                pedidos: real.pedidos,
                projecao,
                pctProjecao: meta > 0 ? round2((projecao / meta) * 100) : null
            };
        }).filter((v) => v.meta > 0 || v.realizado > 0)
            .sort((a, b) => b.realizado - a.realizado);

        // Top produtos líquidos + produtos em queda
        const devolProd = new Map(devolProdRaw.map((d) => [d.produto_id, num(d.total)]));
        const topProdutos = topRaw.map((t) => ({
            produtoId: t.produto_id,
            nome: t.nome,
            total: round2(num(t.total) - (devolProd.get(t.produto_id) || 0)),
            quantidade: num(t.quantidade)
        })).sort((a, b) => b.total - a.total);

        const produtosQueda = quedaRaw
            .map((q) => ({ produtoId: q.produto_id, nome: q.nome, atual: num(q.atual), anterior: num(q.anterior) }))
            .filter((q) => q.anterior >= 300 && q.atual < q.anterior)
            .map((q) => ({ ...q, quedaPct: round2(((q.anterior - q.atual) / q.anterior) * 100) }))
            .sort((a, b) => b.quedaPct - a.quedaPct)
            .slice(0, 6);

        res.json({
            mes,
            categoria,
            serieSemanal: semanasSerie,
            vendedores,
            topProdutos,
            produtosQueda,
            cidades: cidadesRaw.map((c) => ({ cidade: c.cidade, total: round2(num(c.total)), clientes: num(c.clientes) }))
        });
    } catch (error) {
        console.error('[Dashboards] Erro na aba vendas:', error);
        res.status(500).json({ error: 'Erro ao montar a aba de vendas.' });
    }
});

// ════════════════════════════════════════════════════════════════
// GERAL · ABA 3 — RECORRÊNCIA (CRM)
// ════════════════════════════════════════════════════════════════
router.get('/geral/recorrencia', verificarAuth, checkGestor, async (req, res) => {
    try {
        const hoje = isoNowTZ();
        const mes = hoje.slice(0, 7);
        const inicioMes = inicioDiaSP(`${mes}-01`);
        const fimHoje = fimDiaSP(hoje);

        const [insights, movimentoRaw, umaCompraRaw] = await Promise.all([
            prisma.clienteInsight.findMany({
                where: { cliente: { Ativo: true, insightAtivo: true } },
                select: {
                    clienteId: true,
                    statusRecompra: true,
                    diasSemComprar: true,
                    cicloReferenciaDias: true,
                    ticketMedioBase: true,
                    variacaoTicketPct: true,
                    produtoAusenteId: true,
                    cliente: {
                        select: {
                            Nome: true, NomeFantasia: true, End_Cidade: true,
                            vendedor: { select: { id: true, nome: true } }
                        }
                    }
                }
            }),
            prisma.$queryRaw`
                SELECT COUNT(*) FILTER (WHERE primeira >= ${inicioMes})::int AS novos,
                       COUNT(*) FILTER (WHERE primeira < ${inicioMes}
                                        AND ultima_antes IS NOT NULL
                                        AND ultima_antes < ${inicioDiaSP(somaDiasISO(`${mes}-01`, -60))}
                                        AND primeira_no_mes IS NOT NULL)::int AS reativados
                FROM (
                    SELECT cliente_id,
                           MIN(data_venda) AS primeira,
                           MAX(CASE WHEN data_venda < ${inicioMes} THEN data_venda END) AS ultima_antes,
                           MIN(CASE WHEN data_venda >= ${inicioMes} THEN data_venda END) AS primeira_no_mes
                    FROM pedidos
                    WHERE bonificacao = false
                    GROUP BY cliente_id
                ) t
                WHERE primeira_no_mes IS NOT NULL
            `,
            prisma.$queryRaw`
                SELECT COUNT(*)::int AS qtd
                FROM (
                    SELECT cliente_id, COUNT(*) AS n, MAX(data_venda) AS ultima
                    FROM pedidos
                    WHERE bonificacao = false
                    GROUP BY cliente_id
                ) t
                WHERE n = 1 AND ultima >= ${inicioDiaSP(somaDiasISO(hoje, -90))} AND ultima <= ${fimDiaSP(somaDiasISO(hoje, -10))}
            `
        ]);

        const funil = { SEM_HISTORICO: 0, NO_PRAZO: 0, ATENCAO: 0, ATRASADO: 0, CRITICO: 0 };
        for (const i of insights) {
            if (funil[i.statusRecompra] !== undefined) funil[i.statusRecompra] += 1;
        }

        const emRisco = insights.filter((i) => ['ATRASADO', 'CRITICO'].includes(i.statusRecompra));
        const valorRiscoMes = round2(emRisco.reduce((s, i) => s + compraMensalEstimada(i), 0));

        const formatarCliente = (i) => ({
            clienteId: i.clienteId,
            nome: i.cliente?.NomeFantasia || i.cliente?.Nome || 'Cliente',
            cidade: i.cliente?.End_Cidade || null,
            vendedor: i.cliente?.vendedor?.nome || null,
            vendedorId: i.cliente?.vendedor?.id || null,
            status: i.statusRecompra,
            cicloDias: i.cicloReferenciaDias,
            diasSemComprar: i.diasSemComprar,
            compraMensalEstimada: compraMensalEstimada(i)
        });

        const criticos = emRisco
            .sort((a, b) => compraMensalEstimada(b) - compraMensalEstimada(a))
            .slice(0, 15)
            .map(formatarCliente);

        // Enfraquecimento: ainda compra, mas ticket caindo forte
        const enfraquecendo = insights
            .filter((i) => ['NO_PRAZO', 'ATENCAO'].includes(i.statusRecompra) && num(i.variacaoTicketPct) <= -15)
            .sort((a, b) => num(a.variacaoTicketPct) - num(b.variacaoTicketPct))
            .slice(0, 8);
        const idsProdutosAusentes = [...new Set(enfraquecendo.map((i) => i.produtoAusenteId).filter(Boolean))];
        const produtosAusentes = idsProdutosAusentes.length
            ? await prisma.produto.findMany({ where: { id: { in: idsProdutosAusentes } }, select: { id: true, nome: true } })
            : [];
        const nomeProduto = new Map(produtosAusentes.map((p) => [p.id, p.nome]));

        res.json({
            mes,
            funil,
            totalAtivos: insights.length,
            emRisco: { clientes: emRisco.length, valorMensalEstimado: valorRiscoMes },
            criticos,
            enfraquecendo: enfraquecendo.map((i) => ({
                ...formatarCliente(i),
                variacaoTicketPct: num(i.variacaoTicketPct),
                produtoAusente: i.produtoAusenteId ? (nomeProduto.get(i.produtoAusenteId) || null) : null
            })),
            carteira: {
                novosNoMes: num(movimentoRaw[0]?.novos),
                reativadosNoMes: num(movimentoRaw[0]?.reativados),
                semCompra90d: insights.filter((i) => num(i.diasSemComprar) > 90).length,
                primeiraCompraSemRecompra: num(umaCompraRaw[0]?.qtd)
            }
        });
    } catch (error) {
        console.error('[Dashboards] Erro na aba recorrência:', error);
        res.status(500).json({ error: 'Erro ao montar a aba de recorrência.' });
    }
});

// ════════════════════════════════════════════════════════════════
// GERAL · ABA 4 — ATENDIMENTOS
// ════════════════════════════════════════════════════════════════
router.get('/geral/atendimentos', verificarAuth, checkGestor, async (req, res) => {
    try {
        const hoje = isoNowTZ();
        const de = YMD.test(String(req.query.de)) ? String(req.query.de) : `${hoje.slice(0, 7)}-01`;
        const ate = YMD.test(String(req.query.ate)) ? String(req.query.ate) : hoje;
        const gte = inicioDiaSP(de);
        const lte = fimDiaSP(ate);

        const [atendimentos, leadsNovos, retornosVencidos] = await Promise.all([
            prisma.atendimento.findMany({
                where: { criadoEm: { gte, lte } },
                select: { tipo: true, pedidoId: true, idVendedor: true, acaoLabel: true, leadId: true, vendedor: { select: { nome: true } } }
            }),
            prisma.lead.count({ where: { createdAt: { gte, lte } } }),
            prisma.atendimento.groupBy({
                by: ['idVendedor'],
                _count: { _all: true },
                where: { dataRetorno: { gte: inicioDiaSP(somaDiasISO(hoje, -60)), lt: inicioDiaSP(hoje) } }
            })
        ]);

        const porTipo = new Map();
        const porVendedor = new Map();
        const motivos = new Map();
        let comPedido = 0;
        for (const a of atendimentos) {
            porTipo.set(a.tipo || 'OUTRO', (porTipo.get(a.tipo || 'OUTRO') || 0) + 1);
            const v = porVendedor.get(a.idVendedor) || { vendedorId: a.idVendedor, nome: a.vendedor?.nome || 'Vendedor', atendimentos: 0, comPedido: 0 };
            v.atendimentos += 1;
            if (a.pedidoId) { v.comPedido += 1; comPedido += 1; }
            else if (a.acaoLabel) motivos.set(a.acaoLabel, (motivos.get(a.acaoLabel) || 0) + 1);
            porVendedor.set(a.idVendedor, v);
        }
        const retornosPorVend = new Map(retornosVencidos.map((r) => [r.idVendedor, r._count._all]));

        res.json({
            de, ate,
            total: atendimentos.length,
            comPedido,
            semPedido: atendimentos.length - comPedido,
            conversaoPct: atendimentos.length > 0 ? round2((comPedido / atendimentos.length) * 100) : null,
            leadsNovos,
            porTipo: [...porTipo.entries()].map(([tipo, qtd]) => ({ tipo, qtd })).sort((a, b) => b.qtd - a.qtd),
            motivosSemVenda: [...motivos.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 8),
            porVendedor: [...porVendedor.values()]
                .map((v) => ({
                    ...v,
                    conversaoPct: v.atendimentos > 0 ? round2((v.comPedido / v.atendimentos) * 100) : null,
                    retornosVencidos: retornosPorVend.get(v.vendedorId) || 0
                }))
                .sort((a, b) => b.atendimentos - a.atendimentos)
        });
    } catch (error) {
        console.error('[Dashboards] Erro na aba atendimentos:', error);
        res.status(500).json({ error: 'Erro ao montar a aba de atendimentos.' });
    }
});

// ════════════════════════════════════════════════════════════════
// GERAL · ABA 5 — RESULTADO & MARGEM
// ════════════════════════════════════════════════════════════════
router.get('/geral/resultado', verificarAuth, checkGestor, async (req, res) => {
    try {
        const categoria = (req.query.categoria || '').trim() || null;
        const hoje = isoNowTZ();
        const mes = YM.test(String(req.query.mes)) ? String(req.query.mes) : hoje.slice(0, 7);
        const mesAnterior = somaMesesYM(mes, -1);
        const fimMes = mes === hoje.slice(0, 7) ? hoje : somaDiasISO(`${somaMesesYM(mes, 1)}-01`, -1);

        const [dre, margem, aging] = await Promise.all([
            financeiroGerencialService.dre(mesAnterior, mes),
            financeiroGerencialService.margemProdutos(`${mes}-01`, fimMes),
            financeiroGerencialService.agingRecebiveis()
        ]);

        const iMes = dre.meses.indexOf(mes);
        const iAnt = dre.meses.indexOf(mesAnterior);
        const linhaMes = (linha) => (iMes >= 0 ? num(linha.valores[iMes]) : 0);
        const linhaAnt = (linha) => (iAnt >= 0 ? num(linha.valores[iAnt]) : 0);

        const custosTop = dre.despesas.categorias
            .map((c) => ({ nome: c.nome, classificacao: c.classificacao, valor: round2(linhaMes(c)) }))
            .filter((c) => c.valor > 0)
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 6);

        const linhasMargem = (margem.linhas || [])
            .filter((l) => (!categoria || l.categoria === categoria) && l.margemPct != null && num(l.quantidade) > 0 && num(l.receita) >= 100);
        const melhores = [...linhasMargem].sort((a, b) => b.margemPct - a.margemPct).slice(0, 5)
            .map((l) => ({ nome: l.nome, margemPct: l.margemPct, receita: round2(l.receita) }));
        const piores = [...linhasMargem].sort((a, b) => a.margemPct - b.margemPct).slice(0, 5)
            .map((l) => ({ nome: l.nome, margemPct: l.margemPct, receita: round2(l.receita) }));

        res.json({
            mes,
            mesAnterior,
            categoria,
            dre: {
                receitaBruta: round2(linhaMes(dre.receita.faturada) + linhaMes(dre.receita.especial)),
                devolucoes: round2(linhaMes(dre.receita.devolucoes)),
                receitaLiquida: round2(linhaMes(dre.receita.liquida)),
                despesasOperacional: round2(dre.despesas.categorias.filter((c) => c.classificacao === 'OPERACIONAL').reduce((s, c) => s + linhaMes(c), 0)),
                despesasFinanceiro: round2(dre.despesas.categorias.filter((c) => c.classificacao === 'FINANCEIRO').reduce((s, c) => s + linhaMes(c), 0)),
                despesasAClassificar: round2(dre.despesas.categorias.filter((c) => !['OPERACIONAL', 'FINANCEIRO'].includes(c.classificacao)).reduce((s, c) => s + linhaMes(c), 0)),
                despesasTotal: round2(linhaMes(dre.despesas.total)),
                foraDre: round2(linhaMes(dre.foraDre)),
                resultado: round2(linhaMes(dre.resultado)),
                margemPct: iMes >= 0 ? dre.margem.valores[iMes] : null,
                temAClassificar: dre.temAClassificar,
                anterior: {
                    receitaLiquida: round2(linhaAnt(dre.receita.liquida)),
                    resultado: round2(linhaAnt(dre.resultado)),
                    margemPct: iAnt >= 0 ? dre.margem.valores[iAnt] : null
                }
            },
            custosTop,
            margemProdutos: {
                margemPctGeral: margem.totais?.margemPct ?? null,
                receitaTotal: margem.totais?.receitaTotal ?? 0,
                semCusto: margem.totais?.semCusto ?? 0,
                melhores,
                piores
            },
            aging
        });
    } catch (error) {
        console.error('[Dashboards] Erro na aba resultado:', error);
        res.status(500).json({ error: 'Erro ao montar a aba de resultado.' });
    }
});

// ════════════════════════════════════════════════════════════════
// VENDEDOR — extras do dashboard pessoal (o painel de metas continua
// vindo de GET /api/metas/dashboard; aqui entram hoje/ranking/carteira)
// ════════════════════════════════════════════════════════════════
router.get('/vendedor', verificarAuth, async (req, res) => {
    try {
        const { perms, isClark } = await getPerms(req.user.id);
        const isGestor = perms.admin || perms.Pode_Ver_Dashboard_Admin || perms.Pode_Gerenciar_Metas || isClark;
        const vendedorId = (isGestor && typeof req.query.vendedorId === 'string' && req.query.vendedorId.trim())
            ? req.query.vendedorId.trim()
            : req.user.id;

        const hoje = isoNowTZ();
        const inicioHoje = inicioDiaSP(hoje);
        const fimHoje = fimDiaSP(hoje);
        const segunda = segundaDaSemana(hoje);
        const inicioSemana = inicioDiaSP(segunda);
        const segundaPassada = somaDiasISO(segunda, -7);
        const diaSemanaPt = DIAS_SEMANA_PT[new Date(`${hoje}T12:00:00-03:00`).getDay()];

        const [pedidosHojeRaw, atendHoje, rotaHoje, rankingRaw, rankingAnteriorRaw, insightsCarteira, retornos, vencidos] = await Promise.all([
            prisma.$queryRaw`
                SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total, COUNT(DISTINCT p.id)::int AS pedidos
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND p.vendedor_id = ${vendedorId}
                  AND p.data_venda >= ${inicioHoje} AND p.data_venda <= ${fimHoje}
            `,
            prisma.atendimento.findMany({
                where: { idVendedor: vendedorId, criadoEm: { gte: inicioHoje, lte: fimHoje } },
                select: { clienteId: true, leadId: true, pedidoId: true }
            }),
            prisma.cliente.count({
                where: { Ativo: true, idVendedor: vendedorId, Dia_de_venda: { contains: diaSemanaPt } }
            }),
            prisma.$queryRaw`
                SELECT p.vendedor_id AS vendedor_id, COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${inicioSemana} AND p.data_venda <= ${fimHoje}
                GROUP BY 1 ORDER BY 2 DESC
            `,
            prisma.$queryRaw`
                SELECT p.vendedor_id AS vendedor_id, COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total
                FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
                WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
                  AND p.data_venda >= ${inicioDiaSP(segundaPassada)} AND p.data_venda <= ${fimDiaSP(somaDiasISO(segundaPassada, 6))}
                GROUP BY 1 ORDER BY 2 DESC
            `,
            prisma.clienteInsight.findMany({
                where: { cliente: { Ativo: true, insightAtivo: true, idVendedor: vendedorId } },
                select: {
                    clienteId: true, statusRecompra: true, diasSemComprar: true,
                    cicloReferenciaDias: true, ticketMedioBase: true,
                    cliente: { select: { Nome: true, NomeFantasia: true, End_Cidade: true } }
                }
            }),
            prisma.atendimento.findMany({
                where: {
                    idVendedor: vendedorId,
                    dataRetorno: { gte: inicioDiaSP(somaDiasISO(hoje, -60)), lte: fimHoje }
                },
                select: {
                    id: true, dataRetorno: true, assuntoRetorno: true,
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                    lead: { select: { id: true, nomeEstabelecimento: true } }
                },
                orderBy: { dataRetorno: 'asc' },
                take: 6
            }),
            prisma.parcela.findMany({
                where: {
                    status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] },
                    dataVencimento: { lt: inicioHoje },
                    contaReceber: { status: { not: 'CANCELADO' }, cliente: { idVendedor: vendedorId } }
                },
                select: {
                    valor: true, valorPago: true, valorDescontoTotal: true, dataVencimento: true,
                    contaReceber: { select: { clienteId: true, cliente: { select: { Nome: true, NomeFantasia: true } } } }
                }
            })
        ]);

        // Ranking da semana (posição do vendedor, sem expor valores dos colegas)
        const posicaoEm = (lista) => {
            const idx = lista.findIndex((r) => r.vendedor_id === vendedorId);
            return idx >= 0 ? idx + 1 : null;
        };
        const posicao = posicaoEm(rankingRaw);
        const meuTotal = num(rankingRaw.find((r) => r.vendedor_id === vendedorId)?.total);
        const faltaParaSubir = posicao && posicao > 1
            ? round2(num(rankingRaw[posicao - 2].total) - meuTotal)
            : null;

        // Quem visitar primeiro: críticos/atrasados da carteira por valor estimado
        const alertasCarteira = insightsCarteira
            .filter((i) => ['CRITICO', 'ATRASADO'].includes(i.statusRecompra))
            .sort((a, b) => compraMensalEstimada(b) - compraMensalEstimada(a))
            .slice(0, 6)
            .map((i) => ({
                clienteId: i.clienteId,
                nome: i.cliente?.NomeFantasia || i.cliente?.Nome || 'Cliente',
                cidade: i.cliente?.End_Cidade || null,
                status: i.statusRecompra,
                cicloDias: i.cicloReferenciaDias,
                diasSemComprar: i.diasSemComprar,
                compraMensalEstimada: compraMensalEstimada(i)
            }));

        // Inadimplência da carteira (para lembrar na visita)
        const porCliente = new Map();
        for (const p of vencidos) {
            const saldo = num(p.valor) - num(p.valorPago) - num(p.valorDescontoTotal);
            if (saldo <= 0) continue;
            const id = p.contaReceber?.clienteId;
            if (!id) continue;
            const atual = porCliente.get(id) || {
                clienteId: id,
                nome: p.contaReceber?.cliente?.NomeFantasia || p.contaReceber?.cliente?.Nome || 'Cliente',
                valor: 0,
                vencimentoMaisAntigo: p.dataVencimento
            };
            atual.valor = round2(atual.valor + saldo);
            if (new Date(p.dataVencimento) < new Date(atual.vencimentoMaisAntigo)) atual.vencimentoMaisAntigo = p.dataVencimento;
            porCliente.set(id, atual);
        }
        const inadimplentes = [...porCliente.values()].sort((a, b) => b.valor - a.valor);

        res.json({
            vendedorId,
            hojeISO: hoje,
            diaSemana: diaSemanaPt,
            hoje: {
                vendas: round2(num(pedidosHojeRaw[0]?.total)),
                pedidos: num(pedidosHojeRaw[0]?.pedidos),
                atendimentos: atendHoje.length,
                clientesAtendidos: new Set(atendHoje.map((a) => a.clienteId || `lead:${a.leadId}`)).size,
                clientesRotaHoje: rotaHoje
            },
            ranking: {
                posicao,
                totalVendedores: rankingRaw.length,
                faltaParaSubir,
                posicaoSemanaPassada: posicaoEm(rankingAnteriorRaw)
            },
            carteira: {
                criticos: insightsCarteira.filter((i) => i.statusRecompra === 'CRITICO').length,
                atrasados: insightsCarteira.filter((i) => i.statusRecompra === 'ATRASADO').length,
                atencao: insightsCarteira.filter((i) => i.statusRecompra === 'ATENCAO').length,
                inadimplentes: inadimplentes.length,
                valorVencido: round2(inadimplentes.reduce((s, c) => s + c.valor, 0))
            },
            quemVisitar: alertasCarteira,
            retornos: retornos.map((r) => ({
                id: r.id,
                dataRetorno: r.dataRetorno,
                vencido: r.dataRetorno < inicioHoje,
                assunto: r.assuntoRetorno || null,
                clienteId: r.cliente?.UUID || null,
                nome: r.cliente?.NomeFantasia || r.cliente?.Nome || r.lead?.nomeEstabelecimento || 'Cliente'
            })),
            inadimplentes: inadimplentes.slice(0, 5)
        });
    } catch (error) {
        console.error('[Dashboards] Erro no dashboard do vendedor:', error);
        res.status(500).json({ error: 'Erro ao montar o dashboard do vendedor.' });
    }
});

// ════════════════════════════════════════════════════════════════
// ENTREGADOR — rota de hoje, dinheiro a receber e semana
// ════════════════════════════════════════════════════════════════
router.get('/entregador', verificarAuth, async (req, res) => {
    try {
        const { perms, isClark } = await getPerms(req.user.id);
        const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas || isClark;
        if (!verTodas && !perms.Pode_Executar_Entregas) {
            return res.status(403).json({ error: 'Você não tem permissão de Motorista/Entregador.' });
        }
        const responsavelId = (verTodas && typeof req.query.responsavelId === 'string' && req.query.responsavelId.trim())
            ? req.query.responsavelId.trim()
            : req.user.id;

        const hoje = isoNowTZ();
        const inicioHoje = inicioDiaSP(hoje);
        const fimHoje = fimDiaSP(hoje);
        const inicioSemana = inicioDiaSP(segundaDaSemana(hoje));
        const inicioSemanaPassada = inicioDiaSP(somaDiasISO(segundaDaSemana(hoje), -7));
        const fimSemanaPassada = fimDiaSP(somaDiasISO(segundaDaSemana(hoje), -1));

        const ehBoleto = (p) => `${p.nomeCondicaoPagamento || ''} ${p.tipoPagamento || ''}`.toLowerCase().includes('boleto');
        const valorPedido = (p) => p.itens.reduce((s, it) => s + num(it.valor) * num(it.quantidade), 0);

        const [pendentes, amostrasPendentes, concluidasHoje, semanaAtual, semanaPassada] = await Promise.all([
            prisma.pedido.findMany({
                where: {
                    statusEntrega: 'PENDENTE',
                    embarque: { responsavelId, dataSaida: { lte: fimHoje } }
                },
                select: {
                    id: true, prioridadeEntrega: true, nomeCondicaoPagamento: true, tipoPagamento: true,
                    embarque: { select: { numero: true } },
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, Ponto_GPS: true } },
                    itens: { select: { valor: true, quantidade: true } }
                },
                orderBy: [{ prioridadeEntrega: { sort: 'asc', nulls: 'last' } }, { cliente: { NomeFantasia: 'asc' } }]
            }),
            prisma.amostra.count({ where: { status: 'LIBERADO', embarque: { responsavelId, dataSaida: { lte: fimHoje } } } }),
            prisma.pedido.findMany({
                where: {
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                    dataEntrega: { gte: inicioHoje, lte: fimHoje },
                    embarque: { responsavelId }
                },
                select: {
                    id: true, statusEntrega: true, dataEntrega: true, divergenciaPagamento: true,
                    cliente: { select: { Nome: true, NomeFantasia: true } }
                },
                orderBy: { dataEntrega: 'desc' }
            }),
            prisma.pedido.groupBy({
                by: ['statusEntrega'],
                _count: { _all: true },
                where: {
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                    dataEntrega: { gte: inicioSemana, lte: fimHoje },
                    embarque: { responsavelId }
                }
            }),
            prisma.pedido.groupBy({
                by: ['statusEntrega'],
                _count: { _all: true },
                where: {
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] },
                    dataEntrega: { gte: inicioSemanaPassada, lte: fimSemanaPassada },
                    embarque: { responsavelId }
                }
            })
        ]);

        const divergenciasSemana = await prisma.pedido.count({
            where: {
                divergenciaPagamento: true,
                dataEntrega: { gte: inicioSemana, lte: fimHoje },
                embarque: { responsavelId }
            }
        });

        const aReceberPedidos = pendentes.filter((p) => !ehBoleto(p));
        const enderecoDe = (c) => [
            [c?.End_Logradouro, c?.End_Numero].filter(Boolean).join(', '),
            c?.End_Bairro, c?.End_Cidade
        ].filter(Boolean).join(' — ');

        const contarStatus = (grupos, status) => num(grupos.find((g) => g.statusEntrega === status)?._count?._all);

        res.json({
            responsavelId,
            hojeISO: hoje,
            rotaHoje: {
                pendentes: pendentes.length,
                amostrasPendentes,
                feitas: concluidasHoje.length,
                total: pendentes.length + concluidasHoje.length,
                embarqueNumero: pendentes[0]?.embarque?.numero || null,
                cidades: [...new Set(pendentes.map((p) => p.cliente?.End_Cidade).filter(Boolean))],
                proximas: pendentes.slice(0, 4).map((p, idx) => ({
                    pedidoId: p.id,
                    ordem: concluidasHoje.length + idx + 1,
                    nome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'Cliente',
                    endereco: enderecoDe(p.cliente),
                    gps: p.cliente?.Ponto_GPS || null,
                    recebeNaEntrega: !ehBoleto(p),
                    valor: round2(valorPedido(p))
                }))
            },
            dinheiro: {
                aReceberNaEntrega: round2(aReceberPedidos.reduce((s, p) => s + valorPedido(p), 0)),
                clientesQuePagam: aReceberPedidos.length
            },
            hoje: {
                entregues: concluidasHoje.filter((p) => p.statusEntrega === 'ENTREGUE').length,
                parciais: concluidasHoje.filter((p) => p.statusEntrega === 'ENTREGUE_PARCIAL').length,
                devolvidas: concluidasHoje.filter((p) => p.statusEntrega === 'DEVOLVIDO').length,
                divergencias: concluidasHoje.filter((p) => p.divergenciaPagamento).length,
                ultimas: concluidasHoje.slice(0, 5).map((p) => ({
                    nome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'Cliente',
                    status: p.statusEntrega,
                    hora: p.dataEntrega
                }))
            },
            semana: {
                entregas: semanaAtual.reduce((s, g) => s + num(g._count._all), 0),
                devolucoes: contarStatus(semanaAtual, 'DEVOLVIDO') + contarStatus(semanaAtual, 'ENTREGUE_PARCIAL'),
                divergencias: divergenciasSemana,
                semanaPassada: {
                    entregas: semanaPassada.reduce((s, g) => s + num(g._count._all), 0),
                    devolucoes: contarStatus(semanaPassada, 'DEVOLVIDO') + contarStatus(semanaPassada, 'ENTREGUE_PARCIAL')
                }
            }
        });
    } catch (error) {
        console.error('[Dashboards] Erro no dashboard do entregador:', error);
        res.status(500).json({ error: 'Erro ao montar o dashboard do entregador.' });
    }
});

module.exports = router;
