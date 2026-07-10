/**
 * Financeiro Gerencial — Fase 5: Fluxo de Caixa e DRE.
 *
 * FLUXO DE CAIXA (regime de CAIXA — quando o dinheiro entra/sai):
 *   - Entradas previstas  = parcelas a RECEBER pelo vencimento (status != CANCELADO)
 *   - Entradas realizadas = pagamentos recebidos (ledger pagamentos_parcela, não estornados)
 *   - Saídas previstas    = parcelas a PAGAR pelo vencimento (parcela e conta != CANCELADO)
 *   - Saídas realizadas   = pagamentos feitos (ledger pagamentos_parcela_pagar, não estornados)
 *   Agrupado em baldes por DIA ou MÊS (fuso America/Sao_Paulo), com saldo acumulado.
 *
 * DRE (regime de COMPETÊNCIA — quando a venda/despesa aconteceu), por mês:
 *   - Receita faturada  = pedidos situacaoCA=FATURADO, bonificacao=false (Σ itens valor×qtd)
 *   - Receita especial  = pedidos especiais (sem NF) não faturados, bonificacao=false
 *     → mesma regra do Dashboard (Σ itens), SEM frete
 *   - (−) Devoluções    = devolucoes status ATIVA por dataDevolucao
 *   - (−) Despesas      = contas a pagar (status != CANCELADO) por competência
 *     (competencia || 1º vencimento || criadoEm), rateadas por categoria
 *     (contas_pagar_rateio; fallback: categoria da conta; fallback: "Sem categoria")
 *   - Resultado = receita líquida − despesas; margem %.
 *
 * Somente LEITURA — nenhuma escrita no banco. Agregações em JS (funções puras
 * exportadas, testáveis offline); as queries só puxam os campos mínimos.
 */

const prisma = require('../config/database');
const { normalizar } = require('./importacaoCaService');

const TZ = 'America/Sao_Paulo';

// ─────────────────────────────────────────────────────────────
// Helpers de data (fuso São Paulo)
// ─────────────────────────────────────────────────────────────

/** Date → 'YYYY-MM-DD' no fuso de SP. */
const ymdSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
/** Date → 'YYYY-MM' no fuso de SP. */
const ymSP = (d) => ymdSP(d).slice(0, 7);
/** 'YYYY-MM-DD' → Date no início do dia em SP (03:00 UTC). */
const inicioDiaSP = (ymd) => new Date(`${ymd}T00:00:00-03:00`);
/** 'YYYY-MM-DD' → Date no fim do dia em SP. */
const fimDiaSP = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);

const somaDias = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const somaMeses = (ym, n) => {
    const [a, m] = ym.split('-').map(Number);
    const total = a * 12 + (m - 1) + n;
    const na = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    return `${na}-${String(nm).padStart(2, '0')}`;
};

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const num = (v) => Number(v || 0);

// ─────────────────────────────────────────────────────────────
// Fluxo de Caixa — funções puras
// ─────────────────────────────────────────────────────────────

/**
 * Gera a lista de baldes entre de..ate ('YYYY-MM-DD'), por 'dia' ou 'mes'.
 * @returns [{ chave, label }] — chave = 'YYYY-MM-DD' | 'YYYY-MM'
 */
function gerarBuckets(de, ate, granularidade) {
    const buckets = [];
    if (granularidade === 'mes') {
        let ym = de.slice(0, 7);
        const fim = ate.slice(0, 7);
        while (ym <= fim && buckets.length < 60) {
            buckets.push({ chave: ym });
            ym = somaMeses(ym, 1);
        }
    } else {
        let ymd = de;
        while (ymd <= ate && buckets.length < 400) {
            buckets.push({ chave: ymd });
            ymd = somaDias(ymd, 1);
        }
    }
    return buckets;
}

/**
 * Agrega os quatro conjuntos nos baldes e calcula saldos/acumulados.
 * Cada item: { data:Date, valor:Number }. Função PURA.
 */
function agregarFluxo(buckets, granularidade, entradasPrev, entradasReal, saidasPrev, saidasReal) {
    const chaveDe = (d) => (granularidade === 'mes' ? ymSP(d) : ymdSP(d));
    const idx = new Map(buckets.map((b, i) => [b.chave, i]));
    const linhas = buckets.map((b) => ({
        chave: b.chave,
        entradasPrevistas: 0,
        entradasRealizadas: 0,
        saidasPrevistas: 0,
        saidasRealizadas: 0
    }));

    const soma = (itens, campo) => {
        for (const it of itens) {
            const i = idx.get(chaveDe(it.data));
            if (i !== undefined) linhas[i][campo] += num(it.valor);
        }
    };
    soma(entradasPrev, 'entradasPrevistas');
    soma(entradasReal, 'entradasRealizadas');
    soma(saidasPrev, 'saidasPrevistas');
    soma(saidasReal, 'saidasRealizadas');

    let acPrev = 0;
    let acReal = 0;
    for (const l of linhas) {
        l.entradasPrevistas = round2(l.entradasPrevistas);
        l.entradasRealizadas = round2(l.entradasRealizadas);
        l.saidasPrevistas = round2(l.saidasPrevistas);
        l.saidasRealizadas = round2(l.saidasRealizadas);
        l.saldoPrevisto = round2(l.entradasPrevistas - l.saidasPrevistas);
        l.saldoRealizado = round2(l.entradasRealizadas - l.saidasRealizadas);
        acPrev = round2(acPrev + l.saldoPrevisto);
        acReal = round2(acReal + l.saldoRealizado);
        l.acumuladoPrevisto = acPrev;
        l.acumuladoRealizado = acReal;
    }
    return linhas;
}

// ─────────────────────────────────────────────────────────────
// Fluxo de Caixa — consulta
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} de   'YYYY-MM-DD'
 * @param {string} ate  'YYYY-MM-DD'
 * @param {string} granularidade 'dia' | 'mes'
 */
async function fluxoCaixa(de, ate, granularidade = 'dia') {
    const gte = inicioDiaSP(granularidade === 'mes' ? `${de.slice(0, 7)}-01` : de);
    // mês: estende o fim até o último dia do mês de `ate`
    const ateFim = granularidade === 'mes' ? somaDias(somaMeses(ate.slice(0, 7), 1) + '-01', -1) : ate;
    const lte = fimDiaSP(ateFim);

    const [parcelasReceber, pagamentosReceber, parcelasPagar, pagamentosPagar,
        abertoReceber, abertoPagar, vencidoReceber, vencidoPagar] = await Promise.all([
        // previstos: parcelas pelo vencimento (inclui as já pagas — previsto é o que VENCE no período)
        prisma.parcela.findMany({
            where: { dataVencimento: { gte, lte }, status: { not: 'CANCELADO' }, contaReceber: { status: { not: 'CANCELADO' } } },
            select: { dataVencimento: true, valor: true }
        }),
        prisma.pagamentoParcela.findMany({
            where: { dataPagamento: { gte, lte }, estornado: false },
            select: { dataPagamento: true, valorRecebido: true }
        }),
        prisma.parcelaPagar.findMany({
            where: { dataVencimento: { gte, lte }, status: { not: 'CANCELADO' }, contaPagar: { status: { not: 'CANCELADO' } } },
            select: { dataVencimento: true, valor: true }
        }),
        prisma.pagamentoParcelaPagar.findMany({
            where: { dataPagamento: { gte, lte }, estornado: false },
            select: { dataPagamento: true, valorPago: true, juros: true, multa: true }
        }),
        // KPIs de aberto (independem do período): tudo que ainda não foi quitado
        prisma.parcela.aggregate({
            _sum: { valor: true, valorPago: true, valorDescontoTotal: true },
            where: { status: { in: ['PENDENTE', 'PARCIAL', 'VENCIDO'] }, contaReceber: { status: { not: 'CANCELADO' } } }
        }),
        prisma.parcelaPagar.aggregate({
            _sum: { valor: true, valorPago: true },
            where: { status: { in: ['PENDENTE', 'PARCIAL'] }, contaPagar: { status: { not: 'CANCELADO' } } }
        }),
        prisma.parcela.aggregate({
            _sum: { valor: true, valorPago: true, valorDescontoTotal: true },
            where: {
                status: { in: ['PENDENTE', 'PARCIAL', 'VENCIDO'] },
                dataVencimento: { lt: inicioDiaSP(ymdSP(new Date())) },
                contaReceber: { status: { not: 'CANCELADO' } }
            }
        }),
        prisma.parcelaPagar.aggregate({
            _sum: { valor: true, valorPago: true },
            where: {
                status: { in: ['PENDENTE', 'PARCIAL'] },
                dataVencimento: { lt: inicioDiaSP(ymdSP(new Date())) },
                contaPagar: { status: { not: 'CANCELADO' } }
            }
        })
    ]);

    const buckets = gerarBuckets(
        granularidade === 'mes' ? `${de.slice(0, 7)}-01` : de,
        ateFim,
        granularidade
    );
    const linhas = agregarFluxo(
        buckets,
        granularidade,
        parcelasReceber.map((p) => ({ data: p.dataVencimento, valor: p.valor })),
        pagamentosReceber.map((p) => ({ data: p.dataPagamento, valor: p.valorRecebido })),
        parcelasPagar.map((p) => ({ data: p.dataVencimento, valor: p.valor })),
        // saída de caixa = principal + juros + multa (o que realmente saiu do banco)
        pagamentosPagar.map((p) => ({ data: p.dataPagamento, valor: num(p.valorPago) + num(p.juros) + num(p.multa) }))
    );

    const totalPeriodo = linhas.reduce((t, l) => ({
        entradasPrevistas: round2(t.entradasPrevistas + l.entradasPrevistas),
        entradasRealizadas: round2(t.entradasRealizadas + l.entradasRealizadas),
        saidasPrevistas: round2(t.saidasPrevistas + l.saidasPrevistas),
        saidasRealizadas: round2(t.saidasRealizadas + l.saidasRealizadas)
    }), { entradasPrevistas: 0, entradasRealizadas: 0, saidasPrevistas: 0, saidasRealizadas: 0 });

    // "em aberto" = valor − já pago − descontos (aproximação: descontos só existem no receber)
    const aberto = (agg, temDesconto) => round2(
        num(agg._sum.valor) - num(agg._sum.valorPago) - (temDesconto ? num(agg._sum.valorDescontoTotal) : 0)
    );

    return {
        de,
        ate: ateFim,
        granularidade,
        kpis: {
            aReceberAberto: aberto(abertoReceber, true),
            aReceberVencido: aberto(vencidoReceber, true),
            aPagarAberto: aberto(abertoPagar, false),
            aPagarVencido: aberto(vencidoPagar, false),
            saldoPrevistoPeriodo: round2(totalPeriodo.entradasPrevistas - totalPeriodo.saidasPrevistas),
            saldoRealizadoPeriodo: round2(totalPeriodo.entradasRealizadas - totalPeriodo.saidasRealizadas)
        },
        totais: totalPeriodo,
        linhas
    };
}

// ─────────────────────────────────────────────────────────────
// DRE — funções puras
// ─────────────────────────────────────────────────────────────

/**
 * Monta a matriz da DRE. Função PURA.
 * @param {string[]} meses               ['2026-01', ...]
 * @param {Array} receitas               [{ mes, origem:'FATURADO'|'ESPECIAL', total }]
 * @param {Array} devolucoes             [{ mes, total }]
 * @param {Array} despesas               [{ mes, categoria, valor }]
 * @param {(nome:string)=>string} classif classificação da categoria (default: 'A_CLASSIFICAR')
 *   OPERACIONAL/FINANCEIRO/A_CLASSIFICAR entram no resultado; FORA_DRE fica à parte.
 */
function montarDre(meses, receitas, devolucoes, despesas, classif = () => 'A_CLASSIFICAR') {
    const idx = new Map(meses.map((m, i) => [m, i]));
    const zeros = () => meses.map(() => 0);

    const recFaturada = zeros();
    const recEspecial = zeros();
    for (const r of receitas) {
        const i = idx.get(r.mes);
        if (i === undefined) continue;
        if (r.origem === 'FATURADO') recFaturada[i] += num(r.total);
        else recEspecial[i] += num(r.total);
    }
    const devol = zeros();
    for (const d of devolucoes) {
        const i = idx.get(d.mes);
        if (i !== undefined) devol[i] += num(d.total);
    }

    // Despesas por categoria. FORA_DRE (retirada de lucros, empréstimos, imobilizado) NÃO
    // entra no resultado — vai para uma linha à parte, só para transparência.
    const porCategoria = new Map();
    const foraDre = zeros();
    let temAClassificar = false;
    for (const d of despesas) {
        const i = idx.get(d.mes);
        if (i === undefined) continue;
        const nome = (d.categoria || 'Sem categoria').trim() || 'Sem categoria';
        const cls = classif(nome);
        if (cls === 'FORA_DRE') { foraDre[i] += num(d.valor); continue; }
        if (cls === 'A_CLASSIFICAR') temAClassificar = true;
        if (!porCategoria.has(nome)) porCategoria.set(nome, { valores: zeros(), classificacao: cls });
        porCategoria.get(nome).valores[i] += num(d.valor);
    }
    const categorias = [...porCategoria.entries()]
        .map(([nome, { valores, classificacao }]) => ({
            nome,
            classificacao,
            valores: valores.map(round2),
            total: round2(valores.reduce((a, b) => a + b, 0))
        }))
        .sort((a, b) => b.total - a.total);

    const receitaLiquida = meses.map((_, i) => round2(recFaturada[i] + recEspecial[i] - devol[i]));
    const totalDespesas = meses.map((_, i) => round2(categorias.reduce((s, c) => s + c.valores[i], 0)));
    const resultado = meses.map((_, i) => round2(receitaLiquida[i] - totalDespesas[i]));
    const margem = meses.map((_, i) => (receitaLiquida[i] > 0 ? round2((resultado[i] / receitaLiquida[i]) * 100) : null));

    const totalLinha = (arr) => round2(arr.reduce((a, b) => a + b, 0));
    return {
        meses,
        receita: {
            faturada: { valores: recFaturada.map(round2), total: totalLinha(recFaturada) },
            especial: { valores: recEspecial.map(round2), total: totalLinha(recEspecial) },
            devolucoes: { valores: devol.map(round2), total: totalLinha(devol) },
            liquida: { valores: receitaLiquida, total: totalLinha(receitaLiquida) }
        },
        despesas: {
            categorias,
            total: { valores: totalDespesas, total: totalLinha(totalDespesas) }
        },
        // Saídas que NÃO são resultado (retirada de lucros, empréstimos, compra de bens).
        // Ficam fora do lucro/prejuízo — mostradas só para o caixa fechar.
        foraDre: { valores: foraDre.map(round2), total: totalLinha(foraDre) },
        temAClassificar,
        resultado: { valores: resultado, total: totalLinha(resultado) },
        margem: {
            valores: margem,
            total: totalLinha(receitaLiquida) > 0
                ? round2((totalLinha(resultado) / totalLinha(receitaLiquida)) * 100)
                : null
        }
    };
}

/** Competência efetiva de uma conta a pagar: competencia || 1º vencimento || criadoEm. */
function competenciaConta(conta) {
    if (conta.competencia) return conta.competencia;
    const vencs = (conta.parcelas || []).map((p) => new Date(p.dataVencimento).getTime()).filter((t) => !isNaN(t));
    if (vencs.length > 0) return new Date(Math.min(...vencs));
    return conta.criadoEm;
}

// ─────────────────────────────────────────────────────────────
// DRE — consulta
// ─────────────────────────────────────────────────────────────

/**
 * DRE por mês entre de..ate ('YYYY-MM').
 */
async function dre(deMes, ateMes) {
    const meses = [];
    let ym = deMes;
    while (ym <= ateMes && meses.length < 24) {
        meses.push(ym);
        ym = somaMeses(ym, 1);
    }
    const gte = inicioDiaSP(`${deMes}-01`);
    const lte = fimDiaSP(somaDias(`${somaMeses(ateMes, 1)}-01`, -1));

    // Receita por mês/origem — mesma regra do Dashboard (Σ itens valor×qtd), em SQL
    // para não carregar milhares de itens. Timestamps são UTC → converter p/ SP.
    const receitasRaw = await prisma.$queryRaw`
        SELECT to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
               CASE WHEN p.situacao_ca = 'FATURADO' THEN 'FATURADO' ELSE 'ESPECIAL' END AS origem,
               COALESCE(SUM(i.valor * i.quantidade), 0)::float AS total
        FROM pedidos p
        JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.bonificacao = false
          AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
          AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
        GROUP BY 1, 2
    `;

    const devolucoesRaw = await prisma.$queryRaw`
        SELECT to_char((d.data_devolucao AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
               COALESCE(SUM(d.valor_total), 0)::float AS total
        FROM devolucoes d
        WHERE d.status = 'ATIVA'
          AND d.data_devolucao >= ${gte} AND d.data_devolucao <= ${lte}
        GROUP BY 1
    `;

    // Despesas: volume pequeno → em JS (competência com fallback + rateio com fallback)
    // Janela ampliada (competência pode cair no range mesmo com criadoEm fora e vice-versa):
    const contas = await prisma.contaPagar.findMany({
        where: {
            status: { not: 'CANCELADO' },
            OR: [
                { competencia: { gte, lte } },
                { competencia: null, parcelas: { some: { dataVencimento: { gte, lte } } } },
                { competencia: null, parcelas: { none: {} }, criadoEm: { gte, lte } }
            ]
        },
        select: {
            categoria: true,
            valorTotal: true,
            competencia: true,
            criadoEm: true,
            parcelas: { select: { dataVencimento: true } },
            rateios: { select: { categoria: true, valor: true } }
        }
    });

    const despesas = [];
    for (const c of contas) {
        const mes = ymSP(competenciaConta(c));
        if (c.rateios.length > 0) {
            for (const r of c.rateios) despesas.push({ mes, categoria: r.categoria, valor: num(r.valor) });
        } else {
            despesas.push({ mes, categoria: c.categoria, valor: num(c.valorTotal) });
        }
    }

    // Classificação das categorias (balde da DRE). Chave normalizada p/ tolerar acento/caixa.
    const cats = await prisma.categoriaDespesa.findMany({ select: { nome: true, classificacao: true } });
    const mapaClassif = new Map(cats.map((c) => [normalizar(c.nome), c.classificacao]));
    const classif = (nome) => mapaClassif.get(normalizar(nome)) || 'A_CLASSIFICAR';

    return montarDre(
        meses,
        receitasRaw.map((r) => ({ mes: r.mes, origem: r.origem, total: num(r.total) })),
        devolucoesRaw.map((d) => ({ mes: d.mes, total: num(d.total) })),
        despesas,
        classif
    );
}

// ─────────────────────────────────────────────────────────────
// Financeiro POR CONTA (banco/caixa) — regime de caixa
// Entradas = recebimentos (parcelas a receber PAGAS) por conta financeira.
// Saídas   = pagamentos (ledger de contas a pagar, não estornados) por conta.
// ─────────────────────────────────────────────────────────────

const contaAzulService = require('./contaAzulService');

/** Rótulo amigável de uma conta financeira (banco/caixa) a partir da tabela local. */
async function mapaContasFinanceiras() {
    const contas = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true, tipoUso: true, ativo: true } });
    const mapa = new Map();
    contas.forEach((c) => mapa.set(c.id, { nome: c.nomeBanco || 'Conta', tipo: c.tipoUso || null, ativo: c.ativo }));
    return mapa;
}

/**
 * Totais por conta no período (regime de caixa): entradas, saídas e resultado.
 * @param comSaldoCA se true, tenta buscar o saldo em tempo real de cada conta no CA (best-effort).
 */
async function saldosPorConta(de, ate, comSaldoCA = false) {
    const ini = inicioDiaSP(de), fim = fimDiaSP(ate);

    const [entradas, saidas, mapa] = await Promise.all([
        // Recebimentos: parcelas a receber PAGAS no período (por data de pagamento)
        prisma.parcela.groupBy({
            by: ['contaFinanceiraCaId'],
            where: { status: 'PAGO', dataPagamento: { gte: ini, lte: fim } },
            _sum: { valorPago: true },
            _count: { _all: true }
        }),
        // Pagamentos: ledger de contas a pagar (não estornado) no período
        prisma.pagamentoParcelaPagar.groupBy({
            by: ['contaFinanceiraCaId'],
            where: { estornado: false, dataPagamento: { gte: ini, lte: fim } },
            _sum: { valorPago: true, juros: true, multa: true },
            _count: { _all: true }
        }),
        mapaContasFinanceiras()
    ]);

    const linhas = new Map(); // id|null → { entradas, saidas, qtdEnt, qtdSai }
    const get = (id) => {
        const k = id || '__SEM__';
        if (!linhas.has(k)) linhas.set(k, { id: id || null, entradas: 0, saidas: 0, qtdEnt: 0, qtdSai: 0 });
        return linhas.get(k);
    };
    entradas.forEach((e) => { const l = get(e.contaFinanceiraCaId); l.entradas = round2(num(e._sum.valorPago)); l.qtdEnt = e._count._all; });
    saidas.forEach((s) => { const l = get(s.contaFinanceiraCaId); l.saidas = round2(num(s._sum.valorPago) + num(s._sum.juros) + num(s._sum.multa)); l.qtdSai = s._count._all; });

    let contas = [...linhas.values()].map((l) => {
        const info = l.id ? mapa.get(l.id) : null;
        return {
            id: l.id,
            nome: l.id ? (info?.nome || 'Conta do CA') : 'Não informado',
            tipo: info?.tipo || null,
            entradas: l.entradas,
            saidas: l.saidas,
            resultado: round2(l.entradas - l.saidas),
            qtdEntradas: l.qtdEnt,
            qtdSaidas: l.qtdSai,
            saldoCA: null
        };
    });

    // Saldo em tempo real do CA (best-effort; não derruba o relatório se falhar)
    if (comSaldoCA) {
        await Promise.all(contas.filter((c) => c.id).map(async (c) => {
            try { c.saldoCA = await contaAzulService.buscarSaldoContaFinanceira(c.id); }
            catch (_) { c.saldoCA = null; }
        }));
    }

    contas.sort((a, b) => (b.entradas + b.saidas) - (a.entradas + a.saidas));
    const totais = contas.reduce((t, c) => ({
        entradas: round2(t.entradas + c.entradas),
        saidas: round2(t.saidas + c.saidas),
        resultado: round2(t.resultado + c.resultado)
    }), { entradas: 0, saidas: 0, resultado: 0 });

    return { de, ate, contas, totais };
}

/**
 * Extrato (lançamentos) de UMA conta no período: entradas (recebimentos) e
 * saídas (pagamentos), com quem/origem, ordenado por data desc.
 * contaId = null → lançamentos SEM conta informada.
 */
async function extratoPorConta(contaId, de, ate) {
    const ini = inicioDiaSP(de), fim = fimDiaSP(ate);
    const filtroConta = contaId ? contaId : null;

    const [ents, sais, mapa] = await Promise.all([
        prisma.parcela.findMany({
            where: { status: 'PAGO', contaFinanceiraCaId: filtroConta, dataPagamento: { gte: ini, lte: fim } },
            select: {
                id: true, numeroParcela: true, valorPago: true, dataPagamento: true, formaPagamento: true,
                contaReceber: { select: { cliente: { select: { NomeFantasia: true, Nome: true } }, pedido: { select: { numero: true } } } }
            }
        }),
        prisma.pagamentoParcelaPagar.findMany({
            where: { estornado: false, contaFinanceiraCaId: filtroConta, dataPagamento: { gte: ini, lte: fim } },
            select: {
                id: true, valorPago: true, juros: true, multa: true, dataPagamento: true, formaPagamento: true, origem: true,
                parcelaPagar: { select: { numeroParcela: true, contaPagar: { select: { descricao: true, fornecedor: { select: { razaoSocial: true } } } } } }
            }
        }),
        mapaContasFinanceiras()
    ]);

    const lancamentos = [
        ...ents.map((e) => ({
            tipo: 'ENTRADA',
            data: e.dataPagamento,
            valor: round2(num(e.valorPago)),
            quem: e.contaReceber?.cliente?.NomeFantasia || e.contaReceber?.cliente?.Nome || 'Cliente',
            descricao: `Recebimento${e.contaReceber?.pedido?.numero ? ` · pedido ${e.contaReceber.pedido.numero}` : ''}${e.numeroParcela ? ` · parcela ${e.numeroParcela}` : ''}`,
            formaPagamento: e.formaPagamento || null
        })),
        ...sais.map((s) => ({
            tipo: 'SAIDA',
            data: s.dataPagamento,
            valor: round2(num(s.valorPago) + num(s.juros) + num(s.multa)),
            quem: s.parcelaPagar?.contaPagar?.fornecedor?.razaoSocial || 'Fornecedor',
            descricao: s.parcelaPagar?.contaPagar?.descricao || 'Pagamento',
            formaPagamento: s.formaPagamento || null
        }))
    ].sort((a, b) => new Date(b.data) - new Date(a.data));

    const totalEntradas = round2(lancamentos.filter((l) => l.tipo === 'ENTRADA').reduce((s, l) => s + l.valor, 0));
    const totalSaidas = round2(lancamentos.filter((l) => l.tipo === 'SAIDA').reduce((s, l) => s + l.valor, 0));
    const info = contaId ? mapa.get(contaId) : null;

    return {
        conta: { id: contaId || null, nome: contaId ? (info?.nome || 'Conta do CA') : 'Não informado' },
        de, ate,
        totalEntradas, totalSaidas, resultado: round2(totalEntradas - totalSaidas),
        lancamentos
    };
}

// ─────────────────────────────────────────────────────────────
// MARGEM POR PRODUTO (Fase 3) — custo × preço × vendas
// Vendas com a MESMA regra de receita da DRE (bonificacao=false,
// FATURADO ou especial, por data_venda) para os números baterem.
// Custo unitário por prioridade:
//   1. FICHA   — custo por unidade da receita ATIVA do item PCP (tipo PA)
//                vinculado ao produto (ficha técnica, se atualiza com as compras)
//   2. COMPRA  — Produto.custoManual (média ponderada das notas de entrada)
//   3. CA      — Produto.custoMedio (sincronizado do Conta Azul)
//   4. SEM_CUSTO — nenhum dos três; a linha é sinalizada e fica fora dos totais de custo/margem
// ─────────────────────────────────────────────────────────────

/**
 * Monta as linhas e totais da margem. Função PURA (testável offline).
 * @param {Array} vendas   [{ produtoId, quantidade, receita }]
 * @param {Map}   produtos produtoId → { nome, categoria, unidade, valorVenda, custoManual, custoMedio }
 * @param {Map}   custosFicha produtoId → custoPorUnidade (receita ativa)
 */
function montarMargemProdutos(vendas, produtos, custosFicha) {
    const linhas = [];
    for (const v of vendas) {
        const p = produtos.get(v.produtoId);
        if (!p) continue;
        const qtd = num(v.quantidade);
        const receita = round2(v.receita);
        if (qtd <= 0 && receita === 0) continue;

        const ficha = num(custosFicha.get(v.produtoId));
        const compra = num(p.custoManual);
        const ca = num(p.custoMedio);
        let custoUnitario = 0;
        let fonteCusto = 'SEM_CUSTO';
        if (ficha > 0) { custoUnitario = ficha; fonteCusto = 'FICHA'; }
        else if (compra > 0) { custoUnitario = compra; fonteCusto = 'COMPRA'; }
        else if (ca > 0) { custoUnitario = ca; fonteCusto = 'CA'; }

        const custoTotal = round2(custoUnitario * qtd);
        const margem = fonteCusto === 'SEM_CUSTO' ? null : round2(receita - custoTotal);
        linhas.push({
            produtoId: v.produtoId,
            nome: p.nome,
            categoria: p.categoria || null,
            unidade: p.unidade || null,
            quantidade: Math.round(qtd * 1000) / 1000,
            receita,
            precoMedio: qtd > 0 ? round2(receita / qtd) : null,
            valorVenda: num(p.valorVenda) > 0 ? round2(p.valorVenda) : null,
            custoUnitario: fonteCusto === 'SEM_CUSTO' ? null : Math.round(custoUnitario * 10000) / 10000,
            fonteCusto,
            custoTotal: fonteCusto === 'SEM_CUSTO' ? null : custoTotal,
            margem,
            margemPct: margem != null && receita > 0 ? Math.round((margem / receita) * 1000) / 10 : null
        });
    }
    linhas.sort((a, b) => b.receita - a.receita);

    const comCusto = linhas.filter((l) => l.fonteCusto !== 'SEM_CUSTO');
    const receitaTotal = round2(linhas.reduce((s, l) => s + l.receita, 0));
    const receitaComCusto = round2(comCusto.reduce((s, l) => s + l.receita, 0));
    const custoTotal = round2(comCusto.reduce((s, l) => s + l.custoTotal, 0));
    const margemTotal = round2(receitaComCusto - custoTotal);
    return {
        linhas,
        totais: {
            produtos: linhas.length,
            semCusto: linhas.length - comCusto.length,
            receitaTotal,
            receitaComCusto,
            custoTotal,
            margemTotal,
            margemPct: receitaComCusto > 0 ? Math.round((margemTotal / receitaComCusto) * 1000) / 10 : null
        }
    };
}

/**
 * @param {string} de  'YYYY-MM-DD'
 * @param {string} ate 'YYYY-MM-DD'
 */
async function margemProdutos(de, ate) {
    const gte = inicioDiaSP(de);
    const lte = fimDiaSP(ate);

    // 1. Vendas por produto no período (SQL — mesma regra de receita da DRE)
    const vendasRaw = await prisma.$queryRaw`
        SELECT i.produto_id AS produto_id,
               COALESCE(SUM(i.quantidade), 0)::float AS quantidade,
               COALESCE(SUM(i.valor * i.quantidade), 0)::float AS receita
        FROM pedidos p
        JOIN pedido_itens i ON i.pedido_id = p.id
        WHERE p.bonificacao = false
          AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
          AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
        GROUP BY 1
    `;
    const vendas = vendasRaw.map((v) => ({ produtoId: v.produto_id, quantidade: num(v.quantidade), receita: num(v.receita) }));
    const ids = vendas.map((v) => v.produtoId);
    if (ids.length === 0) return { de, ate, ...montarMargemProdutos([], new Map(), new Map()) };

    // 2. Dados dos produtos vendidos
    const produtosDb = await prisma.produto.findMany({
        where: { id: { in: ids } },
        select: { id: true, nome: true, categoria: true, unidade: true, valorVenda: true, custoManual: true, custoMedio: true }
    });
    const produtos = new Map(produtosDb.map((p) => [p.id, p]));

    // 3. Custo da ficha técnica: itens PCP vinculados a esses produtos com receita ativa.
    //    Falha em uma receita não derruba o relatório — o produto cai para o custo de compra/CA.
    const pcpReceitaService = require('./pcpReceitaService');
    const itensPcp = await prisma.itemPcp.findMany({
        where: { produtoId: { in: ids }, ativo: true },
        select: { id: true, produtoId: true }
    });
    const custosFicha = new Map();
    for (const item of itensPcp) {
        if (custosFicha.has(item.produtoId)) continue;
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
            if (num(custo?.custoPorUnidade) > 0) custosFicha.set(item.produtoId, num(custo.custoPorUnidade));
        } catch (err) {
            console.error(`[MargemProdutos] Falha no custo da ficha do produto ${item.produtoId}:`, err.message);
        }
    }

    return { de, ate, ...montarMargemProdutos(vendas, produtos, custosFicha) };
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD FINANCEIRO (Fase 5) — visão geral em uma tela
// ─────────────────────────────────────────────────────────────

const FAIXAS_AGING = [
    { key: 'aVencer', label: 'A vencer', de: null, ate: 0 },       // atraso <= 0
    { key: 'd1_7', label: '1–7 dias', de: 1, ate: 7 },
    { key: 'd8_30', label: '8–30 dias', de: 8, ate: 30 },
    { key: 'd31_60', label: '31–60 dias', de: 31, ate: 60 },
    { key: 'd60mais', label: 'Mais de 60 dias', de: 61, ate: null }
];

/**
 * Classifica parcelas em faixas por dias de atraso. Função PURA.
 * @param parcelas [{ saldo, diasAtraso }] — saldo > 0, diasAtraso <= 0 = a vencer
 */
function montarAging(parcelas) {
    const faixas = FAIXAS_AGING.map((f) => ({ key: f.key, label: f.label, qtd: 0, valor: 0 }));
    for (const p of parcelas) {
        if (!(num(p.saldo) > 0)) continue;
        const d = Math.floor(num(p.diasAtraso));
        const i = FAIXAS_AGING.findIndex((f) =>
            (f.de === null || d >= f.de) && (f.ate === null || d <= f.ate));
        if (i >= 0) { faixas[i].qtd++; faixas[i].valor = round2(faixas[i].valor + num(p.saldo)); }
    }
    const vencido = faixas.filter((f) => f.key !== 'aVencer');
    return {
        faixas,
        totalAberto: round2(faixas.reduce((s, f) => s + f.valor, 0)),
        totalVencido: round2(vencido.reduce((s, f) => s + f.valor, 0)),
        qtdVencidas: vencido.reduce((s, f) => s + f.qtd, 0)
    };
}

/** Aging (inadimplência por idade) das parcelas a receber em aberto. */
async function agingRecebiveis() {
    const hoje = ymdSP(new Date());
    const parcelas = await prisma.parcela.findMany({
        where: {
            status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] },
            contaReceber: { status: { not: 'CANCELADO' } }
        },
        select: { valor: true, valorPago: true, valorDescontoTotal: true, dataVencimento: true }
    });
    const diasEntre = (a, b) => Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);
    return montarAging(parcelas.map((p) => ({
        saldo: num(p.valor) - num(p.valorPago) - num(p.valorDescontoTotal),
        diasAtraso: diasEntre(hoje, ymdSP(p.dataVencimento))
    })));
}

/** Visão geral: junta fluxo 30 dias, contas, aging, margem, DRE do mês e conciliação. */
async function dashboardFinanceiro() {
    const hoje = ymdSP(new Date());
    const mes = hoje.slice(0, 7);
    const [fluxo, saldos, aging, margem, dreMes, conciliacaoPendentes] = await Promise.all([
        fluxoCaixa(hoje, somaDias(hoje, 29), 'dia'),
        saldosPorConta(somaDias(hoje, -29), hoje, false),
        agingRecebiveis(),
        margemProdutos(`${mes}-01`, hoje),
        dre(mes, mes),
        prisma.extratoLancamento.count({ where: { status: 'PENDENTE' } })
    ]);

    const pioresMargens = (margem.linhas || [])
        .filter((l) => l.margemPct != null && l.quantidade > 0)
        .sort((a, b) => a.margemPct - b.margemPct)
        .slice(0, 3)
        .map((l) => ({ nome: l.nome, margemPct: l.margemPct, receita: l.receita }));

    return {
        hoje,
        kpis: fluxo.kpis,
        fluxo30: {
            de: hoje,
            ate: somaDias(hoje, 29),
            saldoPrevisto: fluxo.kpis?.saldoPrevistoPeriodo ?? null,
            linhas: (fluxo.linhas || []).map((l) => ({
                chave: l.chave,
                entradasPrevistas: l.entradasPrevistas,
                saidasPrevistas: l.saidasPrevistas
            }))
        },
        contas30: { contas: saldos.contas.slice(0, 6), totais: saldos.totais, outras: Math.max(0, saldos.contas.length - 6) },
        aging,
        margemMes: {
            pct: margem.totais?.margemPct ?? null,
            receita: margem.totais?.receitaTotal ?? 0,
            semCusto: margem.totais?.semCusto ?? 0,
            piores: pioresMargens
        },
        dreMes: {
            mes,
            receitaLiquida: dreMes.receita?.liquida?.total ?? null,
            despesas: dreMes.despesas?.total?.total ?? null,
            resultado: dreMes.resultado?.total ?? null,
            margemPct: dreMes.margem?.total ?? null,
            temAClassificar: !!dreMes.temAClassificar
        },
        conciliacaoPendentes
    };
}

module.exports = {
    fluxoCaixa,
    dre,
    saldosPorConta,
    extratoPorConta,
    margemProdutos,
    agingRecebiveis,
    dashboardFinanceiro,
    // puras (testáveis offline)
    gerarBuckets,
    agregarFluxo,
    montarDre,
    competenciaConta,
    montarMargemProdutos,
    montarAging
};
