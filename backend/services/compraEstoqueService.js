/**
 * Compras → Estoque e Custo (Fase 6 do módulo financeiro).
 *
 * Quando a nota é conferida (gerar conta a pagar) com itens VINCULADOS a um
 * produto do catálogo ou insumo PCP:
 *   1. grava uma linha de CompraItem (histórico de compras do produto:
 *      fornecedor, nota, quantidade convertida, custo unitário);
 *   2. dá ENTRADA no estoque (estoqueService p/ Produto, pcpEstoqueService p/ ItemPcp),
 *      motivo COMPRA;
 *   3. atualiza o CUSTO por média ponderada com o estoque anterior
 *      (Produto → custoManual, campo local que o sync do CA não sobrescreve;
 *       ItemPcp → custoUnitario, usado nas receitas do PCP).
 *
 * Cancelar a conferência ESTORNA: saída de estoque (motivo ESTORNO_COMPRA) e a
 * linha do histórico é marcada estornado=true (nunca apagada). O custo NÃO é
 * revertido (média já incorporada — corrija manualmente se necessário).
 *
 * Roda DEPOIS da transação da conta a pagar: falha aqui não desfaz a conta —
 * loga, devolve avisos e o estoque pode ser acertado manualmente.
 */

const prisma = require('../config/database');
const estoqueService = require('./estoqueService');
const pcpEstoqueService = require('./pcpEstoqueService');

const round = (v, casas) => {
    const f = 10 ** casas;
    return Math.round(Number(v) * f) / f;
};
const num = (v) => Number(v || 0);

/**
 * Custo médio ponderado pelo estoque anterior. Função PURA.
 * Sem estoque anterior (<= 0) ou sem custo atual (<= 0) → custo da compra.
 */
function custoMedioPonderado(estoqueAntes, custoAtual, qtdEntrada, custoEntrada) {
    const est = num(estoqueAntes);
    const atual = num(custoAtual);
    const qtd = num(qtdEntrada);
    if (qtd <= 0) return atual > 0 ? atual : num(custoEntrada);
    if (est <= 0 || atual <= 0) return num(custoEntrada);
    return round((est * atual + qtd * num(custoEntrada)) / (est + qtd), 4);
}

/**
 * Registra as entradas de estoque/custo/histórico de uma nota conferida.
 * @param {object} nota       NotaEntrada (com fornecedorNome/Cnpj, numero, emissao)
 * @param {string} contaPagarId
 * @param {Array}  entradas   [{ itemNota, produtoId?, itemPcpId?, fator }] — itemNota = NotaEntradaItem
 * @param {string} criadoPorId
 * @returns {{ registradas: number, avisos: string[] }}
 */
async function registrarEntradasCompra(nota, contaPagarId, entradas, criadoPorId) {
    let registradas = 0;
    const avisos = [];

    for (const e of entradas) {
        const { itemNota, produtoId, itemPcpId } = e;
        if (!produtoId && !itemPcpId) continue;
        const fator = num(e.fator) > 0 ? num(e.fator) : 1;

        try {
            const qtdFornecedor = num(itemNota.quantidade);
            const quantidade = round(qtdFornecedor * fator, 3);
            const valorTotal = num(itemNota.valorTotal);
            if (quantidade <= 0) {
                avisos.push(`Item "${itemNota.descricao}": quantidade convertida zero — entrada de estoque pulada.`);
                continue;
            }
            const custoUnitario = round(valorTotal / quantidade, 6);

            // Idempotência: se já existe compra ATIVA desta nota para este item da nota, pula
            // (reconferência após cancelar gera novo registro porque o antigo fica estornado).
            const jaExiste = await prisma.compraItem.findFirst({
                where: {
                    notaEntradaId: nota.id,
                    estornado: false,
                    descricaoFornecedor: itemNota.descricao,
                    produtoId: produtoId || null,
                    itemPcpId: itemPcpId || null
                },
                select: { id: true }
            });
            if (jaExiste) continue;

            // Alvo (para unidade e custo atual)
            let unidadeNossa = itemNota.unidade;
            if (produtoId) {
                const p = await prisma.produto.findUnique({
                    where: { id: produtoId },
                    select: { nome: true, unidade: true, estoqueTotal: true, custoManual: true, custoMedio: true, categoria: true, controlaEstoque: true }
                });
                if (!p) { avisos.push(`Produto do item "${itemNota.descricao}" não encontrado.`); continue; }
                unidadeNossa = p.unidade || unidadeNossa;
                // Produto que NÃO controla estoque: registra a compra e atualiza o custo,
                // mas não movimenta quantidade.
                const controla = await estoqueService.produtoControlaEstoque(p);

                await prisma.compraItem.create({
                    data: {
                        notaEntradaId: nota.id,
                        contaPagarId,
                        produtoId,
                        fornecedorId: nota.fornecedorId || null,
                        fornecedorNome: nota.fornecedorNome,
                        fornecedorCnpj: nota.fornecedorCnpj || null,
                        numeroNota: nota.numero,
                        dataCompra: nota.emissao || new Date(),
                        descricaoFornecedor: itemNota.descricao,
                        quantidadeFornecedor: qtdFornecedor,
                        unidadeFornecedor: itemNota.unidade,
                        fatorConversao: fator,
                        quantidade,
                        unidade: unidadeNossa,
                        valorTotal,
                        custoUnitario
                    }
                });

                // Entrada de estoque (transação própria do estoqueService) — só se controla
                if (controla) {
                    await estoqueService.ajustar({
                        produtoId,
                        vendedorId: criadoPorId || null,
                        tipo: 'ENTRADA',
                        quantidade,
                        motivo: 'COMPRA',
                        observacao: `Compra ${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${nota.fornecedorNome}`
                    });
                }

                // Custo: SEMPRE atualizado. Com controle de estoque, média ponderada com o
                // saldo anterior; sem controle, o custo passa a ser o da última compra.
                const custoAtual = num(p.custoManual) > 0 ? num(p.custoManual) : num(p.custoMedio);
                const novoCusto = controla
                    ? custoMedioPonderado(num(p.estoqueTotal), custoAtual, quantidade, custoUnitario)
                    : custoUnitario;
                await prisma.produto.update({
                    where: { id: produtoId },
                    data: { custoManual: round(novoCusto, 2) }
                });
                if (!controla) {
                    avisos.push(`"${p.nome}": custo atualizado (R$ ${round(novoCusto, 2).toFixed(2)}), sem movimentar estoque — produto não controla estoque.`);
                }
            } else {
                const i = await prisma.itemPcp.findUnique({
                    where: { id: itemPcpId },
                    select: { unidade: true, estoqueAtual: true, custoUnitario: true }
                });
                if (!i) { avisos.push(`Insumo do item "${itemNota.descricao}" não encontrado.`); continue; }
                unidadeNossa = i.unidade || unidadeNossa;

                await prisma.compraItem.create({
                    data: {
                        notaEntradaId: nota.id,
                        contaPagarId,
                        itemPcpId,
                        fornecedorId: nota.fornecedorId || null,
                        fornecedorNome: nota.fornecedorNome,
                        fornecedorCnpj: nota.fornecedorCnpj || null,
                        numeroNota: nota.numero,
                        dataCompra: nota.emissao || new Date(),
                        descricaoFornecedor: itemNota.descricao,
                        quantidadeFornecedor: qtdFornecedor,
                        unidadeFornecedor: itemNota.unidade,
                        fatorConversao: fator,
                        quantidade,
                        unidade: unidadeNossa,
                        valorTotal,
                        custoUnitario
                    }
                });

                await pcpEstoqueService.ajustar({
                    itemPcpId,
                    tipo: 'ENTRADA',
                    quantidade,
                    motivo: 'COMPRA',
                    observacao: `Compra ${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${nota.fornecedorNome}`,
                    criadoPorId: criadoPorId || null
                });

                const novoCusto = custoMedioPonderado(num(i.estoqueAtual), num(i.custoUnitario), quantidade, custoUnitario);
                await prisma.itemPcp.update({
                    where: { id: itemPcpId },
                    data: { custoUnitario: round(novoCusto, 4) }
                });
            }

            registradas++;
        } catch (err) {
            console.error(`[CompraEstoque] Falha na entrada do item "${itemNota?.descricao}":`, err.message);
            avisos.push(`Item "${itemNota?.descricao}": falha na entrada de estoque (${err.message}). Ajuste manualmente se necessário.`);
        }
    }

    return { registradas, avisos };
}

/**
 * Estorna as entradas de uma nota (cancelar conferência): saída de estoque na
 * mesma quantidade e marca as linhas do histórico como estornadas.
 * O custo NÃO é revertido.
 */
async function estornarEntradasNota(notaEntradaId, criadoPorId) {
    const compras = await prisma.compraItem.findMany({
        where: { notaEntradaId, estornado: false }
    });
    let estornadas = 0;
    const avisos = [];

    for (const c of compras) {
        try {
            if (c.produtoId) {
                // Produto sem controle de estoque nunca teve a quantidade lançada — só marca o estorno.
                const p = await prisma.produto.findUnique({
                    where: { id: c.produtoId },
                    select: { categoria: true, controlaEstoque: true }
                });
                const controla = await estoqueService.produtoControlaEstoque(p);
                if (controla) {
                    await estoqueService.ajustar({
                        produtoId: c.produtoId,
                        vendedorId: criadoPorId || null,
                        tipo: 'SAIDA',
                        quantidade: num(c.quantidade),
                        motivo: 'ESTORNO_COMPRA',
                        observacao: `Estorno da compra ${c.numeroNota || ''} — entrada cancelada`.trim()
                    });
                }
            } else if (c.itemPcpId) {
                await pcpEstoqueService.ajustar({
                    itemPcpId: c.itemPcpId,
                    tipo: 'SAIDA',
                    quantidade: num(c.quantidade),
                    motivo: 'ESTORNO_COMPRA',
                    observacao: `Estorno da compra ${c.numeroNota || ''} — entrada cancelada`.trim(),
                    criadoPorId: criadoPorId || null
                });
            }
            await prisma.compraItem.update({
                where: { id: c.id },
                data: { estornado: true, estornadoEm: new Date() }
            });
            estornadas++;
        } catch (err) {
            console.error(`[CompraEstoque] Falha ao estornar compra ${c.id}:`, err.message);
            avisos.push(`Falha ao estornar a entrada de "${c.descricaoFornecedor}" (${err.message}).`);
        }
    }

    return { estornadas, avisos };
}

/** Histórico de compras de um produto do catálogo OU insumo PCP (mais recentes primeiro). */
async function historicoCompras({ produtoId, itemPcpId, take = 50 }) {
    const where = { estornado: false };
    if (produtoId) where.produtoId = produtoId;
    else if (itemPcpId) where.itemPcpId = itemPcpId;
    else return [];

    const compras = await prisma.compraItem.findMany({
        where,
        orderBy: { dataCompra: 'desc' },
        take
    });
    return compras.map((c) => ({
        id: c.id,
        dataCompra: c.dataCompra,
        fornecedorNome: c.fornecedorNome,
        numeroNota: c.numeroNota,
        descricaoFornecedor: c.descricaoFornecedor,
        quantidadeFornecedor: num(c.quantidadeFornecedor),
        unidadeFornecedor: c.unidadeFornecedor,
        quantidade: num(c.quantidade),
        unidade: c.unidade,
        valorTotal: num(c.valorTotal),
        custoUnitario: num(c.custoUnitario),
        notaEntradaId: c.notaEntradaId
    }));
}

module.exports = {
    registrarEntradasCompra,
    estornarEntradasNota,
    historicoCompras,
    // pura (testável offline)
    custoMedioPonderado
};
