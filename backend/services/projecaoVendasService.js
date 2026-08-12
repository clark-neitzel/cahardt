/**
 * Projeção de vendas por dias de trabalho — a "conta da comissão", compartilhada.
 *
 * Cada dia de trabalho restante do mês é estimado pela média das últimas
 * ocorrências daquele dia da semana (últimas segundas, últimas terças…) nos
 * dias de trabalho do vendedor (mês atual + até 2 metas anteriores). Dia sem
 * histórico suficiente cai na média diária simples. Sábado/domingo/feriado não
 * trabalhado simplesmente não entram na lista de dias — não derrubam a conta.
 *
 * Usado pela apuração de comissão (comissaoService) e pelo Dashboard Geral
 * (dashboards.js). Mudança aqui muda a projeção nos DOIS lugares.
 *
 * REGRA DE VENDA (WHERE_PEDIDO_RECEITA + devoluções) — pedido do usuário,
 * 08/2026: venda é só o que foi FATURADO (ou especial, que nunca tem nota),
 * sem bonificação, DESCONTADAS as devoluções ativas e os cancelamentos. É a
 * mesma regra de receita da DRE e do Dashboard Geral: comissão, meta e
 * dashboard falam do mesmo número. Não afrouxar essa regra.
 */
const prisma = require('../config/database');
const dayjs = require('dayjs');

/** Pedido que conta como venda: faturado (ou especial), sem bonificação. */
const WHERE_PEDIDO_RECEITA = {
    bonificacao: false,
    OR: [
        { situacaoCA: 'FATURADO' },
        { especial: true }
    ]
};

const parseDias = (v) => {
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v || '[]'); } catch { return []; }
};

const valorItens = (itens) => (itens || []).reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0);

/**
 * Devoluções ATIVAS por vendedor e por dia num intervalo.
 * Retorna Map(vendedorId → { 'YYYY-MM-DD': valorDevolvido }).
 * A devolução desconta no dia em que foi registrada (mesma regra do dashboard).
 */
async function devolucoesPorVendedorDia(vendedorIds, gte, lte) {
    const mapa = new Map((vendedorIds || []).map(id => [id, {}]));
    if (!vendedorIds || vendedorIds.length === 0) return mapa;
    const devs = await prisma.devolucao.findMany({
        where: {
            status: 'ATIVA',
            dataDevolucao: { gte, lte },
            pedidoOriginal: { vendedorId: { in: vendedorIds } }
        },
        select: {
            valorTotal: true,
            dataDevolucao: true,
            pedidoOriginal: { select: { vendedorId: true } }
        }
    });
    for (const d of devs) {
        const vid = d.pedidoOriginal?.vendedorId;
        if (!vid || !mapa.has(vid)) continue;
        const dia = dayjs(d.dataDevolucao).format('YYYY-MM-DD');
        const por = mapa.get(vid);
        por[dia] = (por[dia] || 0) + Number(d.valorTotal || 0);
    }
    return mapa;
}

/**
 * Cálculo puro (sem banco). `vendasPorDia` deve conter as vendas LÍQUIDAS do mês
 * atual E dos dias históricos (`diasAnteriores`), no formato { 'YYYY-MM-DD': valor }.
 */
function calcularProjecaoDias({ hoje, diasTrabalho, vendasPorDia, diasAnteriores, totalVendidoMes }) {
    const diasPassados = diasTrabalho.filter(d => !dayjs(d).isAfter(hoje, 'day'));
    const diasRestantes = diasTrabalho.filter(d => dayjs(d).isAfter(hoje, 'day'));
    const qtdPassados = diasPassados.length;
    const qtdRestantes = diasRestantes.length;
    const mediaDiaria = qtdPassados > 0 ? totalVendidoMes / qtdPassados : 0;

    // Média por dia da semana: últimas 4 ocorrências de cada dia trabalhado
    // (dia trabalhado sem venda conta como zero — é sinal real)
    const diasHistorico = [...new Set([...diasPassados, ...diasAnteriores])].sort().reverse();
    const mediaPorDiaSemana = {};
    for (let dow = 0; dow < 7; dow++) {
        const amostras = diasHistorico.filter(d => dayjs(d).day() === dow).slice(0, 4);
        if (amostras.length >= 2) {
            mediaPorDiaSemana[dow] = amostras.reduce((acc, d) => acc + (vendasPorDia[d] || 0), 0) / amostras.length;
        }
    }
    const usouDiasSemana = diasRestantes.some(d => mediaPorDiaSemana[dayjs(d).day()] != null);
    const projecaoRestante = diasRestantes.reduce((acc, d) => {
        const m = mediaPorDiaSemana[dayjs(d).day()];
        return acc + (m != null ? m : mediaDiaria);
    }, 0);

    return {
        projecaoRestante,
        valorProjetado: totalVendidoMes + projecaoRestante,
        mediaDiaria,
        metodo: usouDiasSemana ? 'dias_semana' : 'media_simples',
        qtdPassados,
        qtdRestantes,
        totalDias: diasTrabalho.length,
    };
}

/**
 * Histórico de UM vendedor: dias de trabalho das 2 últimas metas anteriores ao
 * mês e as vendas LÍQUIDAS desses dias. Retorna { diasAnteriores, vendasPorDia }
 * (só dias históricos — o chamador mescla com as vendas do mês atual).
 */
async function historicoVendedor(vendedorId, mesReferencia, hoje) {
    const metasAnteriores = await prisma.metaMensalVendedor.findMany({
        where: { vendedorId, mesReferencia: { lt: mesReferencia } },
        orderBy: { mesReferencia: 'desc' },
        take: 2,
        select: { diasTrabalho: true }
    });
    const diasAnteriores = metasAnteriores
        .flatMap(m => parseDias(m.diasTrabalho))
        .filter(d => dayjs(d).isBefore(hoje, 'day'));

    const vendasPorDia = {};
    if (diasAnteriores.length > 0) {
        const ordenados = [...diasAnteriores].sort();
        const gte = dayjs(ordenados[0]).startOf('day').toDate();
        const lte = dayjs(ordenados[ordenados.length - 1]).endOf('day').toDate();
        const [pedidosHist, devsHist] = await Promise.all([
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte, lte }, ...WHERE_PEDIDO_RECEITA },
                select: { dataVenda: true, itens: { select: { quantidade: true, valor: true } } }
            }),
            devolucoesPorVendedorDia([vendedorId], gte, lte)
        ]);
        for (const p of pedidosHist) {
            const d = dayjs(p.dataVenda).format('YYYY-MM-DD');
            vendasPorDia[d] = (vendasPorDia[d] || 0) + valorItens(p.itens);
        }
        for (const [dia, valor] of Object.entries(devsHist.get(vendedorId) || {})) {
            vendasPorDia[dia] = (vendasPorDia[dia] || 0) - valor;
        }
    }
    return { diasAnteriores, vendasPorDia };
}

/**
 * Versão em lote para o Dashboard Geral: projeta TODOS os vendedores que têm
 * meta com dias de trabalho no mês, com poucas queries. Retorna
 * Map(vendedorId → resultado de calcularProjecaoDias + totalVendidoMes líquido).
 */
async function projecoesMes(mesReferencia) {
    const hoje = dayjs();
    const metas = await prisma.metaMensalVendedor.findMany({
        where: { mesReferencia },
        select: { vendedorId: true, diasTrabalho: true }
    });
    const alvo = metas
        .map(m => ({ vendedorId: m.vendedorId, diasTrabalho: parseDias(m.diasTrabalho) }))
        .filter(m => m.diasTrabalho.length > 0);
    if (alvo.length === 0) return new Map();
    const ids = alvo.map(m => m.vendedorId);

    const inicioMes = dayjs(`${mesReferencia}-01`).startOf('month').toDate();
    const fimMes = dayjs(`${mesReferencia}-01`).endOf('month').toDate();

    // 2 últimas metas anteriores de cada vendedor (agrupa em JS — tabela pequena)
    const metasAntTodas = await prisma.metaMensalVendedor.findMany({
        where: { vendedorId: { in: ids }, mesReferencia: { lt: mesReferencia } },
        orderBy: { mesReferencia: 'desc' },
        select: { vendedorId: true, diasTrabalho: true }
    });
    const antPorVendedor = new Map();
    for (const m of metasAntTodas) {
        const lista = antPorVendedor.get(m.vendedorId) || [];
        if (lista.length < 2) { lista.push(m); antPorVendedor.set(m.vendedorId, lista); }
    }
    const diasAnterioresPorVendedor = new Map(ids.map(id => [
        id,
        (antPorVendedor.get(id) || [])
            .flatMap(m => parseDias(m.diasTrabalho))
            .filter(d => dayjs(d).isBefore(hoje, 'day'))
    ]));

    // Pedidos e devoluções do mês atual + do intervalo histórico global
    const todosDiasAnt = [...diasAnterioresPorVendedor.values()].flat().sort();
    const histGte = todosDiasAnt.length ? dayjs(todosDiasAnt[0]).startOf('day').toDate() : null;
    const histLte = todosDiasAnt.length ? dayjs(todosDiasAnt[todosDiasAnt.length - 1]).endOf('day').toDate() : null;
    const [pedidosMes, pedidosHist, devsMes, devsHist] = await Promise.all([
        prisma.pedido.findMany({
            where: { vendedorId: { in: ids }, dataVenda: { gte: inicioMes, lte: fimMes }, ...WHERE_PEDIDO_RECEITA },
            select: { vendedorId: true, dataVenda: true, itens: { select: { quantidade: true, valor: true } } }
        }),
        histGte
            ? prisma.pedido.findMany({
                where: { vendedorId: { in: ids }, dataVenda: { gte: histGte, lte: histLte }, ...WHERE_PEDIDO_RECEITA },
                select: { vendedorId: true, dataVenda: true, itens: { select: { quantidade: true, valor: true } } }
            })
            : Promise.resolve([]),
        devolucoesPorVendedorDia(ids, inicioMes, fimMes),
        histGte ? devolucoesPorVendedorDia(ids, histGte, histLte) : Promise.resolve(new Map())
    ]);

    // vendasPorDia e total do mês, por vendedor (o cálculo só consulta os dias
    // do próprio vendedor, então dias "a mais" vindos do intervalo global não interferem)
    const vendasPorVendedor = new Map(ids.map(id => [id, {}]));
    const totalMesPorVendedor = new Map(ids.map(id => [id, 0]));
    for (const p of [...pedidosMes, ...pedidosHist]) {
        const mapa = vendasPorVendedor.get(p.vendedorId);
        if (!mapa) continue;
        const d = dayjs(p.dataVenda).format('YYYY-MM-DD');
        mapa[d] = (mapa[d] || 0) + valorItens(p.itens);
    }
    for (const p of pedidosMes) {
        totalMesPorVendedor.set(p.vendedorId, (totalMesPorVendedor.get(p.vendedorId) || 0) + valorItens(p.itens));
    }
    // devoluções descontam do dia e (as do mês) do total do mês
    for (const fonte of [devsMes, devsHist]) {
        for (const [vid, porDia] of fonte.entries()) {
            const mapa = vendasPorVendedor.get(vid);
            if (!mapa) continue;
            for (const [dia, valor] of Object.entries(porDia)) {
                mapa[dia] = (mapa[dia] || 0) - valor;
            }
        }
    }
    for (const [vid, porDia] of devsMes.entries()) {
        const totalDev = Object.values(porDia).reduce((a, v) => a + v, 0);
        totalMesPorVendedor.set(vid, (totalMesPorVendedor.get(vid) || 0) - totalDev);
    }

    const resultado = new Map();
    for (const { vendedorId, diasTrabalho } of alvo) {
        const totalVendidoMes = totalMesPorVendedor.get(vendedorId) || 0;
        const proj = calcularProjecaoDias({
            hoje,
            diasTrabalho,
            vendasPorDia: vendasPorVendedor.get(vendedorId),
            diasAnteriores: diasAnterioresPorVendedor.get(vendedorId),
            totalVendidoMes
        });
        resultado.set(vendedorId, { ...proj, totalVendidoMes });
    }
    return resultado;
}

module.exports = {
    WHERE_PEDIDO_RECEITA,
    calcularProjecaoDias,
    devolucoesPorVendedorDia,
    historicoVendedor,
    projecoesMes
};
