// =====================================================================
// Baixa automática de cobranças Asaas com PARCELA vinculada (boletos e
// PIX avulsos do financeiro — NÃO os PIX de entrega, que têm parcelaId
// nulo e são baixados pelo fluxo do Caixa).
//
// Quando o Asaas avisa que a cobrança foi paga:
//   1) baixa a parcela local (ledger PagamentoParcela, como a baixa manual)
//   2) registra a baixa no Conta Azul na conta financeira do Asaas
// Tudo idempotente via flags baixaAppOk/baixaCaOk (webhook e poll podem
// disparar juntos; reprocessar é seguro).
// =====================================================================
const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

// Espelho de backend/routes/contasReceber.js:47 (recalcular status da parcela)
const calcularStatusParcela = (valor, valorPago, valorDescontoTotal) => {
    const recebidoTotal = Number(valorPago || 0) + Number(valorDescontoTotal || 0);
    if (recebidoTotal <= 0) return 'PENDENTE';
    if (recebidoTotal >= Number(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};

// Espelho de backend/routes/contasReceber.js:55 (recalcular status da conta)
const calcularStatusConta = (todasParcelas) => {
    const total = todasParcelas.length;
    const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
    const parciais = todasParcelas.filter(p => p.status === 'PARCIAL').length;
    const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
    if (pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

async function contaAsaasCaId() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
        return cfg?.value || null;
    } catch (_) { return null; }
}

const asaasBaixaService = {
    /**
     * Processa a baixa (app + CA) de uma cobrança Asaas RECEBIDA que tem parcela.
     * Nunca lança: registra o problema em cobranca.baixaErro e devolve o resumo.
     */
    registrarBaixa: async (cobrancaId) => {
        const resultado = { baixaApp: false, baixaCa: false, erros: [] };

        const cobranca = await prisma.cobrancaAsaas.findUnique({
            where: { id: cobrancaId },
            include: {
                parcela: { include: { contaReceber: true } },
                pedido: { select: { id: true, numero: true, idVendaContaAzul: true, dataVenda: true, vendedorId: true, especial: true } },
                cliente: { select: { UUID: true, Nome: true } }
            }
        });
        if (!cobranca || cobranca.status !== 'RECEBIDO' || !cobranca.parcelaId || !cobranca.parcela) {
            return resultado; // nada a fazer (PIX de entrega ou cobrança não paga)
        }

        const parcela = cobranca.parcela;
        const forma = cobranca.tipo === 'BOLETO' ? 'Boleto Asaas' : 'PIX Asaas';
        const dataPgto = cobranca.recebidoEm || new Date();
        const contaCaId = await contaAsaasCaId();

        // ── 1) Baixa local (ledger, igual à baixa manual de contasReceber.js) ──
        if (!cobranca.baixaAppOk) {
            try {
                if (parcela.status === 'CANCELADO') throw new Error('Parcela local está CANCELADA.');

                const saldoRestante = Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0);
                // Recebe o que o cliente pagou, limitado ao saldo (juros/multa ficam na observação)
                const valorPagoAsaas = Number(cobranca.valorRecebido ?? cobranca.valor);
                const recebido = Math.round(Math.min(Math.max(saldoRestante, 0), valorPagoAsaas) * 100) / 100;

                if (recebido > 0) {
                    // registradoPorId é obrigatório no ledger — quem emitiu a cobrança (fallback: vendedor do pedido)
                    const registradoPorId = cobranca.criadoPorId || cobranca.pedido?.vendedorId;
                    if (!registradoPorId) throw new Error('Sem usuário para registrar a baixa (cobrança sem criadoPor e pedido sem vendedor).');

                    const novoValorPago = Number(parcela.valorPago || 0) + recebido;
                    const novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, parcela.valorDescontoTotal);
                    const obs = `Pago via ${forma} (${cobranca.asaasPaymentId})${valorPagoAsaas > recebido + 0.01 ? ` — recebido R$ ${valorPagoAsaas.toFixed(2)} (juros/multa R$ ${(valorPagoAsaas - recebido).toFixed(2)})` : ''}`;

                    await prisma.$transaction(async (tx) => {
                        await tx.pagamentoParcela.create({
                            data: {
                                parcelaId: parcela.id,
                                valorRecebido: recebido,
                                valorDesconto: 0,
                                formaPagamento: forma,
                                contaFinanceiraCaId: contaCaId,
                                dataPagamento: dataPgto,
                                observacao: obs,
                                registradoPorId
                            }
                        });
                        await tx.parcela.update({
                            where: { id: parcela.id },
                            data: {
                                status: novoStatusParcela,
                                valorPago: novoValorPago,
                                formaPagamento: forma,
                                contaFinanceiraCaId: contaCaId || parcela.contaFinanceiraCaId,
                                dataPagamento: novoStatusParcela === 'PAGO' ? dataPgto : parcela.dataPagamento,
                                baixadoPorId: registradoPorId
                            }
                        });
                        const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
                        const atualizadas = todasParcelas.map(p => p.id === parcela.id ? { ...p, status: novoStatusParcela } : p);
                        await tx.contaReceber.update({
                            where: { id: parcela.contaReceberId },
                            data: { status: calcularStatusConta(atualizadas) }
                        });
                    }, { timeout: 20000, maxWait: 10000 });
                }

                await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { baixaAppOk: true } });
                resultado.baixaApp = true;
            } catch (e) {
                console.error(`[Asaas baixa] Falha na baixa local da cobrança ${cobranca.asaasPaymentId}:`, e.message);
                resultado.erros.push(`baixa local: ${e.message}`);
            }
        } else {
            resultado.baixaApp = true;
        }

        // ── 2) Baixa no Conta Azul (fora de transação — chamada de rede) ──
        if (!cobranca.baixaCaOk) {
            try {
                const pedido = cobranca.pedido;
                if (!pedido || (pedido.especial && !pedido.idVendaContaAzul)) {
                    // Pedido especial (sem espelho no CA): não há o que baixar lá
                    await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { baixaCaOk: true } });
                    resultado.baixaCa = true;
                } else if (!pedido.idVendaContaAzul) {
                    // Pedido normal ainda sem venda no CA (ex.: especial recém-convertido) —
                    // fica pendente; o worker de retentativa fecha depois que a venda existir.
                    resultado.erros.push('baixa CA: aguardando a venda ser criada no Conta Azul (retentará sozinho)');
                } else {
                    const dataVendaStr = pedido.dataVenda
                        ? new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
                        : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                    const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(
                        cobranca.cliente.UUID, pedido.idVendaContaAzul, dataVendaStr
                    );
                    // Casa pela numeração (fallback: vencimento igual)
                    const vencLocal = parcela.dataVencimento ? new Date(parcela.dataVencimento).toISOString().split('T')[0] : null;
                    const caPar = (parcelasCA || []).find(p => (p.numero_parcela || 0) === parcela.numeroParcela)
                        || (parcelasCA || []).find(p => p.data_vencimento === vencLocal)
                        || ((parcelasCA || []).length === 1 ? parcelasCA[0] : null);
                    if (!caPar) throw new Error('Parcela correspondente não encontrada no Conta Azul.');

                    const jaPagaCA = ['RECEBIDO', 'QUITADO', 'ACQUITTED', 'PAID'].includes(caPar.status);
                    if (!jaPagaCA) {
                        if (!contaCaId) throw new Error('Conta financeira do Asaas não configurada (asaas_conta_financeira_ca_id).');
                        const valorBaixaCa = Number(cobranca.valorRecebido ?? cobranca.valor);
                        await contaAzulService.criarBaixa(caPar.id, {
                            data_pagamento: new Date(dataPgto).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }),
                            composicao_valor: { valor_bruto: valorBaixaCa, multa: 0, juros: 0, desconto: 0, taxa: 0 },
                            conta_financeira: contaCaId,
                            metodo_pagamento: cobranca.tipo === 'BOLETO' ? 'BOLETO_BANCARIO' : 'PIX_PAGAMENTO_INSTANTANEO',
                            observacao: `${forma} ${cobranca.asaasPaymentId} — baixa automática (webhook Asaas)`
                        });
                    }
                    await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { baixaCaOk: true } });
                    resultado.baixaCa = true;
                }
            } catch (e) {
                console.error(`[Asaas baixa] Falha na baixa CA da cobrança ${cobranca.asaasPaymentId}:`, e.message);
                resultado.erros.push(`baixa CA: ${e.message}`);
            }
        } else {
            resultado.baixaCa = true;
        }

        // Registrar erro (ou limpar) na cobrança + log de histórico do cliente
        try {
            await prisma.cobrancaAsaas.update({
                where: { id: cobranca.id },
                data: { baixaErro: resultado.erros.length ? resultado.erros.join(' | ') : null }
            });
        } catch (_) { /* não crítico */ }

        if (resultado.baixaApp && !cobranca.baixaAppOk) {
            try {
                await prisma.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO',
                        observacao: `${forma} recebido: R$ ${Number(cobranca.valorRecebido ?? cobranca.valor).toFixed(2)} (parcela ${parcela.numeroParcela}) — baixa automática`,
                        clienteId: cobranca.clienteId,
                        idVendedor: cobranca.criadoPorId || cobranca.pedido?.vendedorId || null,
                        pedidoId: cobranca.pedidoId || null
                    }
                });
            } catch (logErr) {
                console.error('[Asaas baixa] Falha no log de histórico (baixa já efetivada):', logErr.message);
            }
        }

        return resultado;
    },

    /**
     * PIX/boleto DEVOLVIDO (estornado) no Asaas depois de recebido:
     *   1) marca a cobrança como ESTORNADO
     *   2) estorna a baixa local (ledger PagamentoParcela) e recalcula parcela/conta
     *   3) exclui a baixa correspondente no Conta Azul (achada pela observação com o id da cobrança)
     *   4) se o PIX foi usado numa entrega, marca divergência no pedido
     *   5) registra Atendimento FINANCEIRO para o faturamento conferir
     * Idempotente e nunca lança (erros ficam em baixaErro).
     */
    registrarEstorno: async (cobrancaId) => {
        const resultado = { estornoApp: false, estornoCa: false, erros: [] };

        const cobranca = await prisma.cobrancaAsaas.findUnique({
            where: { id: cobrancaId },
            include: {
                parcela: { include: { contaReceber: true } },
                pedido: { select: { id: true, numero: true, idVendaContaAzul: true, dataVenda: true, vendedorId: true } },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true } }
            }
        });
        if (!cobranca || cobranca.estornoOk) return resultado; // idempotente por estornoOk

        const forma = cobranca.tipo === 'BOLETO' ? 'Boleto Asaas' : 'PIX Asaas';
        await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { status: 'ESTORNADO' } });

        // ── 1) Estornar a baixa local (se houve) ──
        if (cobranca.baixaAppOk && cobranca.parcelaId && cobranca.parcela) {
            try {
                const parcela = cobranca.parcela;
                await prisma.$transaction(async (tx) => {
                    await tx.pagamentoParcela.updateMany({
                        where: {
                            parcelaId: parcela.id,
                            estornado: false,
                            observacao: { contains: cobranca.asaasPaymentId }
                        },
                        data: { estornado: true, estornadoEm: new Date() }
                    });
                    const restantes = await tx.pagamentoParcela.findMany({ where: { parcelaId: parcela.id, estornado: false } });
                    const novoValorPago = restantes.reduce((s, p) => s + Number(p.valorRecebido), 0);
                    const novoDesconto = restantes.reduce((s, p) => s + Number(p.valorDesconto), 0);
                    const novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, novoDesconto);
                    await tx.parcela.update({
                        where: { id: parcela.id },
                        data: {
                            status: novoStatusParcela,
                            valorPago: novoValorPago || null,
                            valorDescontoTotal: novoDesconto,
                            dataPagamento: novoStatusParcela === 'PAGO' ? parcela.dataPagamento : null
                        }
                    });
                    const todas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
                    const atualizadas = todas.map(p => p.id === parcela.id ? { ...p, status: novoStatusParcela } : p);
                    await tx.contaReceber.update({
                        where: { id: parcela.contaReceberId },
                        data: { status: calcularStatusConta(atualizadas) }
                    });
                }, { timeout: 20000, maxWait: 10000 });
                await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { baixaAppOk: false } });
                resultado.estornoApp = true;
            } catch (e) {
                console.error(`[Asaas estorno] Falha no estorno local de ${cobranca.asaasPaymentId}:`, e.message);
                resultado.erros.push(`estorno local: ${e.message}`);
            }
        }

        // ── 2) Excluir a baixa no Conta Azul (se houve) ──
        if (cobranca.baixaCaOk && cobranca.pedido?.idVendaContaAzul && cobranca.parcela) {
            try {
                const dataVendaStr = new Date(cobranca.pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const parcelasCA = await contaAzulService.encontrarParcelasDeVenda(
                    cobranca.cliente.UUID, cobranca.pedido.idVendaContaAzul, dataVendaStr
                );
                const vencLocal = cobranca.parcela.dataVencimento ? new Date(cobranca.parcela.dataVencimento).toISOString().split('T')[0] : null;
                const caPar = (parcelasCA || []).find(p => (p.numero_parcela || 0) === cobranca.parcela.numeroParcela)
                    || (parcelasCA || []).find(p => p.data_vencimento === vencLocal)
                    || ((parcelasCA || []).length === 1 ? parcelasCA[0] : null);
                if (!caPar) throw new Error('Parcela não encontrada no CA.');
                const det = await contaAzulService.buscarParcelaDetalhe(caPar.id);
                const baixaAsaas = (det?.baixas || []).find(b => (b?.observacao || '').includes(cobranca.asaasPaymentId));
                if (!baixaAsaas?.id) throw new Error('Baixa correspondente não encontrada no CA (excluir manualmente).');
                await contaAzulService.excluirBaixa(baixaAsaas.id);
                await prisma.cobrancaAsaas.update({ where: { id: cobranca.id }, data: { baixaCaOk: false } });
                resultado.estornoCa = true;
            } catch (e) {
                console.error(`[Asaas estorno] Falha ao excluir baixa CA de ${cobranca.asaasPaymentId}:`, e.message);
                resultado.erros.push(`estorno CA: ${e.message}`);
            }
        }

        // ── 3) PIX usado numa ENTREGA (parcela baixada pelo fluxo da entrega/caixa,
        //       SEM ledger) → reabrir a parcela e marcar divergência no pedido.
        //       Só quando NÃO houve estorno via ledger (senão dupla contagem).
        try {
            const pagReal = await prisma.pedidoPagamentoReal.findFirst({ where: { cobrancaAsaasId: cobranca.id } });
            if (pagReal) {
                await prisma.pedido.update({ where: { id: pagReal.pedidoId }, data: { divergenciaPagamento: true } });
                // Renomeia o pagamento da entrega para deixar claro no histórico
                await prisma.pedidoPagamentoReal.update({
                    where: { id: pagReal.id },
                    data: { formaPagamentoNome: 'PIX Asaas (ESTORNADO)' }
                }).catch(() => { });

                if (!cobranca.baixaAppOk) {
                    const pixValor = Number(cobranca.valorRecebido ?? cobranca.valor);
                    const conta = await prisma.contaReceber.findFirst({
                        where: { pedidoId: pagReal.pedidoId },
                        include: { parcelas: { orderBy: { numeroParcela: 'asc' } } }
                    });
                    if (conta) {
                        await prisma.$transaction(async (tx) => {
                            let restante = pixValor;
                            for (const p of conta.parcelas) {
                                if (restante <= 0.001) break;
                                if (!['PAGO', 'PARCIAL'].includes(p.status)) continue;
                                // baixa direta da entrega marca PAGO com valorPago cheio (sem ledger)
                                const pagoAtual = Number(p.valorPago ?? p.valor);
                                const reduz = Math.min(pagoAtual, restante);
                                const novoPago = Math.round((pagoAtual - reduz) * 100) / 100;
                                restante -= reduz;
                                const novoStatus = calcularStatusParcela(p.valor, novoPago, p.valorDescontoTotal);
                                await tx.parcela.update({
                                    where: { id: p.id },
                                    data: {
                                        status: novoStatus,
                                        valorPago: novoPago > 0 ? novoPago : null,
                                        dataPagamento: novoStatus === 'PAGO' ? p.dataPagamento : null,
                                        observacao: `PIX Asaas estornado — R$ ${reduz.toFixed(2)} removido da baixa (conferir cobrança do restante)`
                                    }
                                });
                            }
                            const todas = await tx.parcela.findMany({ where: { contaReceberId: conta.id } });
                            await tx.contaReceber.update({ where: { id: conta.id }, data: { status: calcularStatusConta(todas) } });
                        }, { timeout: 20000, maxWait: 10000 });
                        resultado.estornoApp = true;
                    }
                }
            }
        } catch (e) {
            resultado.erros.push(`reabrir parcela da entrega: ${e.message}`);
        }

        // ── 4) Registrar erro/sucesso + aviso no histórico do cliente ──
        // estornoOk só quando não sobrou pendência (idempotência: re-run repete o que faltou)
        try {
            await prisma.cobrancaAsaas.update({
                where: { id: cobranca.id },
                data: {
                    baixaErro: resultado.erros.length ? `ESTORNO: ${resultado.erros.join(' | ')}` : null,
                    estornoOk: resultado.erros.length === 0
                }
            });
        } catch (_) { /* não crítico */ }
        try {
            await prisma.atendimento.create({
                data: {
                    tipo: 'FINANCEIRO',
                    observacao: `⚠️ ${forma} DEVOLVIDO no Asaas: R$ ${Number(cobranca.valorRecebido ?? cobranca.valor).toFixed(2)}${cobranca.pedido?.numero ? ` (pedido #${cobranca.pedido.numero})` : ''}. Baixas desfeitas automaticamente${resultado.erros.length ? ' COM PENDÊNCIA — conferir' : ''}. O valor voltou ao cliente — cobrar novamente se preciso.`,
                    clienteId: cobranca.clienteId,
                    idVendedor: cobranca.criadoPorId || cobranca.pedido?.vendedorId || null,
                    pedidoId: cobranca.pedidoId || null
                }
            });
        } catch (logErr) {
            console.error('[Asaas estorno] Falha no aviso (estorno já efetivado):', logErr.message);
        }

        console.log(`↩️ [Asaas] Cobrança ${cobranca.asaasPaymentId} ESTORNADA (app: ${resultado.estornoApp}, CA: ${resultado.estornoCa})`);
        return resultado;
    },

    /**
     * Reprocessa cobranças RECEBIDAS com baixa pendente (webhook falhou na hora).
     * Usado pelo admin-exec e pode ser chamado após deploy.
     */
    reprocessarPendentes: async () => {
        const pendentes = await prisma.cobrancaAsaas.findMany({
            where: {
                status: 'RECEBIDO',
                parcelaId: { not: null },
                OR: [{ baixaAppOk: false }, { baixaCaOk: false }]
            },
            select: { id: true, asaasPaymentId: true },
            take: 50
        });
        const resultados = [];
        for (const c of pendentes) {
            const r = await asaasBaixaService.registrarBaixa(c.id);
            resultados.push({ asaasPaymentId: c.asaasPaymentId, ...r });
        }
        return resultados;
    }
};

module.exports = asaasBaixaService;
