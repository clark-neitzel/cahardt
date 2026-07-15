/**
 * Extrato automático do Asaas → conciliação bancária.
 *
 * Busca os lançamentos financeiros da conta Asaas (GET /financialTransactions)
 * e grava cada um como ExtratoLancamento — as MESMAS tabelas do OFX importado
 * à mão, na conta financeira vinculada ao Asaas (app_configs.asaas_conta_financeira_ca_id,
 * a mesma usada nas baixas de PIX). O id do lançamento no Asaas faz o papel do
 * FITID: unique por conta → buscar de novo NÃO duplica nada (idempotente), então
 * o worker repete a janela inteira a cada rodada sem risco.
 *
 * Depois de gravar, roda a conciliação automática da janela (mesma regra do
 * botão da tela: só fecha sozinho quando há exatamente UM candidato).
 */

const prisma = require('../config/database');
const asaasService = require('./asaasService');
const conciliacaoService = require('./conciliacaoBancariaService');

const TZ_OFFSET = '-03:00';
const dataSP = (ymd) => new Date(`${ymd}T12:00:00${TZ_OFFSET}`); // meio-dia SP: imune a virada de fuso
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDias = (s, n) => {
    const d = new Date(`${s}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const round2 = (v) => Math.round(Number(v) * 100) / 100;

async function contaAsaasCaId() {
    const cfg = await prisma.appConfig.findUnique({ where: { key: 'asaas_conta_financeira_ca_id' } });
    return typeof cfg?.value === 'string' && cfg.value ? cfg.value : null;
}

/** Um item do /financialTransactions do Asaas → formato do ExtratoLancamento. */
function mapearItem(t) {
    if (!t?.id || !t?.date || !Number(t.value)) return null;
    const valorAssinado = Number(t.value);
    return {
        fitId: String(t.id),
        data: String(t.date).slice(0, 10),
        valor: round2(Math.abs(valorAssinado)),
        tipo: valorAssinado < 0 ? 'DEBITO' : 'CREDITO',
        descricao: t.description || t.type || null,
        trnType: t.type || null, // PAYMENT_RECEIVED, PIX_CREDIT, TRANSFER, FEE…
        refNum: t.paymentId || t.transferId || null // pista: cobrança/transferência de origem
    };
}

/**
 * Busca a janela [hoje − dias, hoje] no Asaas e grava o que ainda não existe.
 * Devolve { ok, novos, duplicados, conciliadosAuto, periodo } — ou
 * { ok:false, motivo } quando a integração não está de pé (não é erro).
 */
async function sincronizar({ dias = 7 } = {}) {
    if (!asaasService.configurado()) {
        return { ok: false, motivo: 'Integração Asaas não configurada no servidor (ASAAS_API_KEY).' };
    }
    const conta = await contaAsaasCaId();
    if (!conta) {
        return { ok: false, motivo: 'A conta financeira do Asaas ainda não foi vinculada (asaas_conta_financeira_ca_id).' };
    }

    const ate = hojeSP();
    const de = somaDias(ate, -Math.max(1, Math.min(90, Number(dias) || 7)));

    // Paginação: 100 por página; teto de 50 páginas é só um guarda-corpo.
    const itens = [];
    let offset = 0;
    for (let pagina = 0; pagina < 50; pagina++) {
        const r = await asaasService.extratoFinanceiro({ startDate: de, finishDate: ate, offset, limit: 100 });
        itens.push(...r.itens);
        if (!r.temMais || r.itens.length === 0) break;
        offset += r.itens.length;
    }

    const lancamentos = itens.map(mapearItem).filter(Boolean);

    let novos = 0;
    if (lancamentos.length > 0) {
        const existentes = await prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId: conta, fitId: { in: lancamentos.map((l) => l.fitId) } },
            select: { fitId: true }
        });
        const jaTem = new Set(existentes.map((e) => e.fitId));
        const inserir = lancamentos.filter((l) => !jaTem.has(l.fitId));

        if (inserir.length > 0) {
            const datas = inserir.map((l) => l.data).sort();
            await prisma.$transaction(async (tx) => {
                const importacao = await tx.extratoImportacao.create({
                    data: {
                        contaFinanceiraCaId: conta,
                        nomeArquivo: 'Asaas (automático)',
                        dataInicio: dataSP(datas[0]),
                        dataFim: dataSP(datas[datas.length - 1]),
                        totalArquivo: lancamentos.length,
                        novos: inserir.length,
                        duplicados: lancamentos.length - inserir.length
                    }
                });
                await tx.extratoLancamento.createMany({
                    data: inserir.map((l) => ({
                        importacaoId: importacao.id,
                        contaFinanceiraCaId: conta,
                        fitId: l.fitId,
                        data: dataSP(l.data),
                        valor: l.valor,
                        tipo: l.tipo,
                        descricao: l.descricao,
                        trnType: l.trnType,
                        refNum: l.refNum
                    })),
                    skipDuplicates: true // corrida entre worker e botão manual não quebra
                });
            }, { timeout: 20000, maxWait: 10000 });
            novos = inserir.length;
        }
    }

    // Conciliação automática da janela — FORA da transação: é passo secundário,
    // falha aqui não pode desfazer o extrato já gravado.
    let conciliadosAuto = 0;
    try {
        const r = await conciliacaoService.conciliarAutomatico({ contaFinanceiraCaId: conta, de, ate, userId: null });
        conciliadosAuto = r.conciliados;
    } catch (e) {
        console.error('[AsaasExtrato] Conciliação automática falhou (extrato já gravado):', e.message);
    }

    const resultado = {
        ok: true,
        contaFinanceiraCaId: conta,
        periodo: { de, ate },
        doAsaas: lancamentos.length,
        novos,
        duplicados: lancamentos.length - novos,
        conciliadosAuto
    };

    // Registro da última busca (mostrado na tela) — falha aqui não derruba a sync.
    try {
        const value = { em: new Date().toISOString(), ...resultado };
        await prisma.appConfig.upsert({
            where: { key: 'asaas_extrato_ultima_sync' },
            create: { key: 'asaas_extrato_ultima_sync', value },
            update: { value }
        });
    } catch (e) {
        console.error('[AsaasExtrato] Falha ao registrar última sync:', e.message);
    }

    return resultado;
}

/** Para a tela: a integração está de pé? Qual conta é do Asaas? Quando buscou por último? */
async function info() {
    const [conta, sync] = await Promise.all([
        contaAsaasCaId(),
        prisma.appConfig.findUnique({ where: { key: 'asaas_extrato_ultima_sync' } })
    ]);
    return {
        configurado: asaasService.configurado() && !!conta,
        contaFinanceiraCaId: conta,
        ultimaSync: sync?.value || null
    };
}

module.exports = { sincronizar, info };
