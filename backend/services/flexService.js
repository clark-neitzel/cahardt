const prisma = require('../config/database');

/**
 * Carrega o mapa de regras flex por produtoId.
 * Retorna Map<produtoId, { contabilizaFlex, tipoFlex }>
 */
async function obterRegrasCategoria(produtoIds, db) {
    if (!produtoIds || produtoIds.length === 0) return new Map();
    const client = db || prisma;

    const produtos = await client.produto.findMany({
        where: { id: { in: produtoIds } },
        select: {
            id: true,
            categoria: true,
            categoriaProduto: { select: { tipoFlex: true } }
        }
    });

    const categoriasCa = [...new Set(produtos.map(p => p.categoria).filter(Boolean))];
    const catEstoque = categoriasCa.length > 0
        ? await client.categoriaEstoque.findMany({ where: { nome: { in: categoriasCa } }, select: { nome: true, contabilizaFlex: true } })
        : [];
    const catEstoqueMap = new Map(catEstoque.map(c => [c.nome, c.contabilizaFlex]));

    return new Map(produtos.map(p => [p.id, {
        contabilizaFlex: p.categoria ? (catEstoqueMap.get(p.categoria) ?? true) : true,
        tipoFlex: p.categoriaProduto?.tipoFlex || 'NORMAL'
    }]));
}

/** Aplica a regra de flex de categoria sobre um valor bruto. */
function aplicarRegraFlex(flexBruto, regra) {
    if (!regra) return flexBruto;
    if (!regra.contabilizaFlex) return 0;
    const tipo = regra.tipoFlex || 'NORMAL';
    if (tipo === 'NAO_CONTABILIZAR') return 0;
    if (tipo === 'SOMENTE_NEGATIVO') return Math.min(0, flexBruto);
    return flexBruto;
}

/**
 * Calcula o orçamento de flex dinâmico de um vendedor.
 * Orçamento = vendas líquidas últimos 30 dias × percentualFlex%
 * Disponível = orçamento − |flex negativo usado nos últimos 30 dias|
 *
 * @param {string} vendedorId
 * @param {object} [tx] - transação Prisma opcional (usa prisma global se omitido)
 * @returns {{ percentualFlex, vendasLiquidas, orcamento, flexUsado, disponivel }}
 */
async function calcularFlexDinamico(vendedorId, tx) {
    const db = tx || prisma;
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const vendedor = await db.vendedor.findUnique({
        where: { id: vendedorId },
        select: { percentualFlex: true }
    });

    const percentual = Number(vendedor?.percentualFlex || 0);

    if (percentual === 0) {
        return { percentualFlex: 0, vendasLiquidas: 0, orcamento: 0, flexUsado: 0, disponivel: 0 };
    }

    const pedidos = await db.pedido.findMany({
        where: {
            vendedorId,
            createdAt: { gte: trintaDiasAtras },
            statusEnvio: { not: 'EXCLUIDO' },
            bonificacao: false,
            statusEntrega: { not: 'DEVOLVIDO' }
        },
        select: {
            itens: { select: { produtoId: true, valor: true, quantidade: true, flexGerado: true } }
        }
    });

    // Carrega regras de categoria para todos os produtos dos pedidos
    const allProdutoIds = [...new Set(pedidos.flatMap(p => p.itens.map(i => i.produtoId)).filter(Boolean))];
    const regras = await obterRegrasCategoria(allProdutoIds, db);

    let vendasLiquidas = 0;
    let flexUsado = 0;

    for (const p of pedidos) {
        for (const i of p.itens) {
            vendasLiquidas += Number(i.valor) * Number(i.quantidade);
            const flexBruto = Number(i.flexGerado || 0);
            const flexEfetivo = aplicarRegraFlex(flexBruto, regras.get(i.produtoId));
            if (flexEfetivo < 0) flexUsado += flexEfetivo;
        }
    }

    const orcamento = vendasLiquidas * percentual / 100;
    const disponivel = orcamento + flexUsado; // flexUsado é negativo

    return { percentualFlex: percentual, vendasLiquidas, orcamento, flexUsado, disponivel };
}

/**
 * Calcula flex dinâmico para vários vendedores em uma única passagem (eficiente para listar).
 * @param {string[]} vendedorIds
 * @returns {Map<string, {percentualFlex, vendasLiquidas, orcamento, flexUsado, disponivel}>}
 */
async function calcularFlexBulk(vendedorIds) {
    if (!vendedorIds.length) return new Map();

    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const [vendedores, pedidos] = await Promise.all([
        prisma.vendedor.findMany({
            where: { id: { in: vendedorIds } },
            select: { id: true, percentualFlex: true }
        }),
        prisma.pedido.findMany({
            where: {
                vendedorId: { in: vendedorIds },
                createdAt: { gte: trintaDiasAtras },
                statusEnvio: { not: 'EXCLUIDO' },
                bonificacao: false,
                statusEntrega: { not: 'DEVOLVIDO' }
            },
            select: {
                vendedorId: true,
                itens: { select: { produtoId: true, valor: true, quantidade: true, flexGerado: true } }
            }
        })
    ]);

    // Carrega regras de categoria para todos os produtos
    const allProdutoIds = [...new Set(pedidos.flatMap(p => p.itens.map(i => i.produtoId)).filter(Boolean))];
    const regras = await obterRegrasCategoria(allProdutoIds);

    // Inicializa mapa por vendedor
    const percMap = new Map(vendedores.map(v => [v.id, Number(v.percentualFlex || 0)]));
    const dados = new Map(vendedorIds.map(id => [id, { vendasLiquidas: 0, flexUsado: 0 }]));

    for (const p of pedidos) {
        const d = dados.get(p.vendedorId);
        if (!d) continue;
        for (const i of p.itens) {
            d.vendasLiquidas += Number(i.valor) * Number(i.quantidade);
            const flexBruto = Number(i.flexGerado || 0);
            const flexEfetivo = aplicarRegraFlex(flexBruto, regras.get(i.produtoId));
            if (flexEfetivo < 0) d.flexUsado += flexEfetivo;
        }
    }

    const resultado = new Map();
    for (const id of vendedorIds) {
        const percentual = percMap.get(id) || 0;
        const { vendasLiquidas, flexUsado } = dados.get(id) || { vendasLiquidas: 0, flexUsado: 0 };
        const orcamento = vendasLiquidas * percentual / 100;
        const disponivel = orcamento + flexUsado;
        resultado.set(id, { percentualFlex: percentual, vendasLiquidas, orcamento, flexUsado, disponivel });
    }

    return resultado;
}

module.exports = { calcularFlexDinamico, calcularFlexBulk, obterRegrasCategoria };
