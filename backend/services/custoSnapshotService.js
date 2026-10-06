/**
 * Indicadores de Gestão — SNAPSHOT do custo no item do pedido (custo "na hora da venda").
 *
 * Gravado a partir de estoqueService.faturarPedido (ponto único dos 5 caminhos de
 * faturamento), SEMPRE fora de $transaction e SEM nunca lançar erro: um snapshot que
 * falha não pode travar faturamento nem baixa de estoque. A rede de segurança
 * (completarSnapshotsPendentes, no scheduler) cobre o caso do processo cair no meio.
 *
 * "Tem snapshot" = custoSnapshotEm preenchido (item SEM_CUSTO também fica marcado,
 * com custoUnitarioSnapshot null — o custo do dia da venda era desconhecido).
 */
const prisma = require('../config/database');
const custoService = require('./indicadoresCustoService');
const { WHERE_PEDIDO_RECEITA } = require('./projecaoVendasService');

/**
 * Grava o snapshot dos itens do pedido que ainda não têm. Idempotente.
 * NUNCA lança.
 * @returns {Promise<{ gravados:number, semCusto:number }>}
 */
async function gravarSnapshotPedido(pedidoId, { db = prisma } = {}) {
    try {
        const itens = await db.pedidoItem.findMany({
            where: { pedidoId, custoSnapshotEm: null },
            select: { id: true, produtoId: true }
        });
        if (!itens.length) return { gravados: 0, semCusto: 0 };
        return await gravarParaItens(itens, db);
    } catch (e) {
        console.error(`[CustoSnapshot] Falha ao gravar snapshot do pedido ${pedidoId}:`, e.message);
        return { gravados: 0, semCusto: 0, erro: e.message };
    }
}

async function gravarParaItens(itens, db = prisma) {
    const produtoIds = [...new Set(itens.map((i) => i.produtoId))];
    const ctx = await custoService.comCache('ctxFichasSnapshot', 60 * 1000, () => custoService.carregarFichasVigentes());
    const [classes, custos] = await Promise.all([
        custoService.classificarProdutos(produtoIds, ctx),
        custoService.custoAgora(produtoIds, ctx)
    ]);
    const agora = new Date();
    let gravados = 0, semCusto = 0;
    const porProduto = new Map();
    for (const it of itens) {
        if (!porProduto.has(it.produtoId)) porProduto.set(it.produtoId, []);
        porProduto.get(it.produtoId).push(it.id);
    }
    for (const [produtoId, ids] of porProduto) {
        const c = custos.get(produtoId) || { custo: null, fonte: 'SEM_CUSTO' };
        const r = await db.pedidoItem.updateMany({
            where: { id: { in: ids }, custoSnapshotEm: null }, // idempotente: nunca sobrescreve
            data: {
                custoUnitarioSnapshot: c.custo,
                fonteCustoSnapshot: c.fonte,
                classeCustoSnapshot: classes.get(produtoId) || 'SEM_CLASSE',
                custoSnapshotEstimado: false,
                custoSnapshotEm: agora
            }
        });
        gravados += r.count;
        if (c.fonte === 'SEM_CUSTO') semCusto += r.count;
    }
    return { gravados, semCusto };
}

/** Zera o snapshot do pedido (reversão de especial/BN, cancelamento): o próximo faturamento regrava. NUNCA lança. */
async function limparSnapshotPedido(pedidoId, { db = prisma } = {}) {
    try {
        const r = await db.pedidoItem.updateMany({
            where: { pedidoId, custoSnapshotEm: { not: null } },
            data: {
                custoUnitarioSnapshot: null,
                fonteCustoSnapshot: null,
                classeCustoSnapshot: null,
                custoSnapshotEstimado: false,
                custoSnapshotEm: null
            }
        });
        return { limpos: r.count };
    } catch (e) {
        console.error(`[CustoSnapshot] Falha ao limpar snapshot do pedido ${pedidoId}:`, e.message);
        return { limpos: 0, erro: e.message };
    }
}

/**
 * Rede de segurança (scheduler a cada 30 min): itens sem snapshot de pedidos que já saíram
 * do estoque (RECEBIDO) ou já contam como receita, dos últimos 7 dias. NUNCA lança.
 */
async function completarSnapshotsPendentes({ dias = 7, limite = 500 } = {}) {
    try {
        const desde = new Date(Date.now() - dias * 86400000);
        const itens = await prisma.pedidoItem.findMany({
            where: {
                custoSnapshotEm: null,
                pedido: {
                    dataVenda: { gte: desde },
                    // nunca especial aberto/revertido (o snapshot dele nasce na aprovação):
                    // normal já saído do estoque/faturado, ou especial APROVADO (statusEnvio RECEBIDO)
                    OR: [
                        { especial: false, OR: [{ statusEnvio: 'RECEBIDO' }, { situacaoCA: 'FATURADO' }] },
                        { especial: true, statusEnvio: 'RECEBIDO' }
                    ]
                }
            },
            select: { id: true, produtoId: true },
            take: limite
        });
        if (!itens.length) return { gravados: 0, semCusto: 0 };
        const r = await gravarParaItens(itens);
        if (r.gravados) console.log(`[CustoSnapshot] Rede de segurança: ${r.gravados} itens completados.`);
        return r;
    } catch (e) {
        console.error('[CustoSnapshot] Falha na rede de segurança:', e.message);
        return { gravados: 0, semCusto: 0, erro: e.message };
    }
}

/**
 * Backfill retroativo (rota admin): grava snapshot ESTIMADO em itens de pedidos que já
 * estão na regra de receita e ainda não têm snapshot. Idempotente (só itens sem snapshot),
 * em lotes de 500, SEM $transaction gigante. dry=true só diagnostica (não grava).
 * @returns {Promise<object>} { dry, itensAnalisados, gravados, porFonte, semCusto:[top 20], restantes }
 */
async function backfillRetroativo({ de = null, ate = null, dry = true, limite = 500 } = {}) {
    const lim = Math.min(Math.max(parseInt(limite, 10) || 500, 1), 20000);
    const wherePedido = { ...WHERE_PEDIDO_RECEITA };
    if (de || ate) {
        wherePedido.dataVenda = {};
        if (de) wherePedido.dataVenda.gte = new Date(`${de}T00:00:00-03:00`);
        if (ate) wherePedido.dataVenda.lte = new Date(`${ate}T23:59:59.999-03:00`);
    }
    const where = { custoSnapshotEm: null, pedido: wherePedido };
    const itens = await prisma.pedidoItem.findMany({
        where, orderBy: { pedido: { dataVenda: 'asc' } }, take: lim,
        select: { id: true, produtoId: true, quantidade: true, pedido: { select: { dataVenda: true } } }
    });
    const porFonte = { FICHA: 0, COMPRA: 0, HIST_MENSAL: 0, ATUAL: 0, CA: 0, SEM_CUSTO: 0 };
    const semCustoCont = new Map();
    let gravados = 0;
    const agora = new Date();
    for (let i = 0; i < itens.length; i += 500) {
        const lote = itens.slice(i, i + 500);
        const pares = lote.map((it) => ({ produtoId: it.produtoId, data: it.pedido.dataVenda }));
        const [custos, classes] = await Promise.all([
            custoService.custoNaDataLote(pares),
            custoService.classificarProdutos([...new Set(lote.map((l) => l.produtoId))])
        ]);
        const grupos = new Map(); // produto|ymd → ids
        for (const it of lote) {
            const k = `${it.produtoId}|${custoService.ymdSP(it.pedido.dataVenda)}`;
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(it);
        }
        for (const [k, lista] of grupos) {
            const c = custos.get(k) || { custo: null, fonte: 'SEM_CUSTO' };
            porFonte[c.fonte] = (porFonte[c.fonte] || 0) + lista.length;
            if (c.fonte === 'SEM_CUSTO') {
                const pid = lista[0].produtoId;
                semCustoCont.set(pid, (semCustoCont.get(pid) || 0) + lista.length);
            }
            if (dry) continue;
            const r = await prisma.pedidoItem.updateMany({
                where: { id: { in: lista.map((l) => l.id) }, custoSnapshotEm: null }, // idempotente
                data: {
                    custoUnitarioSnapshot: c.custo,
                    fonteCustoSnapshot: c.fonte,
                    classeCustoSnapshot: classes.get(lista[0].produtoId) || 'SEM_CLASSE',
                    custoSnapshotEstimado: true,
                    custoSnapshotEm: agora
                }
            });
            gravados += r.count;
        }
    }
    const topIds = [...semCustoCont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const nomes = topIds.length ? await prisma.produto.findMany({ where: { id: { in: topIds.map((t) => t[0]) } }, select: { id: true, nome: true } }) : [];
    const nomeDe = new Map(nomes.map((n) => [n.id, n.nome]));
    const restantes = await prisma.pedidoItem.count({ where });
    return {
        dry: !!dry, itensAnalisados: itens.length, gravados, porFonte,
        semCusto: topIds.map(([produtoId, n]) => ({ produtoId, nome: nomeDe.get(produtoId) || '', itens: n })),
        restantes
    };
}

/** Cobertura do snapshot por mês de venda (SP) — só pedidos que contam como receita. */
async function diagCobertura() {
    const rows = await prisma.$queryRaw`
        SELECT to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
               COUNT(*)::int AS itens,
               COUNT(*) FILTER (WHERE i.custo_snapshot_em IS NOT NULL AND i.custo_snapshot_estimado = false)::int AS real,
               COUNT(*) FILTER (WHERE i.custo_snapshot_em IS NOT NULL AND i.custo_snapshot_estimado = true)::int AS estimado,
               COUNT(*) FILTER (WHERE i.custo_snapshot_em IS NULL)::int AS sem,
               COUNT(*) FILTER (WHERE i.fonte_custo_snapshot = 'SEM_CUSTO')::int AS "semCusto"
        FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
        GROUP BY 1 ORDER BY 1 DESC
    `;
    return rows.map((r) => ({
        ...r,
        pctReal: r.itens ? Math.round((r.real / r.itens) * 1000) / 10 : null,
        pctEstimado: r.itens ? Math.round((r.estimado / r.itens) * 1000) / 10 : null,
        pctSem: r.itens ? Math.round((r.sem / r.itens) * 1000) / 10 : null
    }));
}

module.exports = { gravarSnapshotPedido, limparSnapshotPedido, completarSnapshotsPendentes, gravarParaItens, backfillRetroativo, diagCobertura };
