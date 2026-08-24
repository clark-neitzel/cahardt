/**
 * Custo do produto/insumo pelas COMPRAS RECENTES que cobrem o estoque (regra travada
 * com o dono em 08/2026 — substitui a média ponderada encadeada por retrato/replay).
 *
 * REGRA (vale para TODOS os produtos que controlam estoque):
 *   custo = média das compras VÁLIDAS mais recentes que COBREM o `estoqueAtual`.
 *   Ordena da mais recente para a mais antiga (por `dataCompra`, desempate `criadoEm`
 *   depois `id`), soma as quantidades até cobrir o estoque; a compra que CRUZA o limite
 *   entra INTEIRA (nunca proporcional). custo = soma(qtd·custoUnit) / soma(qtd) das
 *   compras incluídas. Sem compra válida → custo INTOCADO (mantém o manual).
 *
 * Não faz NENHUMA conversão de unidade — unidade é dado que o dono corrige no cadastro,
 * não é problema de código.
 *
 * Este módulo é a BASE: NÃO pode requerer compraEstoqueService/notaEstoqueService (eles é
 * que requerem este) — senão vira ciclo. Só depende de prisma e estoqueService (que só
 * depende de prisma).
 */

// prisma e estoqueService são carregados SOB DEMANDA dentro de recalcularCustoAlvo — assim
// a função PURA (custoPorEstoqueRecente) pode ser importada sem puxar o banco (o teste
// offline depende disso) e não há risco de ciclo no carregamento.

const round = (v, casas) => {
    const f = 10 ** casas;
    return Math.round(Number(v) * f) / f;
};
const num = (v) => Number(v || 0);

/**
 * Ordena da mais RECENTE para a mais ANTIGA: dataCompra DESC, desempate criadoEm DESC,
 * por fim id DESC (determinístico).
 */
function compararRecentePrimeiro(a, b) {
    const da = new Date(a.dataCompra || 0).getTime();
    const db = new Date(b.dataCompra || 0).getTime();
    if (da !== db) return db - da;
    const ca = new Date(a.criadoEm || 0).getTime();
    const cb = new Date(b.criadoEm || 0).getTime();
    if (ca !== cb) return cb - ca;
    return String(b.id || '').localeCompare(String(a.id || ''));
}

/**
 * Função PURA. Custo pelas compras recentes que cobrem `estoqueAtual`.
 *
 * @param {number} estoqueAtual         saldo atual do produto/insumo (na nossa unidade)
 * @param {Array}  comprasValidas       [{ quantidade, custoUnitario, dataCompra, criadoEm, id }]
 * @returns {number|null}  custo médio (SEM arredondar — quem chama arredonda), ou null se
 *                         não houver compra válida (quantidade > 0).
 *
 * - Filtra quantidade > 0. Nenhuma sobrar → null.
 * - estoqueAtual <= 0 → custoUnitario da compra mais recente (não há saldo a cobrir).
 * - Caso normal: percorre recente→antiga somando as quantidades; inclui cada compra
 *   INTEIRA e para no PRIMEIRO índice em que a soma cobre o estoque (a que cruza entra
 *   inteira). Se nunca cobrir (estoque > soma de todas), inclui TODAS.
 * - Determinística, sem I/O.
 */
function custoPorEstoqueRecente(estoqueAtual, comprasValidas) {
    const validas = (comprasValidas || []).filter((c) => num(c.quantidade) > 0);
    if (validas.length === 0) return null;

    const ordenadas = [...validas].sort(compararRecentePrimeiro);
    const estoque = num(estoqueAtual);

    // Sem saldo a cobrir: vale o preço da compra mais recente.
    if (estoque <= 0) return num(ordenadas[0].custoUnitario);

    let somaQtd = 0;
    let somaValor = 0;
    for (const c of ordenadas) {
        const q = num(c.quantidade);
        somaQtd += q;
        somaValor += q * num(c.custoUnitario);
        if (somaQtd >= estoque) break; // a compra que CRUZA o limite entra INTEIRA
    }
    if (somaQtd <= 0) return null;
    return somaValor / somaQtd;
}

/**
 * Recalcula o custo de um produto/insumo pela regra das compras recentes e GRAVA
 * (a não ser em modo simulação).
 *
 * @param {object} alvo  { produtoId } OU { itemPcpId }
 * @param {object} db    cliente Prisma (ou tx dentro de transação). Default: prisma global.
 * @param {object} opts  { apenasCalcular?: bool } — em `apenasCalcular` só calcula e devolve
 *                        a prévia, sem NENHUMA escrita (usado pela rota de simulação em massa).
 * @returns {{ custo: number|null, custoAtual: number|null,
 *             motivo: 'ok'|'sem-compras'|'custo-zero'|'sem-alvo', nome: string|null }}
 *          `custo` = custo novo (arredondado); `custoAtual` = o que estava gravado.
 *          Sem compra válida (ou custo não-positivo) → NÃO grava; custo atual fica como está.
 */
async function recalcularCustoAlvo({ produtoId, itemPcpId }, db, { apenasCalcular = false } = {}) {
    const prisma = require('../config/database');
    const estoqueService = require('./estoqueService');
    db = db || prisma;
    if (!produtoId && !itemPcpId) return { custo: null, custoAtual: null, motivo: 'sem-alvo', nome: null };

    const where = { estornado: false };
    let nome = null;
    let estoqueAtual = 0;
    let custoAtual = null;
    let semControle = false;

    if (produtoId) {
        const p = await db.produto.findUnique({
            where: { id: produtoId },
            select: { nome: true, estoqueTotal: true, custoManual: true, categoria: true, controlaEstoque: true }
        });
        if (!p) return { custo: null, custoAtual: null, motivo: 'sem-alvo', nome: null };
        nome = p.nome || null;
        estoqueAtual = num(p.estoqueTotal);
        custoAtual = p.custoManual != null ? num(p.custoManual) : null;
        const controla = await estoqueService.produtoControlaEstoque(p, db);
        semControle = !controla;
        where.produtoId = produtoId;
    } else {
        const i = await db.itemPcp.findUnique({
            where: { id: itemPcpId },
            select: { nome: true, estoqueAtual: true, custoUnitario: true }
        });
        if (!i) return { custo: null, custoAtual: null, motivo: 'sem-alvo', nome: null };
        nome = i.nome || null;
        estoqueAtual = num(i.estoqueAtual);
        custoAtual = i.custoUnitario != null ? num(i.custoUnitario) : null;
        where.itemPcpId = itemPcpId;
    }

    const compras = await db.compraItem.findMany({
        where,
        select: { id: true, quantidade: true, custoUnitario: true, dataCompra: true, criadoEm: true }
    });
    const validas = compras.filter((c) => num(c.quantidade) > 0);
    if (validas.length === 0) return { custo: null, custoAtual, motivo: 'sem-compras', nome };

    let custo;
    if (semControle) {
        // Produto que NÃO controla estoque: sem saldo a cobrir, vale o último preço pago
        // (compra válida mais recente).
        const ordenadas = [...validas].sort(compararRecentePrimeiro);
        custo = num(ordenadas[0].custoUnitario);
    } else {
        custo = custoPorEstoqueRecente(estoqueAtual, validas);
    }

    if (!(custo > 0)) return { custo: null, custoAtual, motivo: 'custo-zero', nome };

    const casas = produtoId ? 2 : 4;
    const novo = round(custo, casas);
    if (apenasCalcular) return { custo: novo, custoAtual, motivo: 'ok', nome };

    if (produtoId) {
        await db.produto.update({ where: { id: produtoId }, data: { custoManual: novo } });
    } else {
        await db.itemPcp.update({ where: { id: itemPcpId }, data: { custoUnitario: novo } });
    }
    return { custo: novo, custoAtual, motivo: 'ok', nome };
}

module.exports = {
    custoPorEstoqueRecente, // pura (testável offline)
    recalcularCustoAlvo,
    compararRecentePrimeiro
};
