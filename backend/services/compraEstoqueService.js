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
 * Cancelar a conferência ESTORNA: saída de estoque (motivo ESTORNO_COMPRA), a
 * linha do histórico é marcada estornado=true (nunca apagada) e o CUSTO é
 * RECALCULADO pela média ponderada das compras válidas restantes — corrigir o
 * lançamento corrige o custo sozinho (decisão de 07/2026).
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
 * Núcleo compartilhado: registra as entradas de estoque/custo/histórico de compras.
 * Usado pela conferência de nota (registrarEntradasCompra) e pela despesa manual
 * com produtos (registrarComprasManuais).
 *
 * @param {object} origem    { notaEntradaId?, contaPagarId?, fornecedorId?, fornecedorNome,
 *                             fornecedorCnpj?, numeroNota?, dataCompra, observacaoMov }
 * @param {Array}  entradas  [{ descricao, quantidadeFornecedor, unidadeFornecedor?, fator,
 *                             produtoId?, itemPcpId?, valorTotal }]
 * @param {string} criadoPorId
 * @returns {{ registradas: number, avisos: string[] }}
 */
async function registrarCompras(origem, entradas, criadoPorId) {
    let registradas = 0;
    const avisos = [];

    for (const e of entradas) {
        const { produtoId, itemPcpId } = e;
        if (!produtoId && !itemPcpId) continue;
        const fator = num(e.fator) > 0 ? num(e.fator) : 1;

        try {
            const qtdFornecedor = num(e.quantidadeFornecedor);
            const quantidade = round(qtdFornecedor * fator, 3);
            const valorTotal = num(e.valorTotal);
            if (quantidade <= 0) {
                avisos.push(`Item "${e.descricao}": quantidade convertida zero — entrada de estoque pulada.`);
                continue;
            }
            const custoUnitario = round(valorTotal / quantidade, 6);

            // Idempotência: se já existe compra ATIVA desta origem para este item, pula
            // (reconferência após cancelar gera novo registro porque o antigo fica estornado).
            const chaveOrigem = origem.notaEntradaId
                ? { notaEntradaId: origem.notaEntradaId }
                : { contaPagarId: origem.contaPagarId, notaEntradaId: null };
            const jaExiste = await prisma.compraItem.findFirst({
                where: {
                    ...chaveOrigem,
                    estornado: false,
                    descricaoFornecedor: e.descricao,
                    produtoId: produtoId || null,
                    itemPcpId: itemPcpId || null
                },
                select: { id: true }
            });
            if (jaExiste) continue;

            // Alvo (para unidade e custo atual)
            let unidadeNossa = e.unidadeFornecedor;
            if (produtoId) {
                const p = await prisma.produto.findUnique({
                    where: { id: produtoId },
                    select: { nome: true, unidade: true, estoqueTotal: true, custoManual: true, categoria: true, controlaEstoque: true }
                });
                if (!p) { avisos.push(`Produto do item "${e.descricao}" não encontrado.`); continue; }
                unidadeNossa = p.unidade || unidadeNossa;
                // Produto que NÃO controla estoque: registra a compra e atualiza o custo,
                // mas não movimenta quantidade.
                const controla = await estoqueService.produtoControlaEstoque(p);

                await prisma.compraItem.create({
                    data: {
                        notaEntradaId: origem.notaEntradaId || null,
                        contaPagarId: origem.contaPagarId || null,
                        produtoId,
                        fornecedorId: origem.fornecedorId || null,
                        fornecedorNome: origem.fornecedorNome,
                        fornecedorCnpj: origem.fornecedorCnpj || null,
                        numeroNota: origem.numeroNota || null,
                        dataCompra: origem.dataCompra || new Date(),
                        descricaoFornecedor: e.descricao,
                        quantidadeFornecedor: qtdFornecedor,
                        unidadeFornecedor: e.unidadeFornecedor || unidadeNossa,
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
                        observacao: origem.observacaoMov
                    });
                }

                // Custo: SEMPRE atualizado. Com controle de estoque, média ponderada com o
                // saldo anterior; sem controle, o custo passa a ser o da última compra.
                // (custo do CA não entra mais na conta — decisão de 07/2026)
                const custoAtual = num(p.custoManual);
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
                if (!i) { avisos.push(`Insumo do item "${e.descricao}" não encontrado.`); continue; }
                unidadeNossa = i.unidade || unidadeNossa;

                await prisma.compraItem.create({
                    data: {
                        notaEntradaId: origem.notaEntradaId || null,
                        contaPagarId: origem.contaPagarId || null,
                        itemPcpId,
                        fornecedorId: origem.fornecedorId || null,
                        fornecedorNome: origem.fornecedorNome,
                        fornecedorCnpj: origem.fornecedorCnpj || null,
                        numeroNota: origem.numeroNota || null,
                        dataCompra: origem.dataCompra || new Date(),
                        descricaoFornecedor: e.descricao,
                        quantidadeFornecedor: qtdFornecedor,
                        unidadeFornecedor: e.unidadeFornecedor || unidadeNossa,
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
                    observacao: origem.observacaoMov,
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
            console.error(`[CompraEstoque] Falha na entrada do item "${e?.descricao}":`, err.message);
            avisos.push(`Item "${e?.descricao}": falha na entrada de estoque (${err.message}). Ajuste manualmente se necessário.`);
        }
    }

    return { registradas, avisos };
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
    const origem = {
        notaEntradaId: nota.id,
        contaPagarId,
        fornecedorId: nota.fornecedorId || null,
        fornecedorNome: nota.fornecedorNome,
        fornecedorCnpj: nota.fornecedorCnpj || null,
        numeroNota: nota.numero,
        dataCompra: nota.emissao || new Date(),
        observacaoMov: `Compra ${nota.tipo === 'NFSE' ? 'NFS-e' : 'NF-e'} ${nota.numero || 's/nº'} — ${nota.fornecedorNome}`
    };
    return registrarCompras(
        origem,
        entradas.map((e) => ({
            descricao: e.itemNota.descricao,
            quantidadeFornecedor: e.itemNota.quantidade,
            unidadeFornecedor: e.itemNota.unidade,
            valorTotal: e.itemNota.valorTotal,
            fator: e.fator,
            produtoId: e.produtoId || null,
            itemPcpId: e.itemPcpId || null
        })),
        criadoPorId
    );
}

/**
 * Registra as compras de uma despesa MANUAL (sem nota fiscal): produtos escolhidos
 * na tela de Nova Despesa. Quantidade já vem na NOSSA unidade (fator 1).
 * @param {object} conta      ContaPagar criada (id, numeroNota, competencia)
 * @param {object} fornecedor Fornecedor da conta (ou null)
 * @param {Array}  itens      [{ descricao, quantidade, unidade?, valorTotal, produtoId?, itemPcpId? }]
 * @param {string} criadoPorId
 * @returns {{ registradas: number, avisos: string[] }}
 */
async function registrarComprasManuais(conta, fornecedor, itens, criadoPorId) {
    const nomeFornecedor = fornecedor?.razaoSocial || fornecedor?.nomeFantasia || 'Sem fornecedor';
    const origem = {
        notaEntradaId: null,
        contaPagarId: conta.id,
        fornecedorId: fornecedor?.id || null,
        fornecedorNome: nomeFornecedor,
        fornecedorCnpj: fornecedor?.cnpjCpf || null,
        numeroNota: conta.numeroNota || null,
        dataCompra: new Date(),
        observacaoMov: `Compra (despesa manual) — ${nomeFornecedor}`
    };
    return registrarCompras(
        origem,
        itens.map((it) => ({
            descricao: it.descricao,
            quantidadeFornecedor: it.quantidade,
            unidadeFornecedor: it.unidade || null,
            valorTotal: it.valorTotal,
            fator: 1,
            produtoId: it.produtoId || null,
            itemPcpId: it.itemPcpId || null
        })),
        criadoPorId
    );
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
    return estornarCompras(compras, criadoPorId);
}

/**
 * Estorna as compras de uma despesa MANUAL cancelada (só as sem nota — as de nota
 * são estornadas pelo cancelar-conferência da própria nota).
 */
async function estornarEntradasConta(contaPagarId, criadoPorId) {
    const compras = await prisma.compraItem.findMany({
        where: { contaPagarId, notaEntradaId: null, estornado: false }
    });
    return estornarCompras(compras, criadoPorId);
}

async function estornarCompras(compras, criadoPorId) {
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

    // Recalcula o custo dos alvos afetados pelas compras válidas restantes — assim,
    // cancelar uma conferência errada corrige o custo sozinho (decisão de 07/2026).
    const produtoIds = [...new Set(compras.map((c) => c.produtoId).filter(Boolean))];
    const itemPcpIds = [...new Set(compras.map((c) => c.itemPcpId).filter(Boolean))];
    for (const produtoId of produtoIds) {
        try {
            const novo = await recalcularCustoPelasCompras({ produtoId });
            if (novo != null) avisos.push(`Custo do produto recalculado pelas compras válidas: R$ ${novo.toFixed(2)}.`);
        } catch (err) {
            console.error(`[CompraEstoque] Falha ao recalcular custo do produto ${produtoId}:`, err.message);
            avisos.push('Não foi possível recalcular o custo do produto — confira o campo Custo Manual.');
        }
    }
    for (const itemPcpId of itemPcpIds) {
        try {
            await recalcularCustoPelasCompras({ itemPcpId });
        } catch (err) {
            console.error(`[CompraEstoque] Falha ao recalcular custo do insumo ${itemPcpId}:`, err.message);
            avisos.push('Não foi possível recalcular o custo do insumo — confira o custo unitário no PCP.');
        }
    }

    return { estornadas, avisos };
}

/**
 * Recalcula o custo de um produto/insumo reaplicando a média ponderada sobre o
 * histórico de compras VÁLIDAS (não estornadas), em ordem cronológica.
 * Usado após um estorno, para o lançamento cancelado sair da média.
 * Sem nenhuma compra válida restante, o custo atual é mantido (não zera —
 * pode ter sido digitado à mão) e a função devolve null.
 * @returns {number|null} novo custo aplicado, ou null se nada mudou
 */
async function recalcularCustoPelasCompras({ produtoId, itemPcpId }) {
    const where = { estornado: false };
    if (produtoId) where.produtoId = produtoId;
    else if (itemPcpId) where.itemPcpId = itemPcpId;
    else return null;

    const compras = await prisma.compraItem.findMany({
        where,
        orderBy: [{ dataCompra: 'asc' }, { criadoEm: 'asc' }],
        select: { quantidade: true, custoUnitario: true }
    });
    if (compras.length === 0) return null;

    let est = 0;
    let custo = 0;
    for (const c of compras) {
        const qtd = num(c.quantidade);
        if (qtd <= 0) continue;
        custo = custoMedioPonderado(est, custo, qtd, num(c.custoUnitario));
        est += qtd;
    }
    if (!(custo > 0)) return null;

    if (produtoId) {
        const novo = round(custo, 2);
        await prisma.produto.update({ where: { id: produtoId }, data: { custoManual: novo } });
        return novo;
    }
    const novo = round(custo, 4);
    await prisma.itemPcp.update({ where: { id: itemPcpId }, data: { custoUnitario: novo } });
    return novo;
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
    registrarComprasManuais,
    estornarEntradasNota,
    estornarEntradasConta,
    historicoCompras,
    recalcularCustoPelasCompras,
    // pura (testável offline)
    custoMedioPonderado
};
