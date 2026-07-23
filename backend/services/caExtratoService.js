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
const num = (v) => Number(v || 0);
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

// ─────────────────────────────────────────────────────────────
// DESPESAS lançadas direto no CA → Contas a Pagar do app
//
// O app conhece as despesas que nascem nele (manual/NF-e) e as do CSV
// importado. O que era lançado DIRETO no CA (folha, DAS, tarifa, boleto
// digitado lá) não aparecia aqui. Este sync busca as parcelas de despesa
// do CA (buscar por data de alteração), e para cada parcela que o app
// não conhece:
//   - se a conta do app já existe (idEventoCA) → só vincula a parcela;
//   - se veio do CSV importado (mesmo hash vencimento|cnpj/nome|descrição)
//     → ADOTA a conta existente (grava idParcelaCA nela), sem duplicar;
//   - senão → cria ContaPagar IMPORTADO_CA/NAO_ENVIAR com todas as
//     parcelas do evento (idParcelaCA em cada uma).
// As BAIXAS (e o banco/caixa de onde saiu o dinheiro) chegam pelo worker
// já existente conferirBaixasCA (30 min), que cobre toda parcela com
// idParcelaCA — por isso as parcelas nascem PENDENTE.
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');
const { normalizar, garantirCategorias } = require('./importacaoCaService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymdDe = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : '');
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Busca páginas do /contas-a-pagar/buscar alteradas na janela. */
async function buscarDespesasAlteradasCA(alteradoDe, alteradoAte) {
    const hoje = hojeSP();
    const vencDe = somaDias(hoje, -730);   // vencimento é filtro obrigatório: janela larga
    const vencAte = somaDias(hoje, 365);
    const itens = [];
    for (let pagina = 1; pagina <= 30; pagina++) {
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar` +
            `?pagina=${pagina}&tamanho_pagina=200&data_vencimento_de=${vencDe}&data_vencimento_ate=${vencAte}` +
            `&data_alteracao_de=${encodeURIComponent(alteradoDe + 'T00:00:00')}&data_alteracao_ate=${encodeURIComponent(alteradoAte + 'T23:59:59')}`;
        const resp = await contaAzulService._axiosGet(url, 'CONTAS_PAGAR_BUSCAR_SYNC');
        const pag = resp.data?.itens || [];
        itens.push(...pag);
        const total = Number(resp.data?.itens_totais || 0);
        if (itens.length >= total || pag.length === 0) break;
        await sleep(300);
    }
    return itens;
}

/** Encontra/cria o fornecedor local a partir do fornecedor {id, nome} do CA. */
async function resolverFornecedorCA(fornCA, cache) {
    if (!fornCA?.id) return { fornecedorId: null, cnpj: null };
    if (cache.has(fornCA.id)) return cache.get(fornCA.id);

    let fornecedor = await prisma.fornecedor.findUnique({ where: { contaAzulId: fornCA.id } });
    let cnpj = fornecedor?.cnpjCpf || null;

    if (!fornecedor) {
        // Documento da pessoa no CA (para casar com o fornecedor do CSV, que tem CNPJ)
        try {
            const resp = await contaAzulService._axiosGet(`https://api-v2.contaazul.com/v1/pessoas/${fornCA.id}`, 'PESSOA_DETALHE_SYNC');
            const p = resp.data || {};
            cnpj = String(p.documento || p.cpf_cnpj || p.cnpj || p.cpf || '').replace(/[^0-9A-Za-z]/g, '') || null;
        } catch (_) { /* segue sem documento */ }

        if (cnpj) fornecedor = await prisma.fornecedor.findFirst({ where: { cnpjCpf: cnpj } });
        if (!fornecedor && fornCA.nome) fornecedor = await prisma.fornecedor.findFirst({ where: { razaoSocial: fornCA.nome } });

        if (fornecedor && !fornecedor.contaAzulId) {
            fornecedor = await prisma.fornecedor.update({ where: { id: fornecedor.id }, data: { contaAzulId: fornCA.id } });
        }
        if (!fornecedor) {
            fornecedor = await prisma.fornecedor.create({
                data: {
                    contaAzulId: fornCA.id,
                    cnpjCpf: cnpj,
                    razaoSocial: fornCA.nome || 'Fornecedor sem nome',
                    origem: 'CA',
                    statusEnvioCA: 'NAO_ENVIAR'
                }
            });
        }
        cnpj = fornecedor.cnpjCpf || cnpj;
    }
    const r = { fornecedorId: fornecedor.id, cnpj };
    cache.set(fornCA.id, r);
    return r;
}

/**
 * Importa despesas do CA alteradas na janela [hoje − dias, hoje] (ou de/ate).
 * Idempotente. Devolve resumo { novas, adotadasCsv, vinculadas, jaConhecidas, puladas, erros }.
 */
async function sincronizarDespesas({ dias = 2, de = null, ate = null, limite = 400 } = {}) {
    if (!(await temTokenCA())) return { ok: false, motivo: 'Conta Azul não conectado.' };

    const fim = ate || hojeSP();
    const ini = de || somaDias(fim, -Math.max(1, dias));
    const itens = await buscarDespesasAlteradasCA(ini, fim);

    const resumo = {
        ok: true, periodo: { de: ini, ate: fim }, totalParcelasCA: itens.length,
        novas: 0, adotadasCsv: 0, vinculadas: 0, jaConhecidas: 0, puladas: 0, erros: []
    };
    const cacheForn = new Map();
    let processadasNovas = 0;

    for (const item of itens) {
        try {
            if (!item?.id) { resumo.puladas++; continue; }
            // Renegociada/perdida não vira conta nova (a renegociação gera outro evento)
            if (['RENEGOCIADO', 'PERDIDO'].includes(item.status_traduzido)) { resumo.puladas++; continue; }

            const jaTem = await prisma.parcelaPagar.findFirst({ where: { idParcelaCA: item.id }, select: { id: true } });
            if (jaTem) { resumo.jaConhecidas++; continue; }

            if (processadasNovas >= limite) { resumo.erros.push(`limite de ${limite} novas por rodada atingido — rode de novo para continuar`); break; }
            processadasNovas++;
            await sleep(300); // rate limit CA

            const det = await contaAzulService.buscarParcelaDetalhe(item.id);
            const evento = det?.evento || {};
            const origemEvento = evento?.referencia?.origem || null;
            if (evento?.tipo && evento.tipo !== 'DESPESA') { resumo.puladas++; continue; }
            if (['TRANSFERENCIA', 'SALDO_CONTA_BANCARIA'].includes(origemEvento)) { resumo.puladas++; continue; }

            // 1) A conta do evento já existe no app? Só vincular a parcela.
            const contaExistente = evento?.id
                ? await prisma.contaPagar.findUnique({ where: { idEventoCA: evento.id }, include: { parcelas: true } })
                : null;
            if (contaExistente) {
                const semVinculo = contaExistente.parcelas.find(p => !p.idParcelaCA && p.numeroParcela === (det.indice || 1))
                    || contaExistente.parcelas.find(p => !p.idParcelaCA && ymdDe(p.dataVencimento) === String(item.data_vencimento || ''));
                if (semVinculo) {
                    await prisma.parcelaPagar.update({ where: { id: semVinculo.id }, data: { idParcelaCA: item.id } });
                } else {
                    await prisma.parcelaPagar.create({
                        data: {
                            contaPagarId: contaExistente.id,
                            numeroParcela: det.indice || (contaExistente.parcelas.length + 1),
                            valor: round2(det?.valor_composicao?.valor_bruto ?? item.total),
                            dataVencimento: dataSP(String(item.data_vencimento)),
                            status: 'PENDENTE',
                            idParcelaCA: item.id
                        }
                    });
                }
                resumo.vinculadas++;
                continue;
            }

            const { fornecedorId, cnpj } = await resolverFornecedorCA(item.fornecedor, cacheForn);

            // 2) Já veio do CSV importado? (mesma chave natural) → adota, não duplica.
            const vencYmd = String(item.data_vencimento || '');
            const hashes = [
                sha1(`${vencYmd}|${cnpj || normalizar(item.fornecedor?.nome)}|${normalizar(item.descricao)}`),
                sha1(`${vencYmd}|${normalizar(item.fornecedor?.nome)}|${normalizar(item.descricao)}`)
            ];
            const csv = await prisma.contaPagar.findFirst({
                where: { hashImportacao: { in: hashes }, origem: 'IMPORTADO_CA', idEventoCA: null },
                include: { parcelas: true }
            });
            if (csv) {
                const parcelaCsv = csv.parcelas.find(p => !p.idParcelaCA);
                if (parcelaCsv) {
                    await prisma.parcelaPagar.update({ where: { id: parcelaCsv.id }, data: { idParcelaCA: item.id } });
                    // Evento de parcela única pode carregar o vínculo da conta também
                    if ((evento?.condicao_pagamento?.quantidade_parcelas || 1) === 1 && evento?.id) {
                        await prisma.contaPagar.update({ where: { id: csv.id }, data: { idEventoCA: evento.id } }).catch(() => { });
                    }
                    resumo.adotadasCsv++;
                    continue;
                }
            }

            // 3) Conta nova (lançada direto no CA): cria com TODAS as parcelas do evento.
            let parcelasCA = [];
            if (evento?.id) {
                try {
                    const respPar = await contaAzulService._axiosGet(
                        `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/${evento.id}/parcelas`, 'EVENTO_PARCELAS_SYNC'
                    );
                    parcelasCA = Array.isArray(respPar.data) ? respPar.data : (respPar.data?.itens || []);
                } catch (_) { /* cai no fallback de parcela única */ }
            }
            if (parcelasCA.length === 0) parcelasCA = [det];

            const rateios = (evento?.rateio || []).map(r => ({
                categoria: r.nome_categoria || 'Sem categoria',
                valor: round2(r.valor || r.valor_bruto || 0)
            })).filter(r => r.valor > 0);
            const nomesCat = [...new Set(rateios.map(r => r.categoria))];
            if (nomesCat.length) await garantirCategorias(nomesCat);

            const valorTotal = round2(parcelasCA.reduce((s, p) => s + Number(p?.valor_composicao?.valor_bruto || 0), 0)) || round2(item.total);

            await prisma.contaPagar.create({
                data: {
                    fornecedorId,
                    descricao: item.descricao || det.descricao || 'Despesa (Conta Azul)',
                    categoria: rateios.length === 1 ? rateios[0].categoria : null,
                    categoriaCaId: (evento?.rateio || [])[0]?.id_categoria || null,
                    origem: 'IMPORTADO_CA',
                    valorTotal,
                    status: 'ABERTO', // as baixas chegam pelo worker conferirBaixasCA e recalculam
                    competencia: evento?.data_competencia ? dataSP(String(evento.data_competencia).slice(0, 10)) : null,
                    statusEnvioCA: 'NAO_ENVIAR',
                    idEventoCA: evento?.id || null,
                    observacoes: 'Importada automaticamente do Conta Azul (extrato CA).',
                    rateios: rateios.length ? { create: rateios } : undefined,
                    parcelas: {
                        create: parcelasCA.map((p, i) => ({
                            numeroParcela: p.indice || (i + 1),
                            valor: round2(p?.valor_composicao?.valor_bruto || 0) || round2(item.total),
                            dataVencimento: p.data_vencimento ? dataSP(String(p.data_vencimento).slice(0, 10)) : dataSP(vencYmd),
                            status: 'PENDENTE',
                            idParcelaCA: p.id || null
                        }))
                    }
                }
            });
            resumo.novas++;
        } catch (e) {
            resumo.erros.push(`parcela ${item?.id}: ${e.response?.status || ''} ${e.message}`.trim());
            if (resumo.erros.length >= 20) { resumo.erros.push('muitos erros — rodada interrompida'); break; }
        }
    }

    if (resumo.novas || resumo.adotadasCsv || resumo.vinculadas) {
        console.log(`📥 [Extrato CA] Despesas: ${resumo.novas} novas, ${resumo.adotadasCsv} adotadas do CSV, ${resumo.vinculadas} vinculadas (${ini} → ${fim})`);
    }
    return resumo;
}

// ─────────────────────────────────────────────────────────────
// RECEBIMENTOS baixados direto no CA → espelho no app
//
// O sync de baixas existente (contasReceberSyncService) só cobre contas
// ABERTAS de pedidos faturados no CA. Baixa dada NO CA em parcela sem
// pedido no app (venda antiga/avulsa importada pelo caReceberImportService)
// não chegava: a parcela local ficava PENDENTE (cobrança seguia!) e o
// extrato derivado da conciliação ficava sem o crédito (PIX "sumido").
// Este sync busca as parcelas de RECEBER alteradas na janela e, para as
// pagas no CA:
//   - atualiza o arquivo ca_receber_importado (status/valores/baixas);
//   - se existe parcela local do importador sem nenhum pagamento ativo,
//     espelha as baixas do CA no ledger (pagamentoParcela, cada baixa com
//     o SEU banco) e quita a parcela/conta — o extrato da conciliação
//     nasce daí na rodada de sincronizarExtratoConciliacao.
// ─────────────────────────────────────────────────────────────

const STATUS_PAGO_CA_EXTRATO = ['RECEBIDO', 'RECEBIDO_PARCIAL', 'QUITADO', 'QUITADO_PARCIAL', 'ACQUITTED', 'PAID'];

/** Busca páginas do /contas-a-receber/buscar alteradas na janela. */
async function buscarReceberAlteradasCA(alteradoDe, alteradoAte) {
    const hoje = hojeSP();
    const vencDe = somaDias(hoje, -730);
    const vencAte = somaDias(hoje, 365);
    const itens = [];
    for (let pagina = 1; pagina <= 30; pagina++) {
        const url = `https://api-v2.contaazul.com/v1/financeiro/eventos-financeiros/contas-a-receber/buscar` +
            `?pagina=${pagina}&tamanho_pagina=200&data_vencimento_de=${vencDe}&data_vencimento_ate=${vencAte}` +
            `&data_alteracao_de=${encodeURIComponent(alteradoDe + 'T00:00:00')}&data_alteracao_ate=${encodeURIComponent(alteradoAte + 'T23:59:59')}`;
        const resp = await contaAzulService._axiosGet(url, 'CONTAS_RECEBER_BUSCAR_SYNC');
        const pag = resp.data?.itens || [];
        itens.push(...pag);
        const total = Number(resp.data?.itens_totais || 0);
        if (itens.length >= total || pag.length === 0) break;
        await sleep(300);
    }
    return itens;
}

/**
 * Espelha no app os recebimentos baixados direto no CA (janela de alteração).
 * Idempotente. Devolve { espelhadas, arquivadas, jaTinhamLedger, puladas, erros }.
 */
async function sincronizarRecebimentos({ dias = 2, de = null, ate = null, limite = 300 } = {}) {
    if (!(await temTokenCA())) return { ok: false, motivo: 'Conta Azul não conectado.' };
    const { mapMetodoCA } = require('./contasReceberSyncService');

    const fim = ate || hojeSP();
    const ini = de || somaDias(fim, -Math.max(1, dias));
    const itens = await buscarReceberAlteradasCA(ini, fim);

    const resumo = {
        ok: true, periodo: { de: ini, ate: fim }, totalParcelasCA: itens.length,
        pagasCA: 0, espelhadas: 0, arquivadas: 0, jaTinhamLedger: 0, puladas: 0, erros: []
    };
    let processadas = 0;

    for (const item of itens) {
        try {
            if (!item?.id) { resumo.puladas++; continue; }
            const statusCA = String(item.status_traduzido || item.status || '').toUpperCase();
            if (!STATUS_PAGO_CA_EXTRATO.includes(statusCA)) { resumo.puladas++; continue; }
            resumo.pagasCA++;

            const arch = await prisma.caReceberImportado.findUnique({ where: { idParcelaCA: item.id } });
            // Parcela de pedido do app: o sync de pedidos (contasReceberSyncService) cuida dela.
            if (arch?.temPedidoApp) { resumo.puladas++; continue; }

            // Sem parcela local para espelhar E arquivo já diz "pago" COM as baixas
            // arquivadas → nada a fazer. Se o arquivo está sem o detalhe (falha 429
            // na importação), segue para re-buscar — sem as baixas no JSON a 4ª fonte
            // do extrato não consegue gerar a linha da conciliação.
            const jaArquivadaPaga = arch && STATUS_PAGO_CA_EXTRATO.includes(String(arch.status || '').toUpperCase());
            const temBaixasArquivadas = !!(arch?.dadosDetalhe && Array.isArray(arch.dadosDetalhe.baixas) && arch.dadosDetalhe.baixas.length);
            if (!arch?.parcelaLocalId && jaArquivadaPaga && temBaixasArquivadas) { resumo.puladas++; continue; }

            if (processadas >= limite) { resumo.erros.push(`limite de ${limite} por rodada atingido — rode de novo para continuar`); break; }
            processadas++;
            await sleep(300); // rate limit CA

            const det = await contaAzulService.buscarParcelaDetalhe(item.id);

            // Mantém o arquivo fresco (baixas novas do CA passam a constar)
            if (arch) {
                await prisma.caReceberImportado.update({
                    where: { idParcelaCA: item.id },
                    data: {
                        status: statusCA,
                        valorTotal: item.total != null ? round2(item.total) : arch.valorTotal,
                        valorPago: item.pago != null ? round2(item.pago) : arch.valorPago,
                        dadosBusca: item,
                        dadosDetalhe: det || undefined
                    }
                });
                resumo.arquivadas++;
            } else {
                const evento = det?.evento || null;
                await prisma.caReceberImportado.create({
                    data: {
                        idParcelaCA: item.id,
                        idEventoCA: evento?.id || null,
                        clienteCaId: item.cliente?.id || null,
                        clienteNome: item.cliente?.nome || null,
                        descricao: item.descricao || det?.descricao || null,
                        origemEventoCA: evento?.referencia?.origem || null,
                        status: statusCA,
                        dataVencimento: item.data_vencimento ? new Date(item.data_vencimento + 'T12:00:00-03:00') : null,
                        valorTotal: item.total != null ? round2(item.total) : null,
                        valorPago: item.pago != null ? round2(item.pago) : null,
                        dadosBusca: item,
                        dadosDetalhe: det || undefined
                    }
                });
                resumo.arquivadas++;
            }

            if (!arch?.parcelaLocalId) continue; // sem camada operacional — extrato sai do arquivo

            const parcela = await prisma.parcela.findUnique({ where: { id: arch.parcelaLocalId } });
            if (!parcela || parcela.status === 'CANCELADO') { resumo.puladas++; continue; }
            const ledgerAtivo = await prisma.pagamentoParcela.count({ where: { parcelaId: parcela.id, estornado: false } });
            if (ledgerAtivo > 0) { resumo.jaTinhamLedger++; continue; }

            const baixas = det?.baixas || [];
            if (!baixas.length) { resumo.puladas++; continue; }
            const valorPago = round2(baixas.reduce((s, b) => s + num(b?.valor_composicao?.valor_bruto), 0));
            const principal = baixas.slice().sort((a, b) => num(b?.valor_composicao?.valor_bruto) - num(a?.valor_composicao?.valor_bruto))[0];
            const cfP = principal?.conta_financeira ?? det?.conta_financeira;
            const contaP = cfP ? (typeof cfP === 'string' ? cfP : cfP.id || null) : null;
            const dataP = principal?.data_pagamento ? new Date(principal.data_pagamento + 'T12:00:00-03:00') : new Date();

            await prisma.$transaction(async (tx) => {
                for (const b of baixas) {
                    const valorB = round2(num(b?.valor_composicao?.valor_bruto));
                    if (valorB <= 0) continue;
                    const cfB = b?.conta_financeira ?? det?.conta_financeira;
                    await tx.pagamentoParcela.create({
                        data: {
                            parcelaId: parcela.id,
                            valorRecebido: valorB,
                            valorDesconto: round2(num(b?.valor_composicao?.valor_desconto)),
                            formaPagamento: mapMetodoCA(b?.metodo_pagamento) || 'Outro',
                            contaFinanceiraCaId: cfB ? (typeof cfB === 'string' ? cfB : cfB.id || null) : contaP,
                            dataPagamento: b?.data_pagamento ? new Date(b.data_pagamento + 'T12:00:00-03:00') : dataP,
                            observacao: 'Baixa espelhada do Conta Azul (recebimento em conta importada)'
                        }
                    });
                }
                await tx.parcela.update({
                    where: { id: parcela.id },
                    data: {
                        status: valorPago + 0.01 >= num(parcela.valor) ? 'PAGO' : 'PARCIAL',
                        valorPago,
                        formaPagamento: mapMetodoCA(principal?.metodo_pagamento) || null,
                        contaFinanceiraCaId: contaP,
                        dataPagamento: dataP,
                        observacao: 'Baixa sincronizada do Conta Azul (extrato CA)'
                    }
                });
                const irmas = await tx.parcela.findMany({
                    where: { contaReceberId: parcela.contaReceberId, status: { not: 'CANCELADO' } },
                    select: { id: true, status: true }
                });
                const todasPagas = irmas.every(p => p.id === parcela.id ? valorPago + 0.01 >= num(parcela.valor) : p.status === 'PAGO');
                await tx.contaReceber.update({
                    where: { id: parcela.contaReceberId },
                    data: { status: todasPagas ? 'PAGO' : 'PARCIAL' }
                });
            }, { timeout: 20000, maxWait: 10000 });
            resumo.espelhadas++;
        } catch (e) {
            resumo.erros.push(`parcela ${item?.id}: ${e.response?.status || ''} ${e.message}`.trim());
            if (resumo.erros.length >= 20) { resumo.erros.push('muitos erros — rodada interrompida'); break; }
        }
    }

    if (resumo.espelhadas || resumo.arquivadas) {
        console.log(`💰 [Extrato CA] Recebimentos: ${resumo.espelhadas} baixa(s) espelhada(s), ${resumo.arquivadas} arquivo(s) atualizado(s) (${ini} → ${fim})`);
    }
    return resumo;
}

// ─────────────────────────────────────────────────────────────
// EXTRATO na CONCILIAÇÃO BANCÁRIA para contas do Conta Azul
//
// A Conciliação Bancária mostra o extrato importado por OFX (Sicoob etc.)
// ou pela API do Asaas. A conta "Conta PJ Conta Azul IP" não tem OFX nem
// API de extrato — então a tela ficava vazia para ela. Como TODO movimento
// dessa conta agora chega ao app (baixas de receber/pagar sincronizadas +
// transferências e despesas importadas do CA), o extrato é gerado a partir
// desses movimentos, nas MESMAS tabelas do OFX (ExtratoLancamento):
//   - recebimento  → CRÉDITO, já vinculado à baixa (nasce CONCILIADO)
//   - pagamento    → DÉBITO, idem
//   - transferência→ CRÉDITO/DÉBITO com etiqueta TRANSFERENCIA
// Idempotente pelo fitId (id do movimento no app). Só gera para contas SEM
// outra fonte de extrato: por padrão a conta com "conta azul" no nome;
// dá para mudar pela config ca_extrato_conciliacao_contas (array de UUIDs).
// ─────────────────────────────────────────────────────────────

/** Contas-alvo do extrato derivado (nunca a do Asaas, que tem API própria).
 *  Config ca_extrato_conciliacao_contas: array de UUIDs; ARRAY VAZIO desliga. */
async function contasAlvoConciliacao() {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'ca_extrato_conciliacao_contas' } });
        if (Array.isArray(cfg?.value)) return cfg.value;
    } catch (_) { /* usa o padrão */ }
    const contas = await prisma.contaFinanceira.findMany({
        where: { nomeBanco: { contains: 'conta azul', mode: 'insensitive' }, ativo: true },
        select: { id: true }
    });
    return contas.map(c => c.id);
}

/**
 * Gera as linhas de extrato (conciliação bancária) das contas do CA no
 * período [hoje − dias, hoje]. Idempotente por (conta, fitId).
 */
async function sincronizarExtratoConciliacao({ dias = 30, de = null, ate = null } = {}) {
    const contas = await contasAlvoConciliacao();
    if (!contas.length) return { ok: false, motivo: 'Nenhuma conta do Conta Azul encontrada (config ca_extrato_conciliacao_contas).' };

    const fim = ate || hojeSP();
    const ini = de || somaDias(fim, -Math.max(1, dias));
    const iniDt = new Date(`${ini}T00:00:00-03:00`);
    const fimDt = new Date(`${fim}T23:59:59.999-03:00`);
    const resultados = [];

    for (const conta of contas) {
        const [recs, pags, transfs] = await Promise.all([
            prisma.pagamentoParcela.findMany({
                where: { contaFinanceiraCaId: conta, estornado: false, dataPagamento: { gte: iniDt, lte: fimDt } },
                include: {
                    parcela: {
                        select: {
                            numeroParcela: true,
                            contaReceber: { select: { cliente: { select: { Nome: true, NomeFantasia: true } }, pedido: { select: { numero: true } } } }
                        }
                    }
                }
            }),
            prisma.pagamentoParcelaPagar.findMany({
                where: { contaFinanceiraCaId: conta, estornado: false, dataPagamento: { gte: iniDt, lte: fimDt } },
                include: {
                    parcelaPagar: {
                        select: {
                            numeroParcela: true,
                            contaPagar: { select: { descricao: true, fornecedor: { select: { razaoSocial: true } } } }
                        }
                    }
                }
            }),
            prisma.transferenciaConta.findMany({
                where: { data: { gte: iniDt, lte: fimDt }, OR: [{ contaOrigemId: conta }, { contaDestinoId: conta }] }
            })
        ]);

        const linhas = [];
        for (const r of recs) {
            const valor = round2(r.valorRecebido);
            if (valor <= 0) continue;
            const cli = r.parcela?.contaReceber?.cliente;
            const ped = r.parcela?.contaReceber?.pedido?.numero;
            linhas.push({
                fitId: `ca-rec-${r.id}`,
                data: r.dataPagamento,
                valor,
                tipo: 'CREDITO',
                descricao: `Recebimento ${cli?.NomeFantasia || cli?.Nome || 'cliente'}${ped ? ` · pedido ${ped}` : ''}`,
                trnType: 'CREDIT',
                pagamentoParcelaId: r.id
            });
        }
        for (const p of pags) {
            const valor = round2(num(p.valorPago) + num(p.juros) + num(p.multa));
            if (valor <= 0) continue;
            const cp = p.parcelaPagar?.contaPagar;
            linhas.push({
                fitId: `ca-pag-${p.id}`,
                data: p.dataPagamento,
                valor,
                tipo: 'DEBITO',
                descricao: `Pagamento ${cp?.fornecedor?.razaoSocial || ''} · ${cp?.descricao || 'despesa'}`.trim(),
                trnType: 'DEBIT',
                pagamentoParcelaPagarId: p.id
            });
        }
        for (const t of transfs) {
            const entrou = t.contaDestinoId === conta;
            linhas.push({
                fitId: `ca-tr-${t.id}`,
                data: t.data,
                valor: round2(t.valor),
                tipo: entrou ? 'CREDITO' : 'DEBITO',
                descricao: t.descricao || 'Transferência entre contas',
                trnType: 'XFER',
                transferencia: t
            });
        }

        // 4ª fonte: recebimentos arquivados de ca_receber_importado — parcelas que
        // já estavam PAGAS no CA quando importadas (sem parcela local, sem pedido).
        // A baixa vive só no JSON arquivado; sem isto o crédito (ex.: PIX) nunca
        // aparecia na conciliação da conta do CA.
        const archs = await prisma.caReceberImportado.findMany({
            where: {
                status: { in: STATUS_PAGO_CA_EXTRATO },
                temPedidoApp: false,
                parcelaLocalId: null,
                OR: [
                    { dataVencimento: { gte: new Date(iniDt.getTime() - 120 * 86400000), lte: new Date(fimDt.getTime() + 60 * 86400000) } },
                    { dataVencimento: null }
                ]
            },
            select: { idParcelaCA: true, clienteNome: true, descricao: true, dadosDetalhe: true }
        });
        const arqCandidatas = [];
        for (const a of archs) {
            const baixas = a.dadosDetalhe?.baixas || [];
            baixas.forEach((b, idx) => {
                // Conta pode vir na baixa OU no nível do detalhe da parcela (varia no CA)
                const cf = b?.conta_financeira ?? a.dadosDetalhe?.conta_financeira ?? a.dadosDetalhe?.id_conta_financeira;
                const cfId = cf ? (typeof cf === 'string' ? cf : cf.id || null) : null;
                if (cfId !== conta) return;
                const valor = round2(num(b?.valor_composicao?.valor_bruto));
                const dataStr = String(b?.data_pagamento || '').slice(0, 10);
                if (valor <= 0 || !dataStr) return;
                const data = dataSP(dataStr);
                if (data < iniDt || data > fimDt) return;
                arqCandidatas.push({
                    fitId: `ca-arq-${a.idParcelaCA}-${idx}`,
                    data, valor, tipo: 'CREDITO',
                    descricao: `Recebimento ${a.clienteNome || 'cliente'}${a.descricao ? ` · ${a.descricao}` : ''}`.slice(0, 500),
                    trnType: 'CREDIT'
                });
            });
        }
        if (arqCandidatas.length) {
            // Anti-duplicidade com as linhas derivadas do ledger do app (ca-rec/ca-tr):
            // se a mesma baixa também existe como pagamentoParcela, a linha ca-rec cobre.
            const poolApp = linhas.map(l => ({ t: new Date(l.data).getTime(), valor: l.valor, tipo: l.tipo, usada: false }));
            for (const c of arqCandidatas) {
                const t = new Date(c.data).getTime();
                const dup = poolApp.find(x => !x.usada && x.tipo === c.tipo && Math.abs(x.valor - c.valor) <= 0.01 && Math.abs(x.t - t) <= 2 * 86400000);
                if (dup) { dup.usada = true; continue; }
                linhas.push(c);
            }
        }

        let novos = 0;
        if (linhas.length) {
            const existentes = await prisma.extratoLancamento.findMany({
                where: { contaFinanceiraCaId: conta, fitId: { in: linhas.map(l => l.fitId) } },
                select: { fitId: true }
            });
            const jaTem = new Set(existentes.map(e => e.fitId));

            // ⚠️ ANTI-DUPLICIDADE com extrato importado à mão (PDF do CA / OFX):
            // a mesma movimentação pode já existir como linha importada. Não gerar
            // a linha derivada quando (a) a baixa já está vinculada a alguma linha,
            // ou (b) existe linha importada com mesmo sentido/valor em ±2 dias.
            const margemIni = new Date(iniDt.getTime() - 3 * 86400000);
            const margemFim = new Date(fimDt.getTime() + 3 * 86400000);
            const importadas = await prisma.extratoLancamento.findMany({
                where: {
                    contaFinanceiraCaId: conta,
                    data: { gte: margemIni, lte: margemFim },
                    NOT: { fitId: { startsWith: 'ca-' } }
                },
                select: { data: true, valor: true, tipo: true, pagamentoParcelaId: true, pagamentoParcelaPagarId: true }
            });
            const recVinculadas = new Set(importadas.map(i => i.pagamentoParcelaId).filter(Boolean));
            const pagVinculadas = new Set(importadas.map(i => i.pagamentoParcelaPagarId).filter(Boolean));
            const pool = importadas.map(i => ({ t: new Date(i.data).getTime(), valor: round2(i.valor), tipo: i.tipo, usada: false }));
            const casaComImportada = (l) => {
                const t = new Date(l.data).getTime();
                const p = pool.find(x => !x.usada && x.tipo === l.tipo && Math.abs(x.valor - l.valor) <= 0.01 && Math.abs(x.t - t) <= 2 * 86400000);
                if (p) { p.usada = true; return true; }
                return false;
            };

            const inserir = linhas.filter(l => {
                if (jaTem.has(l.fitId)) return false;
                if (l.pagamentoParcelaId && recVinculadas.has(l.pagamentoParcelaId)) return false;
                if (l.pagamentoParcelaPagarId && pagVinculadas.has(l.pagamentoParcelaPagarId)) return false;
                return !casaComImportada(l);
            });

            if (inserir.length) {
                const datas = inserir.map(l => new Date(l.data).getTime()).sort((a, b) => a - b);
                await prisma.$transaction(async (tx) => {
                    const importacao = await tx.extratoImportacao.create({
                        data: {
                            contaFinanceiraCaId: conta,
                            nomeArquivo: 'Conta Azul (automático)',
                            dataInicio: new Date(datas[0]),
                            dataFim: new Date(datas[datas.length - 1]),
                            totalArquivo: linhas.length,
                            novos: inserir.length,
                            duplicados: linhas.length - inserir.length
                        }
                    });
                    for (const l of inserir) {
                        const criado = await tx.extratoLancamento.create({
                            data: {
                                importacaoId: importacao.id,
                                contaFinanceiraCaId: conta,
                                fitId: l.fitId,
                                data: l.data,
                                valor: l.valor,
                                tipo: l.tipo,
                                descricao: l.descricao,
                                trnType: l.trnType,
                                // Extrato derivado dos próprios movimentos → já nasce fechado
                                status: l.transferencia ? 'TRANSFERENCIA' : 'CONCILIADO',
                                conciliadoAuto: true,
                                conciliadoEm: new Date(),
                                pagamentoParcelaId: l.pagamentoParcelaId || null,
                                pagamentoParcelaPagarId: l.pagamentoParcelaPagarId || null,
                                obs: 'Gerado do Conta Azul (extrato automático)'
                            }
                        });
                        // Liga a transferência à sua linha (para o "desfazer" da tela funcionar)
                        if (l.transferencia && !l.transferencia.extratoLancamentoId) {
                            await tx.transferenciaConta.update({
                                where: { id: l.transferencia.id },
                                data: { extratoLancamentoId: criado.id }
                            }).catch(() => { });
                        }
                    }
                }, { timeout: 20000, maxWait: 10000 });
                novos = inserir.length;
            }
        }
        resultados.push({ conta, linhas: linhas.length, novos, jaExistiam: linhas.length - novos });
    }

    const totalNovos = resultados.reduce((s, r) => s + r.novos, 0);
    if (totalNovos) console.log(`🏦 [Extrato CA] Conciliação: ${totalNovos} linha(s) de extrato gerada(s) (${ini} → ${fim})`);
    return { ok: true, periodo: { de: ini, ate: fim }, contas: resultados };
}

module.exports = { sincronizarTransferencias, sincronizarDespesas, sincronizarRecebimentos, sincronizarExtratoConciliacao };
