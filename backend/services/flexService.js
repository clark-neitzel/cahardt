const prisma = require('../config/database');

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
            flexTotal: true,
            itens: { select: { valor: true, quantidade: true } }
        }
    });

    let vendasLiquidas = 0;
    let flexUsado = 0;

    for (const p of pedidos) {
        vendasLiquidas += p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
        const ft = Number(p.flexTotal);
        if (ft < 0) flexUsado += ft;
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
                flexTotal: true,
                itens: { select: { valor: true, quantidade: true } }
            }
        })
    ]);

    // Inicializa mapa por vendedor
    const percMap = new Map(vendedores.map(v => [v.id, Number(v.percentualFlex || 0)]));
    const dados = new Map(vendedorIds.map(id => [id, { vendasLiquidas: 0, flexUsado: 0 }]));

    for (const p of pedidos) {
        const d = dados.get(p.vendedorId);
        if (!d) continue;
        d.vendasLiquidas += p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0);
        const ft = Number(p.flexTotal);
        if (ft < 0) d.flexUsado += ft;
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

module.exports = { calcularFlexDinamico, calcularFlexBulk };
