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
// Miolo do custo (regra nova: compras VÁLIDAS recentes que cobrem o estoque). Este módulo
// requer o custoCompraCalculo — nunca o contrário (o custoCompraCalculo é a base, sem ciclo).
const custoCompraCalculo = require('./custoCompraCalculo');

const round = (v, casas) => {
    const f = 10 ** casas;
    return Math.round(Number(v) * f) / f;
};
const num = (v) => Number(v || 0);

// Custos batem? (tolerância de meio dígito da casa, por arredondamento de Decimal)
// Mesmo critério de notaEstoqueService.custoIgual.
const custoIgual = (a, b, casas) => a != null && b != null && Math.abs(num(a) - num(b)) < (0.5 / 10 ** casas) + 1e-9;

const chaveAlvo = (produtoId, itemPcpId) => (produtoId ? `PROD:${produtoId}` : `PCP:${itemPcpId}`);

/**
 * ORDEM EM QUE AS COMPRAS ACONTECERAM DE VERDADE NO ESTOQUE = ordem de CRIAÇÃO da linha
 * (`criadoEm`), nunca `dataCompra`. Isto é a espinha do replay e do estorno encadeado.
 *
 * Por quê: o retrato (`estoqueAnterior`/`custoAnterior`/`custoPosterior`) é tirado no
 * instante em que a linha é CRIADA. Já `dataCompra` é a data do DOCUMENTO — a nota fiscal
 * grava a emissão (`notaEstoqueService`: `dataCompra = nota.emissao`), sempre anterior à
 * conferência. Exemplo real que quebrava:
 *   05/08 despesa manual  → linha M, dataCompra 05/08, retrato (est 0, custo 0)
 *   12/08 confere NF-e emitida em 01/08 → linha N, dataCompra 01/08, retrato JÁ COM O M DENTRO
 * Ordenado por dataCompra o replay virava [N, M]: semeava pelo retrato de N (que contém M)
 * e aplicava M outra vez — a mesma compra entrava DUAS VEZES, inflando estoque e custo.
 * Em ordem de criação ([M, N]) semente e laço falam a mesma língua.
 *
 * Empate de `criadoEm`: duas linhas do MESMO alvo criadas na mesma transação (o `now()` do
 * Postgres é o início da transação) — desempata pelo `estoqueAnterior`, que só cresce dentro
 * de uma leva de entradas, e por fim pelo `id`, para a ordem ser sempre determinística.
 */
function compararPorCriacao(a, b) {
    const ta = new Date(a.criadoEm || 0).getTime();
    const tb = new Date(b.criadoEm || 0).getTime();
    if (ta !== tb) return ta - tb;
    const ea = a.estoqueAnterior != null ? num(a.estoqueAnterior) : -Infinity;
    const eb = b.estoqueAnterior != null ? num(b.estoqueAnterior) : -Infinity;
    if (ea !== eb) return ea - eb;
    return String(a.id || '').localeCompare(String(b.id || ''));
}
/** Da mais antiga para a mais nova (ordem em que entraram no estoque). */
const emOrdemDeCriacao = (linhas) => [...linhas].sort(compararPorCriacao);
/** Da mais nova para a mais antiga (ordem para DESFAZER: o custo volta encadeado). */
const emOrdemDeCriacaoInversa = (linhas) => [...linhas].sort((a, b) => compararPorCriacao(b, a));

/**
 * legado — não usar em custo novo. Custo médio ponderado pelo estoque anterior.
 * Mantido exportado só porque o diagnóstico `/diag-receita-custo` (adminExec) ainda o
 * importa para mostrar o cálculo antigo lado a lado. O custo real agora sai de
 * custoCompraCalculo (compras válidas recentes que cobrem o estoque).
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

                // Retrato do saldo/custo ANTES desta compra (auditoria — o custoPosterior é
                // preenchido depois do recálculo). O custo do CA não entra mais na conta.
                const estoqueAnterior = num(p.estoqueTotal);
                const custoAnterior = p.custoManual != null ? num(p.custoManual) : null;

                const compraCriada = await prisma.compraItem.create({
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
                        custoUnitario,
                        estoqueAnterior,
                        custoAnterior,
                        custoPosterior: null
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

                // Custo pela regra nova (compras válidas recentes que cobrem o estoque JÁ com
                // esta entrada). Grava custoManual. Rodar DEPOIS da entrada de estoque.
                const rc = await custoCompraCalculo.recalcularCustoAlvo({ produtoId });
                if (rc.motivo === 'ok') {
                    await prisma.compraItem.update({
                        where: { id: compraCriada.id },
                        data: { custoPosterior: rc.custo }
                    });
                }
                if (!controla) {
                    const txt = rc.custo != null ? ` (R$ ${num(rc.custo).toFixed(2)})` : '';
                    avisos.push(`"${p.nome}": custo atualizado${txt}, sem movimentar estoque — produto não controla estoque.`);
                }
            } else {
                const i = await prisma.itemPcp.findUnique({
                    where: { id: itemPcpId },
                    select: { unidade: true, estoqueAtual: true, custoUnitario: true }
                });
                if (!i) { avisos.push(`Insumo do item "${e.descricao}" não encontrado.`); continue; }
                unidadeNossa = i.unidade || unidadeNossa;

                const estoqueAnterior = num(i.estoqueAtual);
                const custoAnterior = i.custoUnitario != null ? num(i.custoUnitario) : null;

                const compraCriada = await prisma.compraItem.create({
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
                        custoUnitario,
                        estoqueAnterior,
                        custoAnterior,
                        custoPosterior: null
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

                // Custo pela regra nova, DEPOIS da entrada de estoque. Grava custoUnitario.
                const rc = await custoCompraCalculo.recalcularCustoAlvo({ itemPcpId });
                if (rc.motivo === 'ok') {
                    await prisma.compraItem.update({
                        where: { id: compraCriada.id },
                        data: { custoPosterior: rc.custo }
                    });
                }
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
 * mesma quantidade, o CUSTO volta ao valor de antes (quando a compra tem o retrato
 * gravado e ninguém mexeu no custo depois) e as linhas do histórico são marcadas.
 */
async function estornarEntradasNota(notaEntradaId, criadoPorId) {
    const compras = await prisma.compraItem.findMany({ where: { notaEntradaId, estornado: false } });
    // Desfaz na ordem INVERSA da criação (ver compararPorCriacao) — nunca por dataCompra.
    return estornarCompras(emOrdemDeCriacaoInversa(compras), criadoPorId);
}

/**
 * Estorna as compras de uma despesa MANUAL cancelada (só as sem nota — as de nota
 * são estornadas pelo cancelar-conferência da própria nota).
 */
async function estornarEntradasConta(contaPagarId, criadoPorId) {
    const compras = await prisma.compraItem.findMany({
        where: { contaPagarId, notaEntradaId: null, estornado: false }
    });
    // Mais recente primeiro (por CRIAÇÃO): desfazendo de trás para frente, o custo de cada
    // compra volta encadeado (a 2ª devolve ao estado logo depois da 1ª, e assim por diante).
    return estornarCompras(emOrdemDeCriacaoInversa(compras), criadoPorId);
}

/**
 * Observação da movimentação de estorno, legível no histórico do produto/insumo.
 *
 * `numeroNota` é opcional (despesa MANUAL não tem nota) — interpolar cru deixava
 * "Estorno da compra  — entrada cancelada", com espaço duplo e sem dizer de QUAL item
 * era o estorno (o `.trim()` não limpa buraco no meio da frase). Agora o detalhe é
 * montado antes e só entra se existir:
 *   com nota + item → Estorno da compra (nota 777771 · MUSSARELA CAIXA 10KG) — entrada cancelada
 *   só o item       → Estorno da compra (PALMITO PUPUNHA) — entrada cancelada
 *   sem nenhum      → Estorno da compra — entrada cancelada
 */
function observacaoEstorno(c) {
    const numeroNota = String(c?.numeroNota ?? '').trim();
    const item = String(c?.descricaoFornecedor ?? '').trim();
    const detalhe = [numeroNota && `nota ${numeroNota}`, item].filter(Boolean).join(' · ');
    return `Estorno da compra${detalhe ? ` (${detalhe})` : ''} — entrada cancelada`;
}

/**
 * Estorna uma lista de compras (fora de transação — usa estoqueService.ajustar, que
 * abre transação própria). Para cada linha: devolve a quantidade e marca a linha como
 * estornada (nunca apaga). O CUSTO não é mais "devolvido ao valor de antes" aqui — quem
 * decide o custo é o recompute pela regra nova (compras válidas recentes que cobrem o
 * estoque), rodado em `fecharCustoDosAlvos` no fim. Sem compra válida → custo INTOCADO.
 *
 * `avisos` = o que pede ação do usuário; `infos` = recado informativo (custo recalculado).
 */
async function estornarCompras(compras, criadoPorId) {
    let estornadas = 0;
    const avisos = [];
    const infos = [];

    for (const c of compras) {
        try {
            if (c.produtoId) {
                // Produto sem controle de estoque nunca teve a quantidade lançada — só marca o estorno.
                const p = await prisma.produto.findUnique({
                    where: { id: c.produtoId },
                    select: { id: true, nome: true, categoria: true, controlaEstoque: true }
                });
                const controla = await estoqueService.produtoControlaEstoque(p);
                if (controla) {
                    const r = await estoqueService.ajustar({
                        produtoId: c.produtoId,
                        vendedorId: criadoPorId || null,
                        tipo: 'SAIDA',
                        quantidade: num(c.quantidade),
                        motivo: 'ESTORNO_COMPRA',
                        observacao: observacaoEstorno(c)
                    });
                    if (r && r.estoqueDepois < 0) {
                        avisos.push(`O estoque de "${p?.nome || 'produto'}" ficou negativo (${round(r.estoqueDepois, 3)}) porque a quantidade lançada já tinha sido usada — acerte pelo ajuste manual.`);
                    }
                }
            } else if (c.itemPcpId) {
                const i = await prisma.itemPcp.findUnique({
                    where: { id: c.itemPcpId },
                    select: { id: true, nome: true, estoqueAtual: true }
                });
                const saldoAntes = num(i?.estoqueAtual);
                await pcpEstoqueService.ajustar({
                    itemPcpId: c.itemPcpId,
                    tipo: 'SAIDA',
                    quantidade: num(c.quantidade),
                    motivo: 'ESTORNO_COMPRA',
                    observacao: observacaoEstorno(c),
                    criadoPorId: criadoPorId || null
                });
                if (i && saldoAntes - num(c.quantidade) < -0.0005) {
                    avisos.push(`O insumo "${i.nome}" já tinha sido consumido: o estoque parou em zero e ${round(num(c.quantidade) - saldoAntes, 3)} não puderam ser devolvidos — confira no PCP.`);
                }
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

    const fechamento = await fecharCustoDosAlvos({
        produtoIds: [...new Set(compras.map((c) => c.produtoId).filter(Boolean))],
        itemPcpIds: [...new Set(compras.map((c) => c.itemPcpId).filter(Boolean))]
    });

    return {
        estornadas,
        avisos: [...avisos, ...fechamento.avisos],
        infos: [...infos, ...fechamento.infos],
        custos: fechamento.custos
    };
}

/**
 * Fecha o custo dos alvos tocados por um estorno/edição. SEMPRE fora de transação
 * (lê muitas linhas e é ajuste secundário: falhar aqui não desfaz o que já foi feito).
 *
 * Recompõe SEMPRE, sem exceção, pela regra nova (compras válidas recentes que cobrem o
 * estoque). Não há mais o atalho de "custo já restaurado" (`restaurados`): o custo é
 * sempre derivado das compras válidas do momento. Sem compra válida → AVISA em vez de zerar.
 *
 * @param {object} _ignorado o campo `restaurados` é aceito por compatibilidade e ignorado.
 * @returns {{ custos: Array, avisos: string[], infos: string[] }}
 *   `avisos` = pede ação do usuário (não deu para recalcular); `infos` = só informa o custo novo.
 */
async function fecharCustoDosAlvos({ produtoIds = [], itemPcpIds = [] }) {
    const custos = [];
    const avisos = [];
    const infos = [];

    for (const produtoId of produtoIds) {
        try {
            const r = await custoCompraCalculo.recalcularCustoAlvo({ produtoId });
            if (r.motivo === 'ok') {
                custos.push({ produtoId, custo: r.custo });
                infos.push(`Custo de "${r.nome || 'produto'}" recalculado pelas compras válidas: R$ ${r.custo.toFixed(2)}.`);
            } else {
                avisos.push(`Não consegui recalcular sozinho o custo de "${r.nome || 'um dos produtos'}" (não sobrou compra válida no histórico) — o custo atual foi mantido, confira o Custo Manual dele.`);
            }
        } catch (err) {
            console.error(`[CompraEstoque] Falha ao recalcular custo do produto ${produtoId}:`, err.message);
            avisos.push('Não foi possível recalcular o custo de um dos produtos — confira o campo Custo Manual.');
        }
    }

    for (const itemPcpId of itemPcpIds) {
        try {
            const r = await custoCompraCalculo.recalcularCustoAlvo({ itemPcpId });
            if (r.motivo === 'ok') {
                custos.push({ itemPcpId, custo: r.custo });
                infos.push(`Custo do insumo "${r.nome || '(PCP)'}" recalculado pelas compras válidas: R$ ${r.custo.toFixed(4)}.`);
            } else {
                avisos.push(`Não consegui recalcular sozinho o custo do insumo "${r.nome || '(PCP)'}" — o custo atual foi mantido, confira o custo unitário no PCP.`);
            }
        } catch (err) {
            console.error(`[CompraEstoque] Falha ao recalcular custo do insumo ${itemPcpId}:`, err.message);
            avisos.push('Não foi possível recalcular o custo de um dos insumos — confira o custo unitário no PCP.');
        }
    }

    return { custos, avisos, infos };
}

/**
 * Recalcula e grava o custo de um produto/insumo pela regra nova (compras VÁLIDAS mais
 * recentes que cobrem o estoqueAtual). Wrapper fino sobre `custoCompraCalculo` mantendo
 * o retorno detalhado {custo, motivo, nome} que o resto do serviço espera.
 *
 * @param {object} db  opcional — cliente/transação Prisma (default: prisma global).
 * @returns {{ custo: number|null, motivo: 'ok'|'sem-compras'|'custo-zero'|'sem-alvo', nome: string|null }}
 */
async function recalcularCustoDetalhado({ produtoId, itemPcpId }, db) {
    const r = await custoCompraCalculo.recalcularCustoAlvo({ produtoId, itemPcpId }, db || prisma);
    return { custo: r.custo, motivo: r.motivo, nome: r.nome };
}

/**
 * Mesma coisa, com a assinatura HISTÓRICA (`number|null`) que os 4 pontos de
 * notasEntrada.js e o script de teste esperam. NÃO mudar este retorno.
 * @returns {number|null} novo custo aplicado, ou null se nada mudou
 */
async function recalcularCustoPelasCompras({ produtoId, itemPcpId }) {
    const r = await custoCompraCalculo.recalcularCustoAlvo({ produtoId, itemPcpId });
    return r.motivo === 'ok' ? r.custo : null;
}

// =============================================================================
// EDIÇÃO DOS PRODUTOS DE UMA DESPESA (08/2026) — tudo DENTRO de uma transação
//
// Por que estornar tudo e relançar, em vez de comparar item a item: a idempotência
// de `registrarCompras` é (contaPagarId, notaEntradaId, descrição, alvo) — QUANTIDADE
// E VALOR NÃO ENTRAM NA CHAVE. Reenviar o mesmo produto com quantidade nova sem
// estornar antes cai no `continue`: a API responde 200, a tela diz "salvo" e nada
// muda no estoque. Sucesso falso.
//
// E por que código novo em vez de reaproveitar registrarCompras/estornarCompras:
// aqueles rodam no `prisma` global (estoqueService.ajustar abre transação própria e
// não aceita `tx`). Misturar `tx` no estorno com global no relançamento faria a
// idempotência não enxergar o estorno e pular o item. Aqui tudo escreve pelo `tx`:
// movimentação de estoque na mão + estoqueService.recalcularEstoqueProduto(id, tx),
// como notaEstoqueService já faz; PCP via pcpEstoqueService.ajustar(..., tx).
// =============================================================================

/** Retrato do que a despesa tem hoje de produtos (linhas ativas), para o antes/depois. */
async function comprasDaConta(db, contaPagarId) {
    const linhas = await db.compraItem.findMany({
        where: { contaPagarId, notaEntradaId: null, estornado: false },
        orderBy: { criadoEm: 'asc' },
        include: {
            produto: { select: { id: true, nome: true, unidade: true } },
            itemPcp: { select: { id: true, nome: true, unidade: true } }
        }
    });
    return linhas.map((c) => ({
        compraItemId: c.id,
        vinculo: chaveAlvo(c.produtoId, c.itemPcpId),
        nome: c.produto?.nome || c.itemPcp?.nome || null,
        descricao: c.descricaoFornecedor,
        unidade: c.unidade,
        quantidade: num(c.quantidade),
        valorTotal: num(c.valorTotal),
        custoUnitario: num(c.custoUnitario)
    }));
}

/**
 * Estorna UMA linha de compra dentro da transação: devolve a quantidade (movimentação
 * própria, sem estoqueService.ajustar, que abriria outra transação), devolve o custo
 * quando dá e marca a linha. Ver `estornarCompras` para a ordem de decisão do custo.
 */
async function estornarCompraTx(tx, c, criadoPorId, observacao) {
    const avisos = [];
    const infos = [];
    const qtd = round(num(c.quantidade), 3);

    if (c.produtoId) {
        const p = await tx.produto.findUnique({
            where: { id: c.produtoId },
            select: { id: true, nome: true, estoqueTotal: true, estoqueDisponivel: true, categoria: true, controlaEstoque: true }
        });
        if (!p) {
            avisos.push('Produto de uma das compras não existe mais — quantidade não devolvida.');
        } else {
            // Produto sem controle de estoque nunca teve a quantidade lançada.
            // O custo NÃO é devolvido aqui — é refeito pela regra nova em fecharCustoDosAlvos.
            const controla = await estoqueService.produtoControlaEstoque(p, tx);
            const data = {};
            let totalAntes = num(p.estoqueTotal);
            let totalDepois = totalAntes;
            if (controla && qtd > 0) {
                totalDepois = round(totalAntes - qtd, 3);
                data.estoqueTotal = totalDepois;
                data.estoqueDisponivel = round(num(p.estoqueDisponivel) - qtd, 3);
                if (totalDepois < 0) {
                    avisos.push(`O estoque de "${p.nome}" ficou negativo (${totalDepois}) porque a quantidade lançada já tinha sido usada — acerte pelo ajuste manual.`);
                }
            }
            if (Object.keys(data).length > 0) await tx.produto.update({ where: { id: p.id }, data });
            if (controla && qtd > 0) {
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
        }
    } else if (c.itemPcpId) {
        const i = await tx.itemPcp.findUnique({
            where: { id: c.itemPcpId },
            select: { id: true, nome: true, estoqueAtual: true, custoUnitario: true }
        });
        if (!i) {
            avisos.push('Insumo de uma das compras não existe mais — quantidade não devolvida.');
        } else {
            const antes = num(i.estoqueAtual);
            if (qtd > 0) {
                // pcpEstoqueService.ajustar TRAVA EM ZERO (Math.max(0, …)): o que já foi
                // consumido na produção não tem como voltar — avisa em vez de esconder.
                await pcpEstoqueService.ajustar({
                    itemPcpId: i.id,
                    tipo: 'SAIDA',
                    quantidade: qtd,
                    motivo: 'ESTORNO_COMPRA',
                    observacao,
                    criadoPorId
                }, tx);
                if (antes - qtd < -0.0005) {
                    avisos.push(`O insumo "${i.nome}" já tinha sido consumido: o estoque parou em zero e ${round(qtd - antes, 3)} não puderam ser devolvidos — confira no PCP.`);
                }
            }
            // Custo não é devolvido aqui — refeito pela regra nova em fecharCustoDosAlvos.
        }
    }

    await tx.compraItem.update({
        where: { id: c.id },
        data: { estornado: true, estornadoEm: new Date() }
    });
    return { avisos, infos };
}

/**
 * Lança UMA compra dentro da transação (mesma conta de custo de `registrarCompras`,
 * só que tx-aware e já gravando o retrato antes/depois na linha).
 */
async function lancarCompraTx(tx, origem, e, criadoPorId) {
    const avisos = [];
    const infos = [];
    const fator = num(e.fator) > 0 ? num(e.fator) : 1;
    const qtdFornecedor = num(e.quantidadeFornecedor);
    const quantidade = round(qtdFornecedor * fator, 3);
    const valorTotal = num(e.valorTotal);
    if (quantidade <= 0) {
        return { avisos: [`Item "${e.descricao}": quantidade convertida zero — entrada de estoque pulada.`], infos: [], registrada: false };
    }
    const custoUnitario = round(valorTotal / quantidade, 6);

    const base = {
        notaEntradaId: null,
        contaPagarId: origem.contaPagarId || null,
        fornecedorId: origem.fornecedorId || null,
        fornecedorNome: origem.fornecedorNome,
        fornecedorCnpj: origem.fornecedorCnpj || null,
        numeroNota: origem.numeroNota || null,
        // Data da COMPRA, não do conserto: numa correção vem a data da linha estornada
        // (`e.dataCompra`). Carimbar `new Date()` mudava a compra de mês — a série mensal
        // de custo do produto (produtoMargemService agrega CompraItem por mês de
        // dataCompra) perdia a compra em julho e ganhava uma em agosto, calada.
        dataCompra: e.dataCompra || origem.dataCompra || new Date(),
        descricaoFornecedor: e.descricao,
        quantidadeFornecedor: qtdFornecedor,
        fatorConversao: fator,
        quantidade,
        valorTotal,
        custoUnitario
    };

    if (e.produtoId) {
        const p = await tx.produto.findUnique({
            where: { id: e.produtoId },
            select: { id: true, nome: true, unidade: true, estoqueTotal: true, estoqueDisponivel: true, custoManual: true, categoria: true, controlaEstoque: true }
        });
        if (!p) return { avisos: [`Produto do item "${e.descricao}" não encontrado.`], infos: [], registrada: false };

        const controla = await estoqueService.produtoControlaEstoque(p, tx);
        const unidadeNossa = p.unidade || e.unidadeFornecedor || 'UN';
        const estoqueAnterior = num(p.estoqueTotal);
        const custoAnterior = p.custoManual != null ? num(p.custoManual) : null;

        const compra = await tx.compraItem.create({
            data: {
                ...base,
                produtoId: p.id,
                unidadeFornecedor: e.unidadeFornecedor || unidadeNossa,
                unidade: unidadeNossa,
                estoqueAnterior,
                custoAnterior,
                custoPosterior: null
            }
        });

        // Estoque primeiro (só se controla); custo depois, pela regra nova.
        if (controla) {
            await tx.produto.update({
                where: { id: p.id },
                data: {
                    estoqueTotal: round(estoqueAnterior + quantidade, 3),
                    estoqueDisponivel: round(num(p.estoqueDisponivel) + quantidade, 3)
                }
            });
            await tx.movimentacaoEstoque.create({
                data: {
                    produtoId: p.id,
                    vendedorId: criadoPorId,
                    tipo: 'ENTRADA',
                    quantidade,
                    motivo: 'COMPRA',
                    observacao: origem.observacaoMov,
                    estoqueAntes: estoqueAnterior,
                    estoqueDepois: round(estoqueAnterior + quantidade, 3),
                    sincCA: false,
                    erroCA: null
                }
            });
            await estoqueService.recalcularEstoqueProduto(p.id, tx);
        }

        // Custo pela regra nova (compras válidas recentes que cobrem o estoque JÁ com esta
        // entrada). Grava custoManual e completa o retrato (custoPosterior) da linha.
        const rc = await custoCompraCalculo.recalcularCustoAlvo({ produtoId: p.id }, tx);
        if (rc.motivo === 'ok') {
            await tx.compraItem.update({ where: { id: compra.id }, data: { custoPosterior: rc.custo } });
        }
        if (!controla) {
            const txt = rc.custo != null ? ` (R$ ${num(rc.custo).toFixed(2)})` : '';
            infos.push(`"${p.nome}": custo atualizado${txt}, sem movimentar estoque — produto não controla estoque.`);
        }
        return { avisos, infos, registrada: true };
    }

    const i = await tx.itemPcp.findUnique({
        where: { id: e.itemPcpId },
        select: { id: true, nome: true, unidade: true, estoqueAtual: true, custoUnitario: true }
    });
    if (!i) return { avisos: [`Insumo do item "${e.descricao}" não encontrado.`], infos: [], registrada: false };

    const unidadeNossa = i.unidade || e.unidadeFornecedor || 'UN';
    const estoqueAnterior = num(i.estoqueAtual);
    const custoAnterior = i.custoUnitario != null ? num(i.custoUnitario) : null;

    const compra = await tx.compraItem.create({
        data: {
            ...base,
            itemPcpId: i.id,
            unidadeFornecedor: e.unidadeFornecedor || unidadeNossa,
            unidade: unidadeNossa,
            estoqueAnterior,
            custoAnterior,
            custoPosterior: null
        }
    });
    await pcpEstoqueService.ajustar({
        itemPcpId: i.id,
        tipo: 'ENTRADA',
        quantidade,
        motivo: 'COMPRA',
        observacao: origem.observacaoMov,
        criadoPorId
    }, tx);

    // Custo pela regra nova, DEPOIS da entrada. Grava custoUnitario e completa o retrato.
    const rc = await custoCompraCalculo.recalcularCustoAlvo({ itemPcpId: i.id }, tx);
    if (rc.motivo === 'ok') {
        await tx.compraItem.update({ where: { id: compra.id }, data: { custoPosterior: rc.custo } });
    }

    return { avisos, infos, registrada: true };
}

/**
 * Reescreve a lista de produtos de uma despesa MANUAL: estorna TODAS as compras ativas
 * dela e relança a lista nova, na MESMA transação. Não encosta em ContaPagar, parcelas,
 * pagamentos nem no envio ao Conta Azul — só estoque, custo e histórico de compras.
 * Lista vazia = a despesa fica sem produtos (tudo devolvido).
 *
 * O custo final NÃO é fechado aqui: quem chama roda `fecharCustoDosAlvos` DEPOIS do
 * commit, em try/catch próprio (é ajuste secundário e lê muita linha).
 *
 * Duas linhas do MESMO produto já gravadas na despesa (dá para acontecer: a idempotência
 * de `registrarCompras` inclui a descrição do fornecedor, então duas descrições diferentes
 * apontando para o mesmo produto viram duas linhas): AS DUAS são estornadas — o laço
 * percorre as linhas ativas, não os alvos — e o que for relançado é exatamente a lista
 * enviada. A rota, por sua vez, recusa dois itens com o mesmo vínculo no mesmo corpo.
 *
 * @param {object} tx              transação Prisma (interativa — precisa de $queryRaw p/ a trava)
 * @param {object} conta           ContaPagar (id, descricao, numeroNota, dataEmissao?, competencia?)
 * @param {object|null} fornecedor Fornecedor da conta
 * @param {Array}  itensDesejados  [{ produtoId?, itemPcpId?, descricao, unidade?, quantidade, valorTotal }]
 * @param {string} criadoPorId
 * @returns {{ antes, depois, estornadas, registradas, avisos, infos, restaurados: Set<string>,
 *             alvos: { produtoIds: string[], itemPcpIds: string[] } }}
 */
async function sincronizarComprasConta(tx, conta, fornecedor, itensDesejados, criadoPorId) {
    const avisos = [];
    const infos = [];
    // legado — sempre vazio: o custo é SEMPRE refeito pela regra nova em fecharCustoDosAlvos.
    // Mantido no retorno só para compatibilidade com quem ainda repassa este campo.
    const restaurados = new Set();

    // ── 0. TRAVA a despesa até o fim da transação.
    // Sem isso, dois PUT /:id/itens simultâneos (duas abas abertas, retry de rede, clique
    // duplo que passou pelo botão desabilitado) leem as MESMAS linhas ativas em READ
    // COMMITTED e aplicam a subtração de estoque em cima de leitura velha — o estoque fica
    // errado sem ninguém ver. Com o lock, a segunda transação espera, relê o estado já
    // corrigido e o resultado é o da última que rodou (esta rota reescreve a lista inteira,
    // então "a última ganha" é o comportamento certo).
    // É uma linha só e é sempre o PRIMEIRO lock desta transação → não cria ciclo de deadlock.
    await tx.$queryRaw`SELECT id FROM contas_pagar WHERE id = ${conta.id} FOR UPDATE`;

    const antes = await comprasDaConta(tx, conta.id);
    const rotulo = `despesa "${conta.descricao || conta.numeroNota || conta.id}"`;

    // ── 1. Estorna tudo o que está ativo, na ordem INVERSA DA CRIAÇÃO (não por dataCompra:
    // ver compararPorCriacao) — desfazendo de trás para frente o custo volta encadeado.
    const ativas = emOrdemDeCriacaoInversa(await tx.compraItem.findMany({
        where: { contaPagarId: conta.id, notaEntradaId: null, estornado: false }
    }));
    let estornadas = 0;
    for (const c of ativas) {
        const r = await estornarCompraTx(tx, c, criadoPorId || null, `Correção da ${rotulo} — retirada do lançamento anterior`);
        avisos.push(...r.avisos);
        infos.push(...r.infos);
        estornadas++;
    }

    // Data da compra de cada alvo, para o relançamento NÃO mudar a compra de mês (a série
    // mensal de custo do produto e o histórico de compras leem `dataCompra`). Produto que
    // já estava na despesa mantém a data dele; produto NOVO herda a data da despesa.
    const dataPorAlvo = new Map();
    for (const c of emOrdemDeCriacao(ativas)) {
        const chave = chaveAlvo(c.produtoId, c.itemPcpId);
        const comDescricao = `${chave}|${String(c.descricaoFornecedor || '').trim().toLowerCase()}`;
        if (!dataPorAlvo.has(comDescricao)) dataPorAlvo.set(comDescricao, c.dataCompra);
        if (!dataPorAlvo.has(chave)) dataPorAlvo.set(chave, c.dataCompra);
    }
    const dataPadrao = ativas.length > 0
        ? emOrdemDeCriacao(ativas)[0].dataCompra
        : (conta.dataEmissao || conta.competencia || conta.criadoEm || new Date());

    // ── 2. Relança a lista nova
    const nomeFornecedor = fornecedor?.razaoSocial || fornecedor?.nomeFantasia || 'Sem fornecedor';
    const origem = {
        contaPagarId: conta.id,
        fornecedorId: fornecedor?.id || null,
        fornecedorNome: nomeFornecedor,
        fornecedorCnpj: fornecedor?.cnpjCpf || null,
        numeroNota: conta.numeroNota || null,
        dataCompra: dataPadrao,
        observacaoMov: `Correção da ${rotulo} — ${nomeFornecedor}`
    };
    let registradas = 0;
    for (const it of (itensDesejados || [])) {
        if (!it.produtoId && !it.itemPcpId) continue;
        const chave = chaveAlvo(it.produtoId || null, it.itemPcpId || null);
        const comDescricao = `${chave}|${String(it.descricao || '').trim().toLowerCase()}`;
        const r = await lancarCompraTx(tx, origem, {
            descricao: it.descricao,
            quantidadeFornecedor: it.quantidade,
            unidadeFornecedor: it.unidade || null,
            valorTotal: it.valorTotal,
            fator: 1,
            produtoId: it.produtoId || null,
            itemPcpId: it.itemPcpId || null,
            dataCompra: dataPorAlvo.get(comDescricao) || dataPorAlvo.get(chave) || dataPadrao
        }, criadoPorId || null);
        avisos.push(...r.avisos);
        infos.push(...r.infos);
        if (r.registrada) registradas++;
    }

    const depois = await comprasDaConta(tx, conta.id);

    // Alvos tocados dos DOIS lados — o produto que SAIU também precisa do custo refeito.
    const produtoIds = new Set();
    const itemPcpIds = new Set();
    for (const l of [...ativas, ...(itensDesejados || [])]) {
        if (l.produtoId) produtoIds.add(l.produtoId);
        else if (l.itemPcpId) itemPcpIds.add(l.itemPcpId);
    }

    return {
        antes,
        depois,
        estornadas,
        registradas,
        avisos,
        infos,
        restaurados,
        alvos: { produtoIds: [...produtoIds], itemPcpIds: [...itemPcpIds] }
    };
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
    recalcularCustoPelasCompras, // assinatura histórica (number|null) — NÃO mudar
    recalcularCustoDetalhado,
    fecharCustoDosAlvos,
    comprasDaConta,
    sincronizarComprasConta,
    // pura (testável offline)
    custoMedioPonderado
};
