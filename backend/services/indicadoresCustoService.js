/**
 * Indicadores de Gestão — classificação de produtos e custo (em LOTE, sem N+1).
 *
 * - FABRICADO  = produto ligado a um ItemPcp ativo que tem receita (ficha) vigente
 * - REVENDA    = sem ficha e Produto.nfeRevenda = true
 * - SEM_CLASSE = nem ficha nem marca de revenda (D3: cai no CMV, marcado, alertado)
 *
 * A regra de custo da ficha espelha pcpReceitaService.calcularCusto (ingrediente:
 * custoManual do produto > 0, senão custoUnitario do item PCP; SUB = custo da receita
 * ativa; custo/un = custoTotal ÷ rendimentoBase×(1−perda%)), mas carregando tudo de uma vez.
 *
 * Somente LEITURA do banco (quem grava é custoSnapshotService).
 */
const prisma = require('../config/database');

const TZ = 'America/Sao_Paulo';
const num = (v) => (v == null ? 0 : Number(v));
const round4 = (v) => Math.round(Number(v) * 10000) / 10000;
const ymdSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const fimDiaSP = (ymd) => new Date(`${ymd}T23:59:59.999-03:00`);
const somaDias = (ymd, n) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
/** Segunda-feira (YYYY-MM-DD) da semana que contém o dia. */
const segundaDe = (ymd) => {
    const d = new Date(`${ymd}T12:00:00Z`);
    const dow = d.getUTCDay(); // 0=dom
    return somaDias(ymd, dow === 0 ? -6 : 1 - dow);
};

// ── cache simples em memória (TTL) ──
const _cache = new Map();
async function comCache(chave, ttlMs, fn) {
    const hit = _cache.get(chave);
    if (hit && hit.exp > Date.now()) return hit.val;
    const val = await fn();
    _cache.set(chave, { exp: Date.now() + ttlMs, val });
    if (_cache.size > 200) {
        const agora = Date.now();
        for (const [k, v] of _cache) if (v.exp <= agora) _cache.delete(k);
    }
    return val;
}

/**
 * "Versão" das compras: muda sempre que um CompraItem nasce, é estornado ou tem valor corrigido —
 * em QUALQUER ponto do sistema (nota conferida, despesa manual, correção), sem depender de cada
 * chamador lembrar de limpar o cache. 1 consulta leve, memorizada por 2 s.
 */
async function versaoCompras() {
    return comCache('versaoCompras', 2000, async () => {
        const r = await prisma.$queryRaw`
            SELECT COUNT(*)::int AS c, MAX(criado_em) AS a, MAX(estornado_em) AS b,
                   COALESCE(SUM(custo_unitario * quantidade), 0)::float AS s,
                   COUNT(*) FILTER (WHERE estornado)::int AS e
            FROM compras_itens`;
        const x = r[0] || {};
        return `${x.c}|${x.e}|${x.a ? new Date(x.a).getTime() : ''}|${x.b ? new Date(x.b).getTime() : ''}|${x.s}`;
    });
}
/** comCache cuja chave inclui a versão das compras (entrada/estorno aparece na hora). */
async function comCacheCompras(chave, ttlMs, fn) {
    return comCache(`${chave}#${await versaoCompras()}`, ttlMs, fn);
}

/** Zera o cache em memória (após mudar alíquota/categorias — o número novo aparece na hora). */
function limparCache() { _cache.clear(); }

// ─────────────────────────────────────────────────────────────
// Fichas vigentes (1 consulta)
// ─────────────────────────────────────────────────────────────

/**
 * Carrega todas as receitas vigentes hoje + ingredientes.
 * @returns {{ receitaPorItemPcp: Map<string, object>, itemPcpPorProduto: Map<string,string>, itemPcpPorId: Map<string,object> }}
 */
async function carregarFichasVigentes() {
    const agora = new Date();
    const receitas = await prisma.receita.findMany({
        where: {
            status: 'ativa',
            dataInicioVigencia: { lte: agora },
            OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: agora } }]
        },
        orderBy: { versao: 'desc' },
        select: {
            id: true, itemPcpId: true, versao: true, rendimentoBase: true, perdaPercentual: true,
            itemPcp: { select: { id: true, nome: true, tipo: true, unidade: true, ativo: true, produtoId: true, custoUnitario: true } },
            itens: {
                select: {
                    quantidade: true,
                    itemPcp: {
                        select: {
                            id: true, nome: true, tipo: true, unidade: true, custoUnitario: true, produtoId: true,
                            produto: { select: { custoManual: true } }
                        }
                    }
                }
            }
        }
    });
    const receitaPorItemPcp = new Map();
    const itemPcpPorId = new Map();
    const itemPcpPorProduto = new Map();
    for (const r of receitas) {
        if (receitaPorItemPcp.has(r.itemPcpId)) continue; // já veio a de maior versão
        receitaPorItemPcp.set(r.itemPcpId, r);
        const ip = r.itemPcp;
        if (ip) {
            if (!itemPcpPorId.has(ip.id)) itemPcpPorId.set(ip.id, ip);
            // produto fabricado = ItemPcp ATIVO com produtoId e ficha vigente
            if (ip.ativo && ip.produtoId && !itemPcpPorProduto.has(ip.produtoId)) {
                itemPcpPorProduto.set(ip.produtoId, ip.id);
            }
        }
        for (const it of r.itens) if (it.itemPcp) itemPcpPorId.set(it.itemPcp.id, it.itemPcp); // versão com produto.custoManual
    }
    // Custo de referencia: produto SEM ficha própria que usa a ficha de outro produto x fator.
    // Só vale se o referenciado tem ficha vigente e não é ele mesmo (sem circularidade possível:
    // o referenciado sempre usa a ficha própria).
    const referenciaPorProduto = new Map();
    const refs = await prisma.produto.findMany({
        where: { produtoCustoReferenciaId: { not: null } },
        select: { id: true, produtoCustoReferenciaId: true, fatorCustoReferencia: true }
    });
    for (const r of refs) {
        if (r.id === r.produtoCustoReferenciaId) continue;
        if (itemPcpPorProduto.has(r.id)) continue; // ficha própria manda
        const refIp = itemPcpPorProduto.get(r.produtoCustoReferenciaId);
        if (!refIp) continue;
        const fator = Number(r.fatorCustoReferencia);
        referenciaPorProduto.set(r.id, {
            refProdutoId: r.produtoCustoReferenciaId, refItemPcpId: refIp, fator: Number.isFinite(fator) && fator > 0 ? fator : 1
        });
    }
    return { receitaPorItemPcp, itemPcpPorProduto, itemPcpPorId, referenciaPorProduto };
}

/**
 * Ficha que vale para um produto: a própria ou, na falta, a de referência.
 * @returns {{ itemPcpId:string, fator:number, ref:boolean, refProdutoId?:string }|null}
 */
function fichaEfetiva(ctx, produtoId) {
    const own = ctx.itemPcpPorProduto.get(produtoId);
    if (own) return { itemPcpId: own, fator: 1, ref: false };
    const r = ctx.referenciaPorProduto && ctx.referenciaPorProduto.get(produtoId);
    if (r) return { itemPcpId: r.refItemPcpId, fator: r.fator, ref: true, refProdutoId: r.refProdutoId };
    return null;
}

// ─────────────────────────────────────────────────────────────
// Custo da ficha — PURA (mesma regra do calcularCusto)
// ─────────────────────────────────────────────────────────────

/** Resolver padrão: custo ATUAL do ingrediente (custoManual do produto > 0, senão custoUnitario). */
function resolverAtual(ip) {
    const compraProd = ip?.produto?.custoManual != null ? Number(ip.produto.custoManual) : 0;
    if (compraProd > 0) return compraProd;
    const manual = ip?.custoUnitario != null ? Number(ip.custoUnitario) : 0;
    return manual > 0 ? manual : null;
}

/**
 * Custo por unidade de uma receita. PURA.
 * @param receita  objeto de carregarFichasVigentes (com itens)
 * @param ctx      resultado de carregarFichasVigentes
 * @param resolver (itemPcp, dataRef) => custo|null  — injetável (atual ou na data)
 * @returns {{ custoPorUnidade:number, temCustoFaltando:boolean }}
 */
function custoFicha(receita, ctx, resolver = resolverAtual, dataRef = null, _visitados = new Set()) {
    if (!receita) return { custoPorUnidade: 0, temCustoFaltando: true };
    if (_visitados.has(receita.id)) return { custoPorUnidade: 0, temCustoFaltando: true };
    const visitados = new Set(_visitados);
    visitados.add(receita.id);

    let custoTotal = 0;
    let faltando = false;
    for (const item of receita.itens) {
        const ip = item.itemPcp;
        let custoUn = 0;
        if (ip?.tipo === 'SUB') {
            const sub = ctx.receitaPorItemPcp.get(ip.id);
            if (sub) {
                const c = custoFicha(sub, ctx, resolver, dataRef, visitados);
                custoUn = c.custoPorUnidade;
                if (c.temCustoFaltando) faltando = true;
            } else if (ip.custoUnitario != null) {
                custoUn = Number(ip.custoUnitario);
            } else {
                faltando = true;
            }
        } else {
            const c = resolver(ip, dataRef);
            if (c != null && c > 0) custoUn = c;
            else faltando = true;
        }
        custoTotal += custoUn * (Number(item.quantidade) || 0);
    }
    const base = Number(receita.rendimentoBase) || 0;
    const perda = receita.perdaPercentual != null ? Number(receita.perdaPercentual) : 0;
    const liquido = base > 0 ? base * (1 - perda / 100) : 0;
    const porUn = liquido > 0 ? custoTotal / liquido : 0;
    return { custoPorUnidade: round4(porUn), temCustoFaltando: faltando };
}

/**
 * Explode a ficha: quantidade de cada insumo (não-SUB) por 1 unidade do produto final.
 * @returns {Map<itemPcpId, number>}
 */
function explodirFicha(receita, ctx, fator = 1, acc = new Map(), _visitados = new Set()) {
    if (!receita || _visitados.has(receita.id)) return acc;
    const visitados = new Set(_visitados);
    visitados.add(receita.id);
    const base = Number(receita.rendimentoBase) || 0;
    const perda = receita.perdaPercentual != null ? Number(receita.perdaPercentual) : 0;
    const liquido = base > 0 ? base * (1 - perda / 100) : 0;
    if (!(liquido > 0)) return acc;
    for (const item of receita.itens) {
        const ip = item.itemPcp;
        if (!ip) continue;
        const qtdPorUn = ((Number(item.quantidade) || 0) / liquido) * fator;
        if (ip.tipo === 'SUB') {
            const sub = ctx.receitaPorItemPcp.get(ip.id);
            if (sub) explodirFicha(sub, ctx, qtdPorUn, acc, visitados);
        } else {
            acc.set(ip.id, (acc.get(ip.id) || 0) + qtdPorUn);
        }
    }
    return acc;
}

// ─────────────────────────────────────────────────────────────
// Classificação e custo atual (em lote)
// ─────────────────────────────────────────────────────────────

/** @returns {Promise<Map<produtoId, 'FABRICADO'|'REVENDA'|'SEM_CLASSE'>>} */
async function classificarProdutos(produtoIds, ctx = null) {
    const ids = [...new Set((produtoIds || []).filter(Boolean))];
    const mapa = new Map();
    if (!ids.length) return mapa;
    ctx = ctx || await carregarFichasVigentes();
    const produtos = await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, nfeRevenda: true } });
    for (const p of produtos) {
        if (fichaEfetiva(ctx, p.id)) mapa.set(p.id, 'FABRICADO');
        else if (p.nfeRevenda === true) mapa.set(p.id, 'REVENDA');
        else mapa.set(p.id, 'SEM_CLASSE');
    }
    return mapa;
}

/**
 * Custo atual por unidade: ficha > custoManual > custoMedio (CA) > SEM_CUSTO.
 * @returns {Promise<Map<produtoId, { custo:number|null, fonte:string, temCustoFaltando?:boolean }>>}
 */
async function custoAgora(produtoIds, ctx = null) {
    const ids = [...new Set((produtoIds || []).filter(Boolean))];
    const mapa = new Map();
    if (!ids.length) return mapa;
    ctx = ctx || await carregarFichasVigentes();
    const produtos = await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, custoManual: true, custoMedio: true } });
    for (const p of produtos) {
        const ipId = ctx.itemPcpPorProduto.get(p.id);
        if (ipId) {
            const c = custoFicha(ctx.receitaPorItemPcp.get(ipId), ctx);
            if (c.custoPorUnidade > 0) { mapa.set(p.id, { custo: c.custoPorUnidade, fonte: 'FICHA', temCustoFaltando: c.temCustoFaltando }); continue; }
        }
        const fe = fichaEfetiva(ctx, p.id);
        if (fe && fe.ref) {
            const c = custoFicha(ctx.receitaPorItemPcp.get(fe.itemPcpId), ctx);
            if (c.custoPorUnidade > 0) { mapa.set(p.id, { custo: round4(c.custoPorUnidade * fe.fator), fonte: 'FICHA_REF', temCustoFaltando: c.temCustoFaltando }); continue; }
        }
        const manual = num(p.custoManual);
        const ca = num(p.custoMedio);
        if (manual > 0) mapa.set(p.id, { custo: round4(manual), fonte: 'COMPRA' });
        else if (ca > 0) mapa.set(p.id, { custo: round4(ca), fonte: 'CA' });
        else mapa.set(p.id, { custo: null, fonte: 'SEM_CUSTO' });
    }
    return mapa;
}

// ─────────────────────────────────────────────────────────────
// Compras (CompraItem) — histórico de preço por insumo/produto
// ─────────────────────────────────────────────────────────────

/**
 * Índice de compras não estornadas (e com estoque) por chave 'i:<itemPcpId>' / 'p:<produtoId>'.
 * Cada lista vem ordenada por dataCompra crescente.
 */
async function carregarCompras({ itemPcpIds = [], produtoIds = [], ate = null } = {}) {
    const or = [];
    if (itemPcpIds.length) or.push({ itemPcpId: { in: itemPcpIds } });
    if (produtoIds.length) or.push({ produtoId: { in: produtoIds } });
    const idx = new Map();
    if (!or.length) return idx;
    const compras = await prisma.compraItem.findMany({
        where: { estornado: false, semEstoque: false, OR: or, ...(ate ? { dataCompra: { lte: ate } } : {}) },
        orderBy: { dataCompra: 'asc' },
        select: { id: true, itemPcpId: true, produtoId: true, dataCompra: true, custoUnitario: true }
    });
    const push = (k, c) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(c); };
    for (const c of compras) {
        const reg = { id: c.id, t: new Date(c.dataCompra).getTime(), custo: Number(c.custoUnitario) };
        if (c.itemPcpId) push(`i:${c.itemPcpId}`, reg);
        if (c.produtoId) push(`p:${c.produtoId}`, reg);
    }
    for (const lista of idx.values()) lista.sort((a, b) => a.t - b.t);
    return idx;
}

/** Último preço pago com dataCompra <= t. Devolve { custo, estimado } (estimado = antes da 1ª compra). */
function ultimoPrecoAte(lista, t) {
    if (!lista || !lista.length) return null;
    let lo = 0, hi = lista.length - 1, achou = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lista[mid].t <= t) { achou = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (achou >= 0) return { custo: lista[achou].custo, estimado: false };
    return { custo: lista[0].custo, estimado: true };
}

/** Mescla as listas de um ItemPcp (por itemPcpId e por produtoId do item) sem duplicar compras. */
function listaDoInsumo(idx, ip) {
    const a = idx.get(`i:${ip.id}`) || [];
    const b = ip.produtoId ? (idx.get(`p:${ip.produtoId}`) || []) : [];
    if (!b.length) return a;
    if (!a.length) return b;
    const vistos = new Set(a.map((x) => x.id));
    return [...a, ...b.filter((x) => !vistos.has(x.id))].sort((x, y) => x.t - y.t);
}

/** Resolver "preço do insumo na data" (último pago ≤ data; sem compra, cai no custo atual). */
function criarResolverNaData(idx) {
    const memo = new Map();
    return (ip, dataRef) => {
        if (!ip) return null;
        const t = dataRef ? new Date(dataRef).getTime() : Date.now();
        const lista = listaDoInsumo(idx, ip);
        const r = ultimoPrecoAte(lista, t);
        if (r && r.custo > 0) return r.custo;
        return resolverAtual(ip);
    };
}

// ─────────────────────────────────────────────────────────────
// Custo na data (backfill) — cascata (a)→(d), em lote
// ─────────────────────────────────────────────────────────────

/**
 * Custo estimado de produtos em datas passadas.
 * @param pares [{ produtoId, data: Date|string }]
 * @returns {Promise<Map<'produtoId|YYYY-MM-DD', { custo:number|null, fonte:string }>>}
 *   fonte: FICHA | COMPRA | HIST_MENSAL | ATUAL | CA | SEM_CUSTO  (sempre estimado)
 */
async function custoNaDataLote(pares) {
    const out = new Map();
    if (!pares.length) return out;
    const ctx = await carregarFichasVigentes();
    const produtoIds = [...new Set(pares.map((p) => p.produtoId))];

    // insumos de todas as fichas de fabricados envolvidos + os próprios produtos (compras de revenda)
    const insumoIds = new Set(); const insumoProdIds = new Set();
    for (const pid of produtoIds) {
        const fe0 = fichaEfetiva(ctx, pid);
        if (!fe0) continue;
        const pilha = [ctx.receitaPorItemPcp.get(fe0.itemPcpId)]; const vis = new Set();
        while (pilha.length) {
            const r = pilha.pop();
            if (!r || vis.has(r.id)) continue; vis.add(r.id);
            for (const it of r.itens) {
                const ip = it.itemPcp; if (!ip) continue;
                if (ip.tipo === 'SUB') { pilha.push(ctx.receitaPorItemPcp.get(ip.id)); continue; }
                insumoIds.add(ip.id); if (ip.produtoId) insumoProdIds.add(ip.produtoId);
            }
        }
    }
    const idx = await carregarCompras({ itemPcpIds: [...insumoIds], produtoIds: [...new Set([...produtoIds, ...insumoProdIds])] });
    const resolver = criarResolverNaData(idx);
    const atual = await custoAgora(produtoIds, ctx);
    const hist = await prisma.produtoCustoHistorico.findMany({
        where: { produtoId: { in: produtoIds }, custoUnitario: { gt: 0 } },
        select: { produtoId: true, mesReferencia: true, custoUnitario: true }
    });
    const histMap = new Map(hist.map((h) => [`${h.produtoId}|${h.mesReferencia}`, Number(h.custoUnitario)]));

    for (const { produtoId, data } of pares) {
        const ymd = ymdSP(data);
        const chave = `${produtoId}|${ymd}`;
        if (out.has(chave)) continue;
        const t = fimDiaSP(ymd).getTime();
        let res = null;
        // (a) ficha recomposta com o preço dos insumos na data
        const fe = fichaEfetiva(ctx, produtoId);
        if (fe) {
            const c = custoFicha(ctx.receitaPorItemPcp.get(fe.itemPcpId), ctx, resolver, new Date(t));
            if (c.custoPorUnidade > 0) res = { custo: round4(c.custoPorUnidade * fe.fator), fonte: fe.ref ? 'FICHA_REF' : 'FICHA' };
        }
        // (b) último preço de compra do próprio produto
        if (!res) {
            const r = ultimoPrecoAte(idx.get(`p:${produtoId}`), t);
            if (r && r.custo > 0) res = { custo: round4(r.custo), fonte: 'COMPRA' };
        }
        // (c) histórico mensal
        if (!res) {
            const h = histMap.get(`${produtoId}|${ymd.slice(0, 7)}`);
            if (h > 0) res = { custo: round4(h), fonte: 'HIST_MENSAL' };
        }
        // (d) custo atual
        if (!res) {
            const a = atual.get(produtoId);
            res = a && a.custo > 0 ? { custo: a.custo, fonte: 'ATUAL' } : { custo: null, fonte: 'SEM_CUSTO' };
        }
        out.set(chave, res);
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// Séries semanais (derivadas de CompraItem na leitura)
// ─────────────────────────────────────────────────────────────

/** Lista as N semanas (segunda a domingo, fuso SP), da mais antiga para a atual. */
function listarSemanas(n = 8, referencia = null) {
    const hoje = referencia || ymdSP(new Date());
    const segAtual = segundaDe(hoje);
    const semanas = [];
    for (let i = n - 1; i >= 0; i--) {
        const ini = somaDias(segAtual, -7 * i);
        const fimYmd = somaDias(ini, 6);
        semanas.push({
            inicio: ini,
            fim: fimYmd,
            fimT: Math.min(fimDiaSP(fimYmd).getTime(), Date.now()),
            rotulo: `${ini.slice(8, 10)}/${ini.slice(5, 7)}`
        });
    }
    return semanas;
}

/** Insumos (não-SUB) que entram em receita vigente de produto fabricado. @returns Map<itemPcpId, itemPcp> */
function insumosDeFabricados(ctx) {
    const mapa = new Map();
    for (const [, ipId] of ctx.itemPcpPorProduto) {
        const pilha = [ctx.receitaPorItemPcp.get(ipId)]; const vis = new Set();
        while (pilha.length) {
            const r = pilha.pop();
            if (!r || vis.has(r.id)) continue; vis.add(r.id);
            for (const it of r.itens) {
                const ip = it.itemPcp; if (!ip) continue;
                if (ip.tipo === 'SUB') { pilha.push(ctx.receitaPorItemPcp.get(ip.id)); continue; }
                mapa.set(ip.id, ip);
            }
        }
    }
    return mapa;
}

/**
 * Curva semanal do último preço pago dos insumos (MP/EMB) que entram em fichas de fabricados.
 * @returns {{ semanas, insumos:[{ itemPcpId,nome,unidade,tipo,valores,estimados,indice,variacaoPct,altasSeguidas,custoMedioAtual }] }}
 *   (ordenado por |variação| desc; o chamador aplica o top-N / peso no CPV)
 */
async function serieSemanalInsumos({ semanas = 8 } = {}) {
    const n = Math.min(Math.max(parseInt(semanas, 10) || 8, 2), 26);
    return comCacheCompras(`serieInsumos:${n}:${ymdSP(new Date())}`, 10 * 60 * 1000, async () => {
        const ctx = await carregarFichasVigentes();
        const insumos = insumosDeFabricados(ctx);
        const lista = [...insumos.values()].filter((ip) => ip.tipo === 'MP' || ip.tipo === 'EMB'); // todos; o corte de 40 vem DEPOIS de ordenar por variação
        const idx = await carregarCompras({
            itemPcpIds: lista.map((i) => i.id),
            produtoIds: lista.map((i) => i.produtoId).filter(Boolean)
        });
        const sem = listarSemanas(n);
        const saida = [];
        for (const ip of lista) {
            const compras = listaDoInsumo(idx, ip);
            if (!compras.length) continue; // sem nenhuma compra registrada: nada a desenhar
            const valores = []; const estimados = [];
            for (const s of sem) {
                const r = ultimoPrecoAte(compras, s.fimT);
                valores.push(r ? round4(r.custo) : null);
                estimados.push(r ? r.estimado : false);
            }
            const base = valores.find((v) => v != null && v > 0);
            const indice = valores.map((v) => (v != null && base ? Math.round((v / base) * 1000) / 10 : null));
            const ult = valores[valores.length - 1];
            const variacaoPct = base && ult != null ? Math.round(((ult / base) - 1) * 1000) / 10 : 0;
            // altas seguidas: de trás pra frente, quantas semanas consecutivas subiram
            let altas = 0;
            for (let i = valores.length - 1; i > 0; i--) {
                if (valores[i] != null && valores[i - 1] != null && valores[i] > valores[i - 1]) altas++; else break;
            }
            const cm = ip.produto?.custoManual != null ? Number(ip.produto.custoManual) : (ip.custoUnitario != null ? Number(ip.custoUnitario) : null);
            saida.push({
                itemPcpId: ip.id, nome: ip.nome, unidade: ip.unidade, tipo: ip.tipo,
                valores, estimados, indice, variacaoPct, altasSeguidas: altas,
                custoMedioAtual: cm != null && cm > 0 ? round4(cm) : null
            });
        }
        saida.sort((a, b) => Math.abs(b.variacaoPct) - Math.abs(a.variacaoPct));
        saida.length = Math.min(saida.length, 40);
        return { semanas: sem.map((s) => ({ inicio: s.inicio, rotulo: s.rotulo })), insumos: saida };
    });
}

/**
 * Custo da ficha de produtos fabricados em N+1 pontos (hoje e semanas atrás), usando o
 * último preço pago dos insumos. @returns Map<produtoId, { atual:number|null, ha4s:number|null, serie:[number|null] }>
 */
async function serieSemanalFicha(produtoIds, { semanas = 8 } = {}) {
    const mapa = new Map();
    const ctx = await carregarFichasVigentes();
    const fabricados = [...new Set(produtoIds)].filter((id) => ctx.itemPcpPorProduto.has(id)).slice(0, 60);
    if (!fabricados.length) return mapa;
    const insumoIds = new Set(); const insumoProdIds = new Set();
    for (const pid of fabricados) {
        const pilha = [ctx.receitaPorItemPcp.get(ctx.itemPcpPorProduto.get(pid))]; const vis = new Set();
        while (pilha.length) {
            const r = pilha.pop();
            if (!r || vis.has(r.id)) continue; vis.add(r.id);
            for (const it of r.itens) {
                const ip = it.itemPcp; if (!ip) continue;
                if (ip.tipo === 'SUB') { pilha.push(ctx.receitaPorItemPcp.get(ip.id)); continue; }
                insumoIds.add(ip.id); if (ip.produtoId) insumoProdIds.add(ip.produtoId);
            }
        }
    }
    const idx = await carregarCompras({ itemPcpIds: [...insumoIds], produtoIds: [...insumoProdIds] });
    const resolver = criarResolverNaData(idx);
    const sem = listarSemanas(semanas);
    const agora = new Date();
    const ha4s = new Date(Date.now() - 28 * 86400000);
    for (const pid of fabricados) {
        const rec = ctx.receitaPorItemPcp.get(ctx.itemPcpPorProduto.get(pid));
        const f = (d) => { const c = custoFicha(rec, ctx, resolver, d); return c.custoPorUnidade > 0 ? c.custoPorUnidade : null; };
        mapa.set(pid, { atual: f(agora), ha4s: f(ha4s), serie: sem.map((s) => f(new Date(s.fimT))) });
    }
    return mapa;
}

module.exports = {
    carregarFichasVigentes,
    fichaEfetiva,
    custoFicha,
    explodirFicha,
    resolverAtual,
    classificarProdutos,
    custoAgora,
    carregarCompras,
    ultimoPrecoAte,
    listaDoInsumo,
    criarResolverNaData,
    custoNaDataLote,
    listarSemanas,
    insumosDeFabricados,
    serieSemanalInsumos,
    serieSemanalFicha,
    comCache,
    comCacheCompras,
    versaoCompras,
    limparCache,
    segundaDe,
    somaDias,
    ymdSP,
    round4
};
