/**
 * Extrato do Conta Azul → app (Saldos por Conta).
 *
 * A API v2 do CA NÃO tem endpoint de extrato pronto (sondado em 07/2026:
 * /conta-financeira/{id}/extrato, /financeiro/extrato etc. → 404). O extrato
 * é reconstruído pelas fontes que existem:
 *
 *   1. TRANSFERÊNCIAS entre contas — GET /v1/financeiro/transferencias
 *      (endpoint real, fora da referência local) → tabela TransferenciaConta,
 *      idempotente por idTransferenciaCA. Uma transferência feita no CA passa
 *      a aparecer sozinha no app (Saldos por Conta / extrato da conta).
 *   2. Baixas de contas a RECEBER — já sincronizadas (contasReceberSyncService).
 *   3. Baixas de contas a PAGAR — já sincronizadas (contasPagarCaSyncService).
 *
 * Se o usuário já tinha digitado a transferência à mão no app, o sync ADOTA o
 * registro manual (mesmo dia/valor/contas → só grava o idTransferenciaCA nele)
 * em vez de duplicar.
 */

const prisma = require('../config/database');
const contaAzulService = require('./contaAzulService');

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const dataSP = (ymd) => new Date(`${ymd}T12:00:00-03:00`); // meio-dia SP: imune a fuso
const somaDias = (s, n) => {
    const d = new Date(`${s}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

/** CA conectado? (sem token → sync pula silenciosamente) */
async function temTokenCA() {
    try { return !!(await prisma.contaAzulConfig.findFirst()); }
    catch (_) { return false; }
}

/** Busca TODAS as transferências do período no CA (paginando por garantia). */
async function buscarTransferenciasCA(de, ate) {
    const todas = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
        const url = `https://api-v2.contaazul.com/v1/financeiro/transferencias?data_inicio=${de}&data_fim=${ate}&pagina=${pagina}&tamanho_pagina=100`;
        const resp = await contaAzulService._axiosGet(url, 'TRANSFERENCIAS_LISTAR');
        const itens = resp.data?.itens || [];
        todas.push(...itens);
        const total = Number(resp.data?.itens_totais || 0);
        if (todas.length >= total || itens.length === 0) break;
    }
    return todas;
}

/**
 * Importa as transferências do CA do período [hoje − dias, hoje].
 * Idempotente: repetir a janela não duplica nada.
 * Devolve { ok, novas, adotadas, jaImportadas, ignoradas, periodo } ou { ok:false, motivo }.
 */
async function sincronizarTransferencias({ dias = 30, de = null, ate = null } = {}) {
    if (!(await temTokenCA())) return { ok: false, motivo: 'Conta Azul não conectado.' };

    const fim = ate || hojeSP();
    const ini = de || somaDias(fim, -Math.max(1, dias));
    const itens = await buscarTransferenciasCA(ini, fim);

    const resumo = { ok: true, periodo: { de: ini, ate: fim }, total: itens.length, novas: 0, adotadas: 0, jaImportadas: 0, ignoradas: 0 };

    for (const t of itens) {
        const idCA = t?.id;
        const valor = round2(t?.valor);
        const dataStr = String(t?.data || '').slice(0, 10);
        const origemId = t?.origem?.conta_financeira?.id || null;
        const destinoId = t?.destino?.conta_financeira?.id || null;
        if (!idCA || !valor || !dataStr || (!origemId && !destinoId)) { resumo.ignoradas++; continue; }

        const existente = await prisma.transferenciaConta.findFirst({ where: { idTransferenciaCA: idCA } });
        if (existente) { resumo.jaImportadas++; continue; }

        // Transferência igual digitada à mão no app? Adotar em vez de duplicar.
        const diaIni = new Date(`${dataStr}T00:00:00-03:00`);
        const diaFim = new Date(`${dataStr}T23:59:59.999-03:00`);
        const manual = await prisma.transferenciaConta.findFirst({
            where: {
                idTransferenciaCA: null,
                valor,
                data: { gte: diaIni, lte: diaFim },
                contaOrigemId: origemId,
                contaDestinoId: destinoId
            }
        });
        if (manual) {
            await prisma.transferenciaConta.update({ where: { id: manual.id }, data: { idTransferenciaCA: idCA } });
            resumo.adotadas++;
            continue;
        }

        await prisma.transferenciaConta.create({
            data: {
                data: dataSP(dataStr),
                valor,
                contaOrigemId: origemId,
                contaDestinoId: destinoId,
                descricao: t?.descricao ? String(t.descricao).slice(0, 500) : 'Transferência (Conta Azul)',
                idTransferenciaCA: idCA
            }
        });
        resumo.novas++;
    }

    if (resumo.novas || resumo.adotadas) {
        console.log(`🔁 [Extrato CA] Transferências: ${resumo.novas} novas, ${resumo.adotadas} adotadas (${ini} → ${fim})`);
    }
    return resumo;
}

module.exports = { sincronizarTransferencias };
