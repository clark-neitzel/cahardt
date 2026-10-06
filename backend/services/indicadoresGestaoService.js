/**
 * Indicadores de Gestão — cálculo dos blocos da tela (contrato em docs/plano-dashboard-indicadores.md §3.3).
 *
 * Somente LEITURA. Regras que não podem mudar:
 *  - Receita = mesma regra da DRE/comissão/meta (pedido FATURADO ou especial, sem bonificação,
 *    menos devoluções ATIVAS). Aqui a condição é COPIADA, nunca reescrita.
 *  - CPV (fabricado) e CMV (revenda + sem classe) vêm do snapshot de custo no item do pedido
 *    (custo na hora da venda). Item sem snapshot cai no custo atual e conta em cobertura.
 *  - Despesas: categorias marcadas "compra de estoque" ficam FORA (já estão no CPV/CMV);
 *    bloco "Impostos sobre vendas" vira a linha de impostos (alíquota OU o pago), nunca os dois.
 *  - Visão produção (foco=producao ou usuário sem nível completo): o SERVIDOR filtra — só
 *    fabricados e seus insumos, sem preço/receita/margem/cliente.
 */
const prisma = require('../config/database');
const custo = require('./indicadoresCustoService');
const fin = require('./financeiroGerencialService');
const config = require('./indicadoresConfigService');
const projecaoVendasService = require('./projecaoVendasService');
const { normalizar } = require('./importacaoCaService');

const TZ = 'America/Sao_Paulo';
const TTL = 60 * 1000;
const round1 = (v) => Math.round(Number(v) * 10) / 10;
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const round4 = custo.round4;
const num = (v) => Number(v || 0);

const ymdSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const inicioDia = (ymd) => new Date(`${ymd}T00:00:00-03:00`);
const fimDia = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);
const somaDias = custo.somaDias;
const diffDias = (de, ate) => Math.round((new Date(`${ate}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / 86400000);
const ultimoDiaDoMes = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
const somaMeses = (ym, n) => { const [a, m] = ym.split('-').map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (ym) => `${MESES_ABREV[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;

const GRUPO_IMPOSTOS = 'impostos sobre vendas';
const GRUPO_ENTREGAS = 'veiculos e entregas';

// ─────────────────────────────────────────────────────────────
// Período
// ─────────────────────────────────────────────────────────────

/** Período imediatamente anterior, do mesmo tamanho (mês cheio → mês anterior cheio). */
function periodoAnterior(de, ate) {
    const ym = de.slice(0, 7);
    if (de.endsWith('-01') && ate === ultimoDiaDoMes(ym)) {
        const ant = somaMeses(ym, -1);
        return { de: `${ant}-01`, ate: ultimoDiaDoMes(ant) };
    }
    if (de.endsWith('-01') && ate.slice(0, 7) === ym) { // mês até hoje → mesmos dias do mês anterior
        const ant = somaMeses(ym, -1);
        const dias = Math.min(Number(ate.slice(8, 10)), Number(ultimoDiaDoMes(ant).slice(8, 10)));
        return { de: `${ant}-01`, ate: `${ant}-${String(dias).padStart(2, '0')}` };
    }
    const dias = diffDias(de, ate) + 1;
    return { de: somaDias(de, -dias), ate: somaDias(de, -1) };
}

/** Normaliza ?de=&ate= (default: mês corrente até hoje). Lança Error(400) se inválido. */
function resolverPeriodo(de, ate) {
    const YMD = /^\d{4}-\d{2}-\d{2}$/;
    const hoje = ymdSP(new Date());
    if (!de && !ate) { de = `${hoje.slice(0, 7)}-01`; ate = hoje; }
    if (!de || !ate || !YMD.test(String(de)) || !YMD.test(String(ate))) {
        const e = new Error('Informe de e ate no formato YYYY-MM-DD.'); e.status = 400; throw e;
    }
    de = String(de); ate = String(ate);
    if (ate < de) { const e = new Error('A data final precisa ser maior ou igual à inicial.'); e.status = 400; throw e; }
    if (diffDias(de, ate) > 400) { const e = new Error('Período máximo de 13 meses.'); e.status = 400; throw e; }
    return { de, ate, dias: diffDias(de, ate) + 1, anterior: periodoAnterior(de, ate) };
}

// ─────────────────────────────────────────────────────────────
// Vendas do período (1 consulta agrupada + custo de fallback em lote)
// ─────────────────────────────────────────────────────────────

async function ctxFichas() {
    return custo.comCache('ctxFichas', TTL, () => custo.carregarFichasVigentes());
}

/**
 * Linhas de venda do período (mesma regra de receita da DRE), já com classe e custo efetivos.
 * @returns {Promise<Array>} [{ produtoId, clienteId, fat, tem, est, semCusto, receita, base, qtd, custoSnap, n, classe, custoEf, semCustoEf }]
 */
async function carregarVendas(de, ate) {
    return custo.comCache(`vendas:${de}:${ate}`, TTL, async () => {
        const gte = inicioDia(de), lte = fimDia(ate);
        // MESMA condição de receita da DRE (financeiroGerencialService.dre): faturado OU especial, sem bonificação
        const rows = await prisma.$queryRaw`
            SELECT i.produto_id AS "produtoId", p.cliente_id AS "clienteId",
                   COALESCE(p.situacao_ca = 'FATURADO' AND p.especial = false, false) AS fat, -- fat = faturado COM NOTA (especial grava FATURADO mas não tem nota)
                   i.classe_custo_snapshot AS classe,
                   (i.custo_snapshot_em IS NOT NULL) AS tem,
                   i.custo_snapshot_estimado AS est,
                   COALESCE(i.fonte_custo_snapshot = 'SEM_CUSTO', false) AS "semCusto",
                   COALESCE(SUM(i.valor * i.quantidade), 0)::float AS receita,
                   COALESCE(SUM(i.valor_base * i.quantidade), 0)::float AS base,
                   COALESCE(SUM(i.quantidade), 0)::float AS qtd,
                   COALESCE(SUM(i.quantidade * COALESCE(i.custo_unitario_snapshot, 0)), 0)::float AS "custoSnap",
                   COUNT(*)::int AS n
            FROM pedidos p
            JOIN pedido_itens i ON i.pedido_id = p.id
            WHERE p.bonificacao = false
              AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
              AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
            GROUP BY 1, 2, 3, 4, 5, 6, 7
        `;
        const semSnap = [...new Set(rows.filter((r) => !r.tem).map((r) => r.produtoId))];
        let classes = new Map(), custos = new Map();
        if (semSnap.length) {
            const ctx = await ctxFichas();
            [classes, custos] = await Promise.all([custo.classificarProdutos(semSnap, ctx), custo.custoAgora(semSnap, ctx)]);
        }
        return rows.map((r) => {
            if (r.tem) {
                return { ...r, classeEf: r.classe || 'SEM_CLASSE', custoEf: r.custoSnap, semCustoEf: r.semCusto };
            }
            const c = custos.get(r.produtoId);
            return {
                ...r,
                classeEf: classes.get(r.produtoId) || 'SEM_CLASSE',
                custoEf: c && c.custo > 0 ? r.qtd * c.custo : 0,
                semCustoEf: !(c && c.custo > 0)
            };
        });
    });
}

/** Devoluções ATIVAS no período: valor por tipo e custo devolvido por classe. */
async function carregarDevolucoes(de, ate) {
    return custo.comCache(`devol:${de}:${ate}`, TTL, async () => {
        const gte = inicioDia(de), lte = fimDia(ate);
        // tipo 'CONTA_AZUL' só vale como "com nota" se o pedido de ORIGEM não é especial
        const porTipo = await prisma.$queryRaw`
            SELECT CASE WHEN d.tipo = 'CONTA_AZUL' AND p.especial = false THEN 'CONTA_AZUL' ELSE 'OUTRO' END AS tipo,
                   COALESCE(SUM(d.valor_total), 0)::float AS total
            FROM devolucoes d
            JOIN pedidos p ON p.id = d.pedido_original_id
            WHERE d.status = 'ATIVA' AND d.data_devolucao >= ${gte} AND d.data_devolucao <= ${lte}
            GROUP BY 1
        `;
        const itens = await prisma.$queryRaw`
            SELECT di.produto_id AS "produtoId", di.quantidade::float AS qtd, x.custo::float AS custo, x.classe AS classe
            FROM devolucao_itens di
            JOIN devolucoes d ON d.id = di.devolucao_id
            LEFT JOIN (
                SELECT pedido_id, produto_id, AVG(custo_unitario_snapshot) AS custo, MAX(classe_custo_snapshot) AS classe
                FROM pedido_itens
                WHERE custo_snapshot_em IS NOT NULL
                  AND pedido_id IN (SELECT pedido_original_id FROM devolucoes
                                    WHERE status = 'ATIVA' AND data_devolucao >= ${gte} AND data_devolucao <= ${lte})
                GROUP BY pedido_id, produto_id
            ) x ON x.pedido_id = d.pedido_original_id AND x.produto_id = di.produto_id
            WHERE d.status = 'ATIVA' AND d.data_devolucao >= ${gte} AND d.data_devolucao <= ${lte}
        `;
        const semSnap = [...new Set(itens.filter((i) => i.custo == null).map((i) => i.produtoId))];
        const ctx = semSnap.length ? await ctxFichas() : null;
        const [classes, custos] = semSnap.length
            ? await Promise.all([custo.classificarProdutos(semSnap, ctx), custo.custoAgora(semSnap, ctx)])
            : [new Map(), new Map()];
        const custoPorClasse = { FABRICADO: 0, REVENDA: 0, SEM_CLASSE: 0 };
        for (const it of itens) {
            let c = it.custo, cls = it.classe;
            if (c == null) { const a = custos.get(it.produtoId); c = a && a.custo > 0 ? a.custo : 0; }
            if (!cls) cls = classes.get(it.produtoId) || 'SEM_CLASSE';
            custoPorClasse[cls] = (custoPorClasse[cls] || 0) + it.qtd * c;
        }
        const total = porTipo.reduce((s, r) => s + num(r.total), 0);
        const comNota = porTipo.filter((r) => r.tipo === 'CONTA_AZUL').reduce((s, r) => s + num(r.total), 0);
        return { total, comNota, custoPorClasse };
    });
}

// ─────────────────────────────────────────────────────────────
// Despesas do período (competência mensal, rateio proporcional aos dias)
// ─────────────────────────────────────────────────────────────

async function carregarDespesas(de, ate) {
    return custo.comCache(`despesas:${de}:${ate}`, TTL, async () => {
        const mesIni = de.slice(0, 7), mesFim = ate.slice(0, 7);
        const meses = [];
        for (let m = mesIni; m <= mesFim && meses.length < 14; m = somaMeses(m, 1)) meses.push(m);
        const gte = inicioDia(`${mesIni}-01`);
        const lte = fimDia(ultimoDiaDoMes(mesFim));
        const { despesas, mapaCat, gruposDb } = await fin.carregarDespesasClassificadas(gte, lte);
        const nomeGrupo = new Map(gruposDb.map((g) => [g.id, normalizar(g.nome)]));

        // fração de cada mês coberta pelo período
        const fator = new Map();
        let proporcional = false;
        for (const m of meses) {
            const ini = m === mesIni ? de : `${m}-01`;
            const fim = m === mesFim ? ate : ultimoDiaDoMes(m);
            const dias = diffDias(ini, fim) + 1;
            const total = Number(ultimoDiaDoMes(m).slice(8, 10));
            fator.set(m, dias / total);
            if (dias !== total) proporcional = true;
        }

        const acc = { variaveis: 0, fixas: 0, impostosPagos: 0, entregas: 0, comprasEstoque: 0, semNatureza: 0 };
        const semNaturezaCats = new Set();
        const porCategoria = new Map(); // nome → { valor, info }
        for (const d of despesas) {
            const f = fator.get(d.mes);
            if (!f) continue;
            const nome = (d.categoria || 'Sem categoria').trim() || 'Sem categoria';
            const info = mapaCat.get(normalizar(nome));
            if ((info?.classificacao || 'A_CLASSIFICAR') === 'FORA_DRE') continue; // não é resultado
            const v = num(d.valor) * f;
            const grupo = info?.grupoDreId ? nomeGrupo.get(info.grupoDreId) : null;
            const natureza = info?.natureza || 'A_DEFINIR';
            porCategoria.set(nome, (porCategoria.get(nome) || 0) + v);
            if (info?.compraDeEstoque === true) { acc.comprasEstoque += v; continue; }
            if (grupo === GRUPO_ENTREGAS) acc.entregas += v;
            if (grupo === GRUPO_IMPOSTOS) { acc.impostosPagos += v; continue; }
            if (natureza === 'VARIAVEL') acc.variaveis += v;
            else if (natureza === 'FIXA') acc.fixas += v;
            else { acc.semNatureza += v; semNaturezaCats.add(nome); }
        }
        return { ...acc, semNaturezaQtd: semNaturezaCats.size, proporcional, porCategoria, mapaCat };
    });
}

// ─────────────────────────────────────────────────────────────
// Cálculo central do período
// ─────────────────────────────────────────────────────────────

async function calcularPeriodo(de, ate) {
    return custo.comCache(`calc:${de}:${ate}`, TTL, async () => {
        const [vendas, dev, desp, aliquota] = await Promise.all([
            carregarVendas(de, ate), carregarDevolucoes(de, ate), carregarDespesas(de, ate), config.getAliquota()
        ]);
        const receitaBruta = round2(vendas.reduce((s, r) => s + r.receita, 0));
        const faturado = vendas.filter((r) => r.fat).reduce((s, r) => s + r.receita, 0);
        const devolucoes = round2(dev.total);

        let imposto, impostoOrigem;
        if (aliquota) { imposto = round2((aliquota / 100) * Math.max(0, faturado - dev.comNota)); impostoOrigem = 'ALIQUOTA'; }
        else { imposto = round2(desp.impostosPagos); impostoOrigem = 'PAGO'; }
        const receitaLiquida = round2(receitaBruta - devolucoes - imposto);

        const bruto = { FABRICADO: 0, REVENDA: 0, SEM_CLASSE: 0 };
        for (const r of vendas) bruto[r.classeEf] = (bruto[r.classeEf] || 0) + r.custoEf;
        const liq = (c) => bruto[c] - (dev.custoPorClasse[c] || 0);
        const cpv = round2(liq('FABRICADO'));
        const cmvSemClasse = round2(liq('SEM_CLASSE'));
        const cmv = round2(liq('REVENDA') + liq('SEM_CLASSE'));

        const lucroBruto = round2(receitaLiquida - cpv - cmv);
        const despesasVariaveis = round2(desp.variaveis);
        const margemContribuicao = round2(lucroBruto - despesasVariaveis);
        const despesasFixas = round2(desp.fixas);
        const resultado = round2(margemContribuicao - despesasFixas);
        // Crédito líquido: devoluções de vendas de outros meses superam as vendas do período
        const semSentido = receitaLiquida <= 0 || (cpv + cmv) < 0;
        const pct = (v) => (!semSentido ? round1((v / receitaLiquida) * 100) : null);

        const itensTotal = vendas.reduce((s, r) => s + r.n, 0);
        const itensReal = vendas.filter((r) => r.tem && !r.est).reduce((s, r) => s + r.n, 0);
        const itensEst = vendas.filter((r) => r.tem && r.est).reduce((s, r) => s + r.n, 0);
        const itensSem = vendas.filter((r) => !r.tem).reduce((s, r) => s + r.n, 0);
        const itensSemCusto = vendas.filter((r) => r.semCustoEf).reduce((s, r) => s + r.n, 0);

        return {
            de, ate, aliquota, impostoOrigem, semSentido,
            receitaBruta, devolucoes, imposto, receitaLiquida, cpv, cmv, cmvSemClasse, lucroBruto,
            despesasVariaveis, margemContribuicao, despesasFixas, resultado,
            mcPct: pct(margemContribuicao), resultadoPct: pct(resultado),
            semNatureza: { qtd: desp.semNaturezaQtd, valor: round2(desp.semNatureza) },
            despesasProporcionais: desp.proporcional,
            comprasEstoqueExcluidas: round2(desp.comprasEstoque),
            custoEntregaBase: round2(desp.entregas),
            cobertura: {
                itensTotal, itensSnapshotReal: itensReal, itensSnapshotEstimado: itensEst, itensSemSnapshot: itensSem,
                itensSemCusto,
                pctReal: itensTotal > 0 ? round1((itensReal / itensTotal) * 100) : 100
            }
        };
    });
}

// ─────────────────────────────────────────────────────────────
// Semáforo (D5 provisório: pior que 2% da média de 3 meses = atenção; 5% = agir)
// ─────────────────────────────────────────────────────────────

function semaforo(valor, media, melhorSeMaior = true) {
    if (valor == null || media == null || !Number.isFinite(media) || media === 0) {
        return { status: 'sem_dado', palavra: '', base: 'nenhuma' };
    }
    const rel = melhorSeMaior ? (media - valor) / Math.abs(media) : (valor - media) / Math.abs(media);
    if (rel > 0.05) return { status: 'agir', palavra: 'agir', base: 'media3m' };
    if (rel > 0.02) return { status: 'atencao', palavra: 'atenção', base: 'media3m' };
    if (rel < -0.02) return { status: 'ok', palavra: 'subindo', base: 'media3m' };
    return { status: 'ok', palavra: 'no alvo', base: 'media3m' };
}
const media = (arr) => { const v = arr.filter((x) => x != null && Number.isFinite(x)); return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : null; };

// ─────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────

function cobertura(calc, desp3m) {
    const c = calc.cobertura;
    const avisos = [];
    if (calc.semSentido) avisos.push('Neste período as devoluções superam as vendas; margens e percentuais não têm significado. Amplie o período.');
    if (c.itensSnapshotEstimado > 0 && c.itensTotal > 0) {
        avisos.push(`${round1((c.itensSnapshotEstimado / c.itensTotal) * 100)}% do custo vem de estimativa (venda anterior ao registro do custo).`);
    }
    if (c.itensSemSnapshot > 0) avisos.push(`${c.itensSemSnapshot} item(ns) sem custo congelado usam o custo atual do produto.`);
    if (c.itensSemCusto > 0) avisos.push(`${c.itensSemCusto} item(ns) vendidos sem custo conhecido (contam como custo zero).`);
    if (calc.comprasEstoqueExcluidas === 0 && desp3m?.candidatasSemMarca > 0) {
        avisos.push('Nenhuma categoria de despesa foi marcada como "Compra de estoque": a matéria-prima pode estar sendo contada duas vezes na margem.');
    }
    return {
        itensTotal: c.itensTotal, itensSnapshotReal: c.itensSnapshotReal, itensSnapshotEstimado: c.itensSnapshotEstimado,
        itensSemSnapshot: c.itensSemSnapshot, pctReal: c.pctReal, avisos
    };
}

/** Períodos p, p-1, ... p-(n-1) (mais recente primeiro). */
function periodosAnteriores(de, ate, n) {
    const lista = [{ de, ate }];
    for (let i = 1; i < n; i++) lista.push(periodoAnterior(lista[i - 1].de, lista[i - 1].ate));
    return lista;
}

async function resumo({ de, ate }) {
    const periodo = resolverPeriodo(de, ate);
    return custo.comCacheCompras(`resumo:${periodo.de}:${periodo.ate}`, TTL, async () => {
        const lista = periodosAnteriores(periodo.de, periodo.ate, 6);
        const calcs = await Promise.all(lista.map((p) => calcularPeriodo(p.de, p.ate)));
        const [atual, ant] = [calcs[0], calcs[1]];
        const cand = await categoriasPendentesBase();

        const m3 = (campo) => media([calcs[1][campo], calcs[2][campo], calcs[3][campo]]);
        const var_ = (a, b) => (b > 0 ? round1(((a - b) / b) * 100) : null);

        const serie = await custo.serieSemanalInsumos({ semanas: 8 });
        const ins = serie.insumos;
        const variacoes = ins.map((i) => i.variacaoPct);
        const varMedia = variacoes.length ? round1(variacoes.reduce((a, b) => a + b, 0) / variacoes.length) : null;
        let semCustoIns = { status: 'sem_dado', palavra: '', base: 'nenhuma' };
        if (varMedia != null) {
            semCustoIns = varMedia >= 5 ? { status: 'agir', palavra: 'subindo', base: 'nenhuma' }
                : varMedia >= 2 ? { status: 'atencao', palavra: 'subindo', base: 'nenhuma' }
                    : { status: 'ok', palavra: varMedia <= -2 ? 'caindo' : 'estável', base: 'nenhuma' };
        }
        const idxSemanal = serie.semanas.map((_, k) => {
            const v = ins.map((i) => i.indice[k]).filter((x) => x != null);
            return v.length ? round1(v.reduce((a, b) => a + b, 0) / v.length) : null;
        });

        const media3Rec = m3('receitaLiquida');
        const mediaMc = m3('mcPct'), mediaRes = m3('resultadoPct');
        return {
            periodo,
            cobertura: cobertura(atual, cand),
            kpis: {
                receitaLiquida: {
                    valor: atual.receitaLiquida, anterior: ant.receitaLiquida,
                    variacaoPct: var_(atual.receitaLiquida, ant.receitaLiquida),
                    semaforo: semaforo(atual.receitaLiquida, media3Rec)
                },
                margemContribuicao: {
                    valor: atual.margemContribuicao, pct: atual.mcPct, anterior: ant.margemContribuicao, pctAnterior: ant.mcPct,
                    deltaPt: atual.mcPct != null && ant.mcPct != null ? round1(atual.mcPct - ant.mcPct) : null,
                    media3mPct: mediaMc != null ? round1(mediaMc) : null,
                    semaforo: semaforo(atual.mcPct, mediaMc)
                },
                resultadoOperacional: {
                    valor: atual.resultado, pct: atual.resultadoPct, anterior: ant.resultado, pctAnterior: ant.resultadoPct,
                    deltaPt: atual.resultadoPct != null && ant.resultadoPct != null ? round1(atual.resultadoPct - ant.resultadoPct) : null,
                    media3mPct: mediaRes != null ? round1(mediaRes) : null,
                    semaforo: semaforo(atual.resultadoPct, mediaRes)
                },
                custoInsumos: {
                    variacaoPct: varMedia, semanas: 8,
                    destaques: [...ins].slice(0, 3).map((i) => ({ itemPcpId: i.itemPcpId, nome: i.nome, variacaoPct: i.variacaoPct })),
                    semaforo: semCustoIns
                }
            },
            sparks: {
                receitaLiquida: [...calcs].reverse().map((c) => c.receitaLiquida),
                mcPct: [...calcs].reverse().map((c) => c.mcPct),
                resultadoPct: [...calcs].reverse().map((c) => c.resultadoPct),
                custoInsumosIdx: idxSemanal
            }
        };
    });
}

async function cascata({ de, ate }) {
    const periodo = resolverPeriodo(de, ate);
    const c = await calcularPeriodo(periodo.de, periodo.ate);
    const pct = (v) => (!c.semSentido ? round1((v / c.receitaLiquida) * 100) : null);
    const L = (chave, rotulo, valor, tipo) => ({ chave, rotulo, valor: round2(valor), tipo, pctReceitaLiquida: pct(valor) });
    return {
        periodo,
        impostoOrigem: c.impostoOrigem,
        despesasProporcionais: c.despesasProporcionais,
        semSentido: c.semSentido,
        linhas: [
            L('receitaBruta', 'Receita bruta', c.receitaBruta, 'total'),
            L('devolucoes', 'Devoluções', -c.devolucoes, 'deducao'),
            L('impostos', 'Impostos sobre vendas', -c.imposto, 'deducao'),
            L('receitaLiquida', 'Receita líquida', c.receitaLiquida, 'total'),
            L('cpv', 'Custo do produto fabricado (CPV)', -c.cpv, 'deducao'),
            L('cmv', 'Custo da mercadoria revendida (CMV)', -c.cmv, 'deducao'),
            L('lucroBruto', 'Lucro bruto', c.lucroBruto, 'total'),
            L('despesasVariaveis', 'Despesas variáveis', -c.despesasVariaveis, 'deducao'),
            L('margemContribuicao', 'Margem de contribuição', c.margemContribuicao, 'total'),
            L('despesasFixas', 'Despesas fixas', -c.despesasFixas, 'deducao'),
            L('resultado', 'Resultado operacional', c.resultado, 'resultado')
        ],
        alertas: { semNatureza: c.semNatureza, cmvSemClasse: c.cmvSemClasse }
    };
}

function contarDiasUteis(ini, fim) { // segunda a sábado
    let n = 0;
    for (let d = ini; d <= fim; d = somaDias(d, 1)) {
        const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
        if (dow !== 0) n++;
    }
    return n;
}

async function equilibrio({ mes }) {
    const hoje = ymdSP(new Date());
    const mesAtual = hoje.slice(0, 7);
    mes = /^\d{4}-\d{2}$/.test(String(mes || '')) ? String(mes) : mesAtual;
    if (mes > mesAtual) { const e = new Error('Mês no futuro.'); e.status = 400; throw e; }
    return custo.comCache(`equilibrio:${mes}`, TTL, async () => {
        const ehAtual = mes === mesAtual;
        const mesFechado = mes < mesAtual;
        const cheio = await calcularPeriodo(`${mes}-01`, ultimoDiaDoMes(mes)); // despesas do mês inteiro
        let fixos = cheio.despesasFixas, mcPct = cheio.mcPct, mesRef = rotuloMes(mes);
        if (fixos === 0) { // mês sem despesas fixas lançadas ainda → usa o mês anterior como régua
            const ant = somaMeses(mes, -1);
            const c2 = await calcularPeriodo(`${ant}-01`, ultimoDiaDoMes(ant));
            if (c2.despesasFixas > 0) { fixos = c2.despesasFixas; mcPct = c2.mcPct ?? mcPct; mesRef = rotuloMes(ant); }
        }
        const acumulado = cheio.receitaLiquida;
        const fimMes = ultimoDiaDoMes(mes);
        const diasUteisTotais = contarDiasUteis(`${mes}-01`, fimMes);
        const diasUteisDecorridos = mesFechado ? diasUteisTotais : contarDiasUteis(`${mes}-01`, hoje);

        let projecaoFechamento = acumulado, projecaoMetodo = 'ritmo_linear';
        if (ehAtual) {
            const diaAtual = Number(hoje.slice(8, 10)), totalDias = Number(fimMes.slice(8, 10));
            const liquidaDev = round2(cheio.receitaBruta - cheio.devolucoes); // base da projeção por dias de trabalho
            projecaoFechamento = diaAtual > 0 ? round2((acumulado / diaAtual) * totalDias) : acumulado;
            try {
                const projVend = await projecaoVendasService.projecoesMes(mes);
                if (projVend && projVend.size > 0) {
                    let restanteComMeta = 0, baseComMeta = 0;
                    for (const p of projVend.values()) { restanteComMeta += p.projecaoRestante; baseComMeta += p.totalVendidoMes; }
                    const baseSemMeta = Math.max(0, liquidaDev - baseComMeta);
                    const restanteSemMeta = diaAtual > 0 ? (baseSemMeta / diaAtual) * (totalDias - diaAtual) : 0;
                    const escala = liquidaDev > 0 ? acumulado / liquidaDev : 1; // leva a projeção para receita líquida de imposto
                    projecaoFechamento = round2(acumulado + (restanteComMeta + restanteSemMeta) * escala);
                    projecaoMetodo = 'dias_trabalho';
                }
            } catch (e) { console.error('[Indicadores] projeção por dias de trabalho falhou:', e.message); }
        }
        const pontoEquilibrio = mcPct != null && mcPct > 0 && fixos > 0 ? round2(fixos / (mcPct / 100)) : null;
        const base = mesFechado ? acumulado : projecaoFechamento;
        return {
            mes, fixos: round2(fixos), mcPct, pontoEquilibrio,
            margemSegurancaPct: pontoEquilibrio != null && base > 0 ? round1(((base - pontoEquilibrio) / base) * 100) : null,
            acumulado: round2(acumulado), diasUteisDecorridos, diasUteisTotais,
            projecaoFechamento: round2(projecaoFechamento), projecaoMetodo, mesFechado,
            mesReferenciaEquilibrio: mesRef
        };
    });
}

/** Peso de cada insumo no custo dos fabricados vendidos no período (% do total). Só nível completo. */
async function pesoInsumosNoCpv(de, ate) {
    return custo.comCache(`pesoCpv:${de}:${ate}`, TTL, async () => {
        const [vendas, ctx] = await Promise.all([carregarVendas(de, ate), ctxFichas()]);
        const qtdPorProduto = new Map();
        for (const r of vendas) qtdPorProduto.set(r.produtoId, (qtdPorProduto.get(r.produtoId) || 0) + r.qtd);
        const custoPorInsumo = new Map(); let total = 0;
        for (const [pid, q] of qtdPorProduto) {
            const ipId = ctx.itemPcpPorProduto.get(pid);
            if (!ipId) continue;
            const expl = custo.explodirFicha(ctx.receitaPorItemPcp.get(ipId), ctx);
            for (const [insumoId, qtdUn] of expl) {
                const ip = ctx.itemPcpPorId.get(insumoId);
                const c = custo.resolverAtual(ip) || 0;
                const v = q * qtdUn * c;
                custoPorInsumo.set(insumoId, (custoPorInsumo.get(insumoId) || 0) + v);
                total += v;
            }
        }
        const out = new Map();
        for (const [id, v] of custoPorInsumo) out.set(id, total > 0 ? round1((v / total) * 100) : null);
        return out;
    });
}

async function insumosSemanal({ semanas = 8, de, ate, completo }) {
    const serie = await custo.serieSemanalInsumos({ semanas });
    let pesos = null;
    if (completo) {
        const p = resolverPeriodo(de, ate);
        pesos = await pesoInsumosNoCpv(p.de, p.ate);
    }
    const lista = serie.insumos.map((i) => {
        const o = { ...i };
        if (completo) o.pesoCpvPct = pesos.get(i.itemPcpId) ?? null;
        return o;
    });
    const score = (i) => Math.abs(i.variacaoPct) * (i.pesoCpvPct != null ? Math.max(i.pesoCpvPct, 1) : 1);
    lista.sort((a, b) => score(b) - score(a));
    return { semanas: serie.semanas, insumos: lista.slice(0, 6) };
}

async function entradasSemana({ semanaOffset = 0, reduzido }) {
    const off = Math.min(0, Math.max(-52, parseInt(semanaOffset, 10) || 0));
    const hoje = ymdSP(new Date());
    const seg = somaDias(custo.segundaDe(hoje), off * 7);
    const dom = somaDias(seg, 6);
    return custo.comCacheCompras(`entradas:${seg}:${reduzido ? 'r' : 'c'}`, TTL, async () => {
        const ctx = await ctxFichas();
        const insumosFab = custo.insumosDeFabricados(ctx);
        const idsFab = new Set(insumosFab.keys());
        const prodIdsFab = new Set([...insumosFab.values()].map((i) => i.produtoId).filter(Boolean));

        const compras = await prisma.compraItem.findMany({
            where: { estornado: false, semEstoque: false, dataCompra: { gte: inicioDia(seg), lte: fimDia(dom) } },
            orderBy: { dataCompra: 'desc' },
            select: {
                id: true, itemPcpId: true, produtoId: true, notaEntradaId: true, fornecedorNome: true, dataCompra: true,
                descricaoFornecedor: true, quantidade: true, unidade: true, custoUnitario: true, custoAnterior: true,
                itemPcp: { select: { nome: true } }, produto: { select: { nome: true } }
            }
        });
        const filtradas = compras.filter((c) => !reduzido || (c.itemPcpId && idsFab.has(c.itemPcpId)) || (c.produtoId && prodIdsFab.has(c.produtoId)));

        // preço da compra anterior de cada alvo (sem N+1: carrega o histórico do conjunto em lote)
        const idx = await custo.carregarCompras({
            itemPcpIds: [...new Set(filtradas.map((c) => c.itemPcpId).filter(Boolean))],
            produtoIds: [...new Set(filtradas.map((c) => c.produtoId).filter(Boolean))]
        });
        const entradas = filtradas.map((c) => {
            const lista = (c.itemPcpId ? idx.get(`i:${c.itemPcpId}`) : idx.get(`p:${c.produtoId}`)) || [];
            const t = new Date(c.dataCompra).getTime();
            let anterior = null;
            for (const x of lista) { if (x.id !== c.id && x.t < t) anterior = x.custo; else if (x.t >= t) break; }
            if (anterior == null && c.custoAnterior != null && Number(c.custoAnterior) > 0) anterior = Number(c.custoAnterior);
            const pago = Number(c.custoUnitario);
            const eFab = (c.itemPcpId && idsFab.has(c.itemPcpId)) || (c.produtoId && prodIdsFab.has(c.produtoId)) || false;
            return {
                compraItemId: c.id, itemPcpId: c.itemPcpId || null, produtoId: c.produtoId || null,
                nome: c.itemPcp?.nome || c.produto?.nome || c.descricaoFornecedor,
                fornecedor: c.fornecedorNome, dataCompra: ymdSP(c.dataCompra),
                quantidade: Number(c.quantidade), unidade: c.unidade,
                custoPago: round4(pago), custoAnterior: anterior != null ? round4(anterior) : null,
                variacaoPct: anterior != null && anterior > 0 ? round1(((pago / anterior) - 1) * 100) : null,
                eFabricacao: eFab
            };
        });

        // efeito nas fichas: custo da ficha no fim da semana × no dia anterior ao início
        const efeitoFichas = [];
        const insumosEntrados = new Set(filtradas.map((c) => c.itemPcpId).filter(Boolean));
        if (insumosEntrados.size) {
            const fabricados = [...ctx.itemPcpPorProduto.entries()].map(([produtoId, ipId]) => ({ produtoId, rec: ctx.receitaPorItemPcp.get(ipId) }))
                .filter((f) => { const e = custo.explodirFicha(f.rec, ctx); return [...e.keys()].some((k) => insumosEntrados.has(k)); }).slice(0, 60);
            const todosIns = new Set(); const todosProd = new Set();
            for (const f of fabricados) for (const k of custo.explodirFicha(f.rec, ctx).keys()) { todosIns.add(k); const ip = ctx.itemPcpPorId.get(k); if (ip?.produtoId) todosProd.add(ip.produtoId); }
            const idx2 = await custo.carregarCompras({ itemPcpIds: [...todosIns], produtoIds: [...todosProd] });
            const resolver = custo.criarResolverNaData(idx2);
            const nomes = await prisma.produto.findMany({ where: { id: { in: fabricados.map((f) => f.produtoId) } }, select: { id: true, nome: true } });
            const nomeDe = new Map(nomes.map((n) => [n.id, n.nome]));
            const tIni = new Date(inicioDia(seg).getTime() - 1), tFim = new Date(Math.min(fimDia(dom).getTime(), Date.now()));
            for (const f of fabricados) {
                const a = custo.custoFicha(f.rec, ctx, resolver, tIni).custoPorUnidade;
                const b = custo.custoFicha(f.rec, ctx, resolver, tFim).custoPorUnidade;
                if (a > 0 && b > 0 && Math.abs(b - a) >= 0.0001) efeitoFichas.push({ produtoId: f.produtoId, nome: nomeDe.get(f.produtoId) || '', deltaCustoUn: round4(b - a) });
            }
            efeitoFichas.sort((x, y) => Math.abs(y.deltaCustoUn) - Math.abs(x.deltaCustoUn));
        }
        const notas = new Set(filtradas.map((c) => c.notaEntradaId).filter(Boolean)).size;
        return { semana: { de: seg, ate: dom }, notas, entradas, efeitoFichas };
    });
}

/** Linhas de produto (visão completa ou reduzida). */
async function produtos({ de, ate, foco, completo, ordem }) {
    const periodo = resolverPeriodo(de, ate);
    const reduzido = !completo || foco === 'producao';
    return custo.comCacheCompras(`produtos:${periodo.de}:${periodo.ate}:${reduzido ? 'r' : 'c'}:${ordem || ''}`, TTL, async () => {
        const [vendas, ctx] = await Promise.all([carregarVendas(periodo.de, periodo.ate), ctxFichas()]);
        const agg = new Map();
        for (const r of vendas) {
            const a = agg.get(r.produtoId) || { qtd: 0, receita: 0, custo: 0 };
            a.qtd += r.qtd; a.receita += r.receita; a.custo += r.custoEf;
            agg.set(r.produtoId, a);
        }
        const ids = [...agg.keys()];
        const [classes, custosAgora, prods] = await Promise.all([
            custo.classificarProdutos(ids, ctx), custo.custoAgora(ids, ctx),
            prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, categoria: true, unidade: true } })
        ]);
        const infoProd = new Map(prods.map((p) => [p.id, p]));
        const idsLista = ids.filter((id) => !reduzido || classes.get(id) === 'FABRICADO');

        const serieFicha = await custo.serieSemanalFicha(idsLista, { semanas: 5 });
        const idsNaoFab = idsLista.filter((id) => classes.get(id) !== 'FABRICADO');
        const comprasProd = idsNaoFab.length ? await custo.carregarCompras({ produtoIds: idsNaoFab }) : new Map();

        // período anterior (situação: MC% × MC% anterior) — só visão completa
        let antPorProduto = new Map();
        if (!reduzido) {
            const vAnt = await carregarVendas(periodo.anterior.de, periodo.anterior.ate);
            for (const r of vAnt) {
                const a = antPorProduto.get(r.produtoId) || { receita: 0, custo: 0 };
                a.receita += r.receita; a.custo += r.custoEf; antPorProduto.set(r.produtoId, a);
            }
        }

        const linhas = idsLista.map((id) => {
            const a = agg.get(id), p = infoProd.get(id) || {}, ca = custosAgora.get(id) || { custo: null, fonte: 'SEM_CUSTO' };
            const classe = classes.get(id) || 'SEM_CLASSE';
            const sf = serieFicha.get(id);
            let variacao = null, desatualizada = false;
            if (classe === 'FABRICADO' && sf && sf.atual > 0 && sf.ha4s > 0) {
                variacao = round1(((sf.atual / sf.ha4s) - 1) * 100);
                if (ca.custo > 0 && Math.abs(sf.atual - ca.custo) / ca.custo > 0.05) desatualizada = true;
            } else if (classe !== 'FABRICADO') {
                const lista = comprasProd.get(`p:${id}`);
                const agoraP = custo.ultimoPrecoAte(lista, Date.now()), antes = custo.ultimoPrecoAte(lista, Date.now() - 28 * 86400000);
                if (agoraP && antes && antes.custo > 0 && !antes.estimado) variacao = round1(((agoraP.custo / antes.custo) - 1) * 100);
            }
            const linha = {
                produtoId: id, nome: p.nome || '', categoria: p.categoria || null, classe, unidade: p.unidade || '',
                quantidadeVendida: round2(a.qtd),
                custoFichaUn: ca.custo != null ? round4(ca.custo) : null, custoFonte: ca.fonte,
                variacaoCusto4sPct: variacao,
                temCustoFaltando: ca.fonte === 'SEM_CUSTO' || ca.temCustoFaltando === true,
                fichaDesatualizada: desatualizada
            };
            if (!reduzido) {
                const preco = a.qtd > 0 ? a.receita / a.qtd : null;
                const cv = a.qtd > 0 && a.custo > 0 ? a.custo / a.qtd : linha.custoFichaUn;
                const mcUn = preco != null && cv != null ? preco - cv : null;
                const mcPctP = preco > 0 && mcUn != null ? (mcUn / preco) * 100 : null;
                const ant = antPorProduto.get(id);
                const mcPctAnt = ant && ant.receita > 0 ? ((ant.receita - ant.custo) / ant.receita) * 100 : null;
                const s = semaforo(mcPctP, mcPctAnt);
                linha.precoMedio = preco != null ? round2(preco) : null;
                linha.custoVariavelUn = cv != null ? round4(cv) : null;
                linha.markup = preco != null && cv > 0 ? round2(preco / cv) : null;
                linha.mcUn = mcUn != null ? round2(mcUn) : null;
                linha.mcPct = mcPctP != null ? round1(mcPctP) : null;
                linha.mcTotal = cv != null ? round2(a.receita - cv * a.qtd) : null;
                linha.situacao = {
                    status: s.status,
                    rotulo: s.status === 'sem_dado' ? 'sem comparação' : (s.status === 'ok' ? 'no alvo' : s.palavra)
                };
            }
            return linha;
        });

        const chave = reduzido ? 'quantidadeVendida' : (['mcTotal', 'quantidadeVendida', 'markup', 'mcPct', 'variacaoCusto4sPct'].includes(ordem) ? ordem : 'mcTotal');
        if (ordem === 'nome') linhas.sort((x, y) => x.nome.localeCompare(y.nome));
        else linhas.sort((x, y) => (y[chave] ?? -Infinity) - (x[chave] ?? -Infinity));
        return {
            periodo, foco: reduzido ? 'producao' : 'todos',
            resumo: { qtdProdutos: linhas.length, semCusto: linhas.filter((l) => l.custoFonte === 'SEM_CUSTO').length },
            linhas
        };
    });
}

async function producao({ de, ate }) {
    const periodo = resolverPeriodo(de, ate);
    return custo.comCache(`producao:${periodo.de}:${periodo.ate}`, TTL, async () => {
        const hoje = ymdSP(new Date());
        const d30 = somaDias(hoje, -29);
        const [vendas, ctx] = await Promise.all([carregarVendas(d30, hoje), ctxFichas()]);
        const qtd30 = new Map();
        for (const r of vendas) qtd30.set(r.produtoId, (qtd30.get(r.produtoId) || 0) + r.qtd);

        const prodFab = [...ctx.itemPcpPorProduto.keys()];
        const prods = await prisma.produto.findMany({ where: { id: { in: prodFab } }, select: { id: true, estoqueTotal: true } });
        let estoquePA = 0, vendaDiaPA = 0;
        for (const p of prods) {
            const q = qtd30.get(p.id) || 0;
            if (q > 0) { estoquePA += Math.max(0, Number(p.estoqueTotal || 0)); vendaDiaPA += q / 30; }
        }
        // insumos: dias de estoque = estoque ÷ consumo diário (vendas 30d × ficha); mediana entre insumos com consumo
        const consumo = new Map();
        for (const [pid, q] of qtd30) {
            const ipId = ctx.itemPcpPorProduto.get(pid);
            if (!ipId) continue;
            for (const [insId, qtdUn] of custo.explodirFicha(ctx.receitaPorItemPcp.get(ipId), ctx)) consumo.set(insId, (consumo.get(insId) || 0) + q * qtdUn);
        }
        const insDb = consumo.size ? await prisma.itemPcp.findMany({ where: { id: { in: [...consumo.keys()] } }, select: { id: true, estoqueAtual: true } }) : [];
        const dias = insDb.map((i) => (Math.max(0, Number(i.estoqueAtual || 0)) / ((consumo.get(i.id) || 0) / 30))).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
        const mediana = dias.length ? dias[Math.floor(dias.length / 2)] : null;
        return {
            periodo,
            estoque: {
                diasEstoqueProdutoAcabado: vendaDiaPA > 0 ? round1(estoquePA / vendaDiaPA) : null,
                diasEstoqueInsumos: mediana != null ? round1(mediana) : null
            },
            // Etapa 3 (custo real de produção, perda e rendimento por ordem): ainda não existe dado confiável
            perdas: { disponivel: false, valorMes: null, pctCpv: null, metaPct: null, semanal: [] },
            custoRealXPadrao: { disponivel: false, desvioPct: null },
            rendimentoLote: { disponivel: false, realPct: null, fichaPct: null }
        };
    });
}

/** Linhas por cliente (todas) — base de /clientes e do alerta de MC baixa. */
async function clientesTodos(de, ate) {
    return custo.comCache(`clientesTodos:${de}:${ate}`, TTL, async () => {
        const vendas = await carregarVendas(de, ate);
        const gte = inicioDia(de), lte = fimDia(ate);
        const entregasRows = await prisma.$queryRaw`
            SELECT p.cliente_id AS "clienteId", COUNT(DISTINCT p.id)::int AS entregas
            FROM pedidos p
            WHERE p.bonificacao = false AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
              AND p.data_venda >= ${gte} AND p.data_venda <= ${lte}
            GROUP BY 1
        `;
        const entregas = new Map(entregasRows.map((r) => [r.clienteId, r.entregas]));
        const totalEntregas = entregasRows.reduce((s, r) => s + r.entregas, 0);
        const desp = await carregarDespesas(de, ate);
        const custoPorEntrega = totalEntregas > 0 && desp.entregas > 0 ? desp.entregas / totalEntregas : null;

        const porCliente = new Map();
        for (const r of vendas) {
            const a = porCliente.get(r.clienteId) || { receita: 0, base: 0, custo: 0 };
            a.receita += r.receita; a.base += r.base; a.custo += r.custoEf;
            porCliente.set(r.clienteId, a);
        }
        const ids = [...porCliente.keys()];
        const cli = ids.length ? await prisma.cliente.findMany({ where: { UUID: { in: ids } }, select: { UUID: true, Nome: true, NomeFantasia: true } }) : [];
        const nomeDe = new Map(cli.map((c) => [c.UUID, c.NomeFantasia || c.Nome]));
        const linhas = ids.map((id) => {
            const a = porCliente.get(id), n = entregas.get(id) || 0;
            const ce = custoPorEntrega != null ? custoPorEntrega * n : null;
            const mcTotal = a.receita - a.custo - (ce || 0);
            return {
                clienteId: id, nome: nomeDe.get(id) || '—', receita: round2(a.receita),
                descontoMedioPct: a.base > 0 ? round1((1 - a.receita / a.base) * 100) : null,
                entregas: n, custoEntrega: ce != null ? round2(ce) : null,
                mcPct: a.receita > 0 ? round1((mcTotal / a.receita) * 100) : null, mcTotal: round2(mcTotal)
            };
        }).sort((x, y) => y.receita - x.receita);
        return { linhas, custoEntregaOrigem: custoPorEntrega != null ? 'ESTIMADO' : 'INDISPONIVEL' };
    });
}

async function clientes({ de, ate, limite = 6 }) {
    const periodo = resolverPeriodo(de, ate);
    const lim = Math.min(Math.max(parseInt(limite, 10) || 6, 1), 50);
    const r = await clientesTodos(periodo.de, periodo.ate);
    return { periodo, custoEntregaOrigem: r.custoEntregaOrigem, linhas: r.linhas.slice(0, lim) };
}

// ─────────────────────────────────────────────────────────────
// Categorias de despesa pendentes
// ─────────────────────────────────────────────────────────────

const RX_COMPRA_ESTOQUE = /(materia.?prima|embalag|revenda|insumo|mercadoria)/;

async function categoriasPendentesBase() {
    return custo.comCache('catPend', TTL, async () => {
        const hoje = ymdSP(new Date());
        const mesIni = somaMeses(hoje.slice(0, 7), -2);
        const [cats, d] = await Promise.all([
            prisma.categoriaDespesa.findMany({ select: { id: true, nome: true, classificacao: true, natureza: true, grupoDreId: true, compraDeEstoque: true } }),
            carregarDespesas(`${mesIni}-01`, hoje) // só para o valor por categoria (3 meses)
        ]);
        const valor = (nome) => round2(d.porCategoria.get(nome) || 0);
        // mesma regra da tela Categorias de Despesa
        const semNatureza = cats.filter((c) => c.classificacao !== 'FORA_DRE' && (!c.grupoDreId || c.natureza === 'A_DEFINIR'));
        const candidatas = cats.filter((c) => c.classificacao !== 'FORA_DRE' && c.compraDeEstoque !== true && RX_COMPRA_ESTOQUE.test(normalizar(c.nome)));
        const mapa = new Map();
        for (const c of [...semNatureza, ...candidatas]) {
            mapa.set(c.id, {
                id: c.id, nome: c.nome, natureza: c.natureza, compraDeEstoque: c.compraDeEstoque === true,
                valorUltimos3Meses: valor(c.nome)
            });
        }
        return {
            semNatureza: semNatureza.length, candidatasSemMarca: candidatas.length,
            categorias: [...mapa.values()].sort((a, b) => b.valorUltimos3Meses - a.valorUltimos3Meses)
        };
    });
}

async function categoriasPendentes() {
    const b = await categoriasPendentesBase();
    return { semNatureza: b.semNatureza, semMarcaCompraEstoque: b.candidatasSemMarca, categorias: b.categorias };
}

// ─────────────────────────────────────────────────────────────
// Alertas
// ─────────────────────────────────────────────────────────────

async function alertas({ de, ate, completo, foco }) {
    const periodo = resolverPeriodo(de, ate);
    const soProducao = !completo || foco === 'producao';
    return custo.comCacheCompras(`alertas:${periodo.de}:${periodo.ate}:${soProducao ? 'p' : 'c'}`, TTL, async () => {
        const itens = [];
        const serie = await custo.serieSemanalInsumos({ semanas: 8 });
        for (const i of serie.insumos.filter((x) => x.altasSeguidas >= 3).slice(0, 5)) {
            itens.push({
                id: `insumo-alta-${i.itemPcpId}`, nivel: 'atencao', escopo: 'producao',
                titulo: `${i.nome} subiu ${i.altasSeguidas} semanas seguidas`,
                texto: `O último preço pago está ${i.variacaoPct > 0 ? '+' : ''}${i.variacaoPct}% acima do de 8 semanas atrás.`,
                acao: { rotulo: 'Ver compras', rota: '/notas-recebidas', permissao: 'Pode_Acessar_Notas_Recebidas' }
            });
        }
        const prod = await produtos({ de: periodo.de, ate: periodo.ate, foco: 'producao', completo: false });
        const faltando = prod.linhas.filter((l) => l.temCustoFaltando).length;
        const desat = prod.linhas.filter((l) => l.fichaDesatualizada).length;
        if (faltando > 0) itens.push({ id: 'ficha-sem-custo', nivel: 'urgente', escopo: 'producao', titulo: `${faltando} produto(s) fabricado(s) com custo faltando`, texto: 'Falta preço de algum ingrediente da ficha técnica — o custo mostrado está incompleto.', acao: { rotulo: 'Abrir fichas técnicas', rota: '/pcp/receitas', permissao: 'pcp.receitas' } });
        if (desat > 0) itens.push({ id: 'ficha-desatualizada', nivel: 'atencao', escopo: 'producao', titulo: `${desat} ficha(s) técnica(s) desatualizada(s)`, texto: 'O custo da ficha com os últimos preços pagos difere mais de 5% do custo médio gravado.', acao: { rotulo: 'Abrir fichas técnicas', rota: '/pcp/receitas', permissao: 'pcp.receitas' } });

        if (!soProducao) {
            const [resumoR, pend, cl, completoProd] = await Promise.all([
                resumo({ de: periodo.de, ate: periodo.ate }), categoriasPendentes(),
                clientesTodos(periodo.de, periodo.ate), produtos({ de: periodo.de, ate: periodo.ate, foco: 'todos', completo: true })
            ]);
            const mc = resumoR.kpis.margemContribuicao;
            if (mc.semaforo.status === 'atencao' || mc.semaforo.status === 'agir') {
                itens.push({ id: 'mc-abaixo-media', nivel: mc.semaforo.status === 'agir' ? 'urgente' : 'atencao', escopo: 'dono', titulo: 'Margem de contribuição abaixo da média dos 3 meses', texto: `MC de ${mc.pct}% contra média de ${mc.media3mPct}%.`, acao: null });
            }
            for (const p of completoProd.linhas.filter((l) => l.variacaoCusto4sPct != null && l.variacaoCusto4sPct > 5).slice(0, 5)) {
                itens.push({ id: `custo-sobe-${p.produtoId}`, nivel: 'atencao', escopo: 'dono', titulo: `Custo de ${p.nome} subiu ${p.variacaoCusto4sPct}% em 4 semanas`, texto: 'Confira se o preço de venda acompanhou o aumento do custo.', acao: { rotulo: 'Ver margem e custo', rota: '/financeiro/margem-produtos', permissao: 'Pode_Acessar_Financeiro_Gerencial' } });
            }
            for (const c of cl.linhas.filter((x) => x.mcPct != null && x.mcPct < 25 && x.receita > 0).slice(0, 5)) {
                itens.push({ id: `cliente-mc-${c.clienteId}`, nivel: 'info', escopo: 'dono', titulo: `${c.nome}: margem de ${c.mcPct}%`, texto: 'Margem do cliente abaixo de 25% no período.', acao: null });
            }
            if (pend.semNatureza > 0) itens.push({ id: 'cat-sem-natureza', nivel: 'atencao', escopo: 'dono', titulo: `${pend.semNatureza} categoria(s) de despesa sem natureza`, texto: 'Sem definir fixa/variável, a margem de contribuição fica incompleta.', acao: { rotulo: 'Classificar categorias', rota: '/financeiro/categorias-despesa', permissao: 'Pode_Acessar_Financeiro_Gerencial' } });
            if (pend.semMarcaCompraEstoque > 0) itens.push({ id: 'cat-sem-marca-estoque', nivel: 'urgente', escopo: 'dono', titulo: `${pend.semMarcaCompraEstoque} categoria(s) de compra sem a marca "Compra de estoque"`, texto: 'Sem a marca, a matéria-prima é contada duas vezes (no custo do produto e nas despesas).', acao: { rotulo: 'Marcar categorias', rota: '/financeiro/categorias-despesa', permissao: 'Pode_Acessar_Financeiro_Gerencial' } });
            if (resumoR.cobertura.pctReal < 80 && resumoR.cobertura.itensTotal > 0) itens.push({ id: 'cobertura-baixa', nivel: 'info', escopo: 'dono', titulo: `Só ${resumoR.cobertura.pctReal}% do custo é real`, texto: 'O restante vem de estimativa (vendas anteriores ao registro do custo).', acao: null });
            const semClasse = completoProd.linhas.filter((l) => l.classe === 'SEM_CLASSE').length;
            if (semClasse > 0) itens.push({ id: 'sem-classe', nivel: 'atencao', escopo: 'dono', titulo: `${semClasse} produto(s) vendido(s) sem ficha e sem marca de revenda`, texto: 'Entram no CMV marcados "sem classificação". Cadastre a ficha técnica ou marque como revenda.', acao: { rotulo: 'Ver produtos', rota: '/admin/produtos', permissao: 'produtos' } });
        }
        const peso = { urgente: 0, atencao: 1, info: 2 };
        itens.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
        return { itens };
    });
}

module.exports = {
    resolverPeriodo, periodoAnterior, calcularPeriodo, carregarVendas, semaforo,
    resumo, cascata, equilibrio, insumosSemanal, entradasSemana, produtos, producao,
    alertas, clientes, categoriasPendentes
};
