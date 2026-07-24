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
const contaAzulService = require('./contaAzulService');

const BASE = 'https://api-v2.contaazul.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// Tarifa fixa que o Conta Azul desconta do CRÉDITO de cada boleto recebido na
// Conta PJ: a baixa no app é o valor cheio (ex.: R$ 789,99) e o crédito no
// extrato vem líquido (R$ 788,49) — diferença SEMPRE de R$ 1,50 (conferido no
// extrato real de 07/2026). O matching aceita essa diferença e a conciliação
// registra a tarifa como motivo automaticamente.
const TARIFA_BOLETO_CA = 1.5;

/**
 * Candidatos do app para UM lançamento do extrato.
 * @param lanc   { data:'YYYY-MM-DD', valor, tipo }
 * @param pools  { entradas: [{id, valor, data, label}], saidas: [...] } — já na mesma conta
 * @param usados Set de ids de pagamentos já conciliados com outro lançamento
 * @returns candidatos; os casados pela tarifa do boleto CA vêm com `tarifa: 1.5`.
 */
function candidatosPara(lanc, pools, usados, janelaDias = 3) {
    const pool = lanc.tipo === 'CREDITO' ? pools.entradas : pools.saidas;
    const de = somaDias(lanc.data, -janelaDias);
    const ate = somaDias(lanc.data, janelaDias);
    const distDias = (d) => Math.abs((new Date(`${d}T12:00:00Z`) - new Date(`${lanc.data}T12:00:00Z`)) / 86400000);
    return pool
        .filter((p) => !usados.has(p.id) && p.data >= de && p.data <= ate &&
            (valorBate(p.valor, lanc.valor) ||
                (lanc.tipo === 'CREDITO' && valorBate(p.valor, round2(lanc.valor + TARIFA_BOLETO_CA)))))
        .map((p) => (valorBate(p.valor, lanc.valor) ? p : { ...p, tarifa: TARIFA_BOLETO_CA }))
        .sort((a, b) => ((a.tarifa ? 1 : 0) - (b.tarifa ? 1 : 0)) || (distDias(a.data) - distDias(b.data)))
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
                        contaReceber: { select: { pedido: { select: { numero: true, nfeNumero: true } }, cliente: { select: { Nome: true, NomeFantasia: true } } } }
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
                nf: r.parcela?.contaReceber?.pedido?.nfeNumero || null,
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

    // 1) Texto por LINHA visual. O PDF do CA é gerado ROTACIONADO (as coordenadas
    //    cruas agrupam por COLUNA: todas as datas juntas, todos os valores juntos —
    //    visto no diag do arquivo real). Convertendo cada item para o espaço VISUAL
    //    da página (viewport, que aplica a rotação), o y volta a ser a linha de
    //    verdade. Agrupa por y visual (tolerância 4pt) e ordena da esquerda p/ direita.
    const linhas = [];
    const debugPaginas = []; // p/ diagnóstico quando nada é reconhecido
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        if (p === 1) {
            debugPaginas.push({
                rotate: page.rotate,
                viewport: { w: Math.round(viewport.width), h: Math.round(viewport.height), transform: viewport.transform },
                itens: tc.items
                    .filter((it) => String(it.str || '').trim() !== '')
                    .slice(0, 80)
                    .map((it) => ({ str: String(it.str).slice(0, 40), t: (it.transform || []).map((v) => Math.round(v * 10) / 10) }))
            });
        }
        const itens = tc.items
            .filter((it) => String(it.str || '').trim() !== '')
            .map((it) => {
                const t = pdfjsLib.Util.transform(viewport.transform, it.transform);
                return { x: t[4], y: t[5], str: String(it.str) }; // y visual cresce para BAIXO
            })
            .sort((a, b) => (a.y - b.y) || (a.x - b.x));
        let atual = null;
        for (const it of itens) {
            if (!atual || Math.abs(atual.y - it.y) > 4) {
                if (atual) linhas.push(atual.pedacos.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
                atual = { y: it.y, pedacos: [] };
            } else {
                atual.y = (atual.y + it.y) / 2; // acompanha a média da linha
            }
            atual.pedacos.push(it);
        }
        if (atual) linhas.push(atual.pedacos.sort((a, b) => a.x - b.x).map((i) => i.str).join(' '));
    }
    try { await doc.destroy(); } catch (_) { /* liberar memória; falha aqui não importa */ }

    // 2) Linha de movimento = começa com data e tem UM valor; resto é ruído.
    //    Valor: "R$ 1.234,56" com sinal opcional (hífen, en/em-dash ou U+2212) antes
    //    do R$ — e tolera o "R$" faltando na extração (só o número decimal).
    const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})\s+(.+)$/;
    const RE_VALOR_RS = /([-−–—]\s*)?R\$\s*([\d.]+,\d{2})/;
    const RE_VALOR_NU = /([-−–—]\s*)?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})(?!\d)/;
    const RE_STATUS_CA = /\s*(Não\s+conciliado|Conciliado)\s*/i;
    const lancamentos = [];
    const repeticoes = new Map(); // chave data|desc|tipo|valor → nº da repetição

    for (const bruta of linhas) {
        // \s cobre NBSP; normaliza também espaços estreitos que alguns PDFs usam
        const linha = bruta.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();
        const m = linha.match(RE_DATA);
        if (!m) continue;
        const resto = m[4];
        if (/^Saldo\s+(do dia|anterior|final)/i.test(resto)) continue; // linha de saldo, não é movimento
        if (/^a\s+\d{2}\/\d{2}\/\d{4}/.test(resto)) continue;          // "01/07/2026 a 31/07/2026" (período do cabeçalho)

        // Procura o valor DEPOIS do status do CA (a coluna Valor fica à direita);
        // sem status na linha, procura no texto todo. Primeiro com R$, depois número puro.
        const mStatus = resto.match(RE_STATUS_CA);
        const cauda = mStatus ? resto.slice(mStatus.index + mStatus[0].length) : resto;
        const baseIdx = mStatus ? mStatus.index + mStatus[0].length : 0;
        let mv = cauda.match(RE_VALOR_RS);
        if (!mv) mv = cauda.match(RE_VALOR_NU);
        if (!mv) continue; // linha com data mas sem valor — cabeçalho/ruído (fica no diagnóstico)

        const negativo = !!mv[1];
        const valor = round2(Number(mv[2].replace(/\./g, '').replace(',', '.')));
        if (!(valor > 0)) continue;

        const descricao = resto.slice(0, baseIdx + mv.index).replace(RE_STATUS_CA, ' ').replace(/\s+/g, ' ').trim();
        if (!descricao) { avisos.push(`Linha sem descrição ignorada (${m[1]}/${m[2]}/${m[3]}, R$ ${mv[2]}).`); continue; }

        const data = `${m[3]}-${m[2]}-${m[1]}`;
        const tipo = negativo ? 'DEBITO' : 'CREDITO';
        const chave = `${data}|${descricao}|${tipo}|${valor.toFixed(2)}`;
        const n = (repeticoes.get(chave) || 0) + 1;
        repeticoes.set(chave, n);
        const fitId = 'PDF' + crypto.createHash('sha1').update(`${chave}|${n}`).digest('hex').slice(0, 30);

        // IDENTIFICAÇÃO DETERMINÍSTICA: "Venda 1557 - 1/1" na descrição = pedido 1557,
        // parcela 1 no app (a numeração de vendas é COMPARTILHADA com o CA — o app pega
        // o próximo número lá). Guardamos o nº da venda em checkNum e a parcela em
        // refNum; o status da conciliação DO CA vai para memo (contexto na tela).
        const mVenda = descricao.match(/Venda\s+(\d+)\s*-\s*(\d+)\/(\d+)/i);
        const statusCa = mStatus ? (/n[ãa]o/i.test(mStatus[0]) ? 'Não conciliado no CA' : 'Conciliado no CA') : null;

        lancamentos.push({
            fitId, data, valor, tipo, descricao,
            memo: statusCa, nome: null, payee: null,
            checkNum: mVenda ? mVenda[1] : null,
            refNum: mVenda ? `${mVenda[2]}/${mVenda[3]}` : null,
            trnType: null
        });
    }

    if (lancamentos.length === 0) {
        avisos.unshift('Nenhum lançamento reconhecido no PDF — confira se é o "Extrato Conta Azul" exportado do CA (não um scan/foto).');
        // DIAGNÓSTICO: guarda o que o servidor extraiu (primeiras linhas) para inspecionar
        // via admin-exec/diag-pdf-ultimo — sem isso, impossível saber o que veio do PDF real.
        try {
            const valor = {
                em: new Date().toISOString(),
                totalLinhas: linhas.length,
                amostra: linhas.slice(0, 120),
                // Dados CRUS da 1ª página (texto + matriz de posição de cada item):
                // é o que permite descobrir a transformação certa do PDF real.
                pagina1: debugPaginas[0] || null
            };
            await prisma.appConfig.upsert({
                where: { key: 'diag_pdf_extrato_ultimo' },
                update: { value: valor },
                create: { key: 'diag_pdf_extrato_ultimo', value: valor }
            });
        } catch (_) { /* diagnóstico é melhor-esforço */ }
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
    let novos = lancamentos.filter((l) => !porFitId.has(l.fitId));

    // Conta com extrato AUTOMÁTICO (linhas ca-* geradas dos movimentos do CA — caso da
    // Conta PJ Conta Azul): o OFX/PDF traz os MESMOS movimentos com FITID próprio, o que
    // duplicava tudo. Linha do arquivo que já existe como linha derivada (mesmo sentido e
    // valor ±0,01 em ±2 dias; crédito de boleto também casa o LÍQUIDO = bruto − R$1,50 da
    // tarifa do CA) é pulada e contada como duplicada. Linha sem par (tarifa, crédito
    // ainda sem baixa) entra normalmente — é justamente a informação nova do arquivo.
    if (novos.length > 0) {
        const datasNovos = novos.map((l) => new Date(`${l.data}T12:00:00-03:00`).getTime());
        const derivadas = await prisma.extratoLancamento.findMany({
            where: {
                contaFinanceiraCaId,
                fitId: { startsWith: 'ca-' },
                data: {
                    gte: new Date(Math.min(...datasNovos) - 3 * 86400000),
                    lte: new Date(Math.max(...datasNovos) + 3 * 86400000)
                }
            },
            select: { data: true, valor: true, tipo: true }
        });
        if (derivadas.length > 0) {
            const pool = derivadas.map((d) => ({ t: new Date(d.data).getTime(), valor: Number(d.valor), tipo: d.tipo, usada: false }));
            novos = novos.filter((l) => {
                const t = new Date(`${l.data}T12:00:00-03:00`).getTime();
                const v = Number(l.valor);
                let p = pool.find((x) => !x.usada && x.tipo === l.tipo && Math.abs(x.valor - v) <= 0.01 && Math.abs(x.t - t) <= 2 * 86400000);
                if (!p && l.tipo === 'CREDITO') {
                    p = pool.find((x) => !x.usada && x.tipo === 'CREDITO' && (x.valor - v) >= 1.49 && (x.valor - v) <= 1.51 && Math.abs(x.t - t) <= 2 * 86400000);
                }
                if (p) { p.usada = true; return false; }
                return true;
            });
        }
    }

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

/**
 * Identificação DETERMINÍSTICA dos pendentes de CRÉDITO que trazem "Venda NNNN"
 * (checkNum, vindo do PDF do CA): a numeração de vendas é compartilhada, então
 * Venda NNNN = pedido NNNN do app. Não é sugestão por valor — é o próprio pedido.
 * Devolve Map lancamentoId → { venda, parcela, cliente, statusCA, pagamentoId,
 * valorBaixa, tarifa, fecha, motivo }.
 */
async function _identificarPendentes(linhas, usados) {
    const alvo = linhas.filter((l) => l.status === 'PENDENTE' && l.tipo === 'CREDITO' && l.checkNum && /^\d+$/.test(String(l.checkNum)));
    if (alvo.length === 0) return new Map();
    const numeros = [...new Set(alvo.map((l) => Number(l.checkNum)))];
    const pedidos = await prisma.pedido.findMany({
        where: { numero: { in: numeros } },
        select: {
            numero: true,
            cliente: { select: { Nome: true, NomeFantasia: true } },
            contaReceber: {
                select: {
                    parcelas: {
                        select: {
                            id: true, numeroParcela: true, valor: true, status: true,
                            pagamentos: { where: { estornado: false }, select: { id: true, valorRecebido: true, contaFinanceiraCaId: true } }
                        }
                    }
                }
            }
        }
    });
    const porNumero = new Map(pedidos.map((p) => [p.numero, p]));
    const mapa = new Map();
    for (const l of alvo) {
        const ped = porNumero.get(Number(l.checkNum));
        if (!ped) continue; // venda do CA sem pedido no app (ex.: lançada direto lá) — segue como sugestão comum
        const nParc = Number(String(l.refNum || '1/1').split('/')[0]) || 1;
        const parcela = (ped.contaReceber?.parcelas || []).find((p) => p.numeroParcela === nParc) || null;
        const ident = {
            venda: Number(l.checkNum),
            parcela: l.refNum || null,
            cliente: ped.cliente?.NomeFantasia || ped.cliente?.Nome || 'Cliente',
            statusCA: l.memo || null,
            parcelaStatus: parcela?.status || null,
            pagamentoId: null, valorBaixa: null, tarifa: false, fecha: false, motivo: null
        };
        if (!parcela) {
            ident.motivo = 'parcela não encontrada no app';
        } else {
            const pg = parcela.pagamentos.find((x) => x.contaFinanceiraCaId === l.contaFinanceiraCaId && !usados.has(x.id));
            if (!pg) {
                ident.motivo = parcela.status === 'PAGO'
                    ? 'baixa paga mas sem registro nesta conta (aguarde o backfill) ou já conciliada'
                    : 'parcela em aberto no app';
            } else {
                ident.pagamentoId = pg.id;
                ident.valorBaixa = round2(num(pg.valorRecebido));
                if (valorBate(ident.valorBaixa, num(l.valor))) {
                    ident.fecha = true;
                } else if (valorBate(ident.valorBaixa, round2(num(l.valor) + TARIFA_BOLETO_CA))) {
                    ident.fecha = true;
                    ident.tarifa = true;
                } else {
                    ident.motivo = `valor não bate (baixa R$ ${ident.valorBaixa.toFixed(2)} × crédito R$ ${num(l.valor).toFixed(2)})`;
                }
            }
        }
        mapa.set(l.id, ident);
    }
    return mapa;
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

    // Identificação determinística (Venda NNNN do PDF do CA = pedido NNNN)
    const identMapa = await _identificarPendentes(linhas, usados);

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
                // Identificado com CERTEZA (Venda NNNN = pedido NNNN) — não é palpite
                identificado: identMapa.get(l.id) || null,
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

/**
 * Fornecedor "Conta Azul" + categoria "Tarifas de Boletos" para a despesa da tarifa.
 * Resolvidos FORA da transação (categoria consulta a API do CA; regra do projeto:
 * nada de rede dentro de $transaction). Cache de 1h.
 */
let _refTarifaCache = { em: 0, fornecedorId: null, categoria: null };
async function _referenciasTarifaCA() {
    if (_refTarifaCache.fornecedorId && Date.now() - _refTarifaCache.em < 3600000) return _refTarifaCache;
    let fornecedor = await prisma.fornecedor.findFirst({
        where: { razaoSocial: { contains: 'conta azul', mode: 'insensitive' } },
        select: { id: true }
    });
    if (!fornecedor) {
        fornecedor = await prisma.fornecedor.create({
            data: { razaoSocial: 'Conta Azul (tarifas)', ativo: true, origem: 'APP', statusEnvioCA: 'NAO_ENVIAR' },
            select: { id: true }
        });
    }
    let categoria = null;
    try {
        const cats = await contasPagarCaSyncService.listarCategoriasDespesaSeguro();
        categoria = (cats || []).find((c) => /tarifas?\s+de\s+boletos?/i.test(c.nome || '')) ||
            (cats || []).find((c) => /tarifa/i.test(c.nome || '')) || null;
    } catch (_) { /* sem categoria do CA — a despesa fica sem categoriaCaId */ }
    _refTarifaCache = { em: Date.now(), fornecedorId: fornecedor.id, categoria };
    return _refTarifaCache;
}

/**
 * Vincula um CRÉDITO a uma baixa que difere exatamente pela tarifa do boleto CA:
 * vira um GRUPO com a diferença registrada como "Tarifa/taxa do banco" E gera a
 * DESPESA da tarifa (R$ 1,50, fornecedor Conta Azul, categoria Tarifas de Boletos),
 * já paga na conta do extrato — assim a DRE registra o custo e o saldo por conta
 * fecha com o crédito líquido. A despesa fica SÓ NO APP (NAO_ENVIAR): no CA o
 * crédito já entra líquido, empurrar a tarifa para lá subtrairia duas vezes.
 * Desfazer a conciliação cancela a despesa junto (vínculo [tarifa-grupo:id] na observação).
 */
async function _vincularComTarifaCA(lanc, pagamentoId, valorBaixa, userId, auto) {
    const refs = await _referenciasTarifaCA(); // fora da transação (pode bater na API do CA)
    await prisma.$transaction(async (tx) => {
        const grupo = await tx.conciliacaoGrupo.create({
            data: {
                contaFinanceiraCaId: lanc.contaFinanceiraCaId,
                tipo: 'CREDITO',
                valor: round2(num(lanc.valor)),
                valorBaixas: round2(num(valorBaixa)),
                diferenca: round2(num(lanc.valor) - num(valorBaixa)), // negativa: entrou menos que a baixa
                motivoDiferenca: `Tarifa/taxa do banco — boleto Conta Azul (R$ ${TARIFA_BOLETO_CA.toFixed(2)})`,
                criadoPorId: userId || null
            }
        });
        await tx.conciliacaoGrupoItem.createMany({
            data: [
                { grupoId: grupo.id, extratoLancamentoId: lanc.id },
                { grupoId: grupo.id, pagamentoParcelaId: pagamentoId }
            ]
        });
        const r = await tx.extratoLancamento.updateMany({
            where: { id: lanc.id, status: 'PENDENTE' },
            data: { status: 'CONCILIADO', conciliadoAuto: !!auto, conciliadoPorId: userId || null, conciliadoEm: new Date() }
        });
        if (r.count === 0) throw erro('O lançamento deixou de estar pendente — recarregue a tela.');

        // Despesa da tarifa, já paga na conta do extrato (só no app)
        await _criarDespesaTarifaTx(tx, lanc, TARIFA_BOLETO_CA, grupo.id, userId, refs);
    }, { timeout: 20000, maxWait: 10000 });
}

/** Cria a despesa da tarifa do boleto CA dentro de uma transação já aberta. */
async function _criarDespesaTarifaTx(tx, lanc, valorTarifa, grupoId, userId, refs) {
    const conta = await tx.contaPagar.create({
        data: {
            fornecedorId: refs.fornecedorId,
            descricao: `Tarifa de boleto Conta Azul — ${String(lanc.descricao || 'recebimento').slice(0, 180)}`,
            categoria: refs.categoria?.nome || 'Tarifas de Boletos',
            categoriaCaId: refs.categoria?.id || null,
            origem: 'MANUAL',
            valorTotal: valorTarifa,
            status: 'ABERTO',
            statusEnvioCA: 'NAO_ENVIAR', // no CA o crédito já entra líquido — não duplicar lá
            contaFinanceiraCaId: lanc.contaFinanceiraCaId,
            criadoPorId: userId || null,
            observacoes: `Gerada na conciliação bancária (tarifa descontada do crédito). [tarifa-grupo:${grupoId}]`,
            parcelas: { create: [{ numeroParcela: 1, valor: valorTarifa, dataVencimento: lanc.data }] }
        },
        include: { parcelas: true }
    });
    await tx.pagamentoParcelaPagar.create({
        data: {
            parcelaPagarId: conta.parcelas[0].id,
            valorPago: valorTarifa,
            dataPagamento: lanc.data,
            formaPagamento: 'OUTRO',
            contaFinanceiraCaId: lanc.contaFinanceiraCaId,
            statusEnvioCA: 'NAO_ENVIAR',
            origem: 'MANUAL',
            observacao: 'Tarifa do boleto Conta Azul (descontada do crédito no extrato).',
            registradoPorId: userId || null
        }
    });
    await contasPagarCaSyncService.recalcularParcelaEConta(tx, conta.parcelas[0].id);
}

/**
 * Conciliação DETERMINÍSTICA dos créditos do extrato Asaas: o refNum do lançamento
 * guarda o pay_... da cobrança, que aponta exatamente a parcela (boleto) ou o
 * pedido (PIX) no app — sem depender de data e valor baterem. Resolve os três
 * casos que o matching por valor não fecha:
 *   - boleto pago com JUROS/MULTA (crédito maior que a baixa) → grupo com o motivo;
 *   - crédito que caiu >3 dias depois da baixa (fim de semana na compensação);
 *   - dois boletos de mesmo valor no mesmo dia (ambiguidade some: cada pay_ é único).
 * Conservador: só fecha quando a cobrança leva a EXATAMENTE UMA baixa livre na
 * conta, e diferença só é aceita como juros até 10% do crédito (mín. R$ 5) —
 * acima disso, ou crédito MENOR que a baixa, fica para análise manual.
 * Devolve { conciliados, ids } (ids dos lançamentos fechados aqui).
 */
async function _conciliarPorRefAsaas(pendentes, contaFinanceiraCaId, usados, userId) {
    const feitos = new Set();
    const creditos = pendentes.filter((l) => l.tipo === 'CREDITO' && /^pay_/.test(String(l.refNum || '')));
    if (creditos.length === 0) return { conciliados: 0, ids: feitos };

    const cobrancas = await prisma.cobrancaAsaas.findMany({
        where: { asaasPaymentId: { in: creditos.map((l) => l.refNum) } },
        select: { asaasPaymentId: true, parcelaId: true, pedidoId: true }
    });
    const porPay = new Map(cobrancas.map((c) => [c.asaasPaymentId, c]));
    // PIX de pedido (sem parcela vinculada): as parcelas vêm da conta a receber do pedido
    const pedidosIds = [...new Set(cobrancas.filter((c) => !c.parcelaId && c.pedidoId).map((c) => c.pedidoId))];
    const contasPed = pedidosIds.length > 0
        ? await prisma.contaReceber.findMany({
            where: { pedidoId: { in: pedidosIds } },
            select: { pedidoId: true, parcelas: { select: { id: true } } }
        })
        : [];
    const parcelasPorPedido = new Map(contasPed.map((c) => [c.pedidoId, c.parcelas.map((p) => p.id)]));

    let conciliados = 0;
    for (const l of creditos) {
        const cob = porPay.get(l.refNum);
        if (!cob) continue;
        const parcelaIds = cob.parcelaId ? [cob.parcelaId] : (parcelasPorPedido.get(cob.pedidoId) || []);
        if (parcelaIds.length === 0) continue;

        const baixas = await prisma.pagamentoParcela.findMany({
            where: { estornado: false, contaFinanceiraCaId, parcelaId: { in: parcelaIds } },
            select: { id: true, valorRecebido: true }
        });
        const livres = baixas.filter((b) => !usados.has(b.id));
        if (livres.length !== 1) continue; // nada ou mais de uma baixa livre — deixa para o matching/manual

        const baixa = livres[0];
        const dif = round2(num(l.valor) - num(baixa.valorRecebido));
        const tetoJuros = Math.max(5, round2(num(l.valor) * 0.10));
        try {
            if (Math.abs(dif) <= 0.01) {
                const r = await prisma.extratoLancamento.updateMany({
                    where: { id: l.id, status: 'PENDENTE' }, // guarda contra corrida/duplo clique
                    data: {
                        status: 'CONCILIADO', conciliadoAuto: true, conciliadoPorId: userId || null,
                        conciliadoEm: new Date(), pagamentoParcelaId: baixa.id
                    }
                });
                if (r.count > 0) { usados.add(baixa.id); feitos.add(l.id); conciliados++; }
            } else if (dif > 0.01 && dif <= tetoJuros) {
                // Crédito MAIOR que a baixa: juros/multa do atraso. A baixa do app fica
                // como está (nominal); a diferença entra registrada no grupo — mesmo
                // formato do "Juros/multa recebidos" da conciliação manual.
                await prisma.$transaction(async (tx) => {
                    const grupo = await tx.conciliacaoGrupo.create({
                        data: {
                            contaFinanceiraCaId,
                            tipo: 'CREDITO',
                            valor: round2(num(l.valor)),
                            valorBaixas: round2(num(baixa.valorRecebido)),
                            diferenca: dif,
                            motivoDiferenca: `Juros/multa recebidos R$ ${dif.toFixed(2)} — cobrança Asaas paga em atraso`,
                            criadoPorId: userId || null
                        }
                    });
                    await tx.conciliacaoGrupoItem.createMany({
                        data: [
                            { grupoId: grupo.id, extratoLancamentoId: l.id },
                            { grupoId: grupo.id, pagamentoParcelaId: baixa.id }
                        ]
                    });
                    const r = await tx.extratoLancamento.updateMany({
                        where: { id: l.id, status: 'PENDENTE' },
                        data: { status: 'CONCILIADO', conciliadoAuto: true, conciliadoPorId: userId || null, conciliadoEm: new Date() }
                    });
                    if (r.count === 0) throw erro('O lançamento deixou de estar pendente.');
                }, { timeout: 20000, maxWait: 10000 });
                usados.add(baixa.id); feitos.add(l.id); conciliados++;
            }
            // dif negativa (crédito MENOR que a baixa) ou juros acima do teto: análise manual.
        } catch (_) { /* corrida/duplo clique — segue para o próximo */ }
    }
    return { conciliados, ids: feitos };
}

/** Concilia sozinho os PENDENTES com exatamente 1 candidato (exato ou tarifa do boleto CA). */
async function conciliarAutomatico({ contaFinanceiraCaId, de, ate, userId }) {
    const pendentes = await prisma.extratoLancamento.findMany({
        where: { contaFinanceiraCaId, status: 'PENDENTE', data: { gte: dataSP(de), lte: dataSP(ate) } }
    });
    if (pendentes.length === 0) return { conciliados: 0, restantes: 0 };

    const [pools, usados] = await Promise.all([carregarPools(contaFinanceiraCaId, de, ate), idsUsados(contaFinanceiraCaId)]);

    // 1º passo: fechamento determinístico pelo pay_ do Asaas (independe de data/valor)
    const porRef = await _conciliarPorRefAsaas(pendentes, contaFinanceiraCaId, usados, userId);

    let conciliados = porRef.conciliados;
    for (const l of pendentes) {
        if (porRef.ids.has(l.id)) continue;
        const cands = candidatosPara({ data: ymd(l.data), valor: num(l.valor), tipo: l.tipo }, pools, usados);
        if (cands.length !== 1) continue;
        const alvo = cands[0];
        if (alvo.tarifa) {
            // Boleto CA com tarifa: fecha como grupo com o motivo registrado
            try {
                await _vincularComTarifaCA(l, alvo.id, alvo.valor, userId, true);
                usados.add(alvo.id); conciliados++;
            } catch (_) { /* corrida/duplo clique — segue para o próximo */ }
            continue;
        }
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
            ? prisma.pagamentoParcela.findUnique({ where: { id: pagId }, select: { id: true, estornado: true, valorRecebido: true } })
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

    // Boleto CA: a baixa é R$ 1,50 maior que o crédito (tarifa descontada na conta).
    // Nesse caso o vínculo vira GRUPO com a tarifa registrada como motivo.
    if (l.tipo === 'CREDITO' &&
        !valorBate(num(pagamento.valorRecebido), num(l.valor)) &&
        valorBate(num(pagamento.valorRecebido), round2(num(l.valor) + TARIFA_BOLETO_CA))) {
        await _vincularComTarifaCA(l, pagId, num(pagamento.valorRecebido), userId, false);
        return { message: `Conciliado! Tarifa de R$ ${TARIFA_BOLETO_CA.toFixed(2)} registrada e despesa da tarifa gerada (paga, só no app).` };
    }

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

/**
 * Confirma DE UMA VEZ os pendentes IDENTIFICADOS que fecham (Venda NNNN = pedido
 * NNNN, valor exato ou exato+tarifa do boleto CA). Disparado pelo botão da tela —
 * nada roda sozinho. Os que não fecham ficam para análise, com o motivo.
 */
async function confirmarIdentificadas({ contaFinanceiraCaId, de, ate, userId }) {
    const linhas = await prisma.extratoLancamento.findMany({
        where: {
            contaFinanceiraCaId, status: 'PENDENTE', tipo: 'CREDITO',
            checkNum: { not: null },
            data: { gte: dataSP(de), lte: dataSP(ate) }
        }
    });
    const usados = await idsUsados(contaFinanceiraCaId);
    const mapa = await _identificarPendentes(linhas, usados);

    let confirmadas = 0, comTarifa = 0;
    const naoFecham = [];
    for (const l of linhas) {
        const ident = mapa.get(l.id);
        if (!ident) continue;
        if (!ident.fecha) { naoFecham.push({ venda: ident.venda, motivo: ident.motivo }); continue; }
        if (ident.tarifa) {
            try {
                await _vincularComTarifaCA(l, ident.pagamentoId, ident.valorBaixa, userId, false);
                usados.add(ident.pagamentoId); confirmadas++; comTarifa++;
            } catch (_) { /* corrida — segue */ }
        } else {
            const r = await prisma.extratoLancamento.updateMany({
                where: { id: l.id, status: 'PENDENTE' },
                data: {
                    status: 'CONCILIADO', conciliadoAuto: false,
                    conciliadoPorId: userId || null, conciliadoEm: new Date(),
                    pagamentoParcelaId: ident.pagamentoId
                }
            });
            if (r.count > 0) { usados.add(ident.pagamentoId); confirmadas++; }
        }
    }
    const partes = [`${confirmadas} identificada(s) confirmada(s)`];
    if (comTarifa) partes.push(`${comTarifa} com tarifa de R$ ${TARIFA_BOLETO_CA.toFixed(2)} (despesas geradas)`);
    if (naoFecham.length) partes.push(`${naoFecham.length} identificada(s) ficaram para análise`);
    return { message: `${partes.join(' · ')}.`, confirmadas, comTarifa, naoFecham: naoFecham.slice(0, 20) };
}

// ─────────────────────────────────────────────────────────────
// Identificar DÉBITOS "sem nome" consultando o Conta Azul
// ─────────────────────────────────────────────────────────────

let _identDebitos = { rodando: false, progresso: null };

/**
 * Os débitos de boleto no extrato da Conta PJ vêm como "Pagamento de Boleto para
 * Nome não encontrado (Do…" — sem NADA para buscar. Mas no CA esses pagamentos já
 * estão conciliados com a despesa. Este job varre as parcelas de contas a pagar do
 * CA no período, lê as baixas feitas NESTA conta e casa cada débito por
 * (data do pagamento, valor total). No match, grava no lançamento: nome do
 * FORNECEDOR (nome), descrição da despesa (payee), nº da nota (refNum) e
 * memo 'Identificado via Conta Azul' — aí a busca por fornecedor/nota funciona.
 * Ambíguo (dois candidatos no mesmo dia/valor) fica de fora, sem chute.
 * Roda em segundo plano (consulta o CA parcela a parcela, com throttle).
 */
async function identificarDebitosViaCA({ contaFinanceiraCaId, de, ate }) {
    if (_identDebitos.rodando) return { ok: true, jaRodando: true, progresso: _identDebitos.progresso };
    const debitos = await prisma.extratoLancamento.findMany({
        where: {
            contaFinanceiraCaId, status: 'PENDENTE', tipo: 'DEBITO', nome: null,
            data: { gte: dataSP(de), lte: dataSP(ate) }
        },
        select: { id: true, data: true, valor: true }
    });
    if (debitos.length === 0) return { ok: true, iniciado: false, motivo: 'Nenhum débito pendente sem nome no período.' };

    _identDebitos.rodando = true;
    _identDebitos.progresso = { totalDebitos: debitos.length, candidatasLidas: 0, identificados: 0, iniciadoEm: new Date().toISOString() };
    (async () => {
        try {
            // Janela de VENCIMENTO ampla em torno do período dos débitos (boleto pago
            // costuma vencer perto do pagamento; ±45 dias cobre atrasos e antecipações)
            const datas = debitos.map((d) => ymd(d.data)).sort();
            const deV = somaDias(datas[0], -45);
            const ateV = somaDias(datas[datas.length - 1], 45);
            const statusQS = ['RECEBIDO', 'EM_ABERTO', 'ATRASADO', 'RECEBIDO_PARCIAL', 'RENEGOCIADO', 'PERDIDO']
                .map((s) => `&status=${s}`).join('');
            const valoresAlvo = debitos.map((d) => round2(num(d.valor)));
            const maxAlvo = Math.max(...valoresAlvo);

            // 1) Varre a lista de parcelas de contas a pagar do CA na janela
            const candidatas = [];
            let pagina = 1;
            while (pagina <= 15) {
                const resp = await contaAzulService._axiosGet(
                    `${BASE}/v1/financeiro/eventos-financeiros/contas-a-pagar/buscar?pagina=${pagina}&tamanho_pagina=100&data_vencimento_de=${deV}&data_vencimento_ate=${ateV}${statusQS}`,
                    'CONTA_PAGAR_IDENT_DEBITO'
                );
                const itens = resp.data?.itens || resp.data?.items || [];
                for (const it of itens) {
                    if (!it?.id) continue;
                    const total = round2(Number(it.total ?? 0));
                    // pré-filtro: perto de ALGUM débito (juros/multa fazem o pago passar do total da parcela)
                    if (valoresAlvo.some((v) => total <= v + 0.01 && total >= v - 300) || total <= maxAlvo + 0.01) {
                        candidatas.push({ id: it.id, fornecedor: it.fornecedor?.nome || null, descricao: it.descricao || null });
                    }
                }
                const totais = Number(resp.data?.itens_totais || 0);
                if (itens.length < 100 || (totais && pagina * 100 >= totais)) break;
                pagina++;
                await sleep(300);
            }

            // 2) Lê o detalhe (baixas) de cada candidata e indexa por data|valor pago nesta conta
            const porChave = new Map(); // 'YYYY-MM-DD|123.45' → [{fornecedor, descricao, nota}]
            for (const c of candidatas) {
                try {
                    const det = await contaAzulService.buscarParcelaDetalhe(c.id);
                    for (const b of (det?.baixas || [])) {
                        const contaB = b?.conta_financeira?.id || b?.conta_financeira || null;
                        if (contaB !== contaFinanceiraCaId) continue;
                        const comp = b?.valor_composicao || {};
                        const total = round2(num(comp.valor_bruto) + num(comp.juros) + num(comp.multa));
                        const chave = `${String(b.data_pagamento || '').slice(0, 10)}|${total.toFixed(2)}`;
                        if (!porChave.has(chave)) porChave.set(chave, []);
                        porChave.get(chave).push({
                            fornecedor: c.fornecedor || det?.evento?.descricao || null,
                            descricao: det?.descricao || c.descricao || null,
                            nota: det?.nota || null
                        });
                    }
                } catch (_) { /* uma candidata que falha não derruba o job */ }
                _identDebitos.progresso.candidatasLidas++;
                await sleep(250);
            }

            // 3) Casa cada débito por (data, valor) — só quando o match é ÚNICO
            for (const d of debitos) {
                const chave = `${ymd(d.data)}|${round2(num(d.valor)).toFixed(2)}`;
                const achados = porChave.get(chave) || [];
                if (achados.length !== 1) continue; // 0 = não achou; 2+ = ambíguo, não chutar
                const a = achados[0];
                await prisma.extratoLancamento.update({
                    where: { id: d.id },
                    data: {
                        nome: a.fornecedor ? String(a.fornecedor).slice(0, 200) : null,
                        payee: a.descricao ? String(a.descricao).slice(0, 200) : null,
                        refNum: a.nota ? String(a.nota).slice(0, 60) : null,
                        memo: 'Identificado via Conta Azul'
                    }
                });
                _identDebitos.progresso.identificados++;
            }
            console.log('[Conciliação] Identificação de débitos via CA concluída:', _identDebitos.progresso);
        } catch (e) {
            console.error('[Conciliação] Identificação de débitos via CA falhou:', e.message);
        } finally {
            _identDebitos.rodando = false;
        }
    })();
    return { ok: true, iniciado: true, totalDebitos: debitos.length, aviso: 'Identificando no Conta Azul em segundo plano — recarregue a tela em 1–2 minutos.' };
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
        // Grupo de tarifa do boleto CA gerou uma DESPESA da tarifa — cancela junto
        const despesaTarifa = await prisma.contaPagar.findFirst({
            where: { observacoes: { contains: `[tarifa-grupo:${item.grupoId}]` }, status: { not: 'CANCELADO' } },
            select: { id: true, parcelas: { select: { id: true } } }
        });
        await prisma.$transaction(async (tx) => {
            await tx.conciliacaoGrupo.delete({ where: { id: item.grupoId } }); // itens caem em cascata
            await tx.extratoLancamento.updateMany({
                where: { id: { in: idsLanc } },
                data: { status: 'PENDENTE', conciliadoAuto: false, conciliadoPorId: null, conciliadoEm: null, obs: null }
            });
            if (despesaTarifa) {
                const idsParc = despesaTarifa.parcelas.map((p) => p.id);
                await tx.pagamentoParcelaPagar.updateMany({
                    where: { parcelaPagarId: { in: idsParc }, estornado: false },
                    data: { estornado: true, estornadoEm: new Date() }
                });
                await tx.parcelaPagar.updateMany({ where: { id: { in: idsParc } }, data: { status: 'CANCELADO' } });
                await tx.contaPagar.update({ where: { id: despesaTarifa.id }, data: { status: 'CANCELADO' } });
            }
        }, { timeout: 20000, maxWait: 10000 });
        const partes = [idsLanc.length > 1 ? `Grupo desfeito — ${idsLanc.length} lançamentos voltaram para pendente.` : 'Grupo desfeito — lançamento voltou para pendente.'];
        if (despesaTarifa) partes.push('A despesa da tarifa foi cancelada junto.');
        return { message: partes.join(' ') };
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
 *
 * Com `busca`, procura TAMBÉM nas OUTRAS contas: uma baixa lançada no banco
 * errado (ex.: despesa baixada "no Sicoob" mas o dinheiro saiu da Conta PJ)
 * fica invisível na conta certa — aqui ela aparece marcada com o banco em que
 * está (`outraConta`), para o usuário corrigir e conciliar.
 */
async function baixasDisponiveis({ contaFinanceiraCaId, de, ate, tipo, busca }) {
    const [pools, usados] = await Promise.all([carregarPools(contaFinanceiraCaId, de, ate), idsUsados(contaFinanceiraCaId)]);
    const pool = tipo === 'CREDITO' ? pools.entradas : pools.saidas;
    const daConta = pool
        .filter((p) => !usados.has(p.id))
        .sort((a, b) => b.data.localeCompare(a.data));

    const termo = String(busca || '').trim();
    if (!termo) return daConta;

    // Busca nas outras contas (só com termo — não carrega o histórico todo)
    const gte = dataSP(somaDias(de, -3));
    const lte = dataSP(somaDias(ate, 3));
    const q = _interpretarTermoBusca(termo, String(de || '').slice(0, 4));
    const nomesContas = new Map((await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } })).map((c) => [c.id, c.nomeBanco]));

    let outras = [];
    if (tipo === 'DEBITO') {
        const orBusca = [
            { parcelaPagar: { contaPagar: { descricao: { contains: termo, mode: 'insensitive' } } } },
            { parcelaPagar: { contaPagar: { numeroNota: { contains: termo, mode: 'insensitive' } } } },
            { parcelaPagar: { contaPagar: { fornecedor: { razaoSocial: { contains: termo, mode: 'insensitive' } } } } },
            { parcelaPagar: { contaPagar: { fornecedor: { nomeFantasia: { contains: termo, mode: 'insensitive' } } } } }
        ];
        if (q.valor != null) orBusca.push({ valorPago: { gte: q.valor - 0.01, lte: q.valor + 0.01 } });
        const regs = await prisma.pagamentoParcelaPagar.findMany({
            where: {
                estornado: false,
                dataPagamento: { gte, lte },
                // 'not' do Prisma EXCLUI null — baixa SEM banco precisa do OR explícito
                AND: [
                    { OR: [{ contaFinanceiraCaId: null }, { contaFinanceiraCaId: { not: contaFinanceiraCaId } }] },
                    { OR: orBusca }
                ]
            },
            select: {
                id: true, valorPago: true, juros: true, multa: true, desconto: true, dataPagamento: true, formaPagamento: true, contaFinanceiraCaId: true,
                parcelaPagar: {
                    select: {
                        numeroParcela: true, valor: true, dataVencimento: true,
                        contaPagar: { select: { descricao: true, numeroNota: true, fornecedor: { select: { razaoSocial: true, nomeFantasia: true } } } }
                    }
                }
            },
            take: 30
        });
        outras = regs.map((p) => {
            const cp = p.parcelaPagar?.contaPagar;
            const nome = cp?.fornecedor?.nomeFantasia || cp?.fornecedor?.razaoSocial || cp?.descricao || 'Despesa';
            return {
                id: p.id,
                valor: round2(num(p.valorPago) + num(p.juros) + num(p.multa)),
                data: ymd(p.dataPagamento),
                label: `${nome}${p.formaPagamento ? ` (${p.formaPagamento})` : ''}`,
                outraConta: { id: p.contaFinanceiraCaId, nome: p.contaFinanceiraCaId ? (nomesContas.get(p.contaFinanceiraCaId) || 'conta desconhecida') : 'SEM banco', tipo: 'PAGAR' },
                detalhe: {
                    nome,
                    descricao: cp?.descricao || null,
                    numeroNota: cp?.numeroNota || null,
                    parcela: p.parcelaPagar?.numeroParcela ?? null,
                    vencimento: p.parcelaPagar?.dataVencimento ? ymd(p.parcelaPagar.dataVencimento) : null,
                    valorParcela: num(p.parcelaPagar?.valor),
                    formaPagamento: p.formaPagamento || null
                }
            };
        });
    } else {
        const orBusca = [
            { parcela: { contaReceber: { cliente: { Nome: { contains: termo, mode: 'insensitive' } } } } },
            { parcela: { contaReceber: { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } } } }
        ];
        if (q.inteiro != null) orBusca.push({ parcela: { contaReceber: { pedido: { numero: q.inteiro } } } });
        if (q.valor != null) orBusca.push({ valorRecebido: { gte: q.valor - 0.01, lte: q.valor + 0.01 } });
        const regs = await prisma.pagamentoParcela.findMany({
            where: {
                estornado: false,
                dataPagamento: { gte, lte },
                // 'not' do Prisma EXCLUI null — baixa SEM banco precisa do OR explícito
                AND: [
                    { OR: [{ contaFinanceiraCaId: null }, { contaFinanceiraCaId: { not: contaFinanceiraCaId } }] },
                    { OR: orBusca }
                ]
            },
            select: {
                id: true, valorRecebido: true, dataPagamento: true, formaPagamento: true, contaFinanceiraCaId: true,
                parcela: {
                    select: {
                        numeroParcela: true, valor: true, dataVencimento: true,
                        contaReceber: { select: { pedido: { select: { numero: true } }, cliente: { select: { Nome: true, NomeFantasia: true } } } }
                    }
                }
            },
            take: 30
        });
        outras = regs.map((r) => {
            const cli = r.parcela?.contaReceber?.cliente;
            const nome = cli?.NomeFantasia || cli?.Nome || 'Cliente';
            return {
                id: r.id,
                valor: round2(num(r.valorRecebido)),
                data: ymd(r.dataPagamento),
                label: `${nome} — parcela ${r.parcela?.numeroParcela ?? '?'}${r.formaPagamento ? ` (${r.formaPagamento})` : ''}`,
                outraConta: { id: r.contaFinanceiraCaId, nome: r.contaFinanceiraCaId ? (nomesContas.get(r.contaFinanceiraCaId) || 'conta desconhecida') : 'SEM banco', tipo: 'RECEBER' },
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
    }
    // Fora as que já estão conciliadas em QUALQUER conta — pelo link 1↔1 OU por grupo
    const idsOutras = outras.map((o) => o.id);
    const [usadasGeral, usadasGrupo] = await Promise.all([
        prisma.extratoLancamento.findMany({
            where: {
                status: 'CONCILIADO',
                ...(tipo === 'CREDITO'
                    ? { pagamentoParcelaId: { in: idsOutras } }
                    : { pagamentoParcelaPagarId: { in: idsOutras } })
            },
            select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true }
        }),
        prisma.conciliacaoGrupoItem.findMany({
            where: tipo === 'CREDITO'
                ? { pagamentoParcelaId: { in: idsOutras } }
                : { pagamentoParcelaPagarId: { in: idsOutras } },
            select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true }
        })
    ]);
    const bloqueadas = new Set([...usadasGeral, ...usadasGrupo].map((u) => u.pagamentoParcelaId || u.pagamentoParcelaPagarId));
    return [...daConta, ...outras.filter((o) => !bloqueadas.has(o.id))];
}

/**
 * Corrige a CONTA FINANCEIRA de uma baixa lançada no banco errado (ex.: despesa
 * baixada "no Sicoob" quando o dinheiro saiu da Conta PJ). Atualiza o app e,
 * quando a baixa existe no CA (idBaixaCA), atualiza TAMBÉM lá via PATCH — sem
 * precisar estornar na mão. Devolve aviso quando só o app pôde ser corrigido.
 */
async function corrigirContaBaixa({ tipo, pagamentoId, novaContaId, userId }) {
    if (!novaContaId) throw erro('Informe a conta de destino.');
    const conta = await prisma.contaFinanceira.findUnique({ where: { id: novaContaId }, select: { id: true, nomeBanco: true } });
    if (!conta) throw erro('Conta de destino não encontrada.');

    if (tipo === 'PAGAR') {
        const pg = await prisma.pagamentoParcelaPagar.findUnique({
            where: { id: pagamentoId },
            select: { id: true, estornado: true, idBaixaCA: true, contaFinanceiraCaId: true }
        });
        if (!pg || pg.estornado) throw erro('Baixa não encontrada (ou estornada).');
        let caOk = null;
        if (pg.idBaixaCA) {
            // CA primeiro: se falhar, nada muda (evita app e CA divergirem)
            const baixaCA = await contaAzulService.buscarBaixaFinanceira(pg.idBaixaCA);
            const comp = baixaCA?.valor_composicao || {};
            await contaAzulService.atualizarBaixaFinanceira(pg.idBaixaCA, {
                versao: baixaCA?.versao,
                composicao_valor: { valor_bruto: num(comp.valor_bruto) },
                conta_financeira: novaContaId
            });
            caOk = true;
        }
        await prisma.pagamentoParcelaPagar.update({ where: { id: pg.id }, data: { contaFinanceiraCaId: novaContaId } });
        return {
            message: caOk
                ? `Baixa movida para ${conta.nomeBanco} (no app e no Conta Azul).`
                : `Baixa movida para ${conta.nomeBanco} no app. Ela não tem vínculo com o CA — confira o banco da baixa lá.`,
            caAtualizado: !!caOk
        };
    }

    // RECEBER: o ledger não guarda o id da baixa no CA — corrige o app e avisa
    const pg = await prisma.pagamentoParcela.findUnique({ where: { id: pagamentoId }, select: { id: true, estornado: true } });
    if (!pg || pg.estornado) throw erro('Baixa não encontrada (ou estornada).');
    await prisma.pagamentoParcela.update({ where: { id: pg.id }, data: { contaFinanceiraCaId: novaContaId } });
    return {
        message: `Baixa movida para ${conta.nomeBanco} no app. Confira o banco do recebimento no Conta Azul (o app não guarda o vínculo dessa baixa lá).`,
        caAtualizado: false
    };
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
    const q = _interpretarTermoBusca(termo, String(de || '').slice(0, 4));
    const orBusca = [];
    if (termo) {
        orBusca.push({ contaPagar: { descricao: { contains: termo, mode: 'insensitive' } } });
        orBusca.push({ contaPagar: { numeroNota: { contains: termo, mode: 'insensitive' } } });
        orBusca.push({ contaPagar: { fornecedor: { razaoSocial: { contains: termo, mode: 'insensitive' } } } });
        orBusca.push({ contaPagar: { fornecedor: { nomeFantasia: { contains: termo, mode: 'insensitive' } } } });
        if (q.valor != null) orBusca.push({ valor: { gte: q.valor - 0.01, lte: q.valor + 0.01 } });
        if (q.venc) orBusca.push({ dataVencimento: q.venc });
    }
    const parcelas = await prisma.parcelaPagar.findMany({
        where: {
            status: { in: ['PENDENTE', 'PARCIAL'] },
            // Buscando por texto/nota/valor/venc, a janela não corta o resultado
            ...(temJanela && !termo ? { dataVencimento: { gte: dataSP(String(de)), lte: dataSP(String(ate)) } } : {}),
            ...(orBusca.length > 0 ? { OR: orBusca } : {})
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
 * Interpreta o termo de busca dos modais: texto (nome), número inteiro (pedido/NF),
 * valor em reais ("330,10" / "330.10" / "1.234,56") e data de vencimento
 * ("09/07" ou "09/07/2026"). Devolve as formas possíveis do termo.
 */
function _interpretarTermoBusca(termo, anoRef) {
    const t = String(termo || '').trim();
    const out = { texto: t || null, inteiro: null, valor: null, venc: null };
    if (!t) return out;
    if (/^\d+$/.test(t)) out.inteiro = Number(t);
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t)) out.valor = Number(t.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+[.,]\d{1,2}$/.test(t)) out.valor = Number(t.replace(',', '.'));
    const mData = t.match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
    if (mData) {
        const ano = mData[3] || String(anoRef || new Date().getFullYear());
        const ymdStr = `${ano}-${mData[2]}-${mData[1]}`;
        if (!isNaN(new Date(`${ymdStr}T12:00:00`).getTime())) {
            out.venc = { gte: dataSP(ymdStr), lte: new Date(dataSP(ymdStr).getTime() + 24 * 3600 * 1000) };
        }
    }
    return out;
}

/**
 * Contas a RECEBER em aberto, para conciliar uma ENTRADA do extrato (PIX/transferência
 * que caiu no banco/Asaas) dando a baixa ali mesmo — espelho de parcelasPagarEmAberto.
 * Janela de VENCIMENTO ±dias (ajustável na tela); as que fecham com o valor do extrato
 * ganham `bate` e vêm primeiro. Busca por: razão/fantasia do cliente, nº do PEDIDO,
 * nº da NF-e, VALOR ("330,10") e DATA de vencimento ("09/07" ou "09/07/2026").
 */
async function parcelasReceberEmAberto({ valor, busca, de, ate }) {
    const termo = String(busca || '').trim();
    const temJanela = de && ate && /^\d{4}-\d{2}-\d{2}$/.test(String(de)) && /^\d{4}-\d{2}-\d{2}$/.test(String(ate));
    const q = _interpretarTermoBusca(termo, String(de || '').slice(0, 4));
    const orBusca = [];
    if (termo) {
        orBusca.push({ contaReceber: { cliente: { Nome: { contains: termo, mode: 'insensitive' } } } });
        orBusca.push({ contaReceber: { cliente: { NomeFantasia: { contains: termo, mode: 'insensitive' } } } });
        if (q.inteiro != null) {
            orBusca.push({ contaReceber: { pedido: { numero: q.inteiro } } });
            orBusca.push({ contaReceber: { pedido: { nfeNumero: q.inteiro } } });
        }
        if (q.valor != null) orBusca.push({ valor: { gte: q.valor - 0.01, lte: q.valor + 0.01 } });
        if (q.venc) orBusca.push({ dataVencimento: q.venc });
    }
    const parcelas = await prisma.parcela.findMany({
        where: {
            status: { in: ['PENDENTE', 'PARCIAL', 'ABERTO'] },
            contaReceber: { status: { notIn: ['CANCELADO'] } },
            // Com busca por pedido/NF/valor/venc o usuário quer ACHAR — a janela não corta
            ...(temJanela && !termo ? { dataVencimento: { gte: dataSP(String(de)), lte: dataSP(String(ate)) } } : {}),
            ...(orBusca.length > 0 ? { OR: orBusca } : {})
        },
        select: {
            id: true, numeroParcela: true, valor: true, valorPago: true, valorDescontoTotal: true,
            status: true, dataVencimento: true,
            contaReceber: { select: { cliente: { select: { Nome: true, NomeFantasia: true } }, pedido: { select: { numero: true, nfeNumero: true } } } }
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
                nf: p.contaReceber?.pedido?.nfeNumero || null,
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
    juros = 0, multa = 0, desconto = 0, motivoDiferenca, obsDiferenca,
    difTarifa = 0, difJuros = 0, difDesconto = 0, userId
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

    // DECOMPOSIÇÃO da diferença (só entrada): banco = sistema + juros/multa − tarifa − desconto.
    // Cobre o caso real "boleto com juros E tarifa" (ex.: +16,64 de juros − 1,50 de tarifa
    // = diferença de +15,14). A tarifa decomposta também GERA a despesa da tarifa.
    const dec = {
        tarifa: round2(Math.max(0, num(difTarifa))),
        juros: round2(Math.max(0, num(difJuros))),
        desconto: round2(Math.max(0, num(difDesconto)))
    };
    const temDecomposicao = tipo === 'CREDITO' && (dec.tarifa > 0 || dec.juros > 0 || dec.desconto > 0);
    if (temDiferenca && temDecomposicao) {
        if (Math.abs(round2(dec.juros - dec.tarifa - dec.desconto) - diferenca) > 0.01) {
            throw erro(`A decomposição não fecha: juros R$ ${dec.juros.toFixed(2)} − tarifa R$ ${dec.tarifa.toFixed(2)} − desconto R$ ${dec.desconto.toFixed(2)} deveria dar a diferença de R$ ${diferenca.toFixed(2)}.`);
        }
    } else if (temDiferenca) {
        if (!MOTIVOS_VALIDOS.has(motivo)) {
            throw erro(`Banco R$ ${somaExtrato.toFixed(2)} × sistema R$ ${round2(somaExistentes + somaCriadas).toFixed(2)}: diga o que é a diferença de R$ ${Math.abs(diferenca).toFixed(2)} para conciliar.`);
        }
        if (motivo === 'OUTRO' && !obs) throw erro('Descreva a diferença (motivo "Outro").');
    }
    const rotuloMotivo = temDiferenca
        ? (temDecomposicao
            ? [
                dec.juros > 0 ? `Juros/multa recebidos R$ ${dec.juros.toFixed(2)}` : null,
                dec.tarifa > 0 ? `Tarifa boleto CA R$ ${dec.tarifa.toFixed(2)}` : null,
                dec.desconto > 0 ? `Desconto R$ ${dec.desconto.toFixed(2)}` : null
            ].filter(Boolean).join(' · ')
            : [MOTIVOS_DIFERENCA.find((m) => m.value === motivo)?.label, obs].filter(Boolean).join(' — '))
        : null;
    // Referências da despesa da tarifa (fora da transação — pode consultar a API do CA)
    const refsTarifa = (temDiferenca && temDecomposicao && dec.tarifa > 0) ? await _referenciasTarifaCA() : null;

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
            // Tarifa vinda da DECOMPOSIÇÃO → gera a despesa da tarifa (cancelada se desfizer o grupo)
            if (refsTarifa) {
                await _criarDespesaTarifaTx(tx, lancs[0], dec.tarifa, grupo.id, userId, refsTarifa);
            }
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
    confirmarIdentificadas,
    identificarDebitosViaCA,
    corrigirContaBaixa,
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
