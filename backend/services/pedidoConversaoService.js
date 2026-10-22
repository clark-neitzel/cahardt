// =====================================================================
// Conversão de pedido ESPECIAL → pedido normal (com NF).
// Regra do dono (07/2026): PIX é pagamento rastreado — ao receber qualquer
// valor via PIX Asaas num pedido especial, ele vira pedido normal:
//   - ganha número novo na sequência oficial (Conta Azul)
//   - statusEnvio ENVIAR (o worker cria a venda no CA em ~30s)
//   - mantém datas, itens, valores e vendedor
//   - gera aviso persistente p/ o popup do faturamento (a cada 5 min)
// Desde 07/2026 também existe a conversão MANUAL (botão na aba Especiais,
// permissão Pode_Aprovar_Especial): mesma mecânica, para qualquer forma de
// recebimento (dinheiro, boleto, PIX) ou ainda em aberto — caso do cliente
// que exige a NF. É o MESMO registro que muda de aba: nada duplica, e
// entrega/carga/pagamentos/devoluções continuam no pedido.
// =====================================================================
const prisma = require('../config/database');

// Sentinela: a transação aborta quando o pedido já deixou de ser especial (outra conversão
// ganhou a corrida). Não é erro — vira { jaConvertido: true }.
const JA_CONVERTIDO = Symbol('pedido-ja-convertido');
// Chave do advisory lock que serializa a OBTENÇÃO do número local (max+1; Pedido.numero não é unique).
const LOCK_NUMERO_PEDIDO = 74200771;

// Núcleo compartilhado: executa a conversão de um pedido especial já carregado.
// Retorna { numeroAntigo, numeroNovo } ou { jaConvertido: true } (idempotência real: só converte
// quem AINDA é especial, decidido no UPDATE). LANÇA erro se algo falhar (quem chama decide tratar).
async function executarConversao(pedido, { valorPago = null, criadoPorId = null, comoConverteu = 'PIX recebido' } = {}) {
    const { CA_SOMENTE_LEITURA } = require('../config/contaAzulModo');
    const numeroAntigo = pedido.numero;
    // Modo CA (não somente-leitura): número vem da API do CA — rede, então fica FORA da transação.
    const numeroCA = CA_SOMENTE_LEITURA ? null : await require('./contaAzulService').obterProximoNumeroPedido();
    let numeroNovo = numeroCA;

    try {
    await prisma.$transaction(async (tx) => {
        if (CA_SOMENTE_LEITURA) {
            // Duas conversões simultâneas não podem pegar o mesmo max+1: o lock é liberado no fim da transação.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NUMERO_PEDIDO})`;
            const agg = await tx.pedido.aggregate({ _max: { numero: true } });
            numeroNovo = (agg._max.numero || 0) + 1;
        }
        // Idempotência: só converte se ainda for especial (clique/gatilho repetido não passa daqui).
        const upd = await tx.pedido.updateMany({
            where: { id: pedido.id, especial: true },
            data: {
                especial: false,
                numero: numeroNovo,
                statusEnvio: 'ENVIAR', // worker fatura (local desde 23/07; NF-e sai pelo app)
                erroEnvio: null
            }
        });
        if (upd.count === 0) throw JA_CONVERTIDO;
        // Conta a receber acompanha: muda a origem; se não existir (especial antigo
        // criado em aberto), cria agora para o financeiro não ficar sem a conta.
        const contaExistente = await tx.contaReceber.findUnique({ where: { pedidoId: pedido.id } });
        if (contaExistente) {
            await tx.contaReceber.update({
                where: { pedidoId: pedido.id },
                data: { origem: 'FATURADO_CA' }
            });
        } else {
            const itens = pedido.itens || [];
            const valorTotal = itens.reduce((s, i) => s + (Number(i.valor) * Number(i.quantidade)), 0);
            if (valorTotal > 0) {
                const { gerarParcelasData } = require('./pedidoCalculos');
                const parcelasData = gerarParcelasData({
                    valorTotal,
                    qtdParcelas: pedido.qtdParcelas,
                    intervaloDias: pedido.intervaloDias,
                    primeiroVencimento: pedido.primeiroVencimento,
                    dataVenda: pedido.dataVenda
                });
                await tx.contaReceber.create({
                    data: {
                        pedidoId: pedido.id,
                        clienteId: pedido.clienteId,
                        origem: 'FATURADO_CA',
                        valorTotal: Math.round(valorTotal * 100) / 100,
                        status: 'ABERTO',
                        parcelas: { create: parcelasData }
                    }
                });
            }
        }
        await tx.pedidoConvertidoAviso.create({
            data: {
                pedidoId: pedido.id,
                numeroAntigo,
                numeroNovo,
                valorPago
            }
        });
    }, { timeout: 20000, maxWait: 10000 });
    } catch (e) {
        if (e === JA_CONVERTIDO) return { jaConvertido: true };
        throw e;
    }

    // Log de histórico fora da transação (não pode derrubar a conversão)
    try {
        if (criadoPorId || pedido.vendedorId) await prisma.atendimento.create({
            data: {
                tipo: 'FINANCEIRO',
                observacao: `Pedido especial ZZ#${numeroAntigo ?? '?'} foi CONVERTIDO no pedido #${numeroNovo} (${comoConverteu}; segue p/ faturamento e emissão da NF-e pelo app).`,
                clienteId: pedido.clienteId,
                idVendedor: criadoPorId || pedido.vendedorId || null,
                pedidoId: pedido.id
            }
        });
    } catch (logErr) {
        console.error('[Conversão] Falha no log (conversão já efetivada):', logErr.message);
    }

    console.log(`🔁 [Conversão] Especial ZZ#${numeroAntigo} → pedido #${numeroNovo} (${comoConverteu}).`);
    return { numeroAntigo, numeroNovo };
}

// ── Conversão AUTOMÁTICA fora do Asaas (Pix comum na entrega / Pix confirmado na conciliação) ──
// Decisão do dono (10/2026): só CONVERTE (vira pedido normal e entra na fila de NF-e). A NF-e
// NUNCA sai sozinha — o escritório emite depois de conferir o Pix no extrato.
const JANELA_VARREDURA_DIAS = 3; // a varredura é rede de segurança, NÃO backfill de histórico

// Corte FIXO da varredura: só entrega/conciliação a partir daqui. Sem isso, a 1ª execução depois do
// deploy converteria em massa o que já estava parado. (Decisão: 2026-10-21 00:00 de Brasília.)
const CORTE_VARREDURA = new Date('2026-10-21T00:00:00-03:00');

// Regra do dono: QUALQUER crédito confirmado no extrato do banco casado à baixa de um pedido
// especial converte o pedido (não só Pix). A condição está inline em converterEspeciaisDasBaixas;
// para restringir, é só filtrar ali.

async function _registrarAuditoriaConversao(pedido, r, { usuarioId, usuarioNome, comoConverteu }) {
    try {
        await prisma.auditLog.create({
            data: {
                acao: 'CONVERTER_ESPECIAL_AUTO',
                entidade: 'Pedido',
                entidadeId: pedido.id,
                detalhes: `Especial ZZ#${r.numeroAntigo ?? '?'} virou pedido #${r.numeroNovo} automaticamente (${comoConverteu}). NF-e NÃO emitida — conferir o Pix e emitir.`,
                usuarioId: usuarioId || 'SISTEMA',
                usuarioNome: usuarioNome || 'Sistema (conversão automática)'
            }
        });
    } catch (e) {
        console.error('[Conversão] Falha no audit log (conversão já efetivada):', e.message);
    }
    // Devolução ESPECIAL ativa anterior: foi registrada sem NF — avisa a contabilidade, mas converte.
    try {
        const dev = await prisma.devolucao.findFirst({
            where: { pedidoOriginalId: pedido.id, tipo: 'ESPECIAL', status: 'ATIVA' },
            select: { numero: true }
        });
        if (dev) {
            const msg = `Pedido #${r.numeroNovo} (ex-ZZ#${r.numeroAntigo ?? '?'}) foi convertido e tem a devolução nº ${dev.numero} registrada ANTES, sem NF — conferir com a contabilidade antes de emitir a NF-e de venda.`;
            // Atendimento exige vendedor: sem usuário e sem vendedor no pedido, só o auditLog registra.
            if (usuarioId || pedido.vendedorId) {
                await prisma.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO', observacao: msg, clienteId: pedido.clienteId,
                        idVendedor: usuarioId || pedido.vendedorId, pedidoId: pedido.id
                    }
                });
            }
            await prisma.auditLog.create({
                data: {
                    acao: 'CONVERTER_ESPECIAL_AUTO_DEVOLUCAO_ANTERIOR', entidade: 'Pedido', entidadeId: pedido.id,
                    detalhes: msg, usuarioId: usuarioId || 'SISTEMA', usuarioNome: usuarioNome || 'Sistema (conversão automática)'
                }
            });
        }
    } catch (e) {
        console.error('[Conversão] Falha no aviso de devolução anterior (conversão já efetivada):', e.message);
    }
}

const pedidoConversaoService = {
    /**
     * Converte um pedido pelo id, se (e só se) ele for especial e não for bonificação.
     * NUNCA lança. Idempotente (ver executarConversao).
     * @returns {{convertido:boolean, numeroAntigo?, numeroNovo?, erro?}}
     */
    converterPorPedidoId: async (pedidoId, { valorPago = null, criadoPorId = null, criadoPorNome = null, comoConverteu = 'PIX recebido', auditar = false } = {}) => {
        try {
            if (!pedidoId) return { convertido: false };
            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                include: {
                    cliente: { select: { Nome: true, NomeFantasia: true } },
                    itens: { select: { valor: true, quantidade: true } }
                }
            });
            if (!pedido || !pedido.especial || pedido.bonificacao) return { convertido: false };
            // TRAVA ÚNICA (vale para TODOS os gatilhos: Asaas, entrega, conciliação, varredura):
            // pedido cancelado/excluído/devolvido (total) NUNCA é ressuscitado (executarConversao grava
            // statusEnvio ENVIAR, que o colocaria de volta no faturamento e na fila de NF-e).
            if (pedido.cancelado || pedido.statusEnvio === 'EXCLUIDO' || pedido.statusEntrega === 'DEVOLVIDO') {
                return { convertido: false };
            }

            const r = await executarConversao(pedido, { valorPago, criadoPorId, comoConverteu });
            if (r.jaConvertido) return { convertido: false };
            if (auditar) await _registrarAuditoriaConversao(pedido, r, { usuarioId: criadoPorId, usuarioNome: criadoPorNome, comoConverteu });
            return { convertido: true, numeroAntigo: r.numeroAntigo, numeroNovo: r.numeroNovo };
        } catch (e) {
            console.error('[Conversão] Erro ao converter pedido especial:', e.message);
            return { convertido: false, erro: e.message };
        }
    },

    /**
     * Converte o pedido da cobrança se (e só se) ele for especial.
     * Idempotente: pedido já convertido não converte de novo.
     * Nunca lança — erro é logado e devolvido (o recebimento do PIX não pode falhar por isso).
     */
    converterSeEspecial: async (cobranca) => {
        if (!cobranca?.pedidoId) return { convertido: false };
        return pedidoConversaoService.converterPorPedidoId(cobranca.pedidoId, {
            valorPago: cobranca.valorRecebido ?? cobranca.valor ?? null,
            criadoPorId: cobranca.criadoPorId || null,
            comoConverteu: 'recebeu PIX'
        });
    },

    /**
     * GATILHO A — Pix COMUM registrado na entrega. Lê as linhas de pagamento JÁ gravadas e converte
     * se o pedido é especial, não foi devolvido e há linha de recebimento próprio (não de
     * responsável) com valor > 0 que seja Pix (ou ligada a cobrança Asaas — retry). Nunca lança.
     */
    converterSePixNaEntrega: async (pedidoId, { criadoPorId = null, criadoPorNome = null, comoConverteu = 'Pix na entrega' } = {}) => {
        try {
            const { classificarFormaApontada } = require('./inadimplenciaService');
            const { ehRecebimentoProprio } = require('./recebimentoEntregaService');
            const pedido = await prisma.pedido.findUnique({
                where: { id: pedidoId },
                select: {
                    especial: true, bonificacao: true, cancelado: true, statusEntrega: true,
                    pagamentosReais: {
                        select: {
                            valor: true, formaPagamentoNome: true, cobrancaAsaasId: true,
                            responsavelPapel: true, vendedorResponsavelId: true, escritorioResponsavel: true
                        }
                    }
                }
            });
            if (!pedido || !pedido.especial || pedido.bonificacao || pedido.cancelado) return { convertido: false };
            if (!['ENTREGUE', 'ENTREGUE_PARCIAL'].includes(pedido.statusEntrega)) return { convertido: false };
            const linhasPix = pedido.pagamentosReais.filter(l =>
                Number(l.valor) > 0 && ehRecebimentoProprio(l) &&
                (l.cobrancaAsaasId || classificarFormaApontada(l.formaPagamentoNome) === 'PIX'));
            if (linhasPix.length === 0) return { convertido: false };
            const valorPago = Math.round(linhasPix.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;
            return await pedidoConversaoService.converterPorPedidoId(pedidoId, {
                valorPago, criadoPorId, criadoPorNome, comoConverteu, auditar: true
            });
        } catch (e) {
            console.error('[Conversão] Erro no gatilho Pix da entrega:', e.message);
            return { convertido: false, erro: e.message };
        }
    },

    /**
     * GATILHO B — baixas amarradas a crédito do extrato. Converte cada pedido especial dono dessas
     * baixas. Nunca lança. @returns {Array<{pedidoId, numeroAntigo, numeroNovo}>} só os convertidos
     */
    converterEspeciaisDasBaixas: async (pagamentoIds, { userId = null, userNome = null, comoConverteu = 'crédito confirmado no extrato do banco' } = {}) => {
        const convertidos = [];
        try {
            const ids = [...new Set((pagamentoIds || []).filter(Boolean))];
            if (ids.length === 0) return convertidos;
            const baixas = await prisma.pagamentoParcela.findMany({
                where: { id: { in: ids }, estornado: false },
                select: {
                    id: true, valorRecebido: true,
                    parcela: { select: { contaReceber: { select: { pedido: { select: { id: true, especial: true, bonificacao: true } } } } } }
                }
            });
            const porPedido = new Map();
            for (const b of baixas) {
                const ped = b.parcela?.contaReceber?.pedido;
                if (!ped || !ped.especial || ped.bonificacao) continue;
                porPedido.set(ped.id, (porPedido.get(ped.id) || 0) + Number(b.valorRecebido || 0));
            }
            for (const [pedidoId, valor] of porPedido) {
                const r = await pedidoConversaoService.converterPorPedidoId(pedidoId, {
                    valorPago: Math.round(valor * 100) / 100, criadoPorId: userId, criadoPorNome: userNome, comoConverteu, auditar: true
                });
                if (r.convertido) convertidos.push({ pedidoId, numeroAntigo: r.numeroAntigo, numeroNovo: r.numeroNovo });
            }
        } catch (e) {
            console.error('[Conversão] Erro ao converter especiais das baixas:', e.message);
        }
        return convertidos;
    },

    /**
     * VARREDURA de segurança (scheduler): pega o que os gatilhos perderam (falha pontual, deploy no
     * meio). Conservadora: só olha os últimos JANELA_VARREDURA_DIAS dias E nunca antes do CORTE_VARREDURA (21/10/2026) — sem backfill do passado.
     */
    varrerEspeciaisPagos: async () => {
        const desde = new Date(Math.max(CORTE_VARREDURA.getTime(), Date.now() - JANELA_VARREDURA_DIAS * 24 * 3600 * 1000));
        let n = 0;
        try {
            // (a) Pix comum na entrega
            const cand = await prisma.pedido.findMany({
                where: {
                    especial: true, bonificacao: false, cancelado: false,
                    statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] },
                    dataEntrega: { gte: desde },
                    pagamentosReais: { some: { valor: { gt: 0 }, formaPagamentoNome: { contains: 'pix', mode: 'insensitive' } } }
                },
                select: { id: true }, take: 200
            });
            for (const c of cand) {
                const r = await pedidoConversaoService.converterSePixNaEntrega(c.id, { comoConverteu: 'Pix na entrega (varredura de segurança)' });
                if (r.convertido) { n++; console.log(`[Conversão/varredura] Pix de entrega → pedido #${r.numeroNovo}`); }
            }
            // (b) crédito de extrato (banco de verdade, nunca a Caixinha) casado a baixa
            const { contaEspecieId } = require('./recebimentoEntregaService');
            const especie = await contaEspecieId();
            const lancs = await prisma.extratoLancamento.findMany({
                where: {
                    status: 'CONCILIADO', tipo: 'CREDITO', conciliadoEm: { gte: desde },
                    ...(especie ? { contaFinanceiraCaId: { not: especie } } : {})
                },
                select: { id: true, pagamentoParcelaId: true }, take: 1000
            });
            if (lancs.length > 0) {
                const itens = await prisma.conciliacaoGrupoItem.findMany({
                    where: { extratoLancamentoId: { in: lancs.map(l => l.id) } }, select: { grupoId: true }
                });
                const doGrupo = itens.length > 0
                    ? await prisma.conciliacaoGrupoItem.findMany({
                        where: { grupoId: { in: [...new Set(itens.map(i => i.grupoId))] }, pagamentoParcelaId: { not: null } },
                        select: { pagamentoParcelaId: true }
                    })
                    : [];
                const pagIds = [...lancs.map(l => l.pagamentoParcelaId), ...doGrupo.map(i => i.pagamentoParcelaId)].filter(Boolean);
                const conv = await pedidoConversaoService.converterEspeciaisDasBaixas(pagIds, { comoConverteu: 'crédito confirmado no extrato do banco (varredura de segurança)' });
                for (const c of conv) { n++; console.log(`[Conversão/varredura] conciliação → pedido #${c.numeroNovo}`); }
            }
        } catch (e) {
            console.error('[Conversão/varredura] Erro:', e.message);
        }
        return n;
    },

    /**
     * Conversão MANUAL (botão da aba Especiais). Valida e LANÇA erro com mensagem
     * amigável — o controller devolve ao usuário. Qualquer forma de recebimento:
     * o que já foi recebido (PIX, dinheiro, boleto) fica no próprio pedido.
     */
    converterManual: async (pedidoId, usuarioId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                cliente: { select: { Nome: true, NomeFantasia: true } },
                itens: { select: { valor: true, quantidade: true } },
                contaReceber: { include: { parcelas: { select: { valorPago: true, status: true } } } },
                cobrancasAsaas: { where: { status: 'RECEBIDO' }, select: { valorRecebido: true, valor: true } }
            }
        });
        if (!pedido) throw new Error('Pedido não encontrado.');
        if (!pedido.especial) throw new Error('Este pedido não é especial (talvez já tenha sido convertido).');
        if (pedido.bonificacao) throw new Error('Pedido de bonificação não pode ser convertido.');

        // Total já recebido, em QUALQUER forma: PIX Asaas + baixas de parcela (dinheiro/boleto/etc.)
        const recebidoAsaas = pedido.cobrancasAsaas.reduce((s, c) => s + Number(c.valorRecebido ?? c.valor ?? 0), 0);
        const recebidoParcelas = (pedido.contaReceber?.parcelas || [])
            .reduce((s, p) => s + Number(p.valorPago || 0), 0);
        const valorPago = Math.max(recebidoAsaas, recebidoParcelas) || null;

        const r = await executarConversao(pedido, {
            valorPago,
            criadoPorId: usuarioId,
            comoConverteu: 'conversão manual'
        });
        if (r.jaConvertido) throw new Error('Este pedido não é especial (talvez já tenha sido convertido).');
        return { convertido: true, numeroAntigo: r.numeroAntigo, numeroNovo: r.numeroNovo };
    }
};

module.exports = pedidoConversaoService;
