/**
 * Produtos · Margem, Custo & Markup (07/2026)
 *
 * Tela para acompanhar a rentabilidade de cada produto, com foco em produção
 * própria (os que têm ficha técnica ativa no PCP). Fornece:
 *   - lista de produtos com custo, preço, markup, margem e tendência do custo
 *   - detalhe: preço praticado × custo por mês + composição do custo (ingredientes)
 *   - captura mensal do custo (histórico) — estratégia "simples": grava 1 ponto/mês
 *
 * Regras de custo (mesma hierarquia da margem da DRE):
 *   FICHA   = custo por unidade da receita ATIVA do PCP (produção própria)
 *   COMPRA  = Produto.custoManual (média das notas de entrada)
 *   CA      = Produto.custoMedio (fallback do Conta Azul)
 *   SEM_CUSTO = nenhum → fica fora dos totais e é sinalizado
 *
 * Somente leitura, exceto a captura mensal (upsert em produto_custo_historico).
 */

const prisma = require('../config/database');
const pcpReceitaService = require('./pcpReceitaService');

const TZ = 'America/Sao_Paulo';
const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
const round4 = (v) => Math.round(num(v) * 10000) / 10000;

const ymNowSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
const somaMesesYM = (ym, n) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const inicioMesSP = (ym) => new Date(`${ym}-01T00:00:00-03:00`);
const fimMesSP = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const ult = new Date(y, m, 0).getDate();
    return new Date(`${ym}-${String(ult).padStart(2, '0')}T23:59:59.999-03:00`);
};
const listaMeses = (ate, qtd) => {
    const arr = [];
    for (let i = qtd - 1; i >= 0; i--) arr.push(somaMesesYM(ate, -i));
    return arr;
};

/** Classifica a fonte em "própria" (ficha) x "revenda" (compra/ca) x "sem". */
const origemDe = (fonteCusto) => {
    if (fonteCusto === 'FICHA') return 'propria';
    if (fonteCusto === 'COMPRA' || fonteCusto === 'CA') return 'revenda';
    return 'sem';
};

/**
 * Custo atual por unidade de vários produtos.
 * @returns Map<produtoId, { custoUnitario:number|null, fonteCusto:string, receitaId?:string }>
 */
async function custoAtualDeProdutos(ids) {
    const mapa = new Map();
    if (!ids.length) return mapa;

    const produtos = await prisma.produto.findMany({
        where: { id: { in: ids } },
        select: { id: true, custoManual: true, custoMedio: true }
    });
    const produtoById = new Map(produtos.map((p) => [p.id, p]));

    // Fichas técnicas ativas dos produtos (produção própria)
    const itensPcp = await prisma.itemPcp.findMany({
        where: { produtoId: { in: ids }, ativo: true },
        select: { id: true, produtoId: true }
    });
    const fichaPorProduto = new Map();
    for (const item of itensPcp) {
        if (fichaPorProduto.has(item.produtoId)) continue;
        try {
            const receita = await prisma.receita.findFirst({
                where: {
                    itemPcpId: item.id,
                    status: 'ativa',
                    dataInicioVigencia: { lte: new Date() },
                    OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: new Date() } }]
                },
                orderBy: { versao: 'desc' },
                select: { id: true }
            });
            if (!receita) continue;
            const custo = await pcpReceitaService.calcularCusto(receita.id);
            if (num(custo?.custoPorUnidade) > 0) {
                fichaPorProduto.set(item.produtoId, { custo: num(custo.custoPorUnidade), receitaId: receita.id });
            }
        } catch (err) {
            console.error(`[ProdutoMargem] Falha no custo da ficha do produto ${item.produtoId}:`, err.message);
        }
    }

    for (const id of ids) {
        const p = produtoById.get(id);
        const ficha = fichaPorProduto.get(id);
        if (ficha) { mapa.set(id, { custoUnitario: round4(ficha.custo), fonteCusto: 'FICHA', receitaId: ficha.receitaId }); continue; }
        const compra = num(p?.custoManual);
        const ca = num(p?.custoMedio);
        if (compra > 0) mapa.set(id, { custoUnitario: round4(compra), fonteCusto: 'COMPRA' });
        else if (ca > 0) mapa.set(id, { custoUnitario: round4(ca), fonteCusto: 'CA' });
        else mapa.set(id, { custoUnitario: null, fonteCusto: 'SEM_CUSTO' });
    }
    return mapa;
}

const markupDe = (preco, custo) => (custo > 0 ? Math.round((preco / custo) * 100) / 100 : null);
const margemPctDe = (preco, custo) => (preco > 0 && custo != null ? Math.round(((preco - custo) / preco) * 1000) / 10 : null);

/**
 * Lista de produtos com custo/preço/markup/margem + tendência do custo (6 meses)
 * e resumo (KPIs). origem: 'propria' | 'revenda' | 'todos'.
 */
async function listar({ categoria = null, origem = 'todos', meses = 6, mes = null } = {}) {
    const mesAtual = ymNowSP();
    // Mês selecionado (YYYY-MM). Nunca no futuro; padrão = mês corrente.
    const mesSel = (typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes) && mes <= mesAtual) ? mes : mesAtual;
    const ehAtual = mesSel === mesAtual;
    const mesesArr = listaMeses(mesSel, meses); // janela da tendência termina no mês selecionado

    const produtos = await prisma.produto.findMany({
        where: { ativo: true, ...(categoria ? { categoria } : {}) },
        select: { id: true, codigo: true, nome: true, unidade: true, valorVenda: true, categoria: true }
    });
    const ids = produtos.map((p) => p.id);

    // Custo/preço do mês selecionado:
    //  - mês corrente → custo calculado agora + preço de tabela (valorVenda)
    //  - mês passado  → custo do snapshot daquele mês + preço PRATICADO (das vendas),
    //                   caindo para o preço de tabela guardado no snapshot
    const custoAtual = ehAtual ? await custoAtualDeProdutos(ids) : new Map();

    const hist = ids.length ? await prisma.produtoCustoHistorico.findMany({
        where: { produtoId: { in: ids }, mesReferencia: { in: mesesArr } },
        select: { produtoId: true, mesReferencia: true, custoUnitario: true, precoVenda: true, fonteCusto: true }
    }) : [];
    const histWin = new Map(); // produtoId -> Map(mes -> custo)  (para o sparkline)
    const histSel = new Map(); // produtoId -> { custo, preco, fonte } do mês selecionado
    for (const h of hist) {
        if (!histWin.has(h.produtoId)) histWin.set(h.produtoId, new Map());
        histWin.get(h.produtoId).set(h.mesReferencia, h.custoUnitario == null ? null : num(h.custoUnitario));
        if (h.mesReferencia === mesSel) {
            histSel.set(h.produtoId, {
                custo: h.custoUnitario == null ? null : num(h.custoUnitario),
                preco: h.precoVenda == null ? null : round2(h.precoVenda),
                fonte: h.fonteCusto || 'SEM_CUSTO'
            });
        }
    }

    // Preço praticado do mês selecionado (só faz sentido buscar em mês passado)
    const praticado = new Map();
    if (!ehAtual) {
        const gte = inicioMesSP(mesSel), lte = fimMesSP(mesSel);
        const vendas = await prisma.$queryRaw`
            SELECT i.produto_id AS pid,
                   COALESCE(SUM(i.valor * i.quantidade), 0)::float AS receita,
                   COALESCE(SUM(i.quantidade), 0)::float AS qtd
            FROM pedidos p JOIN pedido_itens i ON i.pedido_id = p.id
            WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
              AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
            GROUP BY 1`;
        for (const v of vendas) if (num(v.qtd) > 0) praticado.set(v.pid, round2(num(v.receita) / num(v.qtd)));
    }

    const linhas = [];
    for (const p of produtos) {
        let custo, fonteCusto, preco;
        if (ehAtual) {
            const c = custoAtual.get(p.id) || { custoUnitario: null, fonteCusto: 'SEM_CUSTO' };
            custo = c.custoUnitario; fonteCusto = c.fonteCusto; preco = round2(p.valorVenda);
        } else {
            const s = histSel.get(p.id);
            custo = s ? s.custo : null;
            fonteCusto = s ? s.fonte : 'SEM_CUSTO';
            preco = praticado.has(p.id) ? praticado.get(p.id) : (s && s.preco != null ? s.preco : null);
        }
        const org = origemDe(fonteCusto);
        if (origem !== 'todos' && org !== origem) continue;

        // sparkline da janela terminando no mês selecionado
        const win = histWin.get(p.id) || new Map();
        const serie = mesesArr.map((m) => (win.has(m) ? win.get(m) : (ehAtual && m === mesAtual ? custo : null)));
        const pontos = serie.filter((v) => v != null);
        const custoInicio = pontos.length ? pontos[0] : null;
        const custoFim = pontos.length ? pontos[pontos.length - 1] : null;
        const variacaoCustoPct = (custoInicio && custoFim && custoInicio > 0)
            ? Math.round(((custoFim - custoInicio) / custoInicio) * 1000) / 10 : null;

        linhas.push({
            produtoId: p.id,
            codigo: p.codigo,
            nome: p.nome,
            unidade: p.unidade || null,
            categoria: p.categoria || null,
            origem: org,
            fonteCusto,
            temFicha: fonteCusto === 'FICHA',
            custoUnitario: custo,
            precoVenda: preco,
            precoPraticado: ehAtual ? null : (praticado.has(p.id) ? praticado.get(p.id) : null),
            markup: markupDe(preco, custo),
            margemPct: margemPctDe(preco, custo),
            variacaoCustoPct,
            sparkCusto: serie
        });
    }

    linhas.sort((a, b) => {
        if (a.margemPct == null && b.margemPct == null) return a.nome.localeCompare(b.nome);
        if (a.margemPct == null) return 1;
        if (b.margemPct == null) return -1;
        return b.margemPct - a.margemPct;
    });

    const comMargem = linhas.filter((l) => l.margemPct != null);
    const margemMedia = comMargem.length ? round2(comMargem.reduce((s, l) => s + l.margemPct, 0) / comMargem.length) : null;
    const comMarkup = linhas.filter((l) => l.markup != null);
    const markupMedio = comMarkup.length ? Math.round((comMarkup.reduce((s, l) => s + l.markup, 0) / comMarkup.length) * 100) / 100 : null;

    // Mês mais antigo com histórico (limite de navegação para trás)
    const maisAntigo = await prisma.produtoCustoHistorico.aggregate({ _min: { mesReferencia: true } });

    return {
        mesAtual,
        mesSelecionado: mesSel,
        ehAtual,
        mesMinimo: maisAntigo._min.mesReferencia || mesesArr[0],
        meses: mesesArr,
        categoria,
        origem,
        resumo: {
            total: linhas.length,
            producaoPropria: linhas.filter((l) => l.origem === 'propria').length,
            revenda: linhas.filter((l) => l.origem === 'revenda').length,
            semCusto: linhas.filter((l) => l.fonteCusto === 'SEM_CUSTO').length,
            margemMedia,
            markupMedio,
            margemEmQueda: linhas.filter((l) => l.variacaoCustoPct != null && l.variacaoCustoPct > 3).length
        },
        linhas
    };
}

/**
 * Detalhe de um produto: série mensal de preço praticado × custo × margem,
 * e composição do custo (ingredientes que mais pesam, se tiver ficha técnica).
 */
async function detalhe(produtoId, meses = 6, mes = null) {
    const produto = await prisma.produto.findUnique({
        where: { id: produtoId },
        select: { id: true, codigo: true, nome: true, unidade: true, valorVenda: true, categoria: true }
    });
    if (!produto) return null;

    const mesAtual = ymNowSP();
    const mesSel = (typeof mes === 'string' && /^\d{4}-\d{2}$/.test(mes) && mes <= mesAtual) ? mes : mesAtual;
    const ehAtual = mesSel === mesAtual;
    const mesesArr = listaMeses(mesSel, meses); // série termina no mês selecionado
    const custoAtualMap = await custoAtualDeProdutos([produtoId]);
    const c = custoAtualMap.get(produtoId) || { custoUnitario: null, fonteCusto: 'SEM_CUSTO' };
    const preco = round2(produto.valorVenda);

    // Custo por mês (histórico) — completa o mês corrente com o custo atual
    const hist = await prisma.produtoCustoHistorico.findMany({
        where: { produtoId, mesReferencia: { in: mesesArr } },
        select: { mesReferencia: true, custoUnitario: true, precoVenda: true, estimado: true }
    });
    const histPorMes = new Map(hist.map((h) => [h.mesReferencia, h]));

    // Preço praticado por mês (das vendas — receita/quantidade, regra da DRE)
    const gte = inicioMesSP(mesesArr[0]);
    const lte = fimMesSP(mesSel);
    const vendasRaw = await prisma.$queryRaw`
        SELECT to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
               COALESCE(SUM(i.valor * i.quantidade), 0)::float AS receita,
               COALESCE(SUM(i.quantidade), 0)::float AS quantidade
        FROM pedidos p
        JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.bonificacao = false
          AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
          AND i.produto_id = ${produtoId}
          AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
        GROUP BY 1
    `;
    const vendaPorMes = new Map(vendasRaw.map((v) => [v.mes, { receita: num(v.receita), quantidade: num(v.quantidade) }]));

    const serie = mesesArr.map((m) => {
        const h = histPorMes.get(m);
        const custoMes = h && h.custoUnitario != null ? num(h.custoUnitario) : (m === mesAtual ? c.custoUnitario : null);
        const venda = vendaPorMes.get(m);
        const precoPraticado = venda && venda.quantidade > 0 ? round2(venda.receita / venda.quantidade) : null;
        const precoRef = precoPraticado != null ? precoPraticado : (h && h.precoVenda != null ? round2(h.precoVenda) : (m === mesAtual ? preco : null));
        return {
            mes: m,
            custo: custoMes,
            precoPraticado,
            precoReferencia: precoRef,
            margemPct: margemPctDe(precoRef, custoMes),
            estimado: h ? !!h.estimado : (m !== mesAtual),
            quantidadeVendida: venda ? Math.round(venda.quantidade * 1000) / 1000 : 0
        };
    });

    // Composição do custo (ingredientes) — só produção própria
    let composicao = null;
    if (c.fonteCusto === 'FICHA' && c.receitaId) {
        try {
            const custoReceita = await pcpReceitaService.calcularCusto(c.receitaId);
            const itens = custoReceita.itens || [];
            const ids = itens.map((i) => i.itemPcpId).filter(Boolean);
            const nomes = ids.length ? await prisma.itemPcp.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, tipo: true } }) : [];
            const nomeById = new Map(nomes.map((n) => [n.id, n]));
            const totalReceita = itens.reduce((s, i) => s + num(i.custoTotal), 0);
            // custo por unidade = custoTotal do ingrediente / rendimento líquido
            const rend = num(custoReceita.rendimentoLiquido) || 1;
            const linhas = itens.map((i) => {
                const info = nomeById.get(i.itemPcpId);
                return {
                    nome: info?.nome || 'Ingrediente',
                    tipo: info?.tipo || null,
                    custoPorUnidade: round4(num(i.custoTotal) / rend),
                    pct: totalReceita > 0 ? Math.round((num(i.custoTotal) / totalReceita) * 1000) / 10 : 0
                };
            }).sort((a, b) => b.pct - a.pct);
            composicao = {
                custoPorUnidade: round4(custoReceita.custoPorUnidade),
                rendimentoLiquido: rend,
                temCustoFaltando: !!custoReceita.temCustoFaltando,
                itens: linhas
            };
        } catch (err) {
            console.error(`[ProdutoMargem] Falha na composição do produto ${produtoId}:`, err.message);
        }
    }

    const custoInicio = serie.find((s) => s.custo != null)?.custo ?? null;
    const custoFim = [...serie].reverse().find((s) => s.custo != null)?.custo ?? null;
    const variacaoCustoPct = (custoInicio && custoFim && custoInicio > 0)
        ? Math.round(((custoFim - custoInicio) / custoInicio) * 1000) / 10 : null;
    const margemInicio = serie.find((s) => s.margemPct != null)?.margemPct ?? null;
    const margemFim = [...serie].reverse().find((s) => s.margemPct != null)?.margemPct ?? null;

    // Cabeçalho reflete o mês selecionado (custo/preço daquele mês)
    const sel = serie.find((s) => s.mes === mesSel) || {};
    const custoHeader = sel.custo != null ? sel.custo : null;
    const precoHeader = sel.precoReferencia != null ? sel.precoReferencia : null;

    return {
        mesSelecionado: mesSel,
        ehAtual,
        produto: {
            produtoId: produto.id, codigo: produto.codigo, nome: produto.nome,
            unidade: produto.unidade || null, categoria: produto.categoria || null,
            origem: origemDe(c.fonteCusto), fonteCusto: c.fonteCusto,
            custoUnitario: custoHeader, precoVenda: precoHeader,
            markup: markupDe(precoHeader, custoHeader), margemPct: margemPctDe(precoHeader, custoHeader)
        },
        // A composição reflete a ficha técnica ATUAL (não temos a receita histórica de meses passados)
        composicaoAtual: !ehAtual,
        serie,
        composicao,
        variacao: {
            custoInicio, custoFim, custoPct: variacaoCustoPct,
            margemInicio, margemFim,
            margemPts: (margemInicio != null && margemFim != null) ? Math.round((margemFim - margemInicio) * 10) / 10 : null
        }
    };
}

/**
 * Captura o custo/preço atual de TODOS os produtos ativos no mês informado
 * (upsert). Roda diariamente para o mês corrente; o passado fica congelado.
 */
async function capturarMes(mesRef = ymNowSP(), { estimado = false } = {}) {
    const produtos = await prisma.produto.findMany({
        where: { ativo: true },
        select: { id: true, valorVenda: true }
    });
    const ids = produtos.map((p) => p.id);
    const custos = await custoAtualDeProdutos(ids);
    let gravados = 0;
    for (const p of produtos) {
        const c = custos.get(p.id) || { custoUnitario: null, fonteCusto: 'SEM_CUSTO' };
        await prisma.produtoCustoHistorico.upsert({
            where: { produtoId_mesReferencia: { produtoId: p.id, mesReferencia: mesRef } },
            update: { custoUnitario: c.custoUnitario, fonteCusto: c.fonteCusto, precoVenda: round2(p.valorVenda), estimado, capturadoEm: new Date() },
            create: { produtoId: p.id, mesReferencia: mesRef, custoUnitario: c.custoUnitario, fonteCusto: c.fonteCusto, precoVenda: round2(p.valorVenda), estimado }
        });
        gravados++;
    }
    return { mesRef, produtos: gravados, estimado };
}

/**
 * Preenche o histórico dos últimos N meses com o custo ATUAL (marcado como
 * estimado), UMA vez, quando a tabela ainda está vazia. Assim o gráfico já
 * nasce com uma linha; os meses seguintes recebem snapshots reais.
 */
async function backfillInicial(meses = 6) {
    const existe = await prisma.produtoCustoHistorico.count();
    if (existe > 0) return { pulou: true, motivo: 'histórico já existe' };
    const mesAtual = ymNowSP();
    const mesesArr = listaMeses(mesAtual, meses);
    const resultado = [];
    for (const m of mesesArr) {
        const r = await capturarMes(m, { estimado: m !== mesAtual });
        resultado.push(r);
    }
    return { backfill: true, meses: resultado };
}

module.exports = {
    custoAtualDeProdutos,
    listar,
    detalhe,
    capturarMes,
    backfillInicial,
    // puras
    markupDe,
    margemPctDe,
    origemDe
};
