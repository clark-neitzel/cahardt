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
// CNPJ ALFANUMÉRICO: validar candidato extraído do extrato (evita falso-positivo em texto livre).
const { validarCnpj } = require('../utils/documento');

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
                        numeroParcela: true, valor: true, dataVencimento: true,
                        // ContaReceber NÃO tem numeroNota (só ContaPagar) — não adicionar aqui
                        contaReceber: { select: { pedido: { select: { numero: true } }, cliente: { select: { Nome: true, NomeFantasia: true } } } }
                    }
                }
            }
        }),
        prisma.pagamentoParcelaPagar.findMany({
            where: { estornado: false, contaFinanceiraCaId, dataPagamento: { gte, lte } },
            select: {
                id: true, valorPago: true, juros: true, multa: true, desconto: true, dataPagamento: true, formaPagamento: true,
                parcelaPagar: {
                    select: {
                        numeroParcela: true, valor: true, dataVencimento: true,
                        contaPagar: { select: { descricao: true, numeroNota: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }
                    }
                }
            }
        })
    ]);

    const entradas = recebimentos.map((r) => {
        const cli = r.parcela?.contaReceber?.cliente;
        const nome = cli?.NomeFantasia || cli?.Nome || 'Cliente';
        return {
            id: r.id,
            valor: round2(r.valorRecebido),
            data: ymd(r.dataPagamento),
            label: `${nome} — parcela ${r.parcela?.numeroParcela ?? '?'}${r.formaPagamento ? ` (${r.formaPagamento})` : ''}`,
            // Dados para o usuário conferir "no que estou mexendo" antes de conciliar:
            detalhe: {
                nome,
                descricao: r.parcela?.contaReceber?.pedido?.numero ? `Pedido ${r.parcela.contaReceber.pedido.numero}` : null,
                parcela: r.parcela?.numeroParcela ?? null,
                vencimento: r.parcela?.dataVencimento ? ymd(r.parcela.dataVencimento) : null,
                valorParcela: num(r.parcela?.valor),
                formaPagamento: r.formaPagamento || null
            }
        };
    });
    const saidas = pagamentos.map((p) => {
        const pp = p.parcelaPagar;
        const cp = pp?.contaPagar;
        const forn = cp?.fornecedor;
        const nome = forn?.nomeFantasia || forn?.razaoSocial || cp?.descricao || 'Despesa';
        // O débito no banco inclui juros/multa quando houve — comparar pelo total que saiu.
        const total = round2(num(p.valorPago) + num(p.juros) + num(p.multa));
        return {
            id: p.id,
            valor: total,
            data: ymd(p.dataPagamento),
            label: `${nome}${p.formaPagamento ? ` (${p.formaPagamento})` : ''}`,
            detalhe: {
                nome,
                descricao: cp?.descricao || null,
                numeroNota: cp?.numeroNota || null,
                parcela: pp?.numeroParcela ?? null,
                vencimento: pp?.dataVencimento ? ymd(pp.dataVencimento) : null,
                valorParcela: num(pp?.valor),
                valorPago: num(p.valorPago),
                juros: num(p.juros),
                multa: num(p.multa),
                desconto: num(p.desconto),
                formaPagamento: p.formaPagamento || null
            }
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

// ─────────────────────────────────────────────────────────────
// Extrato em PDF do Conta Azul (a Conta PJ do CA não exporta OFX
// e a API não expõe o extrato — confirmado em 07/2026, tudo 404).
// Lê o texto do PDF com coordenadas (pdfjs), remonta as LINHAS da
// tabela pela posição vertical e extrai data + descrição + valor.
// ─────────────────────────────────────────────────────────────

/**
 * Parser do extrato em PDF gerado pelo Conta Azul ("Extrato Conta Azul…").
 * Formato das linhas: `dd/mm/aaaa  DESCRIÇÃO  [Conciliado|Não conciliado]  [- ]R$ 9.999,99`.
 * Linhas de "Saldo do dia/anterior/final", cabeçalhos e rodapés são ignorados.
 *
 * FITID sintético e ESTÁVEL: hash de (data|descrição|tipo|valor|nº da repetição).
 * Reimportar o mesmo período não duplica (mesmas linhas → mesmos hashes); duas
 * cobranças idênticas no mesmo dia ganham nº de repetição 1, 2… na ordem do PDF.
 *
 * Limitação: o PDF do CA trunca descrições compridas ("NF 1/842…") — a descrição
 * fica como aparece no papel. O status "Conciliado" é a conciliação DO CA, não
 * a nossa — é descartado.
 */
async function parsePdfExtratoCA(buffer) {
    let pdfjsLib;
    try {
        pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    } catch (e) {
        throw erro('Leitura de PDF indisponível no servidor (dependência pdfjs-dist não instalada).', 500);
    }

    const avisos = [];
    let doc;
    try {
        doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true }).promise;
    } catch (e) {
        throw erro('Não consegui abrir o PDF — o arquivo está corrompido ou protegido por senha.');
    }

    // 1) Texto por LINHA visual: agrupa os pedaços pela posição vertical (tolerância
    //    de 2.5pt) e ordena da esquerda para a direita.
    const linhas = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const itens = tc.items
            .filter((it) => String(it.str || '').trim() !== '')
            .map((it) => ({ x: it.transform[4], y: it.transform[5], str: String(it.str) }))
            .sort((a, b) => (b.y - a.y) || (a.x - b.x));
        let atual = null;
        for (const it of itens) {
            if (!atual || Math.abs(atual.y - it.y) > 2.5) {
                if (atual) linhas.push(atual.pedacos.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
                atual = { y: it.y, pedacos: [] };
            }
            atual.pedacos.push(it);
        }
        if (atual) linhas.push(atual.pedacos.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
    }
    try { await doc.destroy(); } catch (_) { /* liberar memória; falha aqui não importa */ }

    // 2) Linha de movimento = começa com data e tem UM valor R$; resto é ruído.
    const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/;
    const RE_VALOR = /(-\s*)?R\$\s*([\d.]+,\d{2})/;
    const RE_STATUS_CA = /\s*(Não\s+conciliado|Conciliado)\s*/i;
    const lancamentos = [];
    const repeticoes = new Map(); // chave data|desc|tipo|valor → nº da repetição

    for (const bruta of linhas) {
        const linha = bruta.replace(/\s+/g, ' ').trim();
        const m = linha.match(RE_DATA);
        if (!m) continue;
        const resto = m[4];
        if (/^Saldo\s+(do dia|anterior|final)/i.test(resto)) continue; // linha de saldo, não é movimento
        if (/^a\s+\d{2}\/\d{2}\/\d{4}/.test(resto)) continue;          // "01/07/2026 a 31/07/2026" (período do cabeçalho)

        const mv = resto.match(RE_VALOR);
        if (!mv) continue; // linha com data mas sem valor — cabeçalho/ruído

        const negativo = !!(mv[1] && mv[1].includes('-'));
        const valor = round2(Number(mv[2].replace(/\./g, '').replace(',', '.')));
        if (!(valor > 0)) continue;

        const descricao = resto.slice(0, mv.index).replace(RE_STATUS_CA, ' ').replace(/\s+/g, ' ').trim();
        if (!descricao) { avisos.push(`Linha sem descrição ignorada (${m[1]}/${m[2]}/${m[3]}, R$ ${mv[2]}).`); continue; }

        const data = `${m[3]}-${m[2]}-${m[1]}`;
        const tipo = negativo ? 'DEBITO' : 'CREDITO';
        const chave = `${data}|${descricao}|${tipo}|${valor.toFixed(2)}`;
        const n = (repeticoes.get(chave) || 0) + 1;
        repeticoes.set(chave, n);
        const fitId = 'PDF' + crypto.createHash('sha1').update(`${chave}|${n}`).digest('hex').slice(0, 30);

        lancamentos.push({
            fitId, data, valor, tipo, descricao,
            memo: null, nome: null, payee: null, checkNum: null, refNum: null, trnType: null
        });
    }

    if (lancamentos.length === 0) {
        avisos.unshift('Nenhum lançamento reconhecido no PDF — confira se é o "Extrato Conta Azul" exportado do CA (não um scan/foto).');
    }
    return { lancamentos, avisos };
}

async function importarOfx({ contaFinanceiraCaId, nomeArquivo, conteudo, criadoPorId }) {
    const { lancamentos, avisos } = parseOfx(conteudo);
    return _gravarImportacao({ contaFinanceiraCaId, nomeArquivo, criadoPorId, lancamentos, avisos });
}

/** Importa o extrato em PDF do Conta Azul (mesma persistência/idempotência do OFX). */
async function importarPdf({ contaFinanceiraCaId, nomeArquivo, buffer, criadoPorId }) {
    const { lancamentos, avisos } = await parsePdfExtratoCA(buffer);
    return _gravarImportacao({ contaFinanceiraCaId, nomeArquivo, criadoPorId, lancamentos, avisos });
}

// Persistência comum (OFX e PDF): dedupe por fitId, atualização de descrição e registro da importação.
async function _gravarImportacao({ contaFinanceiraCaId, nomeArquivo, criadoPorId, lancamentos, avisos }) {
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

/**
 * CNPJ/CPF escondido no texto do banco (Sicoob confirmado no OFX real).
 *
 * O boleto ("DÉB.TIT.COMPE EFETIVADO") NÃO traz beneficiário — só CHECKNUM. Mas o
 * PIX traz o documento na tag <NAME>, em duas formas:
 *    <NAME>Pagamento Pix 02.118.562 0001-60      → CNPJ completo
 *    <NAME>Pagamento Pix ***.851.799-**          → CPF MASCARADO (LGPD)
 * Por isso o texto pesquisado é memo + name + payee, não só a descrição.
 *
 * @returns { completo: '02118562000160' } | { parcial: '851799' } | null
 *          `parcial` são os 6 dígitos do meio do CPF — únicos que o banco revela.
 */
function extrairDocumento(texto) {
    if (!texto) return null;
    const s = String(texto);
    const cnpj = s.match(/(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[/\s]?(\d{4})[-\s]?(\d{2})/);
    if (cnpj) return { completo: cnpj.slice(1).join('') };
    // CNPJ ALFANUMÉRICO (12 posições podem ter letras; DV numérico). Como o extrato é texto
    // livre, só aceita se o dígito verificador bater — senão é falso-positivo (pega parte de palavra).
    const cnpjAlfa = s.match(/(?<![0-9A-Za-z])([0-9A-Za-z]{2})[.\s]?([0-9A-Za-z]{3})[.\s]?([0-9A-Za-z]{3})[/\s]?([0-9A-Za-z]{4})[-\s]?(\d{2})(?![0-9A-Za-z])/);
    if (cnpjAlfa) {
        const cand = cnpjAlfa.slice(1).join('').toUpperCase();
        if (validarCnpj(cand)) return { completo: cand };
    }
    const cpf = s.match(/(?<!\d)(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?(\d{2})(?!\d)/);
    if (cpf) return { completo: cpf.slice(1).join('') };
    // CPF mascarado: ***.851.799-**  (só o miolo vem)
    const mascarado = s.match(/\*{2,3}[.\s]?(\d{3})[.\s]?(\d{3})[-\s]?\*{2,3}/);
    if (mascarado) return { parcial: mascarado.slice(1).join('') };
    return null;
}

/** Todo o texto que o banco mandou nessa linha (o documento pode estar em qualquer tag). */
const textoDoBanco = (l) => [l.descricao, l.memo, l.nome, l.payee].filter(Boolean).join(' | ');

/**
 * "De quem é esse débito?" — quando o banco não diz (o boleto vem só como
 * "DÉB.TIT.COMPE EFETIVADO"), as únicas pistas possíveis são:
 *   1. o CNPJ/CPF que às vezes aparece no texto (PIX) → cruzado com o cadastro;
 *   2. contas a pagar EM ABERTO com o mesmo valor → provavelmente é uma delas.
 * Devolve Map(lancamentoId → { documento, fornecedorDoDocumento, parcelasAbertas }).
 */
async function pistasDeDebito(linhasDebito) {
    const pistas = new Map();
    if (linhasDebito.length === 0) return pistas;

    const docsPorLinha = new Map(linhasDebito.map((l) => [l.id, extrairDocumento(textoDoBanco(l))]));
    const docs = [...docsPorLinha.values()];
    const completos = [...new Set(docs.filter((d) => d?.completo).map((d) => d.completo))];
    const parciais = [...new Set(docs.filter((d) => d?.parcial).map((d) => d.parcial))];

    const selFornecedor = { cnpjCpf: true, razaoSocial: true, nomeFantasia: true };
    const [abertas, fornecedores, porParcial] = await Promise.all([
        prisma.parcelaPagar.findMany({
            where: { status: { in: ['PENDENTE', 'PARCIAL'] } },
            include: {
                pagamentos: { where: { estornado: false }, select: { valorPago: true, desconto: true, estornado: true } },
                contaPagar: { select: { descricao: true, numeroNota: true, statusEnvioCA: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }
            },
            take: 1000
        }),
        completos.length > 0
            ? prisma.fornecedor.findMany({ where: { cnpjCpf: { in: completos } }, select: selFornecedor })
            : [],
        // CPF mascarado: o banco só revela o miolo (***.851.799-**). Buscamos por ele — pode
        // dar mais de um acerto, então isso entra na tela como PROVÁVEL, nunca como certeza.
        parciais.length > 0
            ? prisma.fornecedor.findMany({
                where: { OR: parciais.map((p) => ({ cnpjCpf: { contains: p } })) },
                select: selFornecedor
            })
            : []
    ]);

    // Índice por saldo (em centavos) — casar valor do extrato com o que falta pagar.
    const porSaldo = new Map();
    for (const p of abertas) {
        const saldo = saldoParcelaPagar(p);
        if (saldo <= 0) continue;
        const chave = Math.round(saldo * 100);
        if (!porSaldo.has(chave)) porSaldo.set(chave, []);
        porSaldo.get(chave).push({
            id: p.id,
            fornecedor: p.contaPagar?.fornecedor?.nomeFantasia || p.contaPagar?.fornecedor?.razaoSocial || null,
            descricao: p.contaPagar?.descricao || null,
            numeroNota: p.contaPagar?.numeroNota || null,
            numeroParcela: p.numeroParcela,
            vencimento: ymd(p.dataVencimento),
            valorParcela: num(p.valor),
            vaiAoCA: !!(p.contaPagar?.statusEnvioCA && p.contaPagar.statusEnvioCA !== 'NAO_ENVIAR'),
            saldo
        });
    }
    const nomeF = (f) => f.nomeFantasia || f.razaoSocial;
    const porDoc = new Map(fornecedores.map((f) => [f.cnpjCpf, nomeF(f)]));

    for (const l of linhasDebito) {
        const doc = docsPorLinha.get(l.id);
        const centavos = Math.round(num(l.valor) * 100);
        // ±R$ 0,01 (mesma tolerância do matching)
        const todas = [centavos - 1, centavos, centavos + 1].flatMap((c) => porSaldo.get(c) || []);
        // Regra do usuário: boleto em aberto com VALOR e DATA batendo vira SUGESTÃO
        // (um clique concilia dando a baixa); só o valor batendo fica como dica.
        const dataLanc = ymd(l.data);
        const abertasExatas = todas.filter((c) => c.vencimento === dataLanc);
        const candidatas = todas.filter((c) => c.vencimento !== dataLanc);

        // Só é "o fornecedor" quando o documento veio inteiro. No CPF mascarado, o
        // acerto pelo miolo é palpite — e se casar com mais de um, não afirmamos nada.
        let fornecedorDoDocumento = null;
        let provavel = null;
        if (doc?.completo) {
            fornecedorDoDocumento = porDoc.get(doc.completo) || null;
        } else if (doc?.parcial) {
            const achados = porParcial.filter((f) => (f.cnpjCpf || '').includes(doc.parcial));
            if (achados.length === 1) provavel = nomeF(achados[0]);
        }

        pistas.set(l.id, {
            documento: doc?.completo || null,
            documentoParcial: doc?.parcial || null,
            fornecedorDoDocumento,
            fornecedorProvavel: provavel,
            // O que o banco escreveu de útil além do MEMO ("ITPU", "DARE ICMS DeSTDA",
            // "MARIANA ... RESCISAO") — é nome de verdade, só não é do cadastro.
            textoBeneficiario: l.nome || l.payee || null,
            abertasExatas: abertasExatas.slice(0, 5),
            parcelasAbertas: candidatas.slice(0, 3)
        });
    }
    return pistas;
}

async function listar({ contaFinanceiraCaId, de, ate, status }) {
    const where = {
        contaFinanceiraCaId,
        data: { gte: dataSP(de), lte: dataSP(ate) },
        ...(status && status !== 'todos' ? { status } : {})
    };
    const linhas = await prisma.extratoLancamento.findMany({ where, orderBy: [{ data: 'desc' }, { valor: 'desc' }] });

    const [pools, usados, pistas] = await Promise.all([
        carregarPools(contaFinanceiraCaId, de, ate),
        idsUsados(contaFinanceiraCaId),
        pistasDeDebito(linhas.filter((l) => l.status === 'PENDENTE' && l.tipo === 'DEBITO'))
    ]);
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
        const [itensTodos, gruposInfo] = grupoIds.length > 0
            ? await Promise.all([
                prisma.conciliacaoGrupoItem.findMany({ where: { grupoId: { in: grupoIds } } }),
                prisma.conciliacaoGrupo.findMany({
                    where: { id: { in: grupoIds } },
                    select: { id: true, diferenca: true, motivoDiferenca: true }
                })
            ])
            : [[], []];
        const infoPorGrupo = new Map(gruposInfo.map((g) => [g.id, g]));
        const baixasPorGrupo = new Map();
        for (const it of itensTodos) {
            const pagId = it.pagamentoParcelaId || it.pagamentoParcelaPagarId;
            if (!pagId) continue;
            if (!baixasPorGrupo.has(it.grupoId)) baixasPorGrupo.set(it.grupoId, []);
            baixasPorGrupo.get(it.grupoId).push(labelPorId.get(pagId) || 'Baixa do app');
        }
        for (const it of itensLanc) {
            const labels = baixasPorGrupo.get(it.grupoId) || [];
            const info = infoPorGrupo.get(it.grupoId);
            grupoDoLancamento.set(it.extratoLancamentoId, {
                qtd: labels.length,
                labels,
                diferenca: num(info?.diferenca),
                motivoDiferenca: info?.motivoDiferenca || null
            });
        }
    }

    // Transferências entre contas (status TRANSFERENCIA): de/para qual conta foi
    const idsTransf = linhas.filter((l) => l.status === 'TRANSFERENCIA').map((l) => l.id);
    const [transfs, contasNomes] = idsTransf.length > 0
        ? await Promise.all([
            prisma.transferenciaConta.findMany({
                where: { extratoLancamentoId: { in: idsTransf } },
                select: { extratoLancamentoId: true, contaOrigemId: true, contaDestinoId: true }
            }),
            prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } })
        ])
        : [[], []];
    const transferenciaPorLancamento = new Map(transfs.map((t) => [t.extratoLancamentoId, t]));
    const nomeContaPorId = new Map(contasNomes.map((c) => [c.id, c.nomeBanco]));

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
                grupoBaixas: grupo?.labels || [],
                grupoDiferenca: grupo?.diferenca || 0,
                grupoMotivoDiferenca: grupo?.motivoDiferenca || null
            };
        }
        if (l.status === 'TRANSFERENCIA') {
            const t = transferenciaPorLancamento.get(l.id);
            const outraId = t ? (l.tipo === 'CREDITO' ? t.contaOrigemId : t.contaDestinoId) : null;
            const outraNome = outraId ? (nomeContaPorId.get(outraId) || 'outra conta') : 'conta fora do sistema';
            return { ...base, transferencia: { outraConta: outraNome, sentido: l.tipo === 'CREDITO' ? 'veio de' : 'foi para' } };
        }
        if (l.status === 'PENDENTE') {
            const p = pistas.get(l.id) || null;
            // Sugestões: baixas já registradas (valor ±0,01, data ±3d) E boletos em aberto
            // com valor E vencimento EXATOS (regra do usuário: só o que bate dos dois lados
            // vira sugestão; o resto ele escolhe na busca). Conciliar num item ABERTO dá a
            // baixa na hora, com a data e o banco do extrato.
            const sugBaixas = candidatosPara({ data: ymd(l.data), valor: num(l.valor), tipo: l.tipo }, pools, usados)
                .map((s) => ({ ...s, origem: 'BAIXA' }));
            const sugAbertas = (p?.abertasExatas || []).map((a) => ({
                id: a.id,
                origem: 'ABERTO',
                valor: a.saldo,
                data: a.vencimento,
                label: `${a.fornecedor || a.descricao || 'Despesa'} — boleto em aberto`,
                detalhe: {
                    nome: a.fornecedor || a.descricao,
                    descricao: a.descricao,
                    numeroNota: a.numeroNota,
                    parcela: a.numeroParcela,
                    vencimento: a.vencimento,
                    valorParcela: a.valorParcela,
                    vaiAoCA: a.vaiAoCA
                }
            }));
            return {
                ...base,
                sugestoes: [...sugBaixas, ...sugAbertas],
                // "De quem é?" — CNPJ no texto e/ou contas a pagar em aberto com o mesmo valor
                pistas: p
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
        transferencias: conta((l) => l.status === 'TRANSFERENCIA'),
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
 * Marca um lançamento do extrato como TRANSFERÊNCIA entre contas da empresa
 * (mesma titularidade — "PIX OUTRA IF - MESMA TIT.", TED entre os bancos da casa).
 * Não é receita nem despesa: cria um registro TransferenciaConta (aparece nos
 * relatórios por conta) e tira o lançamento dos pendentes.
 *
 * A conta do próprio extrato é um lado; `outraContaId` é o outro:
 *   CRÉDITO (entrou aqui)  → origem = outraConta, destino = conta do extrato
 *   DÉBITO  (saiu daqui)   → origem = conta do extrato, destino = outraConta
 * `outraContaId` vazio = conta fora do sistema (ex.: banco pessoal não cadastrado).
 */
async function transferir({ lancamentoId, outraContaId, obs, userId }) {
    const l = await prisma.extratoLancamento.findUnique({ where: { id: lancamentoId } });
    if (!l) { const e = new Error('Lançamento do extrato não encontrado.'); e.status = 404; throw e; }
    if (l.status !== 'PENDENTE') { const e = new Error('Só é possível marcar transferência num lançamento pendente.'); e.status = 400; throw e; }

    const outra = String(outraContaId || '').trim() || null;
    if (outra && outra === l.contaFinanceiraCaId) {
        const e = new Error('A outra conta precisa ser diferente da conta do extrato.'); e.status = 400; throw e;
    }
    if (outra) {
        const existe = await prisma.contaFinanceira.findUnique({ where: { id: outra }, select: { id: true } });
        if (!existe) { const e = new Error('Conta de contrapartida não encontrada.'); e.status = 400; throw e; }
    }

    const ehCredito = l.tipo === 'CREDITO';
    await prisma.$transaction(async (tx) => {
        await tx.transferenciaConta.create({
            data: {
                data: l.data,
                valor: l.valor,
                contaOrigemId: ehCredito ? outra : l.contaFinanceiraCaId,
                contaDestinoId: ehCredito ? l.contaFinanceiraCaId : outra,
                descricao: obs?.trim() || l.descricao || 'Transferência entre contas',
                extratoLancamentoId: l.id,
                criadoPorId: userId || null
            }
        });
        const r = await tx.extratoLancamento.updateMany({
            where: { id: l.id, status: 'PENDENTE' }, // guarda contra corrida/duplo clique
            data: { status: 'TRANSFERENCIA', obs: obs?.trim() || null, conciliadoPorId: userId || null, conciliadoEm: new Date() }
        });
        if (r.count === 0) { const e = new Error('Este lançamento acabou de ser tratado por outra pessoa.'); e.status = 400; throw e; }
    }, { timeout: 20000, maxWait: 10000 });

    return { message: 'Transferência entre contas registrada!' };
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

    // Transferência entre contas: apaga o registro da transferência junto
    await prisma.transferenciaConta.deleteMany({ where: { extratoLancamentoId: lancamentoId } });

    const r = await prisma.extratoLancamento.updateMany({
        where: { id: lancamentoId, status: { in: ['CONCILIADO', 'IGNORADO', 'TRANSFERENCIA'] } },
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
// Motivos aceitos para uma diferença entre o extrato e as baixas do app.
// Não é lista solta: o motivo é auditoria — depois dá para somar quanto foi tarifa,
// quanto foi juros, quanto foi desconto no período.
const MOTIVOS_DIFERENCA = [
    { value: 'TARIFA_BANCARIA', label: 'Tarifa/taxa do banco' },
    { value: 'JUROS_MULTA', label: 'Juros/multa pagos a mais' },
    { value: 'DESCONTO', label: 'Desconto obtido' },
    { value: 'ARREDONDAMENTO', label: 'Arredondamento' },
    { value: 'ERRO_LANCAMENTO', label: 'Erro no lançamento do app' },
    { value: 'OUTRO', label: 'Outro (descrever)' }
];
const MOTIVOS_VALIDOS = new Set(MOTIVOS_DIFERENCA.map((m) => m.value));

// ─────────────────────────────────────────────────────────────
// Conciliar dando baixa numa parcela EM ABERTO (saída)
// ─────────────────────────────────────────────────────────────

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/** Saldo que falta pagar numa parcela a pagar (ledger não estornado: pago + desconto). */
const saldoParcelaPagar = (p) => {
    const quitado = (p.pagamentos || [])
        .filter((pg) => !pg.estornado)
        .reduce((s, pg) => s + num(pg.valorPago) + num(pg.desconto), 0);
    return round2(Math.max(0, num(p.valor) - quitado));
};

/**
 * Parcelas a pagar EM ABERTO, para conciliar uma saída do extrato dando baixa.
 *
 * Modelo do Conta Azul (pedido do usuário): a janela padrão é o VENCIMENTO até
 * ±15 dias da data do pagamento no banco (de/ate, ajustável na tela — pode ser
 * "todo período" omitindo as datas), trazendo TODOS os boletos não conciliados
 * do período, não só os que batem no valor. As que fecham exatamente com o valor
 * do extrato ganham a etiqueta `bate` e vêm primeiro.
 */
async function parcelasPagarEmAberto({ valor, busca, de, ate }) {
    const termo = String(busca || '').trim();
    const temJanela = de && ate && /^\d{4}-\d{2}-\d{2}$/.test(String(de)) && /^\d{4}-\d{2}-\d{2}$/.test(String(ate));
    const parcelas = await prisma.parcelaPagar.findMany({
        where: {
            status: { in: ['PENDENTE', 'PARCIAL'] },
            ...(temJanela ? { dataVencimento: { gte: dataSP(String(de)), lte: dataSP(String(ate)) } } : {}),
            ...(termo ? {
                contaPagar: {
                    OR: [
                        { descricao: { contains: termo, mode: 'insensitive' } },
                        { numeroNota: { contains: termo, mode: 'insensitive' } },
                        { fornecedor: { razaoSocial: { contains: termo, mode: 'insensitive' } } },
                        { fornecedor: { nomeFantasia: { contains: termo, mode: 'insensitive' } } }
                    ]
                }
            } : {})
        },
        include: {
            pagamentos: { where: { estornado: false }, select: { valorPago: true, desconto: true, estornado: true } },
            contaPagar: {
                select: {
                    descricao: true, numeroNota: true, statusEnvioCA: true,
                    fornecedor: { select: { razaoSocial: true, nomeFantasia: true } }
                }
            }
        },
        orderBy: { dataVencimento: 'desc' },
        take: 500
    });

    const alvo = round2(num(valor));
    return parcelas
        .map((p) => {
            const saldo = saldoParcelaPagar(p);
            const cp = p.contaPagar;
            return {
                id: p.id,
                saldo,
                valorParcela: num(p.valor),
                numeroParcela: p.numeroParcela,
                vencimento: ymd(p.dataVencimento),
                status: p.status,
                fornecedor: cp?.fornecedor?.nomeFantasia || cp?.fornecedor?.razaoSocial || null,
                descricao: cp?.descricao || null,
                numeroNota: cp?.numeroNota || null,
                // Despesa importada do CA (statusEnvioCA=NAO_ENVIAR) não tem para onde empurrar
                // a baixa — ela fica só no app. A tela avisa antes de o usuário confirmar.
                vaiAoCA: !!(cp?.statusEnvioCA && cp.statusEnvioCA !== 'NAO_ENVIAR'),
                bate: Math.abs(saldo - alvo) <= 0.01
            };
        })
        .filter((p) => p.saldo > 0)
        .sort((a, b) => (b.bate - a.bate) || b.vencimento.localeCompare(a.vencimento))
        .slice(0, 60);
}

// ─────────────────────────────────────────────────────────────
// Conciliar dando baixa numa parcela EM ABERTO (entrada/recebimento)
// ─────────────────────────────────────────────────────────────

/** Saldo que falta receber numa parcela (usa os totais da própria parcela, como a baixa manual). */
const saldoParcelaReceber = (p) =>
    round2(Math.max(0, num(p.valor) - num(p.valorPago) - num(p.valorDescontoTotal)));

// Espelho de backend/routes/contasReceber.js (status por recebido+desconto)
const calcStatusParcelaReceber = (valor, valorPago, valorDescontoTotal) => {
    const recebido = num(valorPago) + num(valorDescontoTotal);
    if (recebido <= 0) return 'PENDENTE';
    if (recebido >= num(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};
const calcStatusContaReceber = (parcelas) => {
    const total = parcelas.length;
    const pagas = parcelas.filter((p) => p.status === 'PAGO').length;
    const parciais = parcelas.filter((p) => p.status === 'PARCIAL').length;
    const canceladas = parcelas.filter((p) => p.status === 'CANCELADO').length;
    if (pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

/** Recalcula status da parcela a receber e da conta, dentro de uma transação. */
async function recalcularParcelaReceber(tx, parcelaId) {
    const p = await tx.parcela.findUnique({
        where: { id: parcelaId },
        include: { pagamentos: { where: { estornado: false }, select: { valorRecebido: true, valorDesconto: true } } }
    });
    if (!p) return;
    const valorPago = round2(p.pagamentos.reduce((s, x) => s + num(x.valorRecebido), 0));
    const valorDescontoTotal = round2(p.pagamentos.reduce((s, x) => s + num(x.valorDesconto), 0));
    const status = p.status === 'CANCELADO' ? 'CANCELADO' : calcStatusParcelaReceber(p.valor, valorPago, valorDescontoTotal);
    const ultimo = p.pagamentos.length > 0;
    await tx.parcela.update({
        where: { id: parcelaId },
        data: {
            status, valorPago, valorDescontoTotal,
            dataPagamento: status === 'PAGO' ? new Date() : (status === 'PARCIAL' ? undefined : null)
        }
    });
    const todas = await tx.parcela.findMany({ where: { contaReceberId: p.contaReceberId }, select: { id: true, status: true } });
    const atualizadas = todas.map((x) => (x.id === parcelaId ? { ...x, status } : x));
    await tx.contaReceber.update({ where: { id: p.contaReceberId }, data: { status: calcStatusContaReceber(atualizadas) } });
}

/**
 * Contas a RECEBER em aberto, para conciliar uma ENTRADA do extrato (PIX/transferência
 * que caiu no banco/Asaas) dando a baixa ali mesmo — espelho de parcelasPagarEmAberto.
 * Janela de VENCIMENTO ±dias (ajustável na tela); as que fecham com o valor do extrato
 * ganham `bate` e vêm primeiro.
 */
async function parcelasReceberEmAberto({ valor, busca, de, ate }) {
    const termo = String(busca || '').trim();
    const temJanela = de && ate && /^\d{4}-\d{2}-\d{2}$/.test(String(de)) && /^\d{4}-\d{2}-\d{2}$/.test(String(ate));
    const parcelas = await prisma.parcela.findMany({
        where: {
            status: { in: ['PENDENTE', 'PARCIAL', 'ABERTO'] },
            contaReceber: { status: { notIn: ['CANCELADO'] } },
            ...(temJanela ? { dataVencimento: { gte: dataSP(String(de)), lte: dataSP(String(ate)) } } : {}),
            ...(termo ? {
                contaReceber: {
                    status: { notIn: ['CANCELADO'] },
                    OR: [
                        { cliente: { Nome: { contains: termo, mode: 'insensitive' } } },
                        { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } },
                        { pedido: { numero: /^\d+$/.test(termo) ? Number(termo) : undefined } }
                    ]
                }
            } : {})
        },
        select: {
            id: true, numeroParcela: true, valor: true, valorPago: true, valorDescontoTotal: true,
            status: true, dataVencimento: true,
            contaReceber: { select: { cliente: { select: { Nome: true, NomeFantasia: true } }, pedido: { select: { numero: true } } } }
        },
        orderBy: { dataVencimento: 'desc' },
        take: 500
    });

    const alvo = round2(num(valor));
    return parcelas
        .map((p) => {
            const saldo = saldoParcelaReceber(p);
            const cli = p.contaReceber?.cliente;
            return {
                id: p.id,
                saldo,
                valorParcela: num(p.valor),
                numeroParcela: p.numeroParcela,
                vencimento: ymd(p.dataVencimento),
                status: p.status,
                cliente: cli?.NomeFantasia || cli?.Nome || 'Cliente',
                pedido: p.contaReceber?.pedido?.numero || null,
                bate: Math.abs(saldo - alvo) <= 0.01
            };
        })
        .filter((p) => p.saldo > 0)
        .sort((a, b) => (b.bate - a.bate) || b.vencimento.localeCompare(a.vencimento))
        .slice(0, 60);
}

/**
 * A AÇÃO ÚNICA da conciliação: "este(s) lançamento(s) do banco é(são) ISTO no sistema".
 *
 * Aceita, em qualquer combinação:
 *   - `parcelaPagarIds`: boletos EM ABERTO do Contas a Pagar (só saída) → a baixa é
 *     criada aqui, com a data e o banco do extrato, e entra na fila do CA;
 *   - `pagamentoIds`: baixas JÁ registradas no app → só são amarradas;
 *   - `lancamentoIds`: um ou mais lançamentos do extrato (2 PIX pagando 1 boleto).
 *
 * Regras de valor:
 *   - disponível = extrato − baixas existentes − juros − multa;
 *   - os boletos são pagos por ordem de vencimento; todos menos o último devem ser
 *     cobertos por inteiro; o último pode ficar PARCIAL (sobra saldo) ou ser quitado
 *     com `desconto`;
 *   - sem boletos envolvidos, sobra/falta é `diferença` e exige motivo declarado
 *     (tarifa, juros, desconto…) — gravado no grupo, exibido na linha.
 *
 * Vínculo: 1 lançamento ↔ 1 pagamento sem diferença usa o link direto; qualquer
 * outra combinação vira ConciliacaoGrupo.
 */
async function conciliarUnificado({
    lancamentoIds, parcelaPagarIds, parcelaReceberIds, pagamentoIds, metodoPagamento,
    juros = 0, multa = 0, desconto = 0, motivoDiferenca, obsDiferenca, userId
}) {
    const idsLanc = [...new Set(lancamentoIds || [])];
    const idsParcPagar = [...new Set(parcelaPagarIds || [])];
    const idsParcReceber = [...new Set(parcelaReceberIds || [])];
    const idsPag = [...new Set(pagamentoIds || [])];
    if (idsLanc.length === 0) throw erro('Escolha ao menos um lançamento do extrato.');

    const lancs = await prisma.extratoLancamento.findMany({ where: { id: { in: idsLanc } } });
    if (lancs.length !== idsLanc.length) throw erro('Lançamento do extrato não encontrado.', 404);
    const contaFinanceiraCaId = lancs[0].contaFinanceiraCaId;
    const tipo = lancs[0].tipo;
    if (lancs.some((l) => l.contaFinanceiraCaId !== contaFinanceiraCaId)) throw erro('Todos os lançamentos precisam ser da mesma conta.');
    if (lancs.some((l) => l.status !== 'PENDENTE')) throw erro('Um dos lançamentos já foi conciliado ou ignorado — recarregue a tela.');
    if (lancs.some((l) => l.tipo !== tipo)) throw erro('Não misture entradas e saídas na mesma conciliação.');
    // Cada sentido só aceita a sua "conta em aberto": entrada → conta a receber; saída → boleto a pagar.
    if (tipo === 'CREDITO' && idsParcPagar.length > 0) throw erro('Boleto a pagar não entra numa entrada do extrato.');
    if (tipo === 'DEBITO' && idsParcReceber.length > 0) throw erro('Conta a receber não entra numa saída do extrato.');
    // idsParc = as parcelas em aberto do sentido certo (a pagar p/ saída, a receber p/ entrada).
    const idsParc = tipo === 'CREDITO' ? idsParcReceber : idsParcPagar;
    if (idsParc.length === 0 && idsPag.length === 0) throw erro('Escolha ao menos uma conta em aberto ou uma baixa já registrada.');

    const somaExtrato = round2(lancs.reduce((s, l) => s + num(l.valor), 0));
    if (somaExtrato <= 0) throw erro('A soma do extrato precisa ser maior que zero.');

    // ── Baixas JÁ registradas: existem, não estornadas, mesma conta, livres ──
    const usados = await idsUsados(contaFinanceiraCaId);
    let existentes = [];
    if (idsPag.length > 0) {
        existentes = tipo === 'CREDITO'
            ? await prisma.pagamentoParcela.findMany({
                where: { id: { in: idsPag } },
                select: { id: true, estornado: true, contaFinanceiraCaId: true, valorRecebido: true }
            })
            : await prisma.pagamentoParcelaPagar.findMany({
                where: { id: { in: idsPag } },
                select: { id: true, estornado: true, contaFinanceiraCaId: true, valorPago: true, juros: true, multa: true }
            });
        if (existentes.length !== idsPag.length) throw erro('Baixa do app não encontrada.');
        if (existentes.some((b) => b.estornado)) throw erro('Uma das baixas escolhidas foi estornada.');
        if (existentes.some((b) => b.contaFinanceiraCaId !== contaFinanceiraCaId)) throw erro('Todas as baixas precisam ser da mesma conta do extrato.');
        if (idsPag.some((id) => usados.has(id))) throw erro('Uma das baixas já está conciliada com outro lançamento.');
    }
    const somaExistentes = round2(existentes.reduce((s, b) =>
        s + (tipo === 'CREDITO' ? num(b.valorRecebido) : num(b.valorPago) + num(b.juros) + num(b.multa)), 0));

    // ── Boletos EM ABERTO: validação + rateio do dinheiro que saiu ──
    const jur = round2(Math.max(0, num(juros)));
    const mul = round2(Math.max(0, num(multa)));
    const desc = round2(Math.max(0, num(desconto)));
    let metodo = null;
    let alocacoes = []; // A PAGAR: { parcela, valorPago, juros, multa, desconto, naCA }
    let alocacoesReceber = []; // A RECEBER: { parcela, valorRecebido }
    let sobraUltima = 0;

    // ── ENTRADA: dar baixa em conta(s) a RECEBER em aberto (espelho do a pagar) ──
    if (idsParc.length > 0 && tipo === 'CREDITO') {
        metodo = String(metodoPagamento || '').toUpperCase();
        if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) throw erro('Escolha a forma de pagamento.');
        if (jur > 0 || mul > 0 || desc > 0) throw erro('Juros/multa/desconto não se aplicam ao dar baixa num recebimento por aqui.');

        const parcelas = await prisma.parcela.findMany({
            where: { id: { in: idsParc } },
            select: { id: true, status: true, valor: true, valorPago: true, valorDescontoTotal: true, dataVencimento: true }
        });
        if (parcelas.length !== idsParc.length) throw erro('Conta a receber não encontrada.', 404);
        if (parcelas.some((p) => p.status === 'PAGO' || p.status === 'CANCELADO')) throw erro('Uma das contas escolhidas já foi paga ou cancelada — recarregue a lista.');

        const disponivel = round2(somaExtrato - somaExistentes);
        if (disponivel <= 0) throw erro('O valor do extrato (menos baixas já marcadas) não sobra nada para as contas escolhidas.');

        // Recebe por ordem de vencimento; só a última pode ficar parcial; excesso vira diferença.
        const ordenadas = parcelas
            .map((p) => ({ p, saldo: saldoParcelaReceber(p), venc: ymd(p.dataVencimento) }))
            .sort((a, b) => a.venc.localeCompare(b.venc));
        if (ordenadas.some((o) => o.saldo <= 0)) throw erro('Uma das contas escolhidas já não tem saldo em aberto.');

        let restante = disponivel;
        ordenadas.forEach((o, i) => {
            const ultima = i === ordenadas.length - 1;
            if (!ultima) {
                if (restante < o.saldo - 0.01) {
                    throw erro(`O valor não alcança todas as contas marcadas: sobram R$ ${restante.toFixed(2)} para uma conta de R$ ${o.saldo.toFixed(2)}. Desmarque alguma.`);
                }
                alocacoesReceber.push({ parcela: o.p, valorRecebido: o.saldo });
                restante = round2(restante - o.saldo);
            } else {
                const recebe = round2(Math.min(restante, o.saldo));
                alocacoesReceber.push({ parcela: o.p, valorRecebido: recebe });
                sobraUltima = round2(o.saldo - recebe);
                restante = round2(restante - recebe);
            }
        });
    } else if (idsParc.length > 0) {
        // ── SAÍDA: dar baixa em boleto(s) a PAGAR em aberto ──
        metodo = String(metodoPagamento || '').toUpperCase();
        if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) throw erro('Escolha a forma de pagamento.');

        const parcelas = await prisma.parcelaPagar.findMany({
            where: { id: { in: idsParc } },
            include: {
                pagamentos: { where: { estornado: false }, select: { valorPago: true, desconto: true, estornado: true } },
                contaPagar: { select: { statusEnvioCA: true, descricao: true } }
            }
        });
        if (parcelas.length !== idsParc.length) throw erro('Boleto (parcela a pagar) não encontrado.', 404);
        if (parcelas.some((p) => p.status === 'PAGO' || p.status === 'CANCELADO')) throw erro('Um dos boletos escolhidos já foi pago ou cancelado — recarregue a lista.');

        const disponivel = round2(somaExtrato - somaExistentes - jur - mul);
        if (disponivel <= 0) throw erro('O valor do extrato (menos juros/multa e baixas já marcadas) não sobra nada para pagar os boletos escolhidos.');

        // Paga por ordem de vencimento; só o último pode ficar parcial.
        const ordenadas = parcelas
            .map((p) => ({ p, saldo: saldoParcelaPagar(p), venc: ymd(p.dataVencimento) }))
            .sort((a, b) => a.venc.localeCompare(b.venc));
        if (ordenadas.some((o) => o.saldo <= 0)) throw erro('Um dos boletos escolhidos já não tem saldo em aberto.');

        let restante = disponivel;
        ordenadas.forEach((o, i) => {
            const ultima = i === ordenadas.length - 1;
            const naCA = !!(o.p.contaPagar.statusEnvioCA && o.p.contaPagar.statusEnvioCA !== 'NAO_ENVIAR');
            if (!ultima) {
                if (restante < o.saldo - 0.01) {
                    throw erro(`O valor não alcança todos os boletos marcados: depois de pagar os primeiros, sobram R$ ${restante.toFixed(2)} para um boleto de R$ ${o.saldo.toFixed(2)}. Desmarque algum.`);
                }
                alocacoes.push({ parcela: o.p, valorPago: o.saldo, juros: 0, multa: 0, desconto: 0, naCA });
                restante = round2(restante - o.saldo);
            } else {
                if (restante > o.saldo - desc + 0.01) {
                    throw erro(`Saiu mais dinheiro (R$ ${restante.toFixed(2)}) do que o último boleto tem em aberto (R$ ${round2(o.saldo - desc).toFixed(2)}). O excedente é juros/multa? Informe nos campos.`);
                }
                // juros/multa/desconto ficam no pagamento do último boleto (é onde o valor fecha)
                alocacoes.push({ parcela: o.p, valorPago: restante, juros: jur, multa: mul, desconto: desc, naCA });
                sobraUltima = round2(o.saldo - desc - restante);
                restante = 0;
            }
        });
    } else if (jur > 0 || mul > 0 || desc > 0) {
        throw erro('Juros/multa/desconto só se aplicam quando há boleto em aberto sendo baixado.');
    }

    // ── Diferença (só existe no caso puro-existentes; com boletos o rateio fecha em 0) ──
    const somaCriadas = round2(
        alocacoes.reduce((s, a) => s + a.valorPago + a.juros + a.multa, 0) +
        alocacoesReceber.reduce((s, a) => s + a.valorRecebido, 0)
    );
    const diferenca = round2(somaExtrato - somaExistentes - somaCriadas);
    const temDiferenca = Math.abs(diferenca) > 0.01;
    const motivo = String(motivoDiferenca || '').toUpperCase();
    const obs = String(obsDiferenca || '').trim();
    if (temDiferenca) {
        if (!MOTIVOS_VALIDOS.has(motivo)) {
            throw erro(`Banco R$ ${somaExtrato.toFixed(2)} × sistema R$ ${round2(somaExistentes + somaCriadas).toFixed(2)}: diga o que é a diferença de R$ ${Math.abs(diferenca).toFixed(2)} para conciliar.`);
        }
        if (motivo === 'OUTRO' && !obs) throw erro('Descreva a diferença (motivo "Outro").');
    }
    const rotuloMotivo = temDiferenca
        ? [MOTIVOS_DIFERENCA.find((m) => m.value === motivo)?.label, obs].filter(Boolean).join(' — ')
        : null;

    const dataPagamento = new Date(lancs[0].data); // com 2 lançamentos, vale a data do primeiro
    let criadas = [];
    await prisma.$transaction(async (tx) => {
        for (const a of alocacoes) {
            const pag = await tx.pagamentoParcelaPagar.create({
                data: {
                    parcelaPagarId: a.parcela.id,
                    valorPago: a.valorPago,
                    juros: a.juros,
                    multa: a.multa,
                    desconto: a.desconto,
                    dataPagamento,
                    formaPagamento: metodo,
                    contaFinanceiraCaId, // o banco do extrato é a verdade
                    statusEnvioCA: a.naCA ? 'ENVIAR' : 'NAO_ENVIAR',
                    origem: 'MANUAL',
                    observacao: `Baixa dada pela conciliação bancária (${lancs[0].descricao || 'extrato'}).`,
                    registradoPorId: userId || null
                }
            });
            criadas.push(pag.id);
            await contasPagarCaSyncService.recalcularParcelaEConta(tx, a.parcela.id);
        }
        for (const a of alocacoesReceber) {
            const pag = await tx.pagamentoParcela.create({
                data: {
                    parcelaId: a.parcela.id,
                    valorRecebido: a.valorRecebido,
                    valorDesconto: 0,
                    dataPagamento,
                    formaPagamento: metodo,
                    contaFinanceiraCaId, // o banco do extrato é a verdade
                    observacao: `Baixa dada pela conciliação bancária (${lancs[0].descricao || 'extrato'}).`,
                    registradoPorId: userId || null
                }
            });
            criadas.push(pag.id);
            await recalcularParcelaReceber(tx, a.parcela.id);
        }

        const todosPagIds = [...idsPag, ...criadas];
        if (idsLanc.length === 1 && todosPagIds.length === 1 && !temDiferenca) {
            // Caso simples: link direto 1↔1 (guarda contra duplo clique)
            const r = await tx.extratoLancamento.updateMany({
                where: { id: idsLanc[0], status: 'PENDENTE' },
                data: {
                    status: 'CONCILIADO',
                    conciliadoAuto: false,
                    conciliadoPorId: userId || null,
                    conciliadoEm: new Date(),
                    ...(tipo === 'CREDITO' ? { pagamentoParcelaId: todosPagIds[0] } : { pagamentoParcelaPagarId: todosPagIds[0] })
                }
            });
            if (r.count === 0) throw erro('O lançamento deixou de estar pendente — recarregue a tela.');
        } else {
            const grupo = await tx.conciliacaoGrupo.create({
                data: {
                    contaFinanceiraCaId,
                    tipo,
                    valor: somaExtrato,
                    valorBaixas: round2(somaExistentes + somaCriadas),
                    diferenca,
                    motivoDiferenca: rotuloMotivo,
                    criadoPorId: userId || null
                }
            });
            await tx.conciliacaoGrupoItem.createMany({
                data: [
                    ...idsLanc.map((id) => ({ grupoId: grupo.id, extratoLancamentoId: id })),
                    ...todosPagIds.map((id) => (tipo === 'CREDITO'
                        ? { grupoId: grupo.id, pagamentoParcelaId: id }
                        : { grupoId: grupo.id, pagamentoParcelaPagarId: id }))
                ]
            });
            const r = await tx.extratoLancamento.updateMany({
                where: { id: { in: idsLanc }, status: 'PENDENTE' },
                data: { status: 'CONCILIADO', conciliadoAuto: false, conciliadoPorId: userId || null, conciliadoEm: new Date() }
            });
            if (r.count !== idsLanc.length) throw erro('Um dos lançamentos deixou de estar pendente — recarregue e tente de novo.');
        }
    }, { timeout: 30000, maxWait: 10000 });

    const partes = [];
    if (alocacoes.length > 0) {
        const quitadas = alocacoes.length - (sobraUltima > 0.01 ? 1 : 0);
        if (quitadas > 0) partes.push(`${quitadas} boleto(s) baixado(s)`);
        if (sobraUltima > 0.01) partes.push(`1 baixa parcial (faltam R$ ${sobraUltima.toFixed(2)})`);
        if (alocacoes.some((a) => a.naCA)) partes.push('baixa vai ao Conta Azul');
        if (alocacoes.some((a) => !a.naCA)) partes.push('despesa importada do CA fica só no app');
    }
    if (alocacoesReceber.length > 0) {
        const quitadas = alocacoesReceber.length - (sobraUltima > 0.01 ? 1 : 0);
        if (quitadas > 0) partes.push(`${quitadas} conta(s) a receber baixada(s)`);
        if (sobraUltima > 0.01) partes.push(`1 baixa parcial (faltam R$ ${sobraUltima.toFixed(2)})`);
    }
    if (idsPag.length > 0) partes.push(`${idsPag.length} baixa(s) já registrada(s) amarrada(s)`);
    if (temDiferenca) partes.push(`diferença de R$ ${Math.abs(diferenca).toFixed(2)} registrada: ${rotuloMotivo}`);
    return { message: `Conciliado! ${partes.join(' · ')}.` };
}

// ─────────────────────────────────────────────────────────────
// Criar a despesa que faltava, direto do extrato
// ─────────────────────────────────────────────────────────────

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

/**
 * LOTE — cria uma despesa (já paga) para CADA lançamento de SAÍDA selecionado e
 * JÁ CONCILIA na hora. Feito para tarifas repetidas (boleto/PIX do Asaas), onde o
 * usuário escolhe UMA vez o fornecedor, a categoria da DRE e a forma de pagamento,
 * e cada linha vira sua própria despesa (mantém a descrição e o nº de documento do
 * banco — cada tarifa tem seu identificador).
 *
 * Cada lançamento é atômico e independente: cria conta + parcela + baixa, recalcula
 * e concilia o lançamento (1:1 com a baixa recém-criada), tudo numa transação sua.
 * Se um falhar, os outros seguem — devolve o total criado e a lista de falhas.
 * O envio ao CA (despesa + baixa) acontece depois, pelos workers, como no fluxo unitário.
 */
async function criarDespesasLoteEConciliar({
    lancamentoIds, fornecedorId, fornecedorNovo, categoria, categoriaCaId, metodoPagamento, userId
}) {
    const ids = [...new Set((lancamentoIds || []).filter(Boolean))];
    if (ids.length === 0) throw erro('Selecione ao menos um lançamento.');
    if (ids.length > 200) throw erro('Máximo de 200 lançamentos por vez — faça em partes.');

    const metodo = String(metodoPagamento || '').toUpperCase();
    if (!contasPagarCaSyncService.METODOS_BAIXA_VALIDOS.has(metodo)) throw erro('Escolha a forma de pagamento.');

    const nomeNovo = String(fornecedorNovo || '').trim();
    if (!fornecedorId && !nomeNovo) throw erro('Informe o fornecedor (as despesas vão para o Conta Azul).');

    // Resolve/cria o fornecedor UMA vez (fora do loop) — todas as tarifas usam o mesmo.
    let idFornecedor = fornecedorId || null;
    if (!idFornecedor) {
        const novo = await prisma.fornecedor.create({
            data: { razaoSocial: nomeNovo, ativo: true, origem: 'APP', statusEnvioCA: 'ENVIAR' }
        });
        idFornecedor = novo.id;
    }

    const labelMetodo = contasPagarCaSyncService.METODOS_PAGAMENTO_BAIXA.find((m) => m.value === metodo)?.label || metodo;

    const lancamentos = await prisma.extratoLancamento.findMany({ where: { id: { in: ids } } });
    const porId = new Map(lancamentos.map((l) => [l.id, l]));

    let criadas = 0;
    let totalValor = 0;
    const falhas = [];

    // Sequencial de propósito: cada item é uma transação curta; o banco compartilhado
    // não gosta de 50 transações simultâneas. Falha de um não derruba os demais.
    for (const id of ids) {
        const l = porId.get(id);
        try {
            if (!l) throw erro('Lançamento não encontrado.');
            if (l.tipo !== 'DEBITO') throw erro('Não é uma saída do banco — só saídas viram despesa.');
            if (l.status !== 'PENDENTE') throw erro('Já conciliado, ignorado ou marcado como transferência.');
            const valor = round2(num(l.valor));
            if (valor <= 0) throw erro('Valor inválido.');

            const descricao = String(l.descricao || 'Tarifa bancária').trim().substring(0, 255);
            const numeroNota = String(l.checkNum || l.refNum || '').trim() || null;
            const dataPagamento = new Date(l.data);

            await prisma.$transaction(async (tx) => {
                const conta = await tx.contaPagar.create({
                    data: {
                        fornecedorId: idFornecedor,
                        descricao,
                        categoria: categoria?.trim() || null,
                        categoriaCaId: categoriaCaId || null,
                        numeroNota,
                        observacoes: `Lançada em lote pela conciliação bancária (extrato: ${l.descricao || 'sem descrição'}).`,
                        origem: 'MANUAL',
                        valorTotal: valor,
                        status: 'ABERTO',
                        statusEnvioCA: 'ENVIAR',
                        metodoPagamentoCA: metodo,
                        contaFinanceiraCaId: l.contaFinanceiraCaId,
                        criadoPorId: userId || null,
                        parcelas: { create: [{ numeroParcela: 1, valor, dataVencimento: dataPagamento }] }
                    },
                    include: { parcelas: true }
                });
                const parcela = conta.parcelas[0];
                const pag = await tx.pagamentoParcelaPagar.create({
                    data: {
                        parcelaPagarId: parcela.id,
                        valorPago: valor,
                        juros: 0,
                        multa: 0,
                        dataPagamento,
                        formaPagamento: metodo,
                        contaFinanceiraCaId: l.contaFinanceiraCaId,
                        statusEnvioCA: 'ENVIAR',
                        origem: 'MANUAL',
                        observacao: `Baixa em lote pela conciliação bancária (${labelMetodo}).`,
                        registradoPorId: userId || null
                    }
                });
                await contasPagarCaSyncService.recalcularParcelaEConta(tx, parcela.id);
                // Concilia o lançamento na hora — a baixa recém-criada é o par 1:1.
                const upd = await tx.extratoLancamento.updateMany({
                    where: { id: l.id, status: 'PENDENTE' }, // guarda contra corrida
                    data: {
                        status: 'CONCILIADO',
                        conciliadoAuto: false,
                        conciliadoPorId: userId || null,
                        conciliadoEm: new Date(),
                        pagamentoParcelaPagarId: pag.id
                    }
                });
                if (upd.count === 0) throw erro('O lançamento mudou de status durante o processo.');
            }, { timeout: 20000, maxWait: 10000 });

            criadas++;
            totalValor = round2(totalValor + valor);
        } catch (e) {
            falhas.push({ id, descricao: l?.descricao || id, erro: e.message });
        }
    }

    const msg = falhas.length === 0
        ? `${criadas} despesa(s) lançada(s) e conciliada(s) — R$ ${totalValor.toFixed(2)}.`
        : `${criadas} lançada(s) (R$ ${totalValor.toFixed(2)}); ${falhas.length} não deu(deram) certo.`;
    return { message: msg, criadas, totalValor, falhas };
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
    importarPdf,
    parsePdfExtratoCA,
    listar,
    conciliarAutomatico,
    conciliar,
    baixasDisponiveis,
    ignorar,
    transferir,
    desfazer,
    listarImportacoes,
    criarDespesaDoLancamento,
    criarDespesasLoteEConciliar,
    opcoesDespesa,
    parcelasPagarEmAberto,
    parcelasReceberEmAberto,
    conciliarUnificado,
    MOTIVOS_DIFERENCA,
    // puras (testáveis offline)
    decodificarOfx,
    parseOfx,
    candidatosPara,
    validarSomaGrupo
};
