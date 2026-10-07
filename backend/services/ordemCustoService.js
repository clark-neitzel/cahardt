/**
 * Indicadores de Gestao (Etapa 3, bloco B) — custo realizado, rendimento e perda por ORDEM DE PRODUCAO.
 *
 * Chamado de pcpOrdemService.finalizar (fora da transacao, sem await) e por uma rede de seguranca
 * no scheduler (apurarPendentes). Regras:
 *  - apurarCustoOrdem NUNCA lanca: devolve { ok:false, erro } e loga [OrdemCusto];
 *  - idempotente: ordem ja apurada (custoApuradoEm) nao e recalculada sem force;
 *  - so grava nas colunas novas de ordens_producao (nao mexe em estoque nem em consumo).
 * Perda "real" = alem do que a ficha ja preve (a perda normal ja esta embutida no custo por unidade).
 */
const prisma = require('../config/database');
const custo = require('./indicadoresCustoService');

const num = (v) => (v == null ? 0 : Number(v));
const finito = (v) => (Number.isFinite(v) ? v : null);
const r = (v, casas) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** casas) / 10 ** casas);

/** Ids de insumos (nao-SUB) alcancaveis a partir de uma lista de itens (explode as SUB pelas fichas vigentes). */
function coletarInsumos(itens, ctx) {
    const itemIds = new Set(); const prodIds = new Set();
    const pilha = [];
    for (const ip of itens) {
        if (ip.tipo === 'SUB') pilha.push(ctx.receitaPorItemPcp.get(ip.id));
        else { itemIds.add(ip.id); if (ip.produtoId) prodIds.add(ip.produtoId); }
    }
    const vis = new Set();
    while (pilha.length) {
        const rc = pilha.pop();
        if (!rc || vis.has(rc.id)) continue; vis.add(rc.id);
        for (const it of rc.itens) {
            const ip = it.itemPcp; if (!ip) continue;
            if (ip.tipo === 'SUB') { pilha.push(ctx.receitaPorItemPcp.get(ip.id)); continue; }
            itemIds.add(ip.id); if (ip.produtoId) prodIds.add(ip.produtoId);
        }
    }
    return { itemIds: [...itemIds], prodIds: [...prodIds] };
}

/** Calcula os campos (sem gravar). Devolve { campos } ou { pular:motivo }. */
async function calcular(ordemId, ctxCompartilhado = null) {
    const ordem = await prisma.ordemProducao.findUnique({
        where: { id: ordemId },
        select: {
            id: true, numero: true, status: true, quantidadePlanejada: true, quantidadeProduzida: true,
            dataFim: true, receitaSnapshot: true,
            receita: { select: { perdaPercentual: true, rendimentoBase: true } },
            itensConsumo: {
                select: {
                    itemPcpId: true, quantidadePrevista: true, quantidadeReal: true, tipo: true,
                    itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true, custoUnitario: true, produtoId: true, produto: { select: { custoManual: true } } } }
                }
            }
        }
    });
    if (!ordem) return { pular: 'ordem nao encontrada' };
    if (ordem.status !== 'FINALIZADA') return { pular: 'ordem nao finalizada' };
    const produzida = num(ordem.quantidadeProduzida);
    const planejada = num(ordem.quantidadePlanejada);
    if (!(produzida > 0)) return { pular: 'quantidade produzida zerada' };

    const ctx = ctxCompartilhado || await custo.carregarFichasVigentes();
    const dataRef = ordem.dataFim || new Date();

    // quantidade que de fato saiu do estoque PCP, por insumo
    const movs = await prisma.movimentacaoPcp.groupBy({
        by: ['itemPcpId'],
        where: { ordemProducaoId: ordem.id, tipo: 'SAIDA', motivo: 'PRODUCAO_CONSUMO' },
        _sum: { quantidade: true }
    });
    const saiu = new Map(movs.map((m) => [m.itemPcpId, num(m._sum.quantidade)]));

    const itens = ordem.itensConsumo.map((c) => c.itemPcp).filter(Boolean);
    const { itemIds, prodIds } = coletarInsumos(itens, ctx);
    const idx = await custo.carregarCompras({ itemPcpIds: itemIds, produtoIds: prodIds, ate: dataRef });
    const resolver = custo.criarResolverNaData(idx);

    let padrao = 0; let realizado = 0; let semPreco = 0;
    for (const c of ordem.itensConsumo) {
        const ip = c.itemPcp; if (!ip) continue;
        const prevista = num(c.quantidadePrevista);
        const real = saiu.has(c.itemPcpId) ? saiu.get(c.itemPcpId) : (num(c.quantidadeReal) > 0 ? num(c.quantidadeReal) : prevista);
        let cu = null;
        if (ip.tipo === 'SUB') {
            const sub = ctx.receitaPorItemPcp.get(ip.id);
            if (sub) {
                const f = custo.custoFicha(sub, ctx, resolver, dataRef);
                if (f.custoPorUnidade > 0) cu = f.custoPorUnidade;
            }
            if (cu == null && ip.custoUnitario != null && Number(ip.custoUnitario) > 0) cu = Number(ip.custoUnitario);
        } else {
            cu = resolver(ip, dataRef);
        }
        if (cu == null || !(cu > 0)) { semPreco++; continue; }
        padrao += prevista * cu;
        realizado += real * cu;
    }

    const snapPerda = ordem.receitaSnapshot && ordem.receitaSnapshot.perdaPercentual;
    const perdaFicha = snapPerda != null && Number.isFinite(Number(snapPerda))
        ? Number(snapPerda)
        : (ordem.receita?.perdaPercentual != null ? Number(ordem.receita.perdaPercentual) : 0);
    const rendFicha = 100 - perdaFicha;
    const esperada = planejada * rendFicha / 100;
    const cuPadrao = esperada > 0 ? padrao / esperada : null;
    const cuReal = realizado / produzida;
    const rendReal = planejada > 0 ? (produzida / planejada) * 100 : null;
    const perdaRealPct = rendReal != null ? Math.max(0, 100 - rendReal) : null;
    const qtdPerdida = esperada > 0 ? Math.max(0, esperada - produzida) : null;
    const perdaValor = qtdPerdida != null && cuPadrao != null ? qtdPerdida * cuPadrao : null;

    return {
        campos: {
            custoPadraoTotal: r(padrao, 2),
            custoRealizadoTotal: r(realizado, 2),
            custoUnitarioPadrao: r(finito(cuPadrao), 4),
            custoUnitarioReal: r(cuReal, 4),
            rendimentoRealPct: r(rendReal, 2),
            rendimentoFichaPct: r(rendFicha, 2),
            perdaRealPct: r(perdaRealPct, 2),
            quantidadePerdida: r(qtdPerdida, 3),
            perdaValor: r(perdaValor, 2),
            insumosSemPreco: semPreco
        },
        numero: ordem.numero
    };
}

/** Apura e grava. NUNCA lanca. */
async function apurarCustoOrdem(ordemId, { estimado = false, force = false, ctx = null } = {}) {
    try {
        const atual = await prisma.ordemProducao.findUnique({ where: { id: ordemId }, select: { custoApuradoEm: true } });
        if (atual && atual.custoApuradoEm && !force) return { ok: true, jaApurada: true };
        const res = await calcular(ordemId, ctx);
        if (res.pular) return { ok: false, motivo: res.pular };
        await prisma.ordemProducao.update({
            where: { id: ordemId },
            data: { ...res.campos, custoApuradoEstimado: !!estimado, custoApuradoEm: new Date() }
        });
        try { custo.limparCache(); } catch (_) { /* cache em memoria: nao critico */ }
        return { ok: true, campos: res.campos };
    } catch (e) {
        console.error('[OrdemCusto] falha ao apurar OP', ordemId, e.message);
        return { ok: false, erro: e.message };
    }
}

/** Rede de seguranca: ordens FINALIZADAS recentes sem apuracao. */
async function apurarPendentes({ limite = 50, diasAtras = 30 } = {}) {
    try {
        const desde = new Date(Date.now() - diasAtras * 86400000);
        const ordens = await prisma.ordemProducao.findMany({
            where: { status: 'FINALIZADA', custoApuradoEm: null, quantidadeProduzida: { gt: 0 }, dataFim: { gte: desde } },
            select: { id: true }, take: limite, orderBy: { dataFim: 'asc' }
        });
        let ok = 0; let falha = 0;
        for (const o of ordens) {
            const x = await apurarCustoOrdem(o.id);
            if (x.ok) ok++; else falha++;
        }
        if (ordens.length) console.log(`[OrdemCusto] apurarPendentes: ${ok} ok, ${falha} nao apuradas de ${ordens.length}`);
        return { total: ordens.length, ok, falha };
    } catch (e) {
        console.error('[OrdemCusto] apurarPendentes falhou:', e.message);
        return { total: 0, ok: 0, falha: 0, erro: e.message };
    }
}

/** Backfill das ordens antigas (marca custoApuradoEstimado). dry=true so mostra. */
async function backfill({ limite = 200, dry = true } = {}) {
    const where = { status: 'FINALIZADA', custoApuradoEm: null, quantidadeProduzida: { gt: 0 } };
    const total = await prisma.ordemProducao.count({ where });
    const ordens = await prisma.ordemProducao.findMany({
        where, select: { id: true, numero: true }, take: limite, orderBy: { dataFim: 'desc' }
    });
    const ctx = await custo.carregarFichasVigentes();
    if (dry) {
        const amostra = [];
        for (const o of ordens.slice(0, 5)) {
            try {
                const res = await calcular(o.id, ctx);
                amostra.push({ numero: o.numero, ...(res.campos ? { campos: res.campos } : { pulada: res.pular }) });
            } catch (e) { amostra.push({ numero: o.numero, erro: e.message }); }
        }
        return { dry: true, totalSemApuracao: total, noLote: ordens.length, amostra };
    }
    let ok = 0; let puladas = 0; let falha = 0;
    for (const o of ordens) {
        const x = await apurarCustoOrdem(o.id, { estimado: true, ctx });
        if (x.ok) ok++; else if (x.motivo) puladas++; else falha++;
    }
    return { dry: false, totalSemApuracao: total, noLote: ordens.length, ok, puladas, falha };
}

// ─────────────────────────────────────────────────────────────
// Leitura para os Indicadores de Gestao (ordens ja apuradas)
// ─────────────────────────────────────────────────────────────

/** Ordens FINALIZADAS e apuradas com dataFim em [gte, lte]. Numeros ja convertidos. */
async function ordensApuradas(gte, lte) {
    const rows = await prisma.ordemProducao.findMany({
        where: { status: 'FINALIZADA', custoApuradoEm: { not: null }, dataFim: { gte, lte } },
        select: {
            dataFim: true, quantidadePlanejada: true, quantidadeProduzida: true,
            custoRealizadoTotal: true, custoUnitarioPadrao: true, rendimentoFichaPct: true,
            perdaValor: true, insumosSemPreco: true, custoApuradoEstimado: true
        }
    });
    return rows.map((o) => ({
        dataFim: o.dataFim,
        planejada: num(o.quantidadePlanejada), produzida: num(o.quantidadeProduzida),
        custoRealizado: num(o.custoRealizadoTotal), cuPadrao: o.custoUnitarioPadrao != null ? num(o.custoUnitarioPadrao) : null,
        rendFicha: o.rendimentoFichaPct != null ? num(o.rendimentoFichaPct) : null,
        perdaValor: num(o.perdaValor), semPreco: num(o.insumosSemPreco) > 0, estimada: o.custoApuradoEstimado === true
    }));
}

/** Agrega ordens (ver plano B.4). Devolve null nos campos sem base — nunca NaN/Infinity. */
function agregarOrdens(rows) {
    const n = rows.length;
    const soma = (f) => rows.reduce((a, o) => a + f(o), 0);
    const custoReal = soma((o) => o.custoRealizado);
    const perdaValor = soma((o) => o.perdaValor);
    const planej = soma((o) => o.planejada);
    const prod = soma((o) => o.produzida);
    const baseDesvio = soma((o) => (o.cuPadrao != null ? o.cuPadrao * o.produzida : 0));
    const perdaTotal = soma((o) => (o.cuPadrao != null ? Math.max(0, o.planejada - o.produzida) * o.cuPadrao : 0));
    const fichaPond = soma((o) => (o.rendFicha != null ? o.planejada * o.rendFicha : 0));
    return {
        ordens: n,
        ordensSemPreco: rows.filter((o) => o.semPreco).length,
        ordensEstimadas: rows.filter((o) => o.estimada).length,
        perdaValor: r(perdaValor, 2),
        perdaTotalValor: r(perdaTotal, 2),
        custoRealizado: r(custoReal, 2),
        pctProduzido: custoReal > 0 ? r((perdaValor / custoReal) * 100, 1) : null,
        desvioPct: baseDesvio > 0 ? r((custoReal / baseDesvio - 1) * 100, 1) : null,
        valorDesvio: baseDesvio > 0 ? r(custoReal - baseDesvio, 2) : null,
        rendimentoRealPct: planej > 0 ? r((prod / planej) * 100, 1) : null,
        rendimentoFichaPct: planej > 0 && fichaPond > 0 ? r(fichaPond / planej, 1) : null
    };
}

module.exports = { apurarCustoOrdem, apurarPendentes, backfill, calcular, ordensApuradas, agregarOrdens };
