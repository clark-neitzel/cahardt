const prisma = require('../config/database'); // singleton compartilhado (pool único)
const contaAzulService = require('./contaAzulService');

const mapMetodoCA = (metodo) => {
    if (!metodo) return null;
    const m = String(metodo).toUpperCase();
    const map = {
        DINHEIRO: 'Dinheiro', BOLETO: 'Boleto', BOLETO_BANCARIO: 'Boleto',
        PIX: 'Pix', CARTAO_CREDITO: 'Cartão Crédito', CARTAO_DEBITO: 'Cartão Débito',
        TRANSFERENCIA_BANCARIA: 'Transferência', CHEQUE: 'Cheque', OUTRO: 'Outro'
    };
    return map[m] || metodo;
};

/**
 * Sincroniza baixas do Conta Azul para UMA conta a receber.
 * @param {string} contaId
 * @param {object} opts
 *   - baixadoPorId: usuário que realizou a ação (quando vem por rota). Sem ele, usa vendedor do pedido.
 *   - origem: 'MANUAL' | 'AUTO' (só pra log)
 */
async function sincronizarConta(contaId, opts = {}) {
    const origem = opts.origem || 'MANUAL';
    const conta = await prisma.contaReceber.findUnique({
        where: { id: contaId },
        include: {
            pedido: {
                select: {
                    id: true, numero: true, idVendaContaAzul: true, dataVenda: true,
                    clienteId: true, especial: true, vendedorId: true
                }
            },
            parcelas: { orderBy: { numeroParcela: 'asc' } }
        }
    });

    if (!conta) throw new Error('Conta não encontrada');
    if (!conta.pedido) throw new Error('Conta sem pedido vinculado');
    if (conta.pedido.especial) throw new Error('Pedido especial sem espelho no CA');
    if (!conta.pedido.idVendaContaAzul) throw new Error('Pedido ainda não foi enviado ao CA');

    const baixadoPorId = opts.baixadoPorId || conta.pedido.vendedorId;
    if (!baixadoPorId) throw new Error('Sem usuário para registrar a baixa');

    const clienteCAId = conta.clienteId;
    const dataVendaStr = new Date(conta.pedido.dataVenda).toISOString().split('T')[0];

    // === DEBUG: busca ampla, mostra tudo que veio, mostra o que casou ===
    const dataVenda = new Date(dataVendaStr + 'T12:00:00-03:00');
    const de = new Date(dataVenda); de.setDate(de.getDate() - 60);
    const ate = new Date(dataVenda); ate.setDate(ate.getDate() + 365);
    const fmtDate = (d) => d.toISOString().split('T')[0];

    const parcelasTodasCliente = await contaAzulService.buscarParcelasContaAReceber(
        clienteCAId, fmtDate(de), fmtDate(ate),
        ['EM_ABERTO', 'ATRASADO', 'RECEBIDO', 'RECEBIDO_PARCIAL', 'ACQUITTED', 'PENDING', 'OVERDUE']
    );

    const debug = {
        pedidoNumero: conta.pedido.numero,
        idVendaCA: conta.pedido.idVendaContaAzul,
        clienteCAId,
        dataVenda: dataVendaStr,
        rangeBusca: `${fmtDate(de)} → ${fmtDate(ate)}`,
        parcelasDoCliente: parcelasTodasCliente.length,
        amostraCliente: parcelasTodasCliente.slice(0, 5).map(p => ({
            id: p.id, venc: p.data_vencimento, status: p.status, valor: p.valor
        })),
        parcelasQueCasaram: []
    };

    const parcelasCA = [];
    debug.referenciasEncontradas = [];
    for (const p of parcelasTodasCliente) {
        await new Promise(r => setTimeout(r, 150)); // throttle 150ms p/ respeitar 10 req/s do CA
        try {
            const det = await contaAzulService.buscarParcelaDetalhe(p.id);
            const refId = det?.evento?.referencia?.id;
            const refOrigem = det?.evento?.referencia?.origem;
            debug.referenciasEncontradas.push({
                parcelaId: det.id, venc: det.data_vencimento, status: det.status,
                refId, refOrigem,
                casa: refId === conta.pedido.idVendaContaAzul
            });
            if (refId === conta.pedido.idVendaContaAzul && refOrigem === 'VENDA') {
                parcelasCA.push(det);
                debug.parcelasQueCasaram.push({
                    id: det.id, numero: det.numero_parcela, status: det.status,
                    venc: det.data_vencimento, valor: det.valor_composicao?.valor_bruto
                });
            }
        } catch (e) {
            // skip
        }
    }

    if (parcelasCA.length === 0) {
        return {
            aplicadas: 0, verificadas: 0, pagasCA: 0, detalhes: [], debug,
            mensagem: `Cliente tem ${parcelasTodasCliente.length} parcela(s) no CA no range, mas NENHUMA casou com idVenda ${conta.pedido.idVendaContaAzul.slice(0, 8)}... . Pedido provavelmente não foi faturado (sem NF-e no CA).`
        };
    }

    parcelasCA.sort((a, b) => {
        const na = a.numero_parcela || 0, nb = b.numero_parcela || 0;
        if (na && nb) return na - nb;
        return new Date(a.data_vencimento || 0) - new Date(b.data_vencimento || 0);
    });

    const STATUS_PAGO_CA = ['RECEBIDO', 'RECEBIDO_PARCIAL', 'QUITADO', 'QUITADO_PARCIAL', 'ACQUITTED', 'PAID'];
    const pagasCA = parcelasCA.filter(p => STATUS_PAGO_CA.includes(p.status));

    let aplicadas = 0;
    let vencimentosAtualizados = 0;
    const detalhes = [];
    const logsAtendimento = []; // criados DEPOIS da transação (log lento não pode derrubar a baixa)
    const parcelasQuitadas = []; // ids quitados agora — p/ cancelar boleto Asaas pendente (fora da transação)
    const hoje = new Date();

    await prisma.$transaction(async (tx) => {
        for (let i = 0; i < conta.parcelas.length; i++) {
            const local = conta.parcelas[i];
            if (local.status === 'CANCELADO') continue;

            let caPar = parcelasCA.find(p => (p.numero_parcela || 0) === local.numeroParcela);
            if (!caPar) caPar = parcelasCA[i];
            if (!caPar) continue;

            // Atualiza vencimento se divergir (mesmo que ainda esteja em aberto)
            if (local.status !== 'PAGO' && caPar.data_vencimento) {
                const vencCA = new Date(caPar.data_vencimento + 'T12:00:00-03:00');
                const vencLocal = local.dataVencimento ? new Date(local.dataVencimento) : null;
                const diff = !vencLocal || vencCA.toISOString().split('T')[0] !== vencLocal.toISOString().split('T')[0];
                if (diff) {
                    await tx.parcela.update({ where: { id: local.id }, data: { dataVencimento: vencCA } });
                    vencimentosAtualizados++;
                    debug.vencimentosAtualizados = debug.vencimentosAtualizados || [];
                    debug.vencimentosAtualizados.push({
                        numeroParcela: local.numeroParcela,
                        antes: vencLocal ? vencLocal.toISOString().split('T')[0] : null,
                        depois: caPar.data_vencimento
                    });
                }
            }

            if (!STATUS_PAGO_CA.includes(caPar.status)) continue;

            // Soma todas as baixas para obter o valor total efetivamente recebido
            const todasBaixas = caPar.baixas || [];
            const valorPago = todasBaixas.length > 0
                ? todasBaixas.reduce((sum, b) => sum + Number(b?.valor_composicao?.valor_bruto || 0), 0)
                : Number(caPar.valor_composicao?.valor_bruto || local.valor);
            // Baixa "principal" = a de maior valor (representa melhor a conta em pagamentos parciais/múltiplos)
            const baixaPrincipal = todasBaixas.length > 0
                ? todasBaixas.slice().sort((a, b) => Number(b?.valor_composicao?.valor_bruto || 0) - Number(a?.valor_composicao?.valor_bruto || 0))[0]
                : null;
            const dataPgto = baixaPrincipal?.data_pagamento ? new Date(baixaPrincipal.data_pagamento + 'T12:00:00-03:00') : hoje;
            const forma = mapMetodoCA(baixaPrincipal?.metodo_pagamento || caPar.metodo_pagamento);
            // Conta financeira (banco/caixa) em que o dinheiro entrou. No CA a baixa traz UUID ou objeto {id,...}.
            const cfRaw = baixaPrincipal?.conta_financeira ?? caPar.conta_financeira ?? caPar.id_conta_financeira;
            const contaFinanceiraCaId = cfRaw ? (typeof cfRaw === 'string' ? cfRaw : cfRaw.id || null) : null;

            // Monta detalhe das baixas para a observação (ex: "Dinheiro R$120,50 + Outros R$21,24 (desc. R$21,23)")
            const detalheBaixas = todasBaixas.length > 1
                ? todasBaixas.map(b => {
                    const f = mapMetodoCA(b.metodo_pagamento) || 'Outros';
                    const vb = Number(b?.valor_composicao?.valor_bruto || 0);
                    const desc = Number(b?.valor_composicao?.valor_desconto || 0);
                    return desc > 0 ? `${f} R$${vb.toFixed(2)} (desc. R$${desc.toFixed(2)})` : `${f} R$${vb.toFixed(2)}`;
                }).join(' + ')
                : null;

            // Só atualiza (e conta como "aplicada") se houver mudança real.
            // Exceção: se já está PAGO com o valor certo MAS falta o banco (contaFinanceiraCaId),
            // e agora temos essa info do CA, atualiza mesmo assim para preencher (backfill natural).
            const valorPagoArredondado = Math.round(valorPago * 100) / 100;
            const faltaConta = !!contaFinanceiraCaId && !local.contaFinanceiraCaId;
            const jaAtualizado = local.status === 'PAGO' &&
                Math.abs((local.valorPago || 0) - valorPagoArredondado) < 0.01 &&
                !faltaConta;

            // Mesmo já-atualizada (status/valor/conta ok), pode FALTAR o ledger INDIVIDUAL
            // por conta — baixa antiga, feita antes do ledger existir. Sem ele, quando o CA
            // divide o pagamento em vários bancos (ex.: PIX Asaas + dinheiro Caixinha), o app
            // não identifica cada parte: a conciliação bancária e o saldo por conta ficam sem
            // o pedaço de cada banco. Nesse caso NÃO pula — cria só o ledger (backfill), sem
            // mexer no status/valor/conta da parcela.
            let soLedger = false;
            if (jaAtualizado) {
                const ledgerAtivo0 = await tx.pagamentoParcela.count({ where: { parcelaId: local.id, estornado: false } });
                if (ledgerAtivo0 > 0 || todasBaixas.length === 0) continue; // já tem ledger, ou nada do CA p/ espelhar
                soLedger = true;
            }

            const obsSync = detalheBaixas
                ? `CA: ${detalheBaixas}`
                : `Baixa sincronizada do Conta Azul (${caPar.status}) [${origem}]`;

            if (!soLedger) {
                await tx.parcela.update({
                    where: { id: local.id },
                    data: {
                        status: 'PAGO',
                        valorPago: valorPagoArredondado,
                        formaPagamento: forma,
                        contaFinanceiraCaId,
                        dataPagamento: dataPgto,
                        baixadoPorId,
                        observacao: obsSync
                    }
                });
                parcelasQuitadas.push(local.id);
            }

            // Ledger local espelhando as baixas do CA (uma linha por baixa, cada uma com o
            // SEU banco/caixa). Sem ele, recebimento que nasce no CA (ex.: PIX Asaas baixado
            // pelo fechamento do Caixa) fica invisível para a conciliação bancária e para o
            // realizado do Fluxo de Caixa. Só cria quando a parcela não tem nenhum pagamento
            // ativo — baixa manual do app já registra o próprio ledger (não duplicar).
            const ledgerAtivo = await tx.pagamentoParcela.count({ where: { parcelaId: local.id, estornado: false } });
            if (ledgerAtivo === 0) {
                const baixasLedger = todasBaixas.length > 0 ? todasBaixas : [null];
                for (const b of baixasLedger) {
                    const valorB = b ? Math.round(Number(b?.valor_composicao?.valor_bruto || 0) * 100) / 100 : valorPagoArredondado;
                    if (valorB <= 0) continue;
                    const cfB = b ? (b.conta_financeira ?? caPar.conta_financeira ?? caPar.id_conta_financeira) : null;
                    await tx.pagamentoParcela.create({
                        data: {
                            parcelaId: local.id,
                            valorRecebido: valorB,
                            valorDesconto: Math.round(Number(b?.valor_composicao?.valor_desconto || 0) * 100) / 100,
                            formaPagamento: b ? (mapMetodoCA(b.metodo_pagamento) || forma) : forma,
                            contaFinanceiraCaId: cfB ? (typeof cfB === 'string' ? cfB : cfB.id || null) : contaFinanceiraCaId,
                            dataPagamento: b?.data_pagamento ? new Date(b.data_pagamento + 'T12:00:00-03:00') : dataPgto,
                            observacao: `Baixa sincronizada do Conta Azul [${origem}]`,
                            registradoPorId: baixadoPorId
                        }
                    });
                }
            }

            // Log no histórico do cliente. Pulado no backfill em massa (opts.semLog) para não
            // gerar milhares de atendimentos repetidos ao só preencher o banco retroativo.
            // Também pulado no soLedger (só completou o ledger de uma baixa já registrada —
            // nada mudou para o cliente). Fica DEPOIS da transação (regra: log fora do $transaction).
            if (!opts.semLog && !soLedger) {
                logsAtendimento.push({
                    tipo: 'FINANCEIRO',
                    observacao: `Sync CA [${origem}] - parcela ${local.numeroParcela} - R$ ${valorPagoArredondado.toFixed(2)} (${forma || 'N/I'}) em ${dataPgto.toISOString().split('T')[0]}`,
                    clienteId: conta.clienteId,
                    idVendedor: baixadoPorId,
                    pedidoId: conta.pedidoId || null
                });
            }

            aplicadas++;
            detalhes.push({ numeroParcela: local.numeroParcela, valor: valorPagoArredondado, forma, data: dataPgto, soLedger });
        }

        const todas = await tx.parcela.findMany({ where: { contaReceberId: conta.id } });
        const pagas = todas.filter(p => p.status === 'PAGO').length;
        const canceladas = todas.filter(p => p.status === 'CANCELADO').length;
        let novoStatus;
        if (pagas + canceladas >= todas.length) novoStatus = 'QUITADO';
        else if (pagas > 0) novoStatus = 'PARCIAL';
        else novoStatus = 'ABERTO';

        await tx.contaReceber.update({ where: { id: conta.id }, data: { status: novoStatus } });
    }, { timeout: 20000, maxWait: 10000 }); // banco compartilhado é lento — nunca confiar no padrão de 5s

    // Log de histórico fora da transação: falha aqui nunca desfaz a baixa já aplicada
    for (const log of logsAtendimento) {
        try { await prisma.atendimento.create({ data: log }); }
        catch (logErr) { console.error('[Sync CA Baixas] Falha no log de histórico (baixa já efetivada):', logErr.message); }
    }

    // Parcela quitada pelo CA → cancela boleto/PIX Asaas pendente dela (senão o
    // cliente ainda pode pagar o boleto antigo = pagamento em dobro). Fora da
    // transação (chamada de rede) e melhor esforço — falha nunca desfaz a baixa.
    if (parcelasQuitadas.length) {
        const asaasService = require('./asaasService');
        for (const pid of parcelasQuitadas) {
            try { await asaasService.cancelarCobrancasDaParcela(pid, 'baixa veio do Conta Azul'); }
            catch (e) { console.error('[Sync CA Baixas] Falha ao cancelar cobrança Asaas (baixa já efetivada):', e.message); }
        }
    }

    return { aplicadas, vencimentosAtualizados, verificadas: parcelasCA.length, pagasCA: pagasCA.length, detalhes, debug };
}

/**
 * Loop em todas as contas a receber abertas (ABERTO/PARCIAL) com pedido CA
 * e sincroniza baixas. Throttled: 500ms entre contas p/ não sobrecarregar CA.
 */
async function sincronizarTodasAbertas() {
    const inicio = Date.now();
    const contas = await prisma.contaReceber.findMany({
        where: {
            status: { in: ['ABERTO', 'PARCIAL'] },
            pedido: {
                idVendaContaAzul: { not: null },
                especial: false
            }
        },
        select: { id: true, pedido: { select: { numero: true } } }
    });

    console.log(`🔄 [Sync CA Baixas] Verificando ${contas.length} conta(s) abertas...`);

    let totalContasAtualizadas = 0;
    let totalParcelasBaixadas = 0;
    let erros = 0;

    for (const c of contas) {
        try {
            const r = await sincronizarConta(c.id, { origem: 'AUTO' });
            if (r.aplicadas > 0) {
                totalContasAtualizadas++;
                totalParcelasBaixadas += r.aplicadas;
                console.log(`✅ [Sync CA Baixas] Pedido #${c.pedido?.numero || '?'}: ${r.aplicadas} parcela(s) baixada(s)`);
            }
        } catch (err) {
            erros++;
            console.warn(`⚠️ [Sync CA Baixas] Falha conta ${c.id} (#${c.pedido?.numero || '?'}): ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    const duracao = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`🔄 [Sync CA Baixas] Fim: ${totalContasAtualizadas} conta(s) atualizadas, ${totalParcelasBaixadas} parcela(s) baixadas, ${erros} erro(s) em ${duracao}s`);
    return { totalContasVerificadas: contas.length, totalContasAtualizadas, totalParcelasBaixadas, erros, duracaoSeg: Number(duracao) };
}

/**
 * Sincroniza todas as contas abertas de UM cliente específico com o CA.
 * Usado antes de verificar inadimplência na criação de pedido.
 * Sem throttle entre contas (clientes geralmente têm poucas contas abertas).
 */
async function sincronizarContasCliente(clienteId) {
    const contas = await prisma.contaReceber.findMany({
        where: {
            clienteId,
            status: { in: ['ABERTO', 'PARCIAL'] },
            pedido: { idVendaContaAzul: { not: null }, especial: false }
        },
        select: { id: true }
    });

    let sincronizadas = 0;
    for (const c of contas) {
        try {
            const r = await sincronizarConta(c.id, { origem: 'AUTO' });
            if (r.aplicadas > 0) sincronizadas++;
        } catch (err) {
            console.warn(`[Sync inadimplência] Falha conta ${c.id}: ${err.message}`);
        }
    }
    return { verificadas: contas.length, sincronizadas };
}

module.exports = { sincronizarConta, sincronizarTodasAbertas, sincronizarContasCliente, mapMetodoCA };
