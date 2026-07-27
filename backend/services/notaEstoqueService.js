/**
 * Notas Recebidas → Estoque (decisão do dono, 07/2026):
 * TODA nota de entrada conferida SOMA no estoque — nos dois caminhos:
 *   • "Gerar Conta a Pagar" (compra normal)          → soma quantidade E atualiza custo;
 *   • "Registrar entrada (sem pagamento)" (bonificação, amostra, remessa/troca,
 *     comodato) → soma SÓ a quantidade, custo intocado (mercadoria a custo zero).
 *
 * Diferente da Fase 6 antiga (compraEstoqueService, que rodava FORA da transação e
 * pulava produtos "sem controle de estoque"), aqui:
 *   • roda DENTRO da mesma transação da conta/registro — ou entra tudo, ou nada;
 *   • soma quantidade SEMPRE que o item tem vínculo (decisão do dono);
 *   • cada aplicação vira uma linha no ledger `NotaEntradaEstoqueMov` com o custo
 *     antes/depois — é o que torna aplicar/estornar idempotente e seguro.
 *
 * O histórico de compras (CompraItem, telas Produto/PCP) continua alimentado por
 * aqui quando a entrada tem custo (comCusto=true); no estorno essas linhas são
 * marcadas estornadas junto com o ledger.
 *
 * Estorno (cancelar-conferência / desfazer-entrada): subtrai a quantidade de volta
 * e RESTAURA o custo para o `custoAnterior` — mas só se o custo atual ainda for o
 * `custoPosterior` gravado (se alguém mexeu no meio, o custo fica e sai um aviso).
 */

const round = (v, casas) => {
    const f = 10 ** casas;
    return Math.round(Number(v) * f) / f;
};
const num = (v) => Number(v || 0);

/**
 * Custo médio ponderado sobre o estoque anterior. Função PURA (testável offline).
 * novo = (max(estoqueAnterior,0)·custoAtual + qtd·custoCompra) / (max(estoqueAnterior,0)+qtd)
 * Sem estoque anterior (≤0) ou sem custo atual (null/≤0) → custo da compra direto.
 */
function custoMedioPonderado(estoqueAnterior, custoAtual, qtdEntrada, custoCompra) {
    const est = Math.max(num(estoqueAnterior), 0);
    const atual = num(custoAtual);
    const qtd = num(qtdEntrada);
    if (qtd <= 0) return atual > 0 ? atual : num(custoCompra);
    if (est <= 0 || atual <= 0) return num(custoCompra);
    return round((est * atual + qtd * num(custoCompra)) / (est + qtd), 4);
}

/**
 * Converte os itens vinculados na conferência ([{ itemNota, produtoId, itemPcpId, fator }])
 * para o formato de aplicarEstoqueNota, já com quantidade e custo CONVERTIDOS
 * (quantidade da nota × fator; custo = valor total do item ÷ quantidade convertida).
 */
function montarItensResolvidos(vinculados) {
    return (vinculados || [])
        .filter((v) => v && (v.produtoId || v.itemPcpId))
        .map((v) => {
            const fator = num(v.fator) > 0 ? num(v.fator) : 1;
            const qtd = round(num(v.itemNota.quantidade) * fator, 3);
            return {
                notaEntradaItemId: v.itemNota.id,
                destino: v.produtoId ? 'PROD' : 'PCP',
                produtoId: v.produtoId || null,
                itemPcpId: v.itemPcpId || null,
                quantidadeConvertida: qtd,
                custoUnitarioConvertido: qtd > 0 ? round(num(v.itemNota.valorTotal) / qtd, 6) : null,
                // dados do item da nota para o histórico de compras (CompraItem)
                itemNota: v.itemNota,
                fator
            };
        });
}

// Rótulo curto da nota nas movimentações visíveis ("NF-e 1234 — Fornecedor X")
const rotuloNota = (nota) =>
    `${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${nota.fornecedorNome || 'fornecedor'}`;

/**
 * Aplica as entradas de estoque de uma nota. Roda DENTRO da transação recebida (tx).
 *
 * @param {object} tx               transação Prisma
 * @param {object} nota             NotaEntrada (id, tipo, numero, emissao, fornecedorNome/Cnpj/Id)
 * @param {Array}  itensResolvidos  [{ notaEntradaItemId, destino, produtoId|itemPcpId,
 *                                     quantidadeConvertida, custoUnitarioConvertido, itemNota?, fator? }]
 * @param {object} opts             { comCusto: bool, criadoPorId?: string, contaPagarId?: string }
 * @returns {{ itens: Array<{nome,unidade,quantidade,destino}>, avisos: string[] }}
 *          Idempotente: se a nota já tem linhas ativas no ledger, devolve { itens: [], avisos: [...] }.
 */
async function aplicarEstoqueNota(tx, nota, itensResolvidos, { comCusto = false, criadoPorId = null, contaPagarId = null } = {}) {
    const itens = [];
    const avisos = [];

    // Idempotência: já aplicado (ledger com linhas não estornadas) → não aplica de novo.
    const jaAplicado = await tx.notaEntradaEstoqueMov.count({
        where: { notaEntradaId: nota.id, estornado: false }
    });
    if (jaAplicado > 0) {
        return { itens: [], avisos: ['Esta nota já tinha entrada de estoque aplicada — nada foi somado de novo.'] };
    }

    const observacao = `Entrada ${rotuloNota(nota)}`;

    for (const item of itensResolvidos || []) {
        const qtd = round(num(item.quantidadeConvertida), 3);
        if (qtd <= 0) {
            avisos.push(`Item "${item.itemNota?.descricao || item.notaEntradaItemId}": quantidade convertida zero — entrada pulada.`);
            continue;
        }
        const custoCompra = comCusto && num(item.custoUnitarioConvertido) > 0
            ? round(num(item.custoUnitarioConvertido), 6)
            : null;

        if (item.destino === 'PROD' && item.produtoId) {
            const p = await tx.produto.findUnique({
                where: { id: item.produtoId },
                select: { id: true, nome: true, unidade: true, estoqueTotal: true, estoqueDisponivel: true, custoManual: true }
            });
            if (!p) { avisos.push(`Produto do item "${item.itemNota?.descricao || ''}" não encontrado — entrada pulada.`); continue; }

            const totalAntes = num(p.estoqueTotal);
            const totalDepois = round(totalAntes + qtd, 3);
            const dispDepois = round(num(p.estoqueDisponivel) + qtd, 3);

            // Custo: média ponderada em custoManual (NUNCA custoMedio — esse vem do CA)
            const custoAnterior = p.custoManual != null ? num(p.custoManual) : null;
            let custoPosterior = null;
            const data = { estoqueTotal: totalDepois, estoqueDisponivel: dispDepois };
            if (custoCompra != null) {
                custoPosterior = round(custoMedioPonderado(totalAntes, custoAnterior, qtd, custoCompra), 2);
                data.custoManual = custoPosterior;
            }
            await tx.produto.update({ where: { id: p.id }, data });

            // Movimentação visível (mesmos campos do padrão existente)
            await tx.movimentacaoEstoque.create({
                data: {
                    produtoId: p.id,
                    vendedorId: criadoPorId,
                    tipo: 'ENTRADA',
                    quantidade: qtd,
                    motivo: 'COMPRA',
                    observacao,
                    estoqueAntes: totalAntes,
                    estoqueDepois: totalDepois,
                    sincCA: false,
                    erroCA: null
                }
            });

            // Histórico de compras (tela do produto) — só quando a entrada tem custo
            if (custoCompra != null && item.itemNota) {
                await criarCompraItem(tx, nota, item, p.unidade, qtd, custoCompra, { produtoId: p.id }, contaPagarId);
            }

            await tx.notaEntradaEstoqueMov.create({
                data: {
                    notaEntradaId: nota.id,
                    notaEntradaItemId: item.notaEntradaItemId || null,
                    destino: 'PROD',
                    produtoId: p.id,
                    quantidade: qtd,
                    custoUnitario: custoCompra,
                    custoAnterior: custoCompra != null ? custoAnterior : null,
                    custoPosterior
                }
            });

            // Produto com controle de estoque: recalcula reservado/disponível (reservas de pedidos)
            const estoqueService = require('./estoqueService');
            await estoqueService.recalcularEstoqueProduto(p.id, tx);

            itens.push({ nome: p.nome, unidade: p.unidade, quantidade: qtd, destino: 'PROD' });
        } else if (item.destino === 'PCP' && item.itemPcpId) {
            const i = await tx.itemPcp.findUnique({
                where: { id: item.itemPcpId },
                select: { id: true, nome: true, unidade: true, estoqueAtual: true, custoUnitario: true }
            });
            if (!i) { avisos.push(`Insumo do item "${item.itemNota?.descricao || ''}" não encontrado — entrada pulada.`); continue; }

            const antes = num(i.estoqueAtual);
            const depois = round(antes + qtd, 3);

            const custoAnterior = i.custoUnitario != null ? num(i.custoUnitario) : null;
            let custoPosterior = null;
            const data = { estoqueAtual: depois };
            if (custoCompra != null) {
                custoPosterior = round(custoMedioPonderado(antes, custoAnterior, qtd, custoCompra), 4);
                data.custoUnitario = custoPosterior;
            }
            await tx.itemPcp.update({ where: { id: i.id }, data });

            await tx.movimentacaoPcp.create({
                data: {
                    itemPcpId: i.id,
                    tipo: 'ENTRADA',
                    quantidade: qtd,
                    motivo: 'COMPRA',
                    observacao,
                    estoqueAntes: antes,
                    estoqueDepois: depois,
                    criadoPorId
                }
            });

            if (custoCompra != null && item.itemNota) {
                await criarCompraItem(tx, nota, item, i.unidade, qtd, custoCompra, { itemPcpId: i.id }, contaPagarId);
            }

            await tx.notaEntradaEstoqueMov.create({
                data: {
                    notaEntradaId: nota.id,
                    notaEntradaItemId: item.notaEntradaItemId || null,
                    destino: 'PCP',
                    itemPcpId: i.id,
                    quantidade: qtd,
                    custoUnitario: custoCompra,
                    custoAnterior: custoCompra != null ? custoAnterior : null,
                    custoPosterior
                }
            });

            itens.push({ nome: i.nome, unidade: i.unidade, quantidade: qtd, destino: 'PCP' });
        }
    }

    return { itens, avisos };
}

// Linha do histórico de compras (CompraItem) — mesmo formato da Fase 6 antiga,
// para as telas de histórico do Produto/insumo continuarem completas.
async function criarCompraItem(tx, nota, item, unidadeNossa, qtd, custoCompra, alvo, contaPagarId) {
    const it = item.itemNota;
    await tx.compraItem.create({
        data: {
            notaEntradaId: nota.id,
            contaPagarId: contaPagarId || nota.contaPagarId || null,
            produtoId: alvo.produtoId || null,
            itemPcpId: alvo.itemPcpId || null,
            fornecedorId: nota.fornecedorId || null,
            fornecedorNome: nota.fornecedorNome || 'Fornecedor',
            fornecedorCnpj: nota.fornecedorCnpj || null,
            numeroNota: nota.numero || null,
            dataCompra: nota.emissao || new Date(),
            descricaoFornecedor: it.descricao,
            quantidadeFornecedor: num(it.quantidade),
            unidadeFornecedor: it.unidade || unidadeNossa || 'UN',
            fatorConversao: num(item.fator) > 0 ? num(item.fator) : 1,
            quantidade: qtd,
            unidade: unidadeNossa || it.unidade || 'UN',
            valorTotal: round(num(it.valorTotal), 2),
            custoUnitario: custoCompra
        }
    });
}

// Custos batem? (tolerância de meio centavo/décimo de milésimo, por arredondamento de Decimal)
const custoIgual = (a, b, casas) => a != null && b != null && Math.abs(num(a) - num(b)) < (0.5 / 10 ** casas) + 1e-9;

/**
 * Estorna TODAS as entradas ativas do ledger de uma nota (dentro da transação tx):
 * subtrai a quantidade de volta, restaura o custo para `custoAnterior` (apenas se o
 * custo atual ainda for o `custoPosterior` gravado), cria a movimentação de saída e
 * marca as linhas (ledger + histórico de compras) como estornadas.
 *
 * @returns {{ estornadas: number, avisos: string[] }}
 */
async function estornarEstoqueNota(tx, notaId, { criadoPorId = null } = {}) {
    const avisos = [];
    const linhas = await tx.notaEntradaEstoqueMov.findMany({
        where: { notaEntradaId: notaId, estornado: false },
        orderBy: { criadoEm: 'asc' }
    });
    if (linhas.length === 0) return { estornadas: 0, avisos };

    const nota = await tx.notaEntrada.findUnique({
        where: { id: notaId },
        select: { id: true, tipo: true, numero: true, fornecedorNome: true }
    });
    const observacao = `Estorno entrada ${rotuloNota(nota || { tipo: 'NFE' })}`;

    let estornadas = 0;
    for (const mov of linhas) {
        const qtd = num(mov.quantidade);

        if (mov.destino === 'PROD' && mov.produtoId) {
            const p = await tx.produto.findUnique({
                where: { id: mov.produtoId },
                select: { id: true, nome: true, estoqueTotal: true, estoqueDisponivel: true, custoManual: true }
            });
            if (!p) { avisos.push('Produto de uma das entradas não existe mais — estorno da quantidade pulado.'); continue; }

            const totalAntes = num(p.estoqueTotal);
            const totalDepois = round(totalAntes - qtd, 3);
            const data = {
                estoqueTotal: totalDepois,
                estoqueDisponivel: round(num(p.estoqueDisponivel) - qtd, 3)
            };
            if (mov.custoPosterior != null) {
                if (custoIgual(p.custoManual, mov.custoPosterior, 2)) {
                    data.custoManual = mov.custoAnterior != null ? round(num(mov.custoAnterior), 2) : null;
                } else {
                    avisos.push(`"${p.nome}": o custo mudou depois desta entrada — quantidade estornada, custo mantido (confira o Custo Manual).`);
                }
            }
            await tx.produto.update({ where: { id: p.id }, data });

            await tx.movimentacaoEstoque.create({
                data: {
                    produtoId: p.id,
                    vendedorId: criadoPorId,
                    tipo: 'SAIDA',
                    quantidade: qtd,
                    motivo: 'ESTORNO_COMPRA',
                    observacao,
                    estoqueAntes: totalAntes,
                    estoqueDepois: totalDepois,
                    sincCA: false,
                    erroCA: null
                }
            });

            const estoqueService = require('./estoqueService');
            await estoqueService.recalcularEstoqueProduto(p.id, tx);
        } else if (mov.destino === 'PCP' && mov.itemPcpId) {
            const i = await tx.itemPcp.findUnique({
                where: { id: mov.itemPcpId },
                select: { id: true, nome: true, estoqueAtual: true, custoUnitario: true }
            });
            if (!i) { avisos.push('Insumo de uma das entradas não existe mais — estorno da quantidade pulado.'); continue; }

            const antes = num(i.estoqueAtual);
            const depois = round(antes - qtd, 3);
            const data = { estoqueAtual: depois };
            if (mov.custoPosterior != null) {
                if (custoIgual(i.custoUnitario, mov.custoPosterior, 4)) {
                    data.custoUnitario = mov.custoAnterior != null ? round(num(mov.custoAnterior), 4) : null;
                } else {
                    avisos.push(`"${i.nome}": o custo mudou depois desta entrada — quantidade estornada, custo mantido (confira o custo unitário no PCP).`);
                }
            }
            await tx.itemPcp.update({ where: { id: i.id }, data });

            await tx.movimentacaoPcp.create({
                data: {
                    itemPcpId: i.id,
                    tipo: 'SAIDA',
                    quantidade: qtd,
                    motivo: 'ESTORNO_COMPRA',
                    observacao,
                    estoqueAntes: antes,
                    estoqueDepois: depois,
                    criadoPorId
                }
            });
        }

        await tx.notaEntradaEstoqueMov.update({
            where: { id: mov.id },
            data: { estornado: true, estornadoEm: new Date() }
        });
        estornadas++;
    }

    // Histórico de compras criado por este fluxo sai junto (marcado, nunca apagado).
    // Notas antigas (Fase 6, sem ledger) não passam por aqui — o estorno legado
    // do compraEstoqueService continua cuidando delas.
    await tx.compraItem.updateMany({
        where: { notaEntradaId: notaId, estornado: false },
        data: { estornado: true, estornadoEm: new Date() }
    });

    return { estornadas, avisos };
}

/** A nota tem entrada de estoque ATIVA (aplicada e não estornada)? */
async function estoqueAplicado(db, notaId) {
    const n = await db.notaEntradaEstoqueMov.count({
        where: { notaEntradaId: notaId, estornado: false }
    });
    return n > 0;
}

module.exports = {
    aplicarEstoqueNota,
    estornarEstoqueNota,
    montarItensResolvidos,
    estoqueAplicado,
    // pura (testável offline)
    custoMedioPonderado
};
