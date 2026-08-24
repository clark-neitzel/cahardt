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
 *
 * NOTAS ANTIGAS (conferidas ANTES do ledger, até 27/07/2026) — 08/2026: essas notas
 * têm a entrada gravada só no formato antigo (CompraItem, Fase 6) e por isso não
 * apareciam como "estoque somado", o que escondia o botão de corrigir. Agora
 * `entradaAplicada` cai para o CompraItem quando o ledger está vazio, e
 * `estornarEstoqueNota` sabe estornar esse formato antigo DENTRO da transação — assim
 * a correção funciona igual nas notas velhas, que passam a ter ledger depois de
 * corrigidas. O CompraItem antigo não guarda o custo de antes/depois: quem chama
 * refaz o custo pelo histórico de compras válidas (é o mesmo que o estorno legado fazia).
 *
 * CORREÇÃO (corrigirEstoqueNota) — 08/2026: conferência com produto/conversão errados
 * não obriga mais a cancelar a despesa. `corrigirEstoqueNota` estorna o ledger e
 * reaplica com os vínculos certos DENTRO da mesma transação, sem encostar em
 * ContaPagar/parcelas/pagamentos. O VALOR nunca vem do formulário — quantidade e
 * custo saem sempre de `itemNota.quantidade`/`itemNota.valorTotal` (o que está no
 * XML), então corrigir a conversão só redistribui o MESMO dinheiro pela quantidade
 * certa. Quando a nota tem custo, o chamador ainda recalcula a média pelo histórico
 * de compras válidas DEPOIS do commit (compraEstoqueService.recalcularCustoPelasCompras)
 * — o "restaurar custoAnterior" do estorno não basta quando houve compras no meio.
 */

// Miolo do custo (regra nova: compras VÁLIDAS recentes que cobrem o estoque). É a home
// real de `recalcularCustoAlvo` (compraEstoqueService só o re-exporta). Requerer aqui não
// cria ciclo: custoCompraCalculo só depende de prisma + estoqueService.
const custoCompraCalculo = require('./custoCompraCalculo');

const round = (v, casas) => {
    const f = 10 ** casas;
    return Math.round(Number(v) * f) / f;
};
const num = (v) => Number(v || 0);

/**
 * legado — não usar em custo novo. Custo médio ponderado sobre o estoque anterior.
 * Mantido exportado por compatibilidade (testes antigos). O custo real agora sai do
 * recompute pela regra das compras válidas recentes (custoCompraCalculo).
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
async function aplicarEstoqueNota(tx, nota, itensResolvidos, { comCusto = false, criadoPorId = null, contaPagarId = null, correcao = false } = {}) {
    const itens = [];
    const avisos = [];

    // Idempotência: já aplicado (ledger com linhas não estornadas) → não aplica de novo.
    const jaAplicado = await tx.notaEntradaEstoqueMov.count({
        where: { notaEntradaId: nota.id, estornado: false }
    });
    if (jaAplicado > 0) {
        return { itens: [], avisos: ['Esta nota já tinha entrada de estoque aplicada — nada foi somado de novo.'] };
    }

    const observacao = correcao ? `Correção da entrada ${rotuloNota(nota)}` : `Entrada ${rotuloNota(nota)}`;

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

            // Custo (custoManual — NUNCA custoMedio, esse vem do CA) NÃO é mais decidido aqui:
            // sai do recompute pela regra nova (compras válidas recentes que cobrem o estoque),
            // rodado DEPOIS da entrada de estoque + criação do CompraItem.
            const custoAnterior = p.custoManual != null ? num(p.custoManual) : null;
            let custoPosterior = null;
            await tx.produto.update({ where: { id: p.id }, data: { estoqueTotal: totalDepois, estoqueDisponivel: dispDepois } });

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
            let compraCriada = null;
            if (custoCompra != null && item.itemNota) {
                compraCriada = await criarCompraItem(tx, nota, item, p.unidade, qtd, custoCompra, { produtoId: p.id }, contaPagarId, {
                    estoqueAnterior: totalAntes, custoAnterior, custoPosterior: null
                });
            }

            // Produto com controle de estoque: recalcula reservado/disponível (reservas de pedidos)
            const estoqueService = require('./estoqueService');
            await estoqueService.recalcularEstoqueProduto(p.id, tx);

            // Custo pela regra nova, DEPOIS da entrada (o CompraItem já existe e o estoque já
            // foi somado). Grava custoManual e completa o retrato do CompraItem/ledger.
            if (custoCompra != null) {
                const rc = await custoCompraCalculo.recalcularCustoAlvo({ produtoId: p.id }, tx);
                if (rc.motivo === 'ok') {
                    custoPosterior = rc.custo;
                    if (compraCriada) await tx.compraItem.update({ where: { id: compraCriada.id }, data: { custoPosterior } });
                }
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

            itens.push({ nome: p.nome, unidade: p.unidade, quantidade: qtd, destino: 'PROD' });
        } else if (item.destino === 'PCP' && item.itemPcpId) {
            const i = await tx.itemPcp.findUnique({
                where: { id: item.itemPcpId },
                select: { id: true, nome: true, unidade: true, estoqueAtual: true, custoUnitario: true }
            });
            if (!i) { avisos.push(`Insumo do item "${item.itemNota?.descricao || ''}" não encontrado — entrada pulada.`); continue; }

            const antes = num(i.estoqueAtual);
            const depois = round(antes + qtd, 3);

            // Custo NÃO é decidido aqui — vem do recompute pela regra nova, após a entrada.
            const custoAnterior = i.custoUnitario != null ? num(i.custoUnitario) : null;
            let custoPosterior = null;
            await tx.itemPcp.update({ where: { id: i.id }, data: { estoqueAtual: depois } });

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

            let compraCriada = null;
            if (custoCompra != null && item.itemNota) {
                compraCriada = await criarCompraItem(tx, nota, item, i.unidade, qtd, custoCompra, { itemPcpId: i.id }, contaPagarId, {
                    estoqueAnterior: antes, custoAnterior, custoPosterior: null
                });
            }

            // Custo pela regra nova, DEPOIS da entrada. Grava custoUnitario e completa o retrato.
            if (custoCompra != null) {
                const rc = await custoCompraCalculo.recalcularCustoAlvo({ itemPcpId: i.id }, tx);
                if (rc.motivo === 'ok') {
                    custoPosterior = rc.custo;
                    if (compraCriada) await tx.compraItem.update({ where: { id: compraCriada.id }, data: { custoPosterior } });
                }
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
// `snapshot` = { estoqueAnterior, custoAnterior, custoPosterior } do alvo nesta entrada:
// é o que permite ao estorno das COMPRAS (compraEstoqueService) devolver o custo exato
// e ao replay começar do saldo certo, sem depender só do ledger da nota.
async function criarCompraItem(tx, nota, item, unidadeNossa, qtd, custoCompra, alvo, contaPagarId, snapshot = {}) {
    const it = item.itemNota;
    return tx.compraItem.create({
        data: {
            estoqueAnterior: snapshot.estoqueAnterior != null ? snapshot.estoqueAnterior : null,
            custoAnterior: snapshot.custoAnterior != null ? snapshot.custoAnterior : null,
            custoPosterior: snapshot.custoPosterior != null ? snapshot.custoPosterior : null,
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
 * Nota SEM ledger (conferida antes de 27/07/2026): cai no estorno do formato antigo
 * (CompraItem), na mesma transação — ver `estornarEstoqueLegado`.
 *
 * @returns {{ estornadas: number, avisos: string[], legado: boolean,
 *             alvos: { produtoIds: string[], itemPcpIds: string[] } }}
 */
async function estornarEstoqueNota(tx, notaId, { criadoPorId = null, correcao = false } = {}) {
    const avisos = [];
    const linhas = await tx.notaEntradaEstoqueMov.findMany({
        where: { notaEntradaId: notaId, estornado: false },
        orderBy: { criadoEm: 'asc' }
    });

    const nota = await tx.notaEntrada.findUnique({
        where: { id: notaId },
        select: { id: true, tipo: true, numero: true, fornecedorNome: true }
    });

    // Nota antiga: nada no ledger, entrada só no histórico de compras (Fase 6).
    if (linhas.length === 0) {
        return estornarEstoqueLegado(tx, nota || { id: notaId, tipo: 'NFE' }, { criadoPorId, correcao });
    }

    const rotulo = rotuloNota(nota || { tipo: 'NFE' });
    const observacao = correcao ? `Correção — retirada do lançamento errado ${rotulo}` : `Estorno entrada ${rotulo}`;

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
            // Só devolve a QUANTIDADE. O custo NÃO é restaurado aqui — quem chama o refaz
            // pela regra nova (compras válidas recentes que cobrem o estoque).
            await tx.produto.update({
                where: { id: p.id },
                data: {
                    estoqueTotal: totalDepois,
                    estoqueDisponivel: round(num(p.estoqueDisponivel) - qtd, 3)
                }
            });

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
            // Só devolve a QUANTIDADE. O custo é refeito pela regra nova por quem chama.
            await tx.itemPcp.update({ where: { id: i.id }, data: { estoqueAtual: depois } });

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
    // Notas antigas (Fase 6, sem ledger) não passam por aqui — quem cuida delas é
    // `estornarEstoqueLegado`, chamado lá em cima quando o ledger está vazio.
    await tx.compraItem.updateMany({
        where: { notaEntradaId: notaId, estornado: false },
        data: { estornado: true, estornadoEm: new Date() }
    });

    const alvos = { produtoIds: [], itemPcpIds: [] };
    for (const mov of linhas) {
        if (mov.destino === 'PROD' && mov.produtoId) alvos.produtoIds.push(mov.produtoId);
        else if (mov.destino === 'PCP' && mov.itemPcpId) alvos.itemPcpIds.push(mov.itemPcpId);
    }

    return { estornadas, avisos, legado: false, alvos };
}

/**
 * Estorna a entrada de uma nota do fluxo ANTIGO (conferida antes do ledger, até
 * 27/07/2026): a entrada existe só como linhas ativas de `CompraItem`.
 *
 * Diferenças em relação ao ledger, todas herdadas de como aquele fluxo lançava:
 *   • produto que NÃO controla estoque nunca teve quantidade lançada — aqui só o
 *     histórico é marcado estornado, sem tirar quantidade que nunca entrou;
 *   • não existe custo "antes/depois" gravado, então o custo NÃO é restaurado aqui —
 *     quem chama refaz pelo histórico de compras válidas (`alvos` diz quais refazer).
 *
 * @returns {{ estornadas: number, avisos: string[], legado: true,
 *             alvos: { produtoIds: string[], itemPcpIds: string[] } }}
 */
async function estornarEstoqueLegado(tx, nota, { criadoPorId = null, correcao = false } = {}) {
    const avisos = [];
    const alvos = { produtoIds: [], itemPcpIds: [] };
    const compras = await tx.compraItem.findMany({
        where: { notaEntradaId: nota.id, estornado: false },
        orderBy: { criadoEm: 'asc' }
    });
    if (compras.length === 0) return { estornadas: 0, avisos, legado: true, alvos };

    const rotulo = rotuloNota(nota);
    const observacao = correcao ? `Correção — retirada do lançamento errado ${rotulo}` : `Estorno entrada ${rotulo}`;
    const estoqueService = require('./estoqueService');
    const produtoIds = new Set();
    const itemPcpIds = new Set();

    let estornadas = 0;
    for (const c of compras) {
        const qtd = round(num(c.quantidade), 3);

        if (c.produtoId) {
            const p = await tx.produto.findUnique({
                where: { id: c.produtoId },
                select: {
                    id: true, nome: true, estoqueTotal: true, estoqueDisponivel: true,
                    categoria: true, controlaEstoque: true
                }
            });
            if (!p) { avisos.push('Produto de uma das entradas antigas não existe mais — estorno da quantidade pulado.'); continue; }

            // No fluxo antigo, produto sem controle de estoque só teve o CUSTO atualizado.
            const controla = await estoqueService.produtoControlaEstoque(p, tx);
            if (controla && qtd > 0) {
                const totalAntes = num(p.estoqueTotal);
                const totalDepois = round(totalAntes - qtd, 3);
                await tx.produto.update({
                    where: { id: p.id },
                    data: {
                        estoqueTotal: totalDepois,
                        estoqueDisponivel: round(num(p.estoqueDisponivel) - qtd, 3)
                    }
                });
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
                await estoqueService.recalcularEstoqueProduto(p.id, tx);
            }
            produtoIds.add(p.id);
        } else if (c.itemPcpId) {
            const i = await tx.itemPcp.findUnique({
                where: { id: c.itemPcpId },
                select: { id: true, nome: true, estoqueAtual: true }
            });
            if (!i) { avisos.push('Insumo de uma das entradas antigas não existe mais — estorno da quantidade pulado.'); continue; }

            if (qtd > 0) {
                const antes = num(i.estoqueAtual);
                const depois = round(antes - qtd, 3);
                await tx.itemPcp.update({ where: { id: i.id }, data: { estoqueAtual: depois } });
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
            itemPcpIds.add(i.id);
        }

        await tx.compraItem.update({
            where: { id: c.id },
            data: { estornado: true, estornadoEm: new Date() }
        });
        estornadas++;
    }

    return {
        estornadas,
        avisos,
        legado: true,
        alvos: { produtoIds: [...produtoIds], itemPcpIds: [...itemPcpIds] }
    };
}

/** A nota tem entrada de estoque ATIVA (ledger novo OU histórico antigo não estornado)? */
async function estoqueAplicado(db, notaId) {
    const n = await db.notaEntradaEstoqueMov.count({
        where: { notaEntradaId: notaId, estornado: false }
    });
    if (n > 0) return true;
    const legado = await db.compraItem.count({
        where: { notaEntradaId: notaId, estornado: false }
    });
    return legado > 0;
}

/**
 * O que esta nota tem HOJE somado no estoque (linhas ativas do ledger), já com o
 * nome do produto/insumo. É o que a tela de correção mostra como "está assim" —
 * NÃO usar a memória do de-para (FornecedorProdutoVinculo), que pode ter sido
 * alterada por uma nota posterior do mesmo fornecedor.
 */
async function entradaAplicada(db, notaId) {
    const linhas = await db.notaEntradaEstoqueMov.findMany({
        where: { notaEntradaId: notaId, estornado: false },
        orderBy: { criadoEm: 'asc' },
        include: {
            produto: { select: { id: true, nome: true, unidade: true } },
            itemPcp: { select: { id: true, nome: true, unidade: true } }
        }
    });
    // Nota antiga (antes de 27/07/2026): sem ledger, mas com entrada no histórico de compras.
    if (linhas.length === 0) return entradaLegado(db, notaId);

    return linhas.map((m) => ({
        notaEntradaItemId: m.notaEntradaItemId,
        destino: m.destino,
        vinculo: m.produtoId ? `PROD:${m.produtoId}` : (m.itemPcpId ? `PCP:${m.itemPcpId}` : null),
        nome: m.produto?.nome || m.itemPcp?.nome || null,
        unidade: m.produto?.unidade || m.itemPcp?.unidade || null,
        quantidade: num(m.quantidade),
        custoUnitario: m.custoUnitario != null ? num(m.custoUnitario) : null,
        legado: false
    }));
}

/**
 * O mesmo retrato de `entradaAplicada`, montado a partir do formato ANTIGO
 * (CompraItem ativo), para as notas conferidas antes do ledger.
 *
 * O CompraItem não guarda o id do item da nota — o vínculo é refeito pela descrição
 * do item (`descricaoFornecedor` = xProd, a mesma chave que o fluxo antigo usava para
 * não duplicar), com a quantidade da nota como desempate quando a descrição repete.
 */
async function entradaLegado(db, notaId) {
    const compras = await db.compraItem.findMany({
        where: { notaEntradaId: notaId, estornado: false },
        orderBy: { criadoEm: 'asc' },
        include: {
            produto: { select: { id: true, nome: true, unidade: true } },
            itemPcp: { select: { id: true, nome: true, unidade: true } }
        }
    });
    if (compras.length === 0) return [];

    const itens = await db.notaEntradaItem.findMany({
        where: { notaEntradaId: notaId },
        select: { id: true, descricao: true, quantidade: true },
        orderBy: { numeroItem: 'asc' }
    });
    const usados = new Set();
    const casarItem = (c) => {
        const porDescricao = itens.find((i) => !usados.has(i.id) && i.descricao === c.descricaoFornecedor);
        const achado = porDescricao
            || itens.find((i) => !usados.has(i.id) && Math.abs(num(i.quantidade) - num(c.quantidadeFornecedor)) < 0.0001);
        if (achado) usados.add(achado.id);
        return achado?.id || null;
    };

    return compras.map((c) => ({
        notaEntradaItemId: casarItem(c),
        destino: c.produtoId ? 'PROD' : 'PCP',
        vinculo: c.produtoId ? `PROD:${c.produtoId}` : (c.itemPcpId ? `PCP:${c.itemPcpId}` : null),
        nome: c.produto?.nome || c.itemPcp?.nome || null,
        unidade: c.produto?.unidade || c.itemPcp?.unidade || c.unidade || null,
        quantidade: num(c.quantidade),
        custoUnitario: c.custoUnitario != null ? num(c.custoUnitario) : null,
        legado: true // entrada do fluxo antigo — vira ledger assim que a nota for corrigida
    }));
}

/**
 * CORRIGE a entrada de estoque de uma nota já lançada: estorna o ledger ativo e
 * reaplica com os vínculos/fatores novos, na MESMA transação. Não encosta em
 * ContaPagar, parcelas nem pagamentos — o financeiro fica exatamente como está.
 *
 * O valor NUNCA vem do formulário: `itensResolvidos` é montado por
 * `montarItensResolvidos` a partir do próprio item da nota (quantidade × fator e
 * valorTotal ÷ quantidade convertida). Mudar o fator só redistribui o mesmo
 * dinheiro por outra quantidade.
 *
 * @returns {{ antes: Array, depois: Array, avisos: string[], alvos: {produtoIds: string[], itemPcpIds: string[]} }}
 *          `alvos` = produtos/insumos tocados (antes OU depois) — o chamador recalcula
 *          o custo deles pelo histórico de compras DEPOIS do commit.
 */
async function corrigirEstoqueNota(tx, nota, itensResolvidos, { comCusto = false, criadoPorId = null, contaPagarId = null } = {}) {
    const antes = await entradaAplicada(tx, nota.id);

    const estorno = await estornarEstoqueNota(tx, nota.id, { criadoPorId, correcao: true });
    const aplicacao = await aplicarEstoqueNota(tx, nota, itensResolvidos, {
        comCusto,
        criadoPorId,
        contaPagarId,
        correcao: true
    });

    const depois = await entradaAplicada(tx, nota.id);

    // Alvos tocados dos DOIS lados (o produto que saiu também precisa ter o custo refeito).
    const produtoIds = new Set();
    const itemPcpIds = new Set();
    for (const l of [...antes, ...depois]) {
        if (l.destino === 'PROD' && l.vinculo) produtoIds.add(l.vinculo.slice(5));
        else if (l.destino === 'PCP' && l.vinculo) itemPcpIds.add(l.vinculo.slice(4));
    }

    return {
        antes,
        depois,
        estornadas: estorno.estornadas,
        avisos: [...estorno.avisos, ...aplicacao.avisos],
        alvos: { produtoIds: [...produtoIds], itemPcpIds: [...itemPcpIds] }
    };
}

module.exports = {
    aplicarEstoqueNota,
    estornarEstoqueNota,
    estornarEstoqueLegado,
    corrigirEstoqueNota,
    montarItensResolvidos,
    estoqueAplicado,
    entradaAplicada,
    entradaLegado,
    // pura (testável offline)
    custoMedioPonderado
};
