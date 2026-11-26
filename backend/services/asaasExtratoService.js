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

// Comprovantes por sincronização: o BOTÃO da tela (e a rota manual) espera a resposta, então
// o lote é pequeno; o worker de 30 min roda em segundo plano e pode ter lote maior
// (scheduler passa limiteComprovantes: LIMITE_COMPROVANTES_WORKER).
const LIMITE_COMPROVANTES_MANUAL = 10;
const LIMITE_COMPROVANTES_WORKER = 25;

/**
 * Busca a janela [hoje − dias, hoje] no Asaas e grava o que ainda não existe.
 * Devolve { ok, novos, duplicados, conciliadosAuto, periodo } — ou
 * { ok:false, motivo } quando a integração não está de pé (não é erro).
 * limiteComprovantes: quantos links de comprovante buscar no fim (padrão pequeno = botão).
 */
async function sincronizar({ dias = 7, limiteComprovantes = LIMITE_COMPROVANTES_MANUAL } = {}) {
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

    // Link do comprovante (recebimentos e pagamentos) — passo secundário, em lote pequeno.
    // Falha aqui não toca no extrato já gravado nem na conciliação.
    let comprovantes = null;
    try {
        comprovantes = await completarComprovantes({ limite: limiteComprovantes });
    } catch (e) {
        console.error('[AsaasExtrato] Comprovantes falharam (extrato já gravado):', e.message);
    }

    const resultado = {
        ok: true,
        contaFinanceiraCaId: conta,
        periodo: { de, ate },
        doAsaas: lancamentos.length,
        novos,
        duplicados: lancamentos.length - novos,
        conciliadosAuto,
        comprovantes
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

// ── Comprovante (link) dos lançamentos ──────────────────────────────────────
// O item do /financialTransactions NÃO traz o link do comprovante (confirmado na
// documentação do Asaas: só paymentId/transferId). O link vem de GET /payments/{id}
// ou GET /transfers/{id} → transactionReceiptUrl. Por isso é um passo À PARTE da
// gravação: roda no fim da sincronização, em lote pequeno e em série, e NUNCA
// impede a gravação do lançamento nem a conciliação.
//
// Quais linhas buscam (e ainda sem link: null OU string vazia):
//  - CRÉDITO com refNum "pay_…"  → comprovante da cobrança (recebimento);
//  - DÉBITO com refNum que NÃO é "pay_" → comprovante da transferência (PIX/TED enviado,
//    GET /transfers/{id}). Como o tipo exato do Asaas para pagamento enviado ainda não foi
//    confirmado em produção (rodar /diag-asaas-comprovante), a regra é por EXCLUSÃO: tenta
//    qualquer débito exceto os que o tipo indica tarifa/estorno (TRN_TYPES_DEBITO_IGNORADOS,
//    comparação por "contém", sem diferenciar maiúscula). Se o Asaas responder 404, a
//    tentativa é gasta e segue (após 5 a linha sai da fila). Depois do diag, dá para apertar
//    trocando por uma lista fechada de tipos — é só mexer em TRN_TYPES_DEBITO_IGNORADOS.
const TRN_TYPES_DEBITO_IGNORADOS = ['FEE', 'REFUND', 'REVERSAL', 'CHARGEBACK'];
const MAX_TENTATIVAS_COMPROVANTE = 5;
const PAUSA_COMPROVANTE_MS = 200;
const MAX_ERROS_SEGUIDOS = 3; // 404 NÃO conta (é só 'esse não tem comprovante'); 429/401/403 interrompem direto
const TETO_LOTE_COMPROVANTES = 200; // teto de segurança do serviço; as rotas manuais impõem o seu (40)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Preenche comprovanteUrl dos lançamentos da conta Asaas que ainda não têm.
 * { limite = 10, dias = null }  — dias: só lançamentos dos últimos N dias (backfill).
 * Devolve { ok, tentados, gravados, semLink, erros, interrompido }. Nunca dá throw.
 */
async function completarComprovantes({ limite = LIMITE_COMPROVANTES_MANUAL, dias = null } = {}) {
    const res = { ok: true, tentados: 0, gravados: 0, semLink: 0, erros: 0, interrompido: null };
    try {
        if (!asaasService.configurado()) return { ...res, ok: false, motivo: 'Asaas não configurado.' };
        const conta = await contaAsaasCaId();
        if (!conta) return { ...res, ok: false, motivo: 'Conta do Asaas não vinculada.' };

        const take = Math.max(1, Math.min(TETO_LOTE_COMPROVANTES, Number(limite) || LIMITE_COMPROVANTES_MANUAL));
        const where = {
            contaFinanceiraCaId: conta,
            comprovanteTentativas: { lt: MAX_TENTATIVAS_COMPROVANTE },
            AND: [
                { refNum: { not: null } },
                // sem link: null OU '' (string vazia nunca seria rebuscada com só `null`)
                { OR: [{ comprovanteUrl: null }, { comprovanteUrl: '' }] },
                {
                    OR: [
                        { tipo: 'CREDITO', refNum: { startsWith: 'pay_' } },
                        {
                            tipo: 'DEBITO',
                            NOT: { refNum: { startsWith: 'pay_' } },
                            // `NOT` do Prisma exclui trnType null — por isso o OR explícito com null
                            OR: [
                                { trnType: null },
                                { NOT: TRN_TYPES_DEBITO_IGNORADOS.map((t) => ({ trnType: { contains: t, mode: 'insensitive' } })) }
                            ]
                        }
                    ]
                }
            ]
        };
        if (dias) where.data = { gte: dataSP(somaDias(hojeSP(), -Math.max(1, Math.min(400, Number(dias) || 1)))) };

        // Nunca tentadas primeiro (mais recentes antes); quem já falhou vai para o fim da fila.
        const linhas = await prisma.extratoLancamento.findMany({
            where,
            select: { id: true, refNum: true, tipo: true, comprovanteTentativas: true },
            orderBy: [{ comprovanteBuscadoEm: { sort: 'asc', nulls: 'first' } }, { data: 'desc' }],
            take
        });

        // Quantos ainda faltam (para o backfill saber se precisa rodar de novo). Falha aqui é só informativa.
        try { res.pendentesAntes = await prisma.extratoLancamento.count({ where }); } catch (_) { /* informativo */ }

        let errosSeguidos = 0;
        for (const l of linhas) {
            res.tentados++;
            let link = null;
            let falhou = false;
            let contaTentativa = true; // 5xx/rede = problema do Asaas, não do lançamento: não gasta tentativa
            try {
                link = l.refNum.startsWith('pay_')
                    ? await asaasService.comprovantePagamento(l.refNum)
                    : await asaasService.comprovanteTransferencia(l.refNum);
                errosSeguidos = 0;
            } catch (e) {
                const st = e.httpStatus || null;
                // 429 (limite) e 401/403 (chave sem permissão) não são culpa do lançamento:
                // interrompe o lote SEM gastar tentativa e sem gravar nada na linha.
                if (st === 429) { res.interrompido = 'limite de requisições do Asaas (429)'; break; }
                if (st === 401 || st === 403) { res.interrompido = `Asaas recusou a chave (${st}) — sem permissão para ler comprovantes`; break; }
                falhou = true;
                res.erros++;
                // 404 = "este não tem comprovante": gasta tentativa (já é o caso) mas não encerra o lote.
                if (st !== 404) errosSeguidos++;
                if (!st || st >= 500) contaTentativa = false;
                console.error(`[AsaasExtrato] Comprovante: falha (${st || 'rede'}) em ${l.refNum}`);
            }

            try {
                await prisma.extratoLancamento.update({
                    where: { id: l.id },
                    data: link
                        ? { comprovanteUrl: link, comprovanteBuscadoEm: new Date() }
                        : {
                            comprovanteBuscadoEm: new Date(),
                            ...(contaTentativa ? { comprovanteTentativas: { increment: 1 } } : {})
                        }
                });
                if (link) res.gravados++; else if (!falhou) res.semLink++;
            } catch (e) {
                console.error('[AsaasExtrato] Comprovante: falha ao gravar:', e.message);
            }

            if (errosSeguidos >= MAX_ERROS_SEGUIDOS) { res.interrompido = `${MAX_ERROS_SEGUIDOS} erros seguidos`; break; }
            await dormir(PAUSA_COMPROVANTE_MS);
        }
    } catch (e) {
        console.error('[AsaasExtrato] Comprovantes falharam:', e.message);
        return { ...res, ok: false, motivo: e.message };
    }
    return res;
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

module.exports = { sincronizar, info, completarComprovantes, LIMITE_COMPROVANTES_WORKER };
