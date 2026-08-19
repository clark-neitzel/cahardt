const prisma = require('../config/database');
const estoqueService = require('./estoqueService');
const { statusParcelaPos, recalcularStatusConta, round2 } = require('./recebimentoEntregaService');

/** Quanto desta parcela JÁ foi liquidado (dinheiro recebido + desconto concedido). */
const jaLiquidado = (p) => round2(Number(p.valorPago || 0) + Number(p.valorDescontoTotal || 0));

// Cancela no Asaas os boletos/PIX ainda pagáveis das parcelas informadas.
// Melhor esforço e fora de qualquer transação (é chamada de rede).
async function cancelarCobrancasDasParcelas(parcelaIds, motivo) {
    const resultado = { canceladas: 0, erros: [] };
    if (!parcelaIds?.length) return resultado;
    try {
        const asaasService = require('./asaasService');
        for (const parcelaId of parcelaIds) {
            const r = await asaasService.cancelarCobrancasDaParcela(parcelaId, motivo);
            resultado.canceladas += r.canceladas;
            resultado.erros.push(...r.erros);
        }
    } catch (err) {
        console.error('[Devolucao] Falha ao cancelar cobranças no Asaas:', err.message);
        resultado.erros.push({ erro: err.message });
    }
    return resultado;
}

const devolucaoService = {

    listar: async (filtros = {}) => {
        const { clienteId, pedidoId, tipo, status, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 } = filtros;
        const where = {};

        if (clienteId) where.clienteId = clienteId;
        if (pedidoId) where.pedidoOriginalId = pedidoId;
        if (tipo) where.tipo = tipo;
        if (status) where.status = status;
        if (dataInicio || dataFim) {
            where.dataDevolucao = {};
            if (dataInicio) where.dataDevolucao.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.dataDevolucao.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.devolucao.findMany({
                where,
                include: {
                    pedidoOriginal: { select: { id: true, numero: true, especial: true, bonificacao: true, statusEntrega: true, nomeCondicaoPagamento: true } },
                    cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                    registradoPor: { select: { id: true, nome: true } },
                    revertidoPor: { select: { id: true, nome: true } },
                    motorista: { select: { id: true, nome: true } },
                    itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } }
                },
                orderBy: { dataDevolucao: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.devolucao.count({ where })
        ]);

        // Anexa a NF-e de devolução emitida pelo app (Focus), se houver, no ambiente atual
        try {
            const focusNfe = require('./focusNfeService');
            const prefixo = `nfd-${focusNfe.ambiente() === 'producao' ? 'p' : 'h'}-`;
            const refs = items.map(d => `${prefixo}${d.id}`);
            const notas = refs.length
                ? await prisma.notaFiscalApp.findMany({ where: { ref: { in: refs } } })
                : [];
            const porRef = new Map(notas.map(n => [n.ref, n]));
            for (const d of items) d.notaFiscalDevolucao = porRef.get(`${prefixo}${d.id}`) || null;
        } catch (e) {
            console.error('[Devolucao] Falha ao anexar NF de devolução:', e.message);
        }

        return { items, total, pagina, tamanhoPagina };
    },

    detalhar: async (id) => {
        return prisma.devolucao.findUnique({
            where: { id },
            include: {
                pedidoOriginal: {
                    select: {
                        id: true, numero: true, especial: true, bonificacao: true,
                        statusEntrega: true, motivoDevolucao: true, dataEntrega: true,
                        nomeCondicaoPagamento: true, clienteId: true,
                        itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } },
                        itensDevolvidos: true
                    }
                },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } },
                registradoPor: { select: { id: true, nome: true } },
                revertidoPor: { select: { id: true, nome: true } },
                motorista: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, codigo: true } } } }
            }
        });
    },

    /**
     * Cria devolução para pedido especial (sem nota CA).
     * @param {Object} params
     * @param {string} params.pedidoId - ID do pedido original
     * @param {Array} params.itens - [{ produtoId, quantidade }]
     * @param {string} params.motivo - Motivo da devolução
     * @param {string} [params.observacao]
     * @param {string} params.registradoPorId - ID do usuário que registrou
     */
    criarEspecial: async ({ pedidoId, itens, motivo, observacao, registradoPorId }) => {
        return devolucaoService._criar({
            pedidoId, itens, motivo, observacao, registradoPorId,
            tipo: 'ESPECIAL'
        });
    },

    /**
     * Cria devolução para pedido que foi pro Conta Azul (com nota).
     */
    criarContaAzul: async ({ pedidoId, itens, motivo, observacao, notaDevolucaoCA, pdfDevolucaoUrl, registradoPorId }) => {
        return devolucaoService._criar({
            pedidoId, itens, motivo, observacao, registradoPorId,
            tipo: 'CONTA_AZUL', notaDevolucaoCA, pdfDevolucaoUrl
        });
    },

    /**
     * Lógica interna de criação de devolução (compartilhada entre especial e CA).
     */
    _criar: async ({ pedidoId, itens, motivo, observacao, registradoPorId, tipo, notaDevolucaoCA, pdfDevolucaoUrl }) => {
        // 1. Buscar pedido original com tudo necessário
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true } } } },
                embarque: { select: { responsavelId: true } },
                contaReceber: { include: { parcelas: true } }
            }
        });

        if (!pedido) throw new Error('Pedido não encontrado.');
        if (!['ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(pedido.statusEntrega)) {
            throw new Error('Só é possível fazer devolução de pedidos com status ENTREGUE_PARCIAL ou DEVOLVIDO.');
        }
        if (pedido.devolucaoFinalizada) {
            throw new Error('Este pedido já possui uma devolução finalizada.');
        }

        // 2. Validar itens contra o pedido original
        const itensMap = new Map(pedido.itens.map(i => [i.produtoId, i]));
        const itensValidados = [];
        let valorTotalDevolucao = 0;

        for (const item of itens) {
            const original = itensMap.get(item.produtoId);
            if (!original) throw new Error(`Produto ${item.produtoId} não encontrado no pedido original.`);

            const qtdDevolvida = parseFloat(item.quantidade);
            const qtdOriginal = parseFloat(original.quantidade);
            if (qtdDevolvida <= 0) continue;
            if (qtdDevolvida > qtdOriginal) {
                throw new Error(`Quantidade devolvida (${qtdDevolvida}) excede a quantidade original (${qtdOriginal}) do produto ${original.produto?.nome || item.produtoId}.`);
            }

            const valorUnitario = parseFloat(original.valor);
            const valorTotal = Math.round(qtdDevolvida * valorUnitario * 100) / 100;

            itensValidados.push({
                produtoId: item.produtoId,
                quantidade: qtdDevolvida,
                valorUnitario,
                valorTotal
            });

            valorTotalDevolucao += valorTotal;
        }

        if (itensValidados.length === 0) throw new Error('Nenhum item válido para devolução.');

        // 3. Determinar escopo
        const todosItensDevolvidos = pedido.itens.every(pi => {
            const dev = itensValidados.find(iv => iv.produtoId === pi.produtoId);
            return dev && dev.quantidade >= parseFloat(pi.quantidade);
        });
        const escopo = todosItensDevolvidos ? 'TOTAL' : 'PARCIAL';

        // 4. Contexto da entrega
        const motoristaId = pedido.embarque?.responsavelId || null;
        const dataEntregaOriginal = pedido.dataEntrega || null;
        const caixaDataReferencia = pedido.dataEntrega
            ? pedido.dataEntrega.toISOString().slice(0, 10)
            : null;

        // 5. Snapshot das parcelas antes do ajuste
        const snapshotParcelas = pedido.contaReceber?.parcelas?.map(p => ({
            id: p.id,
            numeroParcela: p.numeroParcela,
            valor: parseFloat(p.valor),
            status: p.status
        })) || null;

        // Dinheiro já liquidado que a devolução torna indevido → crédito do cliente.
        // Acumulado DENTRO da transação (os dois ramos podem gerar) e relatado depois.
        let creditoAoCliente = 0;
        let valorMantidoNaConta = 0;

        // 6. Executar tudo em transação
        const devolucao = await prisma.$transaction(async (tx) => {
            creditoAoCliente = 0; valorMantidoNaConta = 0; // zera se a transação for reexecutada

            // 6a. Criar devolução
            const dev = await tx.devolucao.create({
                data: {
                    pedidoOriginalId: pedidoId,
                    clienteId: pedido.clienteId,
                    tipo,
                    escopo,
                    motivo,
                    observacao: observacao || null,
                    notaDevolucaoCA: notaDevolucaoCA || null,
                    pdfDevolucaoUrl: pdfDevolucaoUrl || null,
                    motoristaId,
                    dataEntregaOriginal,
                    caixaDataReferencia,
                    registradoPorId,
                    valorTotal: Math.round(valorTotalDevolucao * 100) / 100,
                    snapshotParcelas,
                    itens: {
                        create: itensValidados.map(iv => ({
                            produtoId: iv.produtoId,
                            quantidade: iv.quantidade,
                            valorUnitario: iv.valorUnitario,
                            valorTotal: iv.valorTotal
                        }))
                    }
                },
                include: {
                    itens: { include: { produto: { select: { id: true, nome: true } } } }
                }
            });

            // 6b. Marcar pedido como devolução finalizada
            await tx.pedido.update({
                where: { id: pedidoId },
                data: { devolucaoFinalizada: true }
            });

            // 6c. Ajustar conta a receber
            if (pedido.contaReceber) {
                const conta = pedido.contaReceber;
                const valorOriginalPedido = parseFloat(conta.valorTotal);

                if (escopo === 'TOTAL') {
                    // Parcela que JÁ TEM DINHEIRO (ou desconto) liquidado NÃO pode ser
                    // simplesmente cancelada: o ledger de `pagamentos_parcela` continua vivo
                    // (o dinheiro segue em Saldos por Conta e no realizado) e o título sumiria
                    // do Contas a Receber sem estorno nem crédito. Desde que a baixa parcial
                    // virou rotina (especial baixado na conferência do Caixa) isso é cenário
                    // comum, não exceção.
                    //   • parcela sem nada liquidado  → CANCELADO (comportamento de sempre);
                    //   • parcela com valor liquidado → valor cai para o que já foi liquidado
                    //     e o status é recalculado (fica PAGO) — o ledger continua batendo com
                    //     a parcela, e o que o cliente pagou por mercadoria devolvida vira
                    //     CRÉDITO A DEVOLVER, registrado na observação da devolução.
                    for (const p of conta.parcelas) {
                        if (p.status === 'CANCELADO') continue;
                        const liquidado = jaLiquidado(p);
                        if (liquidado <= 0.01) {
                            await tx.parcela.update({ where: { id: p.id }, data: { status: 'CANCELADO' } });
                            continue;
                        }
                        creditoAoCliente = round2(creditoAoCliente + liquidado);
                        valorMantidoNaConta = round2(valorMantidoNaConta + liquidado);
                        await tx.parcela.update({
                            where: { id: p.id },
                            data: {
                                valor: liquidado,
                                status: statusParcelaPos(liquidado, p.valorPago, p.valorDescontoTotal)
                            }
                        });
                    }
                    await tx.contaReceber.update({
                        where: { id: conta.id },
                        // DEVOLVIDO continua sendo o status do título devolvido por inteiro
                        // (sai da cobrança). O valorTotal só é mexido quando SOBROU parcela
                        // viva (dinheiro já liquidado) — devolução total "limpa" continua
                        // guardando o valor original, como sempre foi.
                        data: {
                            status: 'DEVOLVIDO',
                            ...(valorMantidoNaConta > 0 ? { valorTotal: valorMantidoNaConta } : {})
                        }
                    });
                } else {
                    // Reduzir proporcionalmente as parcelas pendentes.
                    // Parcela PARCIAL entra aqui (tem saldo), mas o valor NUNCA pode cair
                    // abaixo do que já foi recebido/descontado — senão sobraria parcela com
                    // valorPago maior que o valor, que nenhuma tela sabe representar.
                    const ratio = valorTotalDevolucao / valorOriginalPedido;
                    const parcelasPendentes = conta.parcelas.filter(p => p.status !== 'PAGO' && p.status !== 'CANCELADO');

                    let somaAjustada = 0;
                    for (let i = 0; i < parcelasPendentes.length; i++) {
                        const p = parcelasPendentes[i];
                        const valorOriginal = parseFloat(p.valor);
                        let novoValor;

                        if (i === parcelasPendentes.length - 1) {
                            // Última parcela: ajustar para compensar arredondamento
                            const totalPendentesOriginal = parcelasPendentes.reduce((s, pp) => s + parseFloat(pp.valor), 0);
                            const totalReduzido = totalPendentesOriginal - valorTotalDevolucao;
                            novoValor = Math.max(0, Math.round((totalReduzido - somaAjustada) * 100) / 100);
                        } else {
                            novoValor = Math.max(0, Math.round(valorOriginal * (1 - ratio) * 100) / 100);
                            somaAjustada += novoValor;
                        }

                        const liquidado = jaLiquidado(p);
                        const valorFinal = Math.max(novoValor, liquidado);
                        // O que o cliente pagou ALÉM do que passou a dever é crédito dele
                        // (a devolução não "cabe" no título) — nunca pode sumir em silêncio.
                        if (liquidado > novoValor + 0.01) creditoAoCliente = round2(creditoAoCliente + (liquidado - novoValor));
                        await tx.parcela.update({
                            where: { id: p.id },
                            data: {
                                valor: valorFinal,
                                // recebido já cobre o novo valor → a parcela está quitada
                                status: statusParcelaPos(valorFinal, p.valorPago, p.valorDescontoTotal)
                            }
                        });
                    }

                    // Atualizar valor total da conta — SEMPRE relido das parcelas já ajustadas,
                    // nunca por um segundo cálculo proporcional.
                    // Por quê: a parcela tem PISO no que já foi liquidado (acima), e o cálculo
                    // proporcional não tem. Título de R$ 108 com R$ 50 recebidos e devolução de
                    // R$ 63 deixava a parcela em R$ 50 (certo) e a conta em R$ 45 (errado) —
                    // conta valendo MENOS que a soma das próprias parcelas, e nenhuma tela do
                    // Contas a Receber fecha com isso. Lendo do banco depois do ajuste, os dois
                    // números nascem da mesma fonte e não têm como divergir de novo.
                    // CANCELADO fica de fora: parcela cancelada não é dívida (é o mesmo critério
                    // do ramo TOTAL, que soma só o que sobrou vivo).
                    const parcelasFinais = await tx.parcela.findMany({
                        where: { contaReceberId: conta.id, status: { not: 'CANCELADO' } },
                        select: { valor: true }
                    });
                    const novoTotal = Math.max(0, round2(
                        parcelasFinais.reduce((s, p) => s + parseFloat(p.valor), 0)
                    ));
                    await tx.contaReceber.update({
                        where: { id: conta.id },
                        data: { valorTotal: novoTotal }
                    });
                    // Parcela quitada pelo ajuste (recebido cobre o novo valor) precisa refletir
                    // no título: sem isto o Contas a Receber continuava listando como ABERTO.
                    await recalcularStatusConta(tx, conta.id);
                }
            }

            // Crédito do cliente (pagou mercadoria que devolveu) ainda não tem função própria
            // no sistema — a decisão do dono é que por ora ele fique VISÍVEL, nunca silencioso.
            if (creditoAoCliente > 0.01) {
                const aviso = `⚠️ CRÉDITO A DEVOLVER AO CLIENTE: R$ ${creditoAoCliente.toFixed(2)} — `
                    + 'o cliente já havia pago (ou teve desconto) por mercadoria que devolveu. '
                    + 'O recebimento continua lançado no financeiro (não foi estornado). '
                    + 'Acerte manualmente com o cliente: abatimento no próximo pedido ou devolução do valor.';
                await tx.devolucao.update({
                    where: { id: dev.id },
                    data: { observacao: [dev.observacao, aviso].filter(Boolean).join('\n') }
                });
                dev.observacao = [dev.observacao, aviso].filter(Boolean).join('\n');
            }

            dev.creditoAoCliente = creditoAoCliente;
            return dev;
        }, { timeout: 20000, maxWait: 10000 });

        // 6c-bis. Matar a cobrança que sobrou: no TOTAL as parcelas foram canceladas e no
        // PARCIAL tiveram o valor reduzido — em qualquer dos casos o boleto/PIX emitido
        // antes cobra um valor que o cliente não deve mais (e boleto vencido segue pagável).
        let cobrancasCanceladas = { canceladas: 0, erros: [] };
        if (pedido.contaReceber) {
            const parcelasAfetadas = pedido.contaReceber.parcelas
                .filter(p => p.status !== 'PAGO')
                .map(p => p.id);
            cobrancasCanceladas = await cancelarCobrancasDasParcelas(
                parcelasAfetadas,
                `devolução ${escopo === 'TOTAL' ? 'total' : 'parcial'} do pedido`
            );
        }
        devolucao.cobrancasCanceladas = cobrancasCanceladas.canceladas;

        // 6d. Creditar estoque (fora da transação principal pois estoqueService tem sua própria)
        try {
            await estoqueService.creditarDevolucao(
                pedidoId,
                itensValidados.map(iv => ({ produtoId: iv.produtoId, quantidade: iv.quantidade })),
                registradoPorId
            );
        } catch (err) {
            console.error(`[Devolucao] Erro ao creditar estoque para devolução ${devolucao.id}:`, err.message);
        }

        return devolucao;
    },

    /**
     * Reverte uma devolução ativa.
     */
    reverter: async ({ devolucaoId, motivoReversao, revertidoPorId }) => {
        const devolucao = await prisma.devolucao.findUnique({
            where: { id: devolucaoId },
            include: {
                itens: true,
                pedidoOriginal: {
                    include: {
                        contaReceber: { include: { parcelas: true } }
                    }
                }
            }
        });

        if (!devolucao) throw new Error('Devolução não encontrada.');
        if (devolucao.status !== 'ATIVA') throw new Error('Só é possível reverter devoluções com status ATIVA.');

        await prisma.$transaction(async (tx) => {
            // 1. Marcar devolução como revertida
            await tx.devolucao.update({
                where: { id: devolucaoId },
                data: {
                    status: 'REVERTIDA',
                    revertidoPorId,
                    revertidoEm: new Date(),
                    motivoReversao: motivoReversao || null
                }
            });

            // 2. Limpar flag no pedido
            await tx.pedido.update({
                where: { id: devolucao.pedidoOriginalId },
                data: { devolucaoFinalizada: false }
            });

            // 3. Restaurar parcelas do snapshot
            if (devolucao.snapshotParcelas && devolucao.pedidoOriginal.contaReceber) {
                const conta = devolucao.pedidoOriginal.contaReceber;
                const snapshot = devolucao.snapshotParcelas;

                for (const snap of snapshot) {
                    await tx.parcela.update({
                        where: { id: snap.id },
                        data: {
                            valor: snap.valor,
                            status: snap.status
                        }
                    });
                }

                // Restaurar valor total e status da conta
                const valorOriginal = snapshot.reduce((s, p) => s + p.valor, 0);
                const pagas = snapshot.filter(p => p.status === 'PAGO').length;
                const novoStatus = pagas > 0 ? 'PARCIAL' : 'ABERTO';

                await tx.contaReceber.update({
                    where: { id: conta.id },
                    data: {
                        valorTotal: Math.round(valorOriginal * 100) / 100,
                        status: novoStatus
                    }
                });
            }
        }, { timeout: 20000, maxWait: 10000 });

        // 4. Debitar estoque de volta
        try {
            await estoqueService.debitarReversaoDevolucao(
                devolucao.pedidoOriginalId,
                devolucao.itens.map(i => ({ produtoId: i.produtoId, quantidade: parseFloat(i.quantidade) })),
                revertidoPorId
            );
        } catch (err) {
            console.error(`[Devolucao] Erro ao debitar estoque na reversão ${devolucaoId}:`, err.message);
        }

        return { success: true };
    }
};

module.exports = devolucaoService;
