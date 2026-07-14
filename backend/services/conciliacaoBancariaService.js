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
const contasPagarCaSyncService = require('./contasPagarCaSyncService');

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

/**
 * Decodifica o BUFFER do arquivo OFX respeitando o charset.
 *
 * Os bancos brasileiros exportam OFX em Latin1/Windows-1252 (o header traz
 * `CHARSET:1252` ou `ENCODING:USASCII`). Ler como UTF-8 corrompe os acentos —
 * era isso que fazia "DÉB.TIT.COMPE" virar "D�B.TIT.COMPE" na tela (o caractere
 * inválido U+FFFD ia gravado no banco). Regra: obedecer o header; sem header
 * confiável, tentar UTF-8 e cair para cp1252 se aparecer lixo.
 */
function decodificarOfx(buffer) {
    if (!Buffer.isBuffer(buffer)) return String(buffer || '');
    // O header do OFX 1.x é ASCII puro — ler os primeiros bytes é sempre seguro.
    const header = buffer.slice(0, 512).toString('latin1').toUpperCase();
    const declaraUtf8 = /CHARSET:\s*(UTF-?8)/.test(header) || /ENCODING:\s*UTF-?8/.test(header);
    const declaraLatin = /CHARSET:\s*(1252|8859-1|LATIN1)/.test(header) || /ENCODING:\s*USASCII/.test(header);

    const comoUtf8 = buffer.toString('utf8');
    const sujo = comoUtf8.includes('�'); // byte inválido em UTF-8 → não era UTF-8

    if (declaraUtf8 && !sujo) return comoUtf8;
    if (declaraLatin || sujo) {
        // 'latin1' no Node cobre cp1252 nos acentos (difere só em 0x80–0x9F, que não
        // aparecem em descrição de extrato).
        const comoLatin = buffer.toString('latin1');
        if (!comoLatin.includes('�')) return comoLatin;
    }
    return comoUtf8;
}

/** Valor de uma tag OFX dentro de um bloco (SGML: fecha na quebra de linha ou na próxima tag). */
function tagOfx(bloco, tag) {
    const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
    const v = m ? m[1].trim() : null;
    return v || null; // string vazia = ausente
}

/** Nome dentro do bloco <PAYEE> (alguns bancos põem o beneficiário só aí). */
function payeeOfx(bloco) {
    const m = bloco.match(/<PAYEE>([\s\S]*?)(?:<\/PAYEE>|<BANKACCTTO>|$)/i);
    return m ? tagOfx(m[1], 'NAME') : null;
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

        // Campos crus: o MEMO costuma ser genérico ("DÉB.TIT.COMPE EFETIVADO"); o beneficiário,
        // quando o banco manda, vem no NAME ou no PAYEE. Guardamos todos.
        const memo = tagOfx(bloco, 'MEMO');
        const nome = tagOfx(bloco, 'NAME');
        const payee = payeeOfx(bloco);
        const checkNum = tagOfx(bloco, 'CHECKNUM');
        const refNum = tagOfx(bloco, 'REFNUM');
        const trnType = tagOfx(bloco, 'TRNTYPE');
        const descricao = memo || nome || payee || null;

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
            descricao,
            memo, nome, payee, checkNum, refNum, trnType
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

/** Ids de pagamentos já vinculados (link 1↔1 legado OU item de grupo) na conta. */
async function idsUsados(contaFinanceiraCaId) {
    const [diretos, grupos] = await Promise.all([
        prisma.extratoLancamento.findMany({
            where: { contaFinanceiraCaId, status: 'CONCILIADO' },
            select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true }
        }),
        prisma.conciliacaoGrupo.findMany({
            where: { contaFinanceiraCaId },
            select: { itens: { select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true } } }
        })
    ]);
    return new Set([
        ...diretos.flatMap((u) => [u.pagamentoParcelaId, u.pagamentoParcelaPagarId]),
        ...grupos.flatMap((g) => g.itens.flatMap((i) => [i.pagamentoParcelaId, i.pagamentoParcelaPagarId]))
    ].filter(Boolean));
}

/**
 * Confere as somas de um grupo. Função PURA.
 * @returns { ok, somaExtrato, somaBaixas, diferenca }
 */
function validarSomaGrupo(valoresExtrato, valoresBaixas) {
    const somaExtrato = round2(valoresExtrato.reduce((s, v) => s + num(v), 0));
    const somaBaixas = round2(valoresBaixas.reduce((s, v) => s + num(v), 0));
    const diferenca = round2(somaExtrato - somaBaixas);
    return { ok: Math.abs(diferenca) <= 0.01 && somaExtrato > 0, somaExtrato, somaBaixas, diferenca };
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
        select: { id: true, fitId: true, descricao: true, memo: true }
    });
    const porFitId = new Map(existentes.map((e) => [e.fitId, e]));
    const novos = lancamentos.filter((l) => !porFitId.has(l.fitId));

    // Reimportar o mesmo arquivo NÃO duplica (unique por FITID) — e aproveita para
    // ATUALIZAR o texto das linhas que já estavam lá. É assim que a descrição de quem
    // foi importado antes da correção de charset ("D�B.TIT.COMPE") se conserta, e que
    // os campos novos (NAME/PAYEE/CHECKNUM) chegam ao histórico. Status e vínculo de
    // conciliação NÃO são tocados.
    const paraAtualizar = lancamentos.filter((l) => {
        const atual = porFitId.get(l.fitId);
        if (!atual) return false;
        return atual.descricao !== l.descricao || atual.memo !== l.memo;
    });

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
                    descricao: l.descricao,
                    memo: l.memo,
                    nome: l.nome,
                    payee: l.payee,
                    checkNum: l.checkNum,
                    refNum: l.refNum,
                    trnType: l.trnType
                })),
                skipDuplicates: true
            });
        }
        for (const l of paraAtualizar) {
            await tx.extratoLancamento.update({
                where: { id: porFitId.get(l.fitId).id },
                data: {
                    descricao: l.descricao,
                    memo: l.memo,
                    nome: l.nome,
                    payee: l.payee,
                    checkNum: l.checkNum,
                    refNum: l.refNum,
                    trnType: l.trnType
                }
            });
        }
    }, { timeout: 30000, maxWait: 10000 });

    return {
        importacaoId: importacao.id,
        totalArquivo: lancamentos.length,
        novos: novos.length,
        duplicados: lancamentos.length - novos.length,
        atualizados: paraAtualizar.length,
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

    // Lançamentos conciliados via GRUPO (sem link 1↔1): montar o rótulo com as baixas do grupo
    const idsSemLink = linhas.filter((l) => l.status === 'CONCILIADO' && !l.pagamentoParcelaId && !l.pagamentoParcelaPagarId).map((l) => l.id);
    const grupoDoLancamento = new Map(); // lancamentoId → { qtd, labels }
    if (idsSemLink.length > 0) {
        const itensLanc = await prisma.conciliacaoGrupoItem.findMany({
            where: { extratoLancamentoId: { in: idsSemLink } },
            select: { grupoId: true, extratoLancamentoId: true }
        });
        const grupoIds = [...new Set(itensLanc.map((i) => i.grupoId))];
        const itensTodos = grupoIds.length > 0
            ? await prisma.conciliacaoGrupoItem.findMany({ where: { grupoId: { in: grupoIds } } })
            : [];
        const baixasPorGrupo = new Map();
        for (const it of itensTodos) {
            const pagId = it.pagamentoParcelaId || it.pagamentoParcelaPagarId;
            if (!pagId) continue;
            if (!baixasPorGrupo.has(it.grupoId)) baixasPorGrupo.set(it.grupoId, []);
            baixasPorGrupo.get(it.grupoId).push(labelPorId.get(pagId) || 'Baixa do app');
        }
        for (const it of itensLanc) {
            const labels = baixasPorGrupo.get(it.grupoId) || [];
            grupoDoLancamento.set(it.extratoLancamentoId, { qtd: labels.length, labels });
        }
    }

    const lancamentos = linhas.map((l) => {
        const base = {
            id: l.id,
            data: ymd(l.data),
            valor: num(l.valor),
            tipo: l.tipo,
            descricao: l.descricao,
            status: l.status,
            obs: l.obs,
            conciliadoAuto: l.conciliadoAuto,
            // Detalhes crus do banco (o que existir): beneficiário, nº do documento, tipo.
            // O MEMO só repete a descrição quando não há mais nada — some da tela nesse caso.
            detalhes: {
                nome: l.nome || l.payee || null,
                documento: l.checkNum || l.refNum || null,
                trnType: l.trnType || null,
                memo: l.memo && l.memo !== l.descricao ? l.memo : null
            }
        };
        if (l.status === 'CONCILIADO') {
            const pagId = l.pagamentoParcelaId || l.pagamentoParcelaPagarId;
            if (pagId) return { ...base, conciliadoCom: labelPorId.get(pagId) || 'Baixa do app' };
            const grupo = grupoDoLancamento.get(l.id);
            return {
                ...base,
                conciliadoCom: grupo ? `Grupo: ${grupo.qtd} baixa(s)` : 'Grupo',
                grupoBaixas: grupo?.labels || []
            };
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

/**
 * Volta um lançamento (conciliado ou ignorado) para PENDENTE.
 * Se ele estiver num GRUPO, o grupo inteiro é dissolvido (todos os lançamentos
 * do grupo voltam a pendente e as baixas ficam livres de novo).
 */
async function desfazer({ lancamentoId }) {
    const item = await prisma.conciliacaoGrupoItem.findUnique({ where: { extratoLancamentoId: lancamentoId } });
    if (item) {
        const irmaos = await prisma.conciliacaoGrupoItem.findMany({
            where: { grupoId: item.grupoId, extratoLancamentoId: { not: null } },
            select: { extratoLancamentoId: true }
        });
        const idsLanc = irmaos.map((i) => i.extratoLancamentoId);
        await prisma.$transaction(async (tx) => {
            await tx.conciliacaoGrupo.delete({ where: { id: item.grupoId } }); // itens caem em cascata
            await tx.extratoLancamento.updateMany({
                where: { id: { in: idsLanc } },
                data: { status: 'PENDENTE', conciliadoAuto: false, conciliadoPorId: null, conciliadoEm: null, obs: null }
            });
        }, { timeout: 20000, maxWait: 10000 });
        return { message: idsLanc.length > 1 ? `Grupo desfeito — ${idsLanc.length} lançamentos voltaram para pendente.` : 'Grupo desfeito — lançamento voltou para pendente.' };
    }

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

/**
 * Baixas do app DISPONÍVEIS (não conciliadas) na conta/período, para o modal
 * de conciliação em grupo. tipo CREDITO → recebimentos; DEBITO → pagamentos.
 */
async function baixasDisponiveis({ contaFinanceiraCaId, de, ate, tipo }) {
    const [pools, usados] = await Promise.all([carregarPools(contaFinanceiraCaId, de, ate), idsUsados(contaFinanceiraCaId)]);
    const pool = tipo === 'CREDITO' ? pools.entradas : pools.saidas;
    return pool
        .filter((p) => !usados.has(p.id))
        .sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Concilia em GRUPO: N lançamentos do extrato ↔ M baixas do app, soma exata (±R$ 0,01).
 * Todos do mesmo tipo (crédito OU débito) e da mesma conta.
 */
async function conciliarGrupo({ contaFinanceiraCaId, lancamentoIds, pagamentoIds, userId }) {
    const idsLanc = [...new Set(lancamentoIds || [])];
    const idsPag = [...new Set(pagamentoIds || [])];
    if (idsLanc.length === 0 || idsPag.length === 0) {
        const e = new Error('Escolha ao menos um lançamento do extrato e uma baixa do app.');
        e.status = 400;
        throw e;
    }

    const lancs = await prisma.extratoLancamento.findMany({ where: { id: { in: idsLanc } } });
    if (lancs.length !== idsLanc.length) { const e = new Error('Lançamento do extrato não encontrado.'); e.status = 404; throw e; }
    if (lancs.some((l) => l.contaFinanceiraCaId !== contaFinanceiraCaId)) { const e = new Error('Todos os lançamentos precisam ser da mesma conta.'); e.status = 400; throw e; }
    if (lancs.some((l) => l.status !== 'PENDENTE')) { const e = new Error('Só é possível agrupar lançamentos pendentes.'); e.status = 400; throw e; }
    const tipo = lancs[0].tipo;
    if (lancs.some((l) => l.tipo !== tipo)) { const e = new Error('Não misture entradas e saídas no mesmo grupo.'); e.status = 400; throw e; }

    // Baixas: existem, não estornadas, mesma conta, e ainda livres?
    const usados = await idsUsados(contaFinanceiraCaId);
    let baixas;
    if (tipo === 'CREDITO') {
        baixas = await prisma.pagamentoParcela.findMany({
            where: { id: { in: idsPag } },
            select: { id: true, estornado: true, contaFinanceiraCaId: true, valorRecebido: true }
        });
    } else {
        baixas = await prisma.pagamentoParcelaPagar.findMany({
            where: { id: { in: idsPag } },
            select: { id: true, estornado: true, contaFinanceiraCaId: true, valorPago: true, juros: true, multa: true }
        });
    }
    if (baixas.length !== idsPag.length) { const e = new Error('Baixa do app não encontrada.'); e.status = 400; throw e; }
    if (baixas.some((b) => b.estornado)) { const e = new Error('Uma das baixas escolhidas foi estornada.'); e.status = 400; throw e; }
    if (baixas.some((b) => b.contaFinanceiraCaId !== contaFinanceiraCaId)) { const e = new Error('Todas as baixas precisam ser da mesma conta do extrato.'); e.status = 400; throw e; }
    if (idsPag.some((id) => usados.has(id))) { const e = new Error('Uma das baixas já está conciliada com outro lançamento.'); e.status = 400; throw e; }

    const valoresBaixas = baixas.map((b) => tipo === 'CREDITO' ? num(b.valorRecebido) : round2(num(b.valorPago) + num(b.juros) + num(b.multa)));
    const soma = validarSomaGrupo(lancs.map((l) => num(l.valor)), valoresBaixas);
    if (!soma.ok) {
        const e = new Error(`A soma não bate: extrato R$ ${soma.somaExtrato.toFixed(2)} × baixas R$ ${soma.somaBaixas.toFixed(2)} (diferença R$ ${Math.abs(soma.diferenca).toFixed(2)}).`);
        e.status = 400;
        throw e;
    }

    await prisma.$transaction(async (tx) => {
        const grupo = await tx.conciliacaoGrupo.create({
            data: { contaFinanceiraCaId, tipo, valor: soma.somaExtrato, criadoPorId: userId || null }
        });
        await tx.conciliacaoGrupoItem.createMany({
            data: [
                ...idsLanc.map((id) => ({ grupoId: grupo.id, extratoLancamentoId: id })),
                ...idsPag.map((id) => (tipo === 'CREDITO'
                    ? { grupoId: grupo.id, pagamentoParcelaId: id }
                    : { grupoId: grupo.id, pagamentoParcelaPagarId: id }))
            ]
        });
        const r = await tx.extratoLancamento.updateMany({
            where: { id: { in: idsLanc }, status: 'PENDENTE' }, // guarda contra corrida
            data: { status: 'CONCILIADO', conciliadoAuto: false, conciliadoPorId: userId || null, conciliadoEm: new Date() }
        });
        if (r.count !== idsLanc.length) throw new Error('Um dos lançamentos deixou de estar pendente — recarregue e tente de novo.');
    }, { timeout: 20000, maxWait: 10000 });

    return { message: `Grupo conciliado: ${idsLanc.length} lançamento(s) do extrato ↔ ${idsPag.length} baixa(s) do app (R$ ${soma.somaExtrato.toFixed(2)}).` };
}

// ─────────────────────────────────────────────────────────────
// Criar a despesa que faltava, direto do extrato
// ─────────────────────────────────────────────────────────────

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * Cria a despesa (conta a pagar) correspondente a um DÉBITO do extrato que não
 * tem par no app — o caso "o boleto foi pago no banco, mas ninguém lançou".
 *
 * O dinheiro JÁ saiu do banco, então a despesa nasce **paga**: junto com a conta
 * e a parcela, grava a baixa (PagamentoParcelaPagar) com a data, o valor e o
 * banco do próprio lançamento do extrato. É essa baixa que vira o candidato da
 * linha — o usuário volta para a lista e clica em "Conciliar".
 *
 * Juros/multa: o extrato traz o TOTAL que saiu. O valor da parcela (o boleto) é
 * `valor do extrato − juros − multa`, e juros/multa vão nos campos próprios da
 * baixa — que é exatamente como o matching soma (valorPago + juros + multa).
 *
 * A conta vai ao Conta Azul (statusEnvioCA=ENVIAR): o worker de contas a pagar
 * empurra a despesa e depois a baixa. Nada de chamada externa aqui dentro.
 */
async function criarDespesaDoLancamento({
    lancamentoId, fornecedorId, fornecedorNovo, descricao, categoria, categoriaCaId,
    numeroNota, competencia, observacoes, metodoPagamento, dataVencimento,
    juros = 0, multa = 0, userId
}) {
    const l = await prisma.extratoLancamento.findUnique({ where: { id: lancamentoId } });
    if (!l) throw erro('Lançamento do extrato não encontrado.', 404);
    if (l.tipo !== 'DEBITO') throw erro('Só dá para criar despesa a partir de uma SAÍDA do extrato.');
    if (l.status !== 'PENDENTE') throw erro('Este lançamento já foi conciliado ou ignorado.');
    if (!descricao?.trim()) throw erro('Informe a descrição da despesa.');

    const metodo = String(metodoPagamento || '').toUpperCase();
    if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) throw erro('Escolha a forma de pagamento.');

    const nomeNovo = String(fornecedorNovo || '').trim();
    if (!fornecedorId && !nomeNovo) throw erro('Informe o fornecedor (a despesa vai para o Conta Azul).');

    // Rateio do que saiu do banco: total = boleto + juros + multa.
    const total = round2(num(l.valor));
    const jur = round2(Math.max(0, num(juros)));
    const mul = round2(Math.max(0, num(multa)));
    const valorParcela = round2(total - jur - mul);
    if (valorParcela <= 0) throw erro('Juros + multa não podem ser maiores ou iguais ao valor que saiu do banco.');

    const dataPagamento = new Date(l.data);
    const venc = dataVencimento && /^\d{4}-\d{2}-\d{2}$/.test(String(dataVencimento))
        ? dataSP(String(dataVencimento))
        : dataPagamento;
    const comp = competencia && /^\d{4}-\d{2}-\d{2}$/.test(String(competencia)) ? dataSP(String(competencia)) : null;

    const labelMetodo = contasPagarCaSyncService.METODOS_PAGAMENTO_BAIXA.find((m) => m.value === metodo)?.label || metodo;

    let conta;
    let pagamentoId;
    await prisma.$transaction(async (tx) => {
        let idFornecedor = fornecedorId || null;
        if (!idFornecedor) {
            const novo = await tx.fornecedor.create({
                data: { razaoSocial: nomeNovo, ativo: true, origem: 'APP', statusEnvioCA: 'ENVIAR' }
            });
            idFornecedor = novo.id;
        }

        conta = await tx.contaPagar.create({
            data: {
                fornecedorId: idFornecedor,
                descricao: descricao.trim(),
                categoria: categoria?.trim() || null,
                categoriaCaId: categoriaCaId || null,
                numeroNota: numeroNota?.trim() || null,
                competencia: comp,
                observacoes: [observacoes?.trim(), `Lançada pela conciliação bancária (extrato: ${l.descricao || 'sem descrição'}).`]
                    .filter(Boolean).join(' · '),
                origem: 'MANUAL',
                valorTotal: valorParcela,
                status: 'ABERTO',
                statusEnvioCA: 'ENVIAR',
                metodoPagamentoCA: metodo,
                contaFinanceiraCaId: l.contaFinanceiraCaId,
                criadoPorId: userId || null,
                parcelas: { create: [{ numeroParcela: 1, valor: valorParcela, dataVencimento: venc }] }
            },
            include: { parcelas: true }
        });

        const parcela = conta.parcelas[0];
        const pag = await tx.pagamentoParcelaPagar.create({
            data: {
                parcelaPagarId: parcela.id,
                valorPago: valorParcela,
                juros: jur,
                multa: mul,
                dataPagamento,
                formaPagamento: metodo,
                contaFinanceiraCaId: l.contaFinanceiraCaId,
                statusEnvioCA: 'ENVIAR',
                origem: 'MANUAL',
                observacao: `Baixa criada pela conciliação bancária (${labelMetodo}).`,
                registradoPorId: userId || null
            }
        });
        pagamentoId = pag.id;
        await contasPagarCaSyncService.recalcularParcelaEConta(tx, parcela.id);
    }, { timeout: 20000, maxWait: 10000 });

    return {
        message: `Despesa criada e baixada (R$ ${total.toFixed(2)}). Agora é só clicar em Conciliar.`,
        contaPagarId: conta.id,
        pagamentoParcelaPagarId: pagamentoId
    };
}

/** Fornecedores + categorias + formas de pagamento para o modal de "criar despesa". */
async function opcoesDespesa() {
    const [fornecedores, categorias] = await Promise.all([
        prisma.fornecedor.findMany({
            where: { ativo: true },
            select: { id: true, razaoSocial: true, nomeFantasia: true, cnpjCpf: true },
            orderBy: { razaoSocial: 'asc' }
        }),
        contasPagarCaSyncService.listarCategoriasDespesaSeguro().catch(() => [])
    ]);
    return { fornecedores, categorias, metodosPagamento: contasPagarCaSyncService.METODOS_PAGAMENTO_BAIXA };
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
    conciliarGrupo,
    baixasDisponiveis,
    ignorar,
    desfazer,
    listarImportacoes,
    criarDespesaDoLancamento,
    opcoesDespesa,
    // puras (testáveis offline)
    decodificarOfx,
    parseOfx,
    candidatosPara,
    validarSomaGrupo
};
