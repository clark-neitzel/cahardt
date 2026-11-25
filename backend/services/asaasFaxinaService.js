// =====================================================================
// Faxina automática de cobranças Asaas de títulos JÁ QUITADOS.
//
// Por quê: quando o título é quitado no app (baixa, conciliação, caixa), o boleto/PIX que
// ficou aberto no Asaas é cancelado NO INSTANTE da baixa. Se o Asaas recusa ou está fora do
// ar nesse instante, ninguém tenta de novo — e o cliente pode pagar em dobro (boleto vencido
// continua pagável; QR de entrega vive 12 meses). Esta rotina refaz o cancelamento sozinha.
//
// Regras de segurança (NÃO afrouxar):
//  - só cobrança PENDENTE/EXPIRADO do ambiente atual (RECEBIDO/CANCELADO/outro ambiente ficam de fora);
//  - elegível = parcela PAGO/CANCELADO, OU conta da parcela QUITADO, OU conta do pedido QUITADO.
//    Conta CANCELADO fica de fora (pedido cancelado tem outro fluxo);
//  - parcela PAGO dentro de conta PARCIAL/ABERTO cancela SÓ as cobranças daquela parcela —
//    NUNCA a varredura do pedido (cancelaria o boleto de outra parcela ainda devida);
//  - carência de 10 min depois da quitação (deixa o fluxo normal terminar) e NÃO escolhe para
//    cancelar a cobrança criada DEPOIS da quitação (alguém gerou de propósito; vai para a lista
//    `ignoradaPorSerPosterior` do diag). ATENÇÃO — o cancelamento é por ESCOPO, não por cobrança:
//    o asaasService cancela TODAS as abertas da parcela (ou do pedido) de uma vez. Então uma
//    cobrança "posterior" ou em backoff que esteja no mesmo escopo de uma irmã elegível é
//    cancelada/retentada junto com ela. Aceito de propósito: o título já está quitado, então
//    cancelar é coerente (decisão do dono, 11/2026);
//  - NÃO consulta o Asaas (consultarCobranca dispara baixa/aviso) — só cancela;
//  - não roda no ambiente local nem sem ASAAS_API_KEY; ASAAS_FAXINA_DESLIGADA=1 desliga (lida a cada ciclo);
//  - recusa do Asaas → backoff em memória (30min,1h,2h,6h,24h); sem coluna nova no schema.
// =====================================================================
const prisma = require('../config/database');
const asaasService = require('./asaasService');

const CARENCIA_MIN = 10;
const BUSCA_MAX = 200;
const PAUSA_MS = 300;
const ESCADA_MIN = [30, 60, 120, 360, 1440];
const STATUS_ABERTOS = ['PENDENTE', 'EXPIRADO'];
const STATUS_PARCELA_FINAL = ['PAGO', 'CANCELADO'];
const CHAVE_RESUMO = 'asaas_faxina_ultima';
const LOG_MIN_INTERVALO_MS = 24 * 3600 * 1000;

// asaasPaymentId → { falhas, proxima:Date, ultimoErro, ultimoLog:number }
const _backoff = new Map();
let _emExecucao = false; // trava anti-sobreposição (a do scheduler é a 1ª; esta cobre chamada manual/simultânea)

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function proximaTentativa(falhas, agora) {
    const min = ESCADA_MIN[Math.min(Math.max(falhas, 1), ESCADA_MIN.length) - 1];
    return new Date(agora.getTime() + min * 60000);
}

function estaEmBackoff(paymentId, agora) {
    const b = _backoff.get(paymentId);
    return !!b && b.proxima > agora;
}

/** Cobranças em espera (para o diagnóstico). */
function estadoBackoff() {
    return [..._backoff.entries()].map(([paymentId, b]) => ({
        paymentId, falhas: b.falhas, proxima: b.proxima, ultimoErro: b.ultimoErro
    })).sort((a, b) => a.proxima - b.proxima);
}

function _resetarBackoff() { _backoff.clear(); }

/**
 * Cobranças abertas cujo título já foi quitado. Só leitura.
 * @returns { elegiveis, ignoradaPorSerPosterior, emCarencia } — cada item traz o gatilho.
 */
async function buscarElegiveis({ agora = new Date(), excluirPaymentIds = [] } = {}) {
    const lista = await prisma.cobrancaAsaas.findMany({
        where: {
            status: { in: STATUS_ABERTOS },
            ambiente: asaasService.AMBIENTE,
            ...(excluirPaymentIds.length > 0 ? { asaasPaymentId: { notIn: excluirPaymentIds } } : {}),
            OR: [
                { parcela: { status: { in: STATUS_PARCELA_FINAL } } },
                { parcela: { contaReceber: { status: 'QUITADO' } } },
                { pedido: { contaReceber: { status: 'QUITADO' } } }
            ]
        },
        select: {
            id: true, asaasPaymentId: true, tipo: true, status: true, valor: true, createdAt: true,
            parcelaId: true, pedidoId: true,
            parcela: { select: { id: true, status: true, updatedAt: true, contaReceber: { select: { id: true, status: true, updatedAt: true, pedidoId: true } } } },
            pedido: { select: { numero: true, contaReceber: { select: { id: true, status: true, updatedAt: true } } } }
        },
        orderBy: { createdAt: 'asc' },
        take: BUSCA_MAX
    });

    const limiteCarencia = new Date(agora.getTime() - CARENCIA_MIN * 60000);
    const elegiveis = [];
    const ignoradaPorSerPosterior = [];
    const emCarencia = [];

    for (const c of lista) {
        const gatilhos = [];
        if (c.parcela && STATUS_PARCELA_FINAL.includes(c.parcela.status)) gatilhos.push({ tipo: 'parcela', quitadoEm: c.parcela.updatedAt });
        if (c.parcela?.contaReceber?.status === 'QUITADO') gatilhos.push({ tipo: 'contaDaParcela', quitadoEm: c.parcela.contaReceber.updatedAt });
        if (c.pedido?.contaReceber?.status === 'QUITADO') gatilhos.push({ tipo: 'contaDoPedido', quitadoEm: c.pedido.contaReceber.updatedAt });
        if (gatilhos.length === 0) continue;

        const item = {
            cobrancaId: c.id, paymentId: c.asaasPaymentId, tipo: c.tipo, status: c.status, valor: Number(c.valor),
            criadaEm: c.createdAt, pedido: c.pedido?.numero ?? null, parcelaId: c.parcelaId, pedidoId: c.pedidoId,
            parcelaStatus: c.parcela?.status || null,
            contaId: c.parcela?.contaReceber?.id || c.pedido?.contaReceber?.id || null,
            contaStatus: c.parcela?.contaReceber?.status || c.pedido?.contaReceber?.status || null,
            gatilho: gatilhos[0].tipo
        };
        // criada DEPOIS da quitação → alguém gerou de propósito; não mexe
        const validos = gatilhos.filter((g) => c.createdAt < g.quitadoEm);
        if (validos.length === 0) {
            ignoradaPorSerPosterior.push({ ...item, quitadoEm: gatilhos[0].quitadoEm });
            continue;
        }
        const maduros = validos.filter((g) => g.quitadoEm < limiteCarencia);
        if (maduros.length === 0) {
            emCarencia.push({ ...item, quitadoEm: validos[0].quitadoEm });
            continue;
        }
        elegiveis.push({ ...item, gatilho: maduros[0].tipo, quitadoEm: maduros[0].quitadoEm });
    }
    return { elegiveis, ignoradaPorSerPosterior, emCarencia };
}

/**
 * Decide COMO cancelar cada cobrança (reconsulta o banco logo antes) e agrupa:
 *   parcela:<id> → cancelarCobrancasDaParcela   |   pedido:<id> → cancelarCobrancasDoPedido
 * Devolve Map<chave, { tipo, id, cobs:[item] }>; o que deixou de valer fica de fora.
 */
async function _classificar(elegiveis) {
    const grupos = new Map();
    const add = (tipo, id, item) => {
        const k = `${tipo}:${id}`;
        if (!grupos.has(k)) grupos.set(k, { tipo, id, cobs: [] });
        grupos.get(k).cobs.push(item);
    };
    for (const e of elegiveis) {
        // 1) parcela quitada/cancelada → só as cobranças DESSA parcela
        if (e.parcelaId) {
            const p = await prisma.parcela.findUnique({ where: { id: e.parcelaId }, select: { status: true } });
            if (p && STATUS_PARCELA_FINAL.includes(p.status)) { add('parcela', e.parcelaId, e); continue; }
        }
        // 2) conta QUITADA (reconsultada agora)
        let conta = null;
        if (e.contaId) conta = await prisma.contaReceber.findUnique({ where: { id: e.contaId }, select: { status: true } });
        if (!conta || conta.status !== 'QUITADO') continue; // mudou desde a busca: não mexe
        // cobrança presa a uma parcela: cancela só a parcela (todas já estão acertadas);
        // sem parcela (PIX de entrega): varre o pedido.
        if (e.parcelaId) add('parcela', e.parcelaId, e);
        else if (e.pedidoId) add('pedido', e.pedidoId, e);
    }
    return grupos;
}

function _logFalha(paymentId, b, agora) {
    const quando = agora.getTime();
    const devidoPorContagem = b.falhas === 1 || b.falhas === 5;
    const devidoPorTempo = b.falhas > 5 && (!b.ultimoLog || quando - b.ultimoLog >= LOG_MIN_INTERVALO_MS);
    if (devidoPorContagem || devidoPorTempo) {
        console.error(`[AsaasFaxina] Asaas recusou cancelar ${paymentId} (tentativa ${b.falhas}): ${b.ultimoErro}`);
        b.ultimoLog = quando;
    }
    if (b.falhas === 3) {
        console.warn(`[AsaasFaxina] ${paymentId} recusada 3x seguidas — pode estar PAGA no Asaas com webhook perdido. Conferir: diag-asaas-qr-vivos?conferirAsaas=1`);
    }
}

/**
 * Um ciclo da faxina. Nunca lança.
 * @param teto    máx. de cobranças tentadas por ciclo
 * @param dryRun  só classifica (não chama o Asaas, não grava resumo)
 */
async function executar({ teto = 30, dryRun = false, agora = new Date(), pausaMs = PAUSA_MS } = {}) {
    if (_emExecucao) return { pulado: true, motivo: 'ciclo anterior ainda em andamento' };
    _emExecucao = true;
    try {
        if (!asaasService.configurado()) return { pulado: true, motivo: 'Asaas não configurado (sem ASAAS_API_KEY)' };
        if (process.env.ASAAS_FAXINA_DESLIGADA === '1') return { pulado: true, motivo: 'desligada por ASAAS_FAXINA_DESLIGADA=1' };
        if (require('./backupService').ambienteLocal()) return { pulado: true, motivo: 'ambiente local' };

        const emEspera = [..._backoff.keys()].filter((id) => estaEmBackoff(id, agora));
        const { elegiveis } = await buscarElegiveis({ agora, excluirPaymentIds: emEspera });
        const grupos = await _classificar(elegiveis);

        let tentadas = 0, canceladas = 0, recusadas = 0, puladas = 0, primeiro = true;
        for (const g of grupos.values()) {
            const abertos = g.cobs.filter((c) => !estaEmBackoff(c.paymentId, agora));
            if (abertos.length === 0 || tentadas >= teto) { puladas += g.cobs.length; continue; }
            if (dryRun) { tentadas += g.cobs.length; continue; }
            if (!primeiro) await sleep(pausaMs);
            primeiro = false;

            tentadas += g.cobs.length;
            const motivo = 'título quitado (faxina automática)';
            let r;
            try {
                r = g.tipo === 'parcela'
                    ? await asaasService.cancelarCobrancasDaParcela(g.id, motivo)
                    : await asaasService.cancelarCobrancasDoPedido(g.id, motivo);
            } catch (e) {
                console.error(`[AsaasFaxina] erro inesperado em ${g.tipo}:${g.id}: ${e.message}`);
                r = { canceladas: 0, erros: g.cobs.map((c) => ({ paymentId: c.paymentId, erro: e.message })) };
            }
            canceladas += r?.canceladas || 0;
            const comErro = new Map((r?.erros || []).map((x) => [x.paymentId, x.erro]));
            for (const c of g.cobs) if (!comErro.has(c.paymentId)) _backoff.delete(c.paymentId); // saiu (ou já não está aberta)
            for (const [paymentId, desc] of comErro) {
                const b = _backoff.get(paymentId) || { falhas: 0, ultimoLog: 0 };
                b.falhas += 1;
                b.proxima = proximaTentativa(b.falhas, agora);
                b.ultimoErro = String(desc || 'erro').slice(0, 300);
                _backoff.set(paymentId, b);
                recusadas++;
                _logFalha(paymentId, b, agora);
            }
        }

        const resumo = {
            em: agora.toISOString(), elegiveis: elegiveis.length, tentadas, canceladas, recusadas,
            emBackoff: [..._backoff.keys()].filter((id) => estaEmBackoff(id, agora)).length, puladas
        };
        if (!dryRun) {
            try {
                await prisma.appConfig.upsert({
                    where: { key: CHAVE_RESUMO },
                    create: { key: CHAVE_RESUMO, value: resumo },
                    update: { value: resumo }
                });
            } catch (e) { console.error('[AsaasFaxina] Falha ao registrar resumo:', e.message); }
        }
        return { ok: true, dryRun, ...resumo };
    } catch (e) {
        console.error('[AsaasFaxina] erro inesperado no ciclo:', e.message);
        return { ok: false, erro: e.message };
    } finally {
        _emExecucao = false;
    }
}

module.exports = { buscarElegiveis, executar, estadoBackoff, _resetarBackoff, _backoff, CARENCIA_MIN, ESCADA_MIN, CHAVE_RESUMO };
