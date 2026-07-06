/**
 * Conciliação bancária — extrato OFX × lançamentos do app.
 *
 * Fluxo:
 *   1. O usuário exporta o extrato do banco em OFX e importa aqui, escolhendo a
 *      conta financeira (banco/caixa do CA) correspondente.
 *   2. Cada linha do extrato vira um ExtratoLancamento. O FITID (identidade do
 *      lançamento no banco) tem unique por conta → importar o mesmo arquivo de
 *      novo NÃO duplica nada (idempotente).
 *   3. O matching sugere, para cada lançamento PENDENTE, as baixas do app na
 *      MESMA conta com o MESMO valor (±R$ 0,01) e data próxima (±3 dias):
 *      CRÉDITO → PagamentoParcela (contas a receber); DÉBITO → PagamentoParcelaPagar.
 *   4. "Conciliar automático" fecha sozinho os casos com exatamente UM candidato;
 *      o resto o usuário confirma na tela (ou marca IGNORADO — tarifa, transferência).
 *
 * O parser de OFX é próprio (função pura, testável offline) — OFX é SGML simples
 * e uma dependência nova não se justifica.
 */

const crypto = require('crypto');
const prisma = require('../config/database');

const TZ_OFFSET = '-03:00';
const round2 = (v) => Math.round(Number(v) * 100) / 100;
const num = (v) => Number(v || 0);
const dataSP = (ymd) => new Date(`${ymd}T12:00:00${TZ_OFFSET}`); // meio-dia SP: imune a virada de fuso
const ymd = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const somaDias = (s, n) => {
    const d = new Date(`${s}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────
// Parser OFX (função PURA)
// ─────────────────────────────────────────────────────────────

/** Valor de uma tag OFX dentro de um bloco (SGML: fecha na quebra de linha ou na próxima tag). */
function tagOfx(bloco, tag) {
    const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : null;
}

/**
 * Lê o texto de um arquivo OFX e devolve os lançamentos normalizados.
 * @returns {{ lancamentos: [{ fitId, data:'YYYY-MM-DD', valor, tipo:'CREDITO'|'DEBITO', descricao }], avisos: string[] }}
 */
function parseOfx(texto) {
    const avisos = [];
    const lancamentos = [];
    if (!texto || !/<OFX>|<STMTTRN>/i.test(texto)) {
        return { lancamentos, avisos: ['O arquivo não parece ser um OFX (não encontrei <OFX>/<STMTTRN>).'] };
    }

    // Blocos <STMTTRN> ... (com ou sem </STMTTRN> — bancos variam)
    const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
    const vistosNoArquivo = new Map(); // fitId → contagem (p/ FITID sintético estável)

    for (const bloco of blocos) {
        const dt = tagOfx(bloco, 'DTPOSTED');
        const amt = tagOfx(bloco, 'TRNAMT');
        if (!dt || !amt) { avisos.push('Lançamento sem data ou valor foi pulado.'); continue; }

        const data = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { avisos.push(`Data inválida "${dt}" — lançamento pulado.`); continue; }

        // TRNAMT: "-150.00", "150,00", "1.234,56"…
        let bruto = amt.replace(/\s/g, '');
        if (/,\d{1,2}$/.test(bruto)) bruto = bruto.replace(/\./g, '').replace(',', '.');
        const valorAssinado = parseFloat(bruto);
        if (!Number.isFinite(valorAssinado) || valorAssinado === 0) { avisos.push(`Valor inválido "${amt}" — lançamento pulado.`); continue; }

        const descricao = tagOfx(bloco, 'MEMO') || tagOfx(bloco, 'NAME') || null;

        // FITID: identidade no banco. Sem FITID → sintetiza um estável (hash de data+valor+descrição+ocorrência).
        let fitId = tagOfx(bloco, 'FITID');
        if (!fitId) {
            const base = `${data}|${valorAssinado}|${descricao || ''}`;
            const n = (vistosNoArquivo.get(base) || 0) + 1;
            vistosNoArquivo.set(base, n);
            fitId = 'GEN-' + crypto.createHash('md5').update(`${base}|${n}`).digest('hex').slice(0, 20);
        }

        lancamentos.push({
            fitId,
            data,
            valor: round2(Math.abs(valorAssinado)),
            tipo: valorAssinado < 0 ? 'DEBITO' : 'CREDITO',
            descricao
        });
    }

    return { lancamentos, avisos };
}

// ─────────────────────────────────────────────────────────────
// Matching (função PURA sobre pools já carregados)
// ─────────────────────────────────────────────────────────────

const valorBate = (a, b) => Math.abs(num(a) - num(b)) <= 0.01;

/**
 * Candidatos do app para UM lançamento do extrato.
 * @param lanc   { data:'YYYY-MM-DD', valor, tipo }
 * @param pools  { entradas: [{id, valor, data, label}], saidas: [...] } — já na mesma conta
 * @param usados Set de ids de pagamentos já conciliados com outro lançamento
 */
function candidatosPara(lanc, pools, usados, janelaDias = 3) {
    const pool = lanc.tipo === 'CREDITO' ? pools.entradas : pools.saidas;
    const de = somaDias(lanc.data, -janelaDias);
    const ate = somaDias(lanc.data, janelaDias);
    const distDias = (d) => Math.abs((new Date(`${d}T12:00:00Z`) - new Date(`${lanc.data}T12:00:00Z`)) / 86400000);
    return pool
        .filter((p) => !usados.has(p.id) && p.data >= de && p.data <= ate && valorBate(p.valor, lanc.valor))
        .sort((a, b) => distDias(a.data) - distDias(b.data))
        .slice(0, 5);
}

// ─────────────────────────────────────────────────────────────
// Pools de baixas do app (mesma conta, período ± janela)
// ─────────────────────────────────────────────────────────────

async function carregarPools(contaFinanceiraCaId, deYmd, ateYmd) {
    const gte = dataSP(somaDias(deYmd, -3));
    const lte = dataSP(somaDias(ateYmd, 3));

    const [recebimentos, pagamentos] = await Promise.all([
        prisma.pagamentoParcela.findMany({
            where: { estornado: false, contaFinanceiraCaId, dataPagamento: { gte, lte } },
            select: {
                id: true, valorRecebido: true, dataPagamento: true, formaPagamento: true,
                parcela: {
                    select: {
                        numeroParcela: true,
                        contaReceber: { select: { cliente: { select: { Nome: true, NomeFantasia: true } } } }
                    }
                }
            }
        }),
        prisma.pagamentoParcelaPagar.findMany({
            where: { estornado: false, contaFinanceiraCaId, dataPagamento: { gte, lte } },
            select: {
                id: true, valorPago: true, juros: true, multa: true, dataPagamento: true, formaPagamento: true,
                parcelaPagar: {
                    select: {
                        numeroParcela: true,
                        contaPagar: { select: { descricao: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }
                    }
                }
            }
        })
    ]);

    const entradas = recebimentos.map((r) => {
        const cli = r.parcela?.contaReceber?.cliente;
        return {
            id: r.id,
            valor: round2(r.valorRecebido),
            data: ymd(r.dataPagamento),
            label: `${cli?.NomeFantasia || cli?.Nome || 'Cliente'} — parcela ${r.parcela?.numeroParcela ?? '?'}${r.formaPagamento ? ` (${r.formaPagamento})` : ''}`
        };
    });
    const saidas = pagamentos.map((p) => {
        const cp = p.parcelaPagar?.contaPagar;
        const forn = cp?.fornecedor;
        // O débito no banco inclui juros/multa quando houve — comparar pelo total que saiu.
        const total = round2(num(p.valorPago) + num(p.juros) + num(p.multa));
        return {
            id: p.id,
            valor: total,
            data: ymd(p.dataPagamento),
            label: `${forn?.nomeFantasia || forn?.razaoSocial || cp?.descricao || 'Despesa'}${p.formaPagamento ? ` (${p.formaPagamento})` : ''}`
        };
    });
    return { entradas, saidas };
}

/** Ids de pagamentos já vinculados a algum lançamento CONCILIADO (na conta). */
async function idsUsados(contaFinanceiraCaId) {
    const usados = await prisma.extratoLancamento.findMany({
        where: { contaFinanceiraCaId, status: 'CONCILIADO' },
        select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true }
    });
    return new Set(usados.flatMap((u) => [u.pagamentoParcelaId, u.pagamentoParcelaPagarId]).filter(Boolean));
}

// ─────────────────────────────────────────────────────────────
// Importação (idempotente por FITID)
// ─────────────────────────────────────────────────────────────

async function importarOfx({ contaFinanceiraCaId, nomeArquivo, conteudo, criadoPorId }) {
    const { lancamentos, avisos } = parseOfx(conteudo);
    if (lancamentos.length === 0) {
        const motivo = avisos[0] || 'Nenhum lançamento encontrado no arquivo.';
        const err = new Error(motivo);
        err.status = 400;
        throw err;
    }

    const fitIds = lancamentos.map((l) => l.fitId);
    const existentes = await prisma.extratoLancamento.findMany({
        where: { contaFinanceiraCaId, fitId: { in: fitIds } },
        select: { fitId: true }
    });
    const jaTem = new Set(existentes.map((e) => e.fitId));
    const novos = lancamentos.filter((l) => !jaTem.has(l.fitId));

    const datas = lancamentos.map((l) => l.data).sort();
    let importacao;
    await prisma.$transaction(async (tx) => {
        importacao = await tx.extratoImportacao.create({
            data: {
                contaFinanceiraCaId,
                nomeArquivo,
                dataInicio: dataSP(datas[0]),
                dataFim: dataSP(datas[datas.length - 1]),
                totalArquivo: lancamentos.length,
                novos: novos.length,
                duplicados: lancamentos.length - novos.length,
                criadoPorId: criadoPorId || null
            }
        });
        if (novos.length > 0) {
            await tx.extratoLancamento.createMany({
                data: novos.map((l) => ({
                    importacaoId: importacao.id,
                    contaFinanceiraCaId,
                    fitId: l.fitId,
                    data: dataSP(l.data),
                    valor: l.valor,
                    tipo: l.tipo,
                    descricao: l.descricao
                })),
                skipDuplicates: true
            });
        }
    }, { timeout: 20000, maxWait: 10000 });

    return {
        importacaoId: importacao.id,
        totalArquivo: lancamentos.length,
        novos: novos.length,
        duplicados: lancamentos.length - novos.length,
        periodo: { de: datas[0], ate: datas[datas.length - 1] },
        avisos
    };
}

// ─────────────────────────────────────────────────────────────
// Listagem com sugestões + resumo
// ─────────────────────────────────────────────────────────────

async function listar({ contaFinanceiraCaId, de, ate, status }) {
    const where = {
        contaFinanceiraCaId,
        data: { gte: dataSP(de), lte: dataSP(ate) },
        ...(status && status !== 'todos' ? { status } : {})
    };
    const linhas = await prisma.extratoLancamento.findMany({ where, orderBy: [{ data: 'desc' }, { valor: 'desc' }] });

    const [pools, usados] = await Promise.all([carregarPools(contaFinanceiraCaId, de, ate), idsUsados(contaFinanceiraCaId)]);
    const labelPorId = new Map([...pools.entradas, ...pools.saidas].map((p) => [p.id, p.label]));

    const lancamentos = linhas.map((l) => {
        const base = {
            id: l.id,
            data: ymd(l.data),
            valor: num(l.valor),
            tipo: l.tipo,
            descricao: l.descricao,
            status: l.status,
            obs: l.obs,
            conciliadoAuto: l.conciliadoAuto
        };
        if (l.status === 'CONCILIADO') {
            const pagId = l.pagamentoParcelaId || l.pagamentoParcelaPagarId;
            return { ...base, conciliadoCom: labelPorId.get(pagId) || 'Baixa do app' };
        }
        if (l.status === 'PENDENTE') {
            return {
                ...base,
                sugestoes: candidatosPara({ data: ymd(l.data), valor: num(l.valor), tipo: l.tipo }, pools, usados)
            };
        }
        return base;
    });

    // Lado do app: baixas da conta no período que NÃO estão vinculadas a nenhum extrato
    const dentro = (p) => p.data >= de && p.data <= ate;
    const soNoApp = {
        entradas: pools.entradas.filter((p) => dentro(p) && !usados.has(p.id)),
        saidas: pools.saidas.filter((p) => dentro(p) && !usados.has(p.id))
    };

    const soma = (arr, f) => round2(arr.filter(f).reduce((s, l) => s + l.valor, 0));
    const conta = (f) => lancamentos.filter(f).length;
    const resumo = {
        total: lancamentos.length,
        pendentes: conta((l) => l.status === 'PENDENTE'),
        conciliados: conta((l) => l.status === 'CONCILIADO'),
        ignorados: conta((l) => l.status === 'IGNORADO'),
        valorPendente: soma(lancamentos, (l) => l.status === 'PENDENTE'),
        valorConciliado: soma(lancamentos, (l) => l.status === 'CONCILIADO'),
        soNoApp: { entradas: soNoApp.entradas.length, saidas: soNoApp.saidas.length }
    };

    return { de, ate, resumo, lancamentos, soNoApp };
}

// ─────────────────────────────────────────────────────────────
// Ações
// ─────────────────────────────────────────────────────────────

/** Concilia sozinho os PENDENTES com exatamente 1 candidato. */
async function conciliarAutomatico({ contaFinanceiraCaId, de, ate, userId }) {
    const pendentes = await prisma.extratoLancamento.findMany({
        where: { contaFinanceiraCaId, status: 'PENDENTE', data: { gte: dataSP(de), lte: dataSP(ate) } }
    });
    if (pendentes.length === 0) return { conciliados: 0, restantes: 0 };

    const [pools, usados] = await Promise.all([carregarPools(contaFinanceiraCaId, de, ate), idsUsados(contaFinanceiraCaId)]);

    let conciliados = 0;
    for (const l of pendentes) {
        const cands = candidatosPara({ data: ymd(l.data), valor: num(l.valor), tipo: l.tipo }, pools, usados);
        if (cands.length !== 1) continue;
        const alvo = cands[0];
        const r = await prisma.extratoLancamento.updateMany({
            where: { id: l.id, status: 'PENDENTE' }, // guarda contra corrida/duplo clique
            data: {
                status: 'CONCILIADO',
                conciliadoAuto: true,
                conciliadoPorId: userId || null,
                conciliadoEm: new Date(),
                ...(l.tipo === 'CREDITO' ? { pagamentoParcelaId: alvo.id } : { pagamentoParcelaPagarId: alvo.id })
            }
        });
        if (r.count > 0) { usados.add(alvo.id); conciliados++; }
    }
    return { conciliados, restantes: pendentes.length - conciliados };
}

/** Concilia UM lançamento com a baixa escolhida pelo usuário. */
async function conciliar({ lancamentoId, pagamentoParcelaId, pagamentoParcelaPagarId, userId }) {
    const l = await prisma.extratoLancamento.findUnique({ where: { id: lancamentoId } });
    if (!l) { const e = new Error('Lançamento do extrato não encontrado.'); e.status = 404; throw e; }
    if (l.status === 'CONCILIADO') { const e = new Error('Este lançamento já está conciliado.'); e.status = 400; throw e; }

    const pagId = l.tipo === 'CREDITO' ? pagamentoParcelaId : pagamentoParcelaPagarId;
    if (!pagId) {
        const e = new Error(l.tipo === 'CREDITO' ? 'Escolha o recebimento do app (entrada).' : 'Escolha o pagamento do app (saída).');
        e.status = 400;
        throw e;
    }

    // O pagamento existe e ainda não está vinculado a outro lançamento?
    const [pagamento, emUso] = await Promise.all([
        l.tipo === 'CREDITO'
            ? prisma.pagamentoParcela.findUnique({ where: { id: pagId }, select: { id: true, estornado: true } })
            : prisma.pagamentoParcelaPagar.findUnique({ where: { id: pagId }, select: { id: true, estornado: true } }),
        prisma.extratoLancamento.findFirst({
            where: {
                status: 'CONCILIADO',
                ...(l.tipo === 'CREDITO' ? { pagamentoParcelaId: pagId } : { pagamentoParcelaPagarId: pagId })
            },
            select: { id: true }
        })
    ]);
    if (!pagamento || pagamento.estornado) { const e = new Error('Baixa do app não encontrada (ou estornada).'); e.status = 400; throw e; }
    if (emUso) { const e = new Error('Essa baixa do app já está conciliada com outro lançamento do extrato.'); e.status = 400; throw e; }

    await prisma.extratoLancamento.update({
        where: { id: lancamentoId },
        data: {
            status: 'CONCILIADO',
            conciliadoAuto: false,
            conciliadoPorId: userId || null,
            conciliadoEm: new Date(),
            pagamentoParcelaId: l.tipo === 'CREDITO' ? pagId : null,
            pagamentoParcelaPagarId: l.tipo === 'CREDITO' ? null : pagId
        }
    });
    return { message: 'Lançamento conciliado!' };
}

async function ignorar({ lancamentoId, obs, userId }) {
    const r = await prisma.extratoLancamento.updateMany({
        where: { id: lancamentoId, status: 'PENDENTE' },
        data: { status: 'IGNORADO', obs: obs?.trim() || null, conciliadoPorId: userId || null, conciliadoEm: new Date() }
    });
    if (r.count === 0) { const e = new Error('Só é possível ignorar um lançamento pendente.'); e.status = 400; throw e; }
    return { message: 'Lançamento marcado como ignorado.' };
}

/** Volta um lançamento (conciliado ou ignorado) para PENDENTE. */
async function desfazer({ lancamentoId }) {
    const r = await prisma.extratoLancamento.updateMany({
        where: { id: lancamentoId, status: { in: ['CONCILIADO', 'IGNORADO'] } },
        data: {
            status: 'PENDENTE',
            pagamentoParcelaId: null,
            pagamentoParcelaPagarId: null,
            conciliadoAuto: false,
            conciliadoPorId: null,
            conciliadoEm: null,
            obs: null
        }
    });
    if (r.count === 0) { const e = new Error('Nada para desfazer neste lançamento.'); e.status = 400; throw e; }
    return { message: 'Lançamento voltou para pendente.' };
}

async function listarImportacoes(contaFinanceiraCaId) {
    const imps = await prisma.extratoImportacao.findMany({
        where: { contaFinanceiraCaId },
        orderBy: { criadoEm: 'desc' },
        take: 20
    });
    return imps.map((i) => ({
        id: i.id,
        nomeArquivo: i.nomeArquivo,
        periodo: { de: i.dataInicio ? ymd(i.dataInicio) : null, ate: i.dataFim ? ymd(i.dataFim) : null },
        totalArquivo: i.totalArquivo,
        novos: i.novos,
        duplicados: i.duplicados,
        criadoEm: i.criadoEm
    }));
}

module.exports = {
    importarOfx,
    listar,
    conciliarAutomatico,
    conciliar,
    ignorar,
    desfazer,
    listarImportacoes,
    // puras (testáveis offline)
    parseOfx,
    candidatosPara
};
