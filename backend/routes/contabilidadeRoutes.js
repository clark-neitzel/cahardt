/**
 * CONTABILIDADE — relatórios para o escritório de contabilidade (Fase 1).
 *
 * Área de CONSULTA: todas as rotas são GET (nenhuma escrita). Pensada para o
 * cadastro do contador com a permissão Pode_Acessar_Contabilidade ligada e o
 * resto desligado — por isso a checagem é própria e não reaproveita a de
 * Contas a Receber.
 *
 * GET /api/contabilidade/relatorio-receber
 *   ?visao=titulos|recebimentos
 *   Títulos (competência): 1 linha por PARCELA, filtrada pela data de criação
 *     do título (contas_receber.created_at) — "o que foi lançado no período".
 *   Recebimentos (caixa): 1 linha por BAIXA (ledger pagamentos_parcela,
 *     estornado=false), filtrada pela data do pagamento — "o que entrou de
 *     dinheiro, por qual forma e em qual banco". Parcela paga metade PIX,
 *     metade dinheiro = 2 linhas.
 *   Filtros comuns: criacaoDe/Ate, vencDe/Ate, pagDe/Ate (YYYY-MM-DD),
 *     cliente (texto), documento (NF_CA|NF_APP|ESPECIAL|IMPORTADA|SEM_NF),
 *     forma, banco (id da conta financeira), status (parcela), origem (conta).
 *
 * A coluna "documento" resolve a dúvida nº 1 da contabilidade:
 *   NF_CA    — NF-e emitida no Conta Azul (nº no cache do pedido)
 *   NF_APP   — NF-e emitida pelo app (Focus NFe, AUTORIZADO)
 *   ESPECIAL — pedido especial, sem nota (de propósito)
 *   IMPORTADA— conta importada do CA sem pedido no app
 *   SEM_NF   — pedido normal ainda sem NF registrada
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');

const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

const checkAcesso = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Acessar_Contabilidade) {
        return res.status(403).json({ error: 'Sem permissão para acessar a Contabilidade.' });
    }
    next();
};

// "2026-08-01" → Date no início/fim do dia em SP (mesmo padrão do resto do financeiro)
const diaIni = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? new Date(`${ymd}T00:00:00-03:00`) : null);
const diaFim = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')) ? new Date(`${ymd}T23:59:59.999-03:00`) : null);
const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
const toList = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

const LIMITE_LINHAS = 8000; // trava de sanidade (um mês tem centenas de linhas, não milhares)

// Mesmo filtro de ruído da tela de Contas a Receber (contasReceber.js):
// esconde conta de pedido excluído/cancelado/bonificação; conta sem pedido passa livre.
// ⚠️ Prisma deste projeto: `notIn` EXCLUI linhas com o campo NULL. situacaoCA é
// anulável (pedido nunca sincronizado / faturado local) — sem o OR explícito com
// null, esses pedidos sumiam do relatório e o mês vinha "faltando linhas".
const SEM_RUIDO_OR = [
    { pedidoId: null },
    {
        pedido: {
            statusEnvio: { notIn: ['EXCLUIDO'] },
            bonificacao: false,
            OR: [
                { situacaoCA: null },
                { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }
            ]
        }
    }
];

const SELECT_CONTA = {
    id: true,
    origem: true,
    createdAt: true,
    cliente: { select: { UUID: true, Nome: true, Documento: true } },
    pedido: {
        select: {
            id: true, numero: true, especial: true, nomeCondicaoPagamento: true,
            nfeNumero: true, nfeChave: true, situacaoCA: true,
            vendedor: { select: { nome: true } },
            notasFiscaisApp: {
                where: { tipo: 'VENDA', status: 'AUTORIZADO' },
                select: { numero: true, serie: true, chave: true },
                orderBy: { criadoEm: 'desc' },
                take: 1
            }
        }
    }
};

/** Documento fiscal da conta (ver cabeçalho do arquivo). */
function resolverDocumento(conta) {
    const p = conta.pedido;
    if (!p) return { tipo: 'IMPORTADA', numero: null, serie: null, chave: null };
    if (p.especial) return { tipo: 'ESPECIAL', numero: null, serie: null, chave: null };
    const nfApp = p.notasFiscaisApp?.[0];
    if (nfApp) return { tipo: 'NF_APP', numero: nfApp.numero, serie: nfApp.serie, chave: nfApp.chave };
    if (p.nfeNumero || p.nfeChave) return { tipo: 'NF_CA', numero: p.nfeNumero, serie: null, chave: p.nfeChave };
    return { tipo: 'SEM_NF', numero: null, serie: null, chave: null };
}

/**
 * Conta IMPORTADA do CA (sem pedido no app) não é caixa-preta: o arquivo da
 * importação (ca_receber_importado) guarda o nº da venda no CA e a descrição
 * ("Venda 554 / NF-e:83197"). Devolve Map contaReceberId → { numeroVendaCA, nfNumero }.
 */
async function infoImportadas(contaIds) {
    if (contaIds.length === 0) return new Map();
    const rows = await prisma.caReceberImportado.findMany({
        where: { contaReceberId: { in: contaIds } },
        select: { contaReceberId: true, numeroVendaCA: true, descricao: true }
    });
    const mapa = new Map();
    for (const r of rows) {
        const mNf = String(r.descricao || '').match(/NF-?S?e?\s*[.:]?\s*(\d{4,7})/i);
        mapa.set(r.contaReceberId, {
            numeroVendaCA: r.numeroVendaCA,
            nfNumero: mNf ? parseInt(mNf[1], 10) : null
        });
    }
    return mapa;
}

/** Situação de conciliação (extrato) de um conjunto de baixas: ids → Set dos conciliados. */
async function idsConciliados(pagamentoIds) {
    if (pagamentoIds.length === 0) return new Set();
    const [diretos, emGrupo] = await Promise.all([
        prisma.extratoLancamento.findMany({
            where: { pagamentoParcelaId: { in: pagamentoIds }, status: 'CONCILIADO' },
            select: { pagamentoParcelaId: true }
        }),
        prisma.conciliacaoGrupoItem.findMany({
            where: { pagamentoParcelaId: { in: pagamentoIds } },
            select: { pagamentoParcelaId: true }
        })
    ]);
    return new Set([
        ...diretos.map((l) => l.pagamentoParcelaId),
        ...emGrupo.map((i) => i.pagamentoParcelaId)
    ]);
}

// GET /relatorio-receber — ver cabeçalho do arquivo
router.get('/relatorio-receber', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            visao = 'titulos',
            criacaoDe, criacaoAte, vencDe, vencAte, pagDe, pagAte,
            cliente, documento, forma, banco, status, origem
        } = req.query;

        // Nome dos bancos (join manual — id da conta é a chave em todo o financeiro)
        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nomeBanco = new Map(contasFin.map((c) => [c.id, c.nomeBanco]));

        const docFiltro = toList(documento);
        const linhas = [];
        let truncado = false;

        if (visao === 'recebimentos') {
            // ── Caixa: 1 linha por baixa do ledger ──
            const where = { estornado: false };
            if (diaIni(pagDe) || diaFim(pagAte)) {
                where.dataPagamento = {};
                if (diaIni(pagDe)) where.dataPagamento.gte = diaIni(pagDe);
                if (diaFim(pagAte)) where.dataPagamento.lte = diaFim(pagAte);
            }
            if (toList(forma).length) where.formaPagamento = { in: toList(forma) };
            if (toList(banco).length) where.contaFinanceiraCaId = { in: toList(banco) };
            if (toList(origem).length) where.origem = { in: toList(origem) };

            const parcelaWhere = { contaReceber: { OR: SEM_RUIDO_OR } };
            if (diaIni(vencDe) || diaFim(vencAte)) {
                parcelaWhere.dataVencimento = {};
                if (diaIni(vencDe)) parcelaWhere.dataVencimento.gte = diaIni(vencDe);
                if (diaFim(vencAte)) parcelaWhere.dataVencimento.lte = diaFim(vencAte);
            }
            if (diaIni(criacaoDe) || diaFim(criacaoAte)) {
                parcelaWhere.contaReceber.createdAt = {};
                if (diaIni(criacaoDe)) parcelaWhere.contaReceber.createdAt.gte = diaIni(criacaoDe);
                if (diaFim(criacaoAte)) parcelaWhere.contaReceber.createdAt.lte = diaFim(criacaoAte);
            }
            if (cliente?.trim()) {
                parcelaWhere.contaReceber.cliente = { Nome: { contains: cliente.trim(), mode: 'insensitive' } };
            }
            where.parcela = parcelaWhere;

            const pagamentos = await prisma.pagamentoParcela.findMany({
                where,
                take: LIMITE_LINHAS + 1,
                orderBy: { dataPagamento: 'desc' },
                select: {
                    id: true, valorRecebido: true, valorDesconto: true, motivoDesconto: true,
                    formaPagamento: true, contaFinanceiraCaId: true, dataPagamento: true, origem: true,
                    registradoPor: { select: { nome: true } },
                    parcela: {
                        select: {
                            id: true, numeroParcela: true, valor: true, dataVencimento: true, status: true,
                            contaReceber: { select: SELECT_CONTA }
                        }
                    }
                }
            });
            truncado = pagamentos.length > LIMITE_LINHAS;
            const conciliados = await idsConciliados(pagamentos.slice(0, LIMITE_LINHAS).map((p) => p.id));
            const importadas = await infoImportadas([...new Set(
                pagamentos.slice(0, LIMITE_LINHAS).filter((p) => !p.parcela.contaReceber.pedido).map((p) => p.parcela.contaReceber.id)
            )]);

            for (const pg of pagamentos.slice(0, LIMITE_LINHAS)) {
                const conta = pg.parcela.contaReceber;
                const extra = !conta.pedido ? importadas.get(conta.id) : null;
                let doc = resolverDocumento(conta);
                if (extra?.nfNumero) doc = { tipo: 'NF_CA', numero: extra.nfNumero, serie: null, chave: null };
                if (docFiltro.length && !docFiltro.includes(doc.tipo)) continue;
                linhas.push({
                    id: pg.id,
                    pedidoNumero: conta.pedido?.numero ?? null,
                    numeroVendaCA: extra?.numeroVendaCA ?? null,
                    especial: !!conta.pedido?.especial,
                    criacao: conta.createdAt,
                    clienteNome: conta.cliente?.Nome || '—',
                    clienteDoc: conta.cliente?.Documento || null,
                    documento: doc, // importada com NF na descrição já vem como NF_CA
                    numeroParcela: pg.parcela.numeroParcela,
                    vencimento: pg.parcela.dataVencimento,
                    valor: round2(pg.parcela.valor),
                    valorRecebido: round2(pg.valorRecebido),
                    desconto: round2(pg.valorDesconto),
                    motivoDesconto: pg.motivoDesconto || null,
                    forma: pg.formaPagamento || null,
                    bancoId: pg.contaFinanceiraCaId,
                    bancoNome: pg.contaFinanceiraCaId ? (nomeBanco.get(pg.contaFinanceiraCaId) || 'Conta desconhecida') : null,
                    dataBaixa: pg.dataPagamento,
                    baixadoPor: pg.registradoPor?.nome || null,
                    origemBaixa: pg.origem || null,
                    conciliado: conciliados.has(pg.id),
                    status: pg.parcela.status,
                    origemConta: conta.origem,
                    condicao: conta.pedido?.nomeCondicaoPagamento || null,
                    vendedor: conta.pedido?.vendedor?.nome || null
                });
            }
        } else {
            // ── Competência: 1 linha por parcela ──
            const where = { contaReceber: { OR: SEM_RUIDO_OR } };
            if (diaIni(criacaoDe) || diaFim(criacaoAte)) {
                where.contaReceber.createdAt = {};
                if (diaIni(criacaoDe)) where.contaReceber.createdAt.gte = diaIni(criacaoDe);
                if (diaFim(criacaoAte)) where.contaReceber.createdAt.lte = diaFim(criacaoAte);
            }
            if (cliente?.trim()) {
                where.contaReceber.cliente = { Nome: { contains: cliente.trim(), mode: 'insensitive' } };
            }
            if (diaIni(vencDe) || diaFim(vencAte)) {
                where.dataVencimento = {};
                if (diaIni(vencDe)) where.dataVencimento.gte = diaIni(vencDe);
                if (diaFim(vencAte)) where.dataVencimento.lte = diaFim(vencAte);
            }
            if (toList(status).length) where.status = { in: toList(status) };
            if (toList(forma).length) where.formaPagamento = { in: toList(forma) };
            if (toList(banco).length) where.contaFinanceiraCaId = { in: toList(banco) };
            if (toList(origem).length) where.contaReceber.origem = { in: toList(origem) };
            // Data da baixa (resumo da parcela) quando pedida na visão títulos
            if (diaIni(pagDe) || diaFim(pagAte)) {
                where.dataPagamento = {};
                if (diaIni(pagDe)) where.dataPagamento.gte = diaIni(pagDe);
                if (diaFim(pagAte)) where.dataPagamento.lte = diaFim(pagAte);
            }

            const parcelas = await prisma.parcela.findMany({
                where,
                take: LIMITE_LINHAS + 1,
                orderBy: [{ dataVencimento: 'asc' }],
                select: {
                    id: true, numeroParcela: true, valor: true, dataVencimento: true, status: true,
                    valorPago: true, valorDescontoTotal: true, formaPagamento: true,
                    contaFinanceiraCaId: true, dataPagamento: true,
                    baixadoPor: { select: { nome: true } },
                    contaReceber: { select: SELECT_CONTA },
                    pagamentos: { where: { estornado: false }, select: { id: true } }
                }
            });
            truncado = parcelas.length > LIMITE_LINHAS;
            const idsPg = parcelas.slice(0, LIMITE_LINHAS).flatMap((p) => p.pagamentos.map((x) => x.id));
            const conciliados = await idsConciliados(idsPg);
            const importadas = await infoImportadas([...new Set(
                parcelas.slice(0, LIMITE_LINHAS).filter((p) => !p.contaReceber.pedido).map((p) => p.contaReceber.id)
            )]);

            for (const par of parcelas.slice(0, LIMITE_LINHAS)) {
                const conta = par.contaReceber;
                const extra = !conta.pedido ? importadas.get(conta.id) : null;
                let doc = resolverDocumento(conta);
                if (extra?.nfNumero) doc = { tipo: 'NF_CA', numero: extra.nfNumero, serie: null, chave: null };
                if (docFiltro.length && !docFiltro.includes(doc.tipo)) continue;
                linhas.push({
                    id: par.id,
                    pedidoNumero: conta.pedido?.numero ?? null,
                    numeroVendaCA: extra?.numeroVendaCA ?? null,
                    especial: !!conta.pedido?.especial,
                    criacao: conta.createdAt,
                    clienteNome: conta.cliente?.Nome || '—',
                    clienteDoc: conta.cliente?.Documento || null,
                    documento: doc,
                    numeroParcela: par.numeroParcela,
                    vencimento: par.dataVencimento,
                    valor: round2(par.valor),
                    valorRecebido: round2(par.valorPago),
                    desconto: round2(par.valorDescontoTotal),
                    motivoDesconto: null,
                    forma: par.formaPagamento || null,
                    bancoId: par.contaFinanceiraCaId,
                    bancoNome: par.contaFinanceiraCaId ? (nomeBanco.get(par.contaFinanceiraCaId) || 'Conta desconhecida') : null,
                    dataBaixa: par.dataPagamento,
                    baixadoPor: par.baixadoPor?.nome || null,
                    origemBaixa: null,
                    conciliado: par.pagamentos.some((x) => conciliados.has(x.id)),
                    status: par.status,
                    origemConta: conta.origem,
                    condicao: conta.pedido?.nomeCondicaoPagamento || null,
                    vendedor: conta.pedido?.vendedor?.nome || null
                });
            }
        }

        // Resumo (sobre as linhas já filtradas)
        const valorTotal = round2(linhas.reduce((s, l) => s + l.valor, 0));
        const recebidoTotal = round2(linhas.reduce((s, l) => s + (l.valorRecebido || 0), 0));
        const comNF = round2(linhas.filter((l) => ['NF_CA', 'NF_APP'].includes(l.documento.tipo)).reduce((s, l) => s + l.valor, 0));
        const semNF = round2(linhas.filter((l) => l.documento.tipo === 'ESPECIAL').reduce((s, l) => s + l.valor, 0));

        res.json({
            visao: visao === 'recebimentos' ? 'recebimentos' : 'titulos',
            resumo: { linhas: linhas.length, valorTotal, recebidoTotal, comNF, semNF, truncado },
            bancos: contasFin.map((c) => ({ id: c.id, nome: c.nomeBanco })),
            linhas
        });
    } catch (error) {
        console.error('[Contabilidade] relatorio-receber:', error);
        res.status(500).json({ error: 'Erro ao montar o relatório de contas a receber.' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2 — CONTAS A PAGAR (visões: contas | pagamentos | categorias/DRE)
// ═══════════════════════════════════════════════════════════════════

/** Documento fiscal da conta a pagar. */
function resolverDocPagar(conta) {
    if (conta.origem === 'NFE') return { tipo: 'NFE', numero: conta.numeroNota, chave: conta.chaveNfe };
    if (conta.origem === 'NFSE') return { tipo: 'NFSE', numero: conta.numeroNota, chave: conta.chaveNfe };
    if (conta.numeroNota || conta.chaveNfe) return { tipo: 'NFE', numero: conta.numeroNota, chave: conta.chaveNfe };
    if (conta.origem === 'IMPORTADO_CA') return { tipo: 'IMPORTADO_CA', numero: null, chave: null };
    return { tipo: 'SEM_DOC', numero: null, chave: null };
}

/** Baixas do pagar conciliadas com o extrato: ids → Set. */
async function idsConciliadosPagar(pagamentoIds) {
    if (pagamentoIds.length === 0) return new Set();
    const [diretos, emGrupo] = await Promise.all([
        prisma.extratoLancamento.findMany({
            where: { pagamentoParcelaPagarId: { in: pagamentoIds }, status: 'CONCILIADO' },
            select: { pagamentoParcelaPagarId: true }
        }),
        prisma.conciliacaoGrupoItem.findMany({
            where: { pagamentoParcelaPagarId: { in: pagamentoIds } },
            select: { pagamentoParcelaPagarId: true }
        })
    ]);
    return new Set([...diretos.map((l) => l.pagamentoParcelaPagarId), ...emGrupo.map((i) => i.pagamentoParcelaPagarId)]);
}

const SELECT_CONTA_PAGAR = {
    id: true, descricao: true, categoria: true, origem: true, numeroNota: true, chaveNfe: true,
    dataEmissao: true, competencia: true, valorTotal: true, status: true, pdfPath: true,
    categoriaDespesa: { select: { nome: true, classificacao: true, natureza: true } },
    fornecedor: { select: { razaoSocial: true, nomeFantasia: true, cnpjCpf: true } },
    rateios: { select: { categoria: true, valor: true } }
};

// GET /relatorio-pagar?visao=contas|pagamentos|categorias
//   Filtros: emissaoDe/Ate (dataEmissao), vencDe/Ate, pagDe/Ate, fornecedor (texto),
//            documento (NFE|NFSE|IMPORTADO_CA|SEM_DOC), forma, banco, status, categoria (nome)
router.get('/relatorio-pagar', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            visao = 'contas', emissaoDe, emissaoAte, vencDe, vencAte, pagDe, pagAte,
            fornecedor, documento, forma, banco, status, categoria
        } = req.query;

        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nomeBanco = new Map(contasFin.map((c) => [c.id, c.nomeBanco]));
        const docFiltro = toList(documento);
        const catFiltro = toList(categoria);
        const linhas = [];
        let truncado = false;

        // Filtro comum sobre a CONTA (emissão/fornecedor/categoria) — visão contas e pagamentos
        const whereConta = { status: { not: 'CANCELADO' } };
        if (diaIni(emissaoDe) || diaFim(emissaoAte)) {
            whereConta.dataEmissao = {};
            if (diaIni(emissaoDe)) whereConta.dataEmissao.gte = diaIni(emissaoDe);
            if (diaFim(emissaoAte)) whereConta.dataEmissao.lte = diaFim(emissaoAte);
        }
        if (fornecedor?.trim()) {
            whereConta.fornecedor = {
                OR: [
                    { razaoSocial: { contains: fornecedor.trim(), mode: 'insensitive' } },
                    { nomeFantasia: { contains: fornecedor.trim(), mode: 'insensitive' } }
                ]
            };
        }
        if (catFiltro.length) {
            whereConta.OR = [
                { categoria: { in: catFiltro } },
                { rateios: { some: { categoria: { in: catFiltro } } } }
            ];
        }

        if (visao === 'pagamentos') {
            // ── Caixa: 1 linha por baixa do ledger do pagar ──
            const where = { estornado: false, parcelaPagar: { contaPagar: whereConta } };
            if (diaIni(pagDe) || diaFim(pagAte)) {
                where.dataPagamento = {};
                if (diaIni(pagDe)) where.dataPagamento.gte = diaIni(pagDe);
                if (diaFim(pagAte)) where.dataPagamento.lte = diaFim(pagAte);
            }
            if (toList(forma).length) where.formaPagamento = { in: toList(forma) };
            if (toList(banco).length) where.contaFinanceiraCaId = { in: toList(banco) };
            if (diaIni(vencDe) || diaFim(vencAte)) {
                where.parcelaPagar.dataVencimento = {};
                if (diaIni(vencDe)) where.parcelaPagar.dataVencimento.gte = diaIni(vencDe);
                if (diaFim(vencAte)) where.parcelaPagar.dataVencimento.lte = diaFim(vencAte);
            }

            const pagamentos = await prisma.pagamentoParcelaPagar.findMany({
                where,
                take: LIMITE_LINHAS + 1,
                orderBy: { dataPagamento: 'desc' },
                select: {
                    id: true, valorPago: true, juros: true, multa: true, desconto: true,
                    formaPagamento: true, contaFinanceiraCaId: true, dataPagamento: true, origem: true,
                    registradoPor: { select: { nome: true } },
                    parcelaPagar: {
                        select: {
                            numeroParcela: true, valor: true, dataVencimento: true, status: true,
                            contaPagar: { select: SELECT_CONTA_PAGAR }
                        }
                    }
                }
            });
            truncado = pagamentos.length > LIMITE_LINHAS;
            const conciliados = await idsConciliadosPagar(pagamentos.slice(0, LIMITE_LINHAS).map((p) => p.id));

            for (const pg of pagamentos.slice(0, LIMITE_LINHAS)) {
                const conta = pg.parcelaPagar.contaPagar;
                const doc = resolverDocPagar(conta);
                if (docFiltro.length && !docFiltro.includes(doc.tipo)) continue;
                linhas.push({
                    id: pg.id,
                    fornecedor: conta.fornecedor?.razaoSocial || conta.fornecedor?.nomeFantasia || '—',
                    fornecedorDoc: conta.fornecedor?.cnpjCpf || null,
                    descricao: conta.descricao,
                    documento: doc,
                    categoria: conta.rateios.length > 1 ? 'RATEADA' : (conta.categoriaDespesa?.nome || conta.categoria || null),
                    classificacao: conta.categoriaDespesa?.classificacao || null,
                    rateios: conta.rateios.length > 1 ? conta.rateios.map((r) => ({ categoria: r.categoria, valor: round2(r.valor) })) : [],
                    emissao: conta.dataEmissao,
                    numeroParcela: pg.parcelaPagar.numeroParcela,
                    vencimento: pg.parcelaPagar.dataVencimento,
                    valor: round2(pg.parcelaPagar.valor),
                    valorPago: round2(pg.valorPago),
                    juros: round2(pg.juros),
                    multa: round2(pg.multa),
                    descontoPg: round2(pg.desconto),
                    forma: pg.formaPagamento || null,
                    bancoId: pg.contaFinanceiraCaId,
                    bancoNome: pg.contaFinanceiraCaId ? (nomeBanco.get(pg.contaFinanceiraCaId) || 'Conta desconhecida') : null,
                    dataBaixa: pg.dataPagamento,
                    baixadoPor: pg.registradoPor?.nome || null,
                    conciliado: conciliados.has(pg.id),
                    status: pg.parcelaPagar.status,
                    temAnexo: !!conta.pdfPath
                });
            }
        } else if (visao === 'categorias') {
            // ── DRE: totais por categoria usando SEMPRE o rateio quando existir ──
            const contas = await prisma.contaPagar.findMany({
                where: whereConta,
                take: LIMITE_LINHAS + 1,
                select: SELECT_CONTA_PAGAR
            });
            truncado = contas.length > LIMITE_LINHAS;
            const catsInfo = new Map(
                (await prisma.categoriaDespesa.findMany({
                    select: { nome: true, classificacao: true, natureza: true, grupoDre: { select: { nome: true } } }
                })).map((c) => [c.nome, c])
            );
            const acum = new Map();
            const somar = (nomeCat, valor) => {
                const nome = nomeCat || 'Sem categoria';
                const atual = acum.get(nome) || { categoria: nome, contas: 0, valor: 0 };
                atual.contas += 1;
                atual.valor = round2(atual.valor + Number(valor || 0));
                acum.set(nome, atual);
            };
            for (const c of contas.slice(0, LIMITE_LINHAS)) {
                if (c.rateios.length > 0) c.rateios.forEach((r) => somar(r.categoria, r.valor));
                else somar(c.categoriaDespesa?.nome || c.categoria, c.valorTotal);
            }
            const totalGeral = round2([...acum.values()].reduce((s, a) => s + a.valor, 0));
            for (const a of [...acum.values()].sort((x, y) => y.valor - x.valor)) {
                const info = catsInfo.get(a.categoria);
                linhas.push({
                    id: a.categoria,
                    categoria: a.categoria,
                    classificacao: info?.classificacao || null,
                    natureza: info?.natureza || null,
                    grupoDre: info?.grupoDre?.nome || null,
                    contas: a.contas,
                    valor: a.valor,
                    percentual: totalGeral > 0 ? round2((a.valor / totalGeral) * 100) : 0
                });
            }
        } else {
            // ── Competência: 1 linha por parcela ──
            const where = { contaPagar: whereConta };
            if (diaIni(vencDe) || diaFim(vencAte)) {
                where.dataVencimento = {};
                if (diaIni(vencDe)) where.dataVencimento.gte = diaIni(vencDe);
                if (diaFim(vencAte)) where.dataVencimento.lte = diaFim(vencAte);
            }
            if (toList(status).length) where.status = { in: toList(status) };
            if (diaIni(pagDe) || diaFim(pagAte)) {
                where.dataPagamento = {};
                if (diaIni(pagDe)) where.dataPagamento.gte = diaIni(pagDe);
                if (diaFim(pagAte)) where.dataPagamento.lte = diaFim(pagAte);
            }

            const parcelas = await prisma.parcelaPagar.findMany({
                where,
                take: LIMITE_LINHAS + 1,
                orderBy: [{ dataVencimento: 'asc' }],
                select: {
                    id: true, numeroParcela: true, valor: true, dataVencimento: true, status: true,
                    valorPago: true, formaPagamento: true, dataPagamento: true,
                    contaPagar: { select: SELECT_CONTA_PAGAR },
                    pagamentos: {
                        where: { estornado: false },
                        select: { id: true, contaFinanceiraCaId: true, formaPagamento: true }
                    }
                }
            });
            truncado = parcelas.length > LIMITE_LINHAS;
            const idsPg = parcelas.slice(0, LIMITE_LINHAS).flatMap((p) => p.pagamentos.map((x) => x.id));
            const conciliados = await idsConciliadosPagar(idsPg);

            for (const par of parcelas.slice(0, LIMITE_LINHAS)) {
                const conta = par.contaPagar;
                const doc = resolverDocPagar(conta);
                if (docFiltro.length && !docFiltro.includes(doc.tipo)) continue;
                const bancoBaixa = par.pagamentos.find((x) => x.contaFinanceiraCaId)?.contaFinanceiraCaId || null;
                if (toList(banco).length && !toList(banco).includes(bancoBaixa || '')) continue;
                const formaBaixa = par.formaPagamento || par.pagamentos.find((x) => x.formaPagamento)?.formaPagamento || null;
                if (toList(forma).length && !toList(forma).includes(formaBaixa || '')) continue;
                linhas.push({
                    id: par.id,
                    fornecedor: conta.fornecedor?.razaoSocial || conta.fornecedor?.nomeFantasia || '—',
                    fornecedorDoc: conta.fornecedor?.cnpjCpf || null,
                    descricao: conta.descricao,
                    documento: doc,
                    categoria: conta.rateios.length > 1 ? 'RATEADA' : (conta.categoriaDespesa?.nome || conta.categoria || null),
                    classificacao: conta.categoriaDespesa?.classificacao || null,
                    rateios: conta.rateios.length > 1 && par.numeroParcela === 1
                        ? conta.rateios.map((r) => ({ categoria: r.categoria, valor: round2(r.valor) })) : [],
                    emissao: conta.dataEmissao,
                    numeroParcela: par.numeroParcela,
                    vencimento: par.dataVencimento,
                    valor: round2(par.valor),
                    valorPago: round2(par.valorPago),
                    juros: null, multa: null, descontoPg: null,
                    forma: formaBaixa,
                    bancoId: bancoBaixa,
                    bancoNome: bancoBaixa ? (nomeBanco.get(bancoBaixa) || 'Conta desconhecida') : null,
                    dataBaixa: par.dataPagamento,
                    baixadoPor: null,
                    conciliado: par.pagamentos.some((x) => conciliados.has(x.id)),
                    status: par.status,
                    temAnexo: !!conta.pdfPath
                });
            }
        }

        const valorTotal = round2(linhas.reduce((s, l) => s + (l.valor || 0), 0));
        const pagoTotal = round2(linhas.reduce((s, l) => s + (l.valorPago || 0), 0));
        res.json({
            visao: ['pagamentos', 'categorias'].includes(visao) ? visao : 'contas',
            resumo: { linhas: linhas.length, valorTotal, pagoTotal, truncado },
            bancos: contasFin.map((c) => ({ id: c.id, nome: c.nomeBanco })),
            linhas
        });
    } catch (error) {
        console.error('[Contabilidade] relatorio-pagar:', error);
        res.status(500).json({ error: 'Erro ao montar o relatório de contas a pagar.' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 3 — EXTRATO COM IDENTIFICAÇÃO DA CONCILIAÇÃO (+ export OFX)
// ═══════════════════════════════════════════════════════════════════

/**
 * Monta o extrato de uma conta com a coluna "Identificação": cada linha do banco
 * diz de qual pedido/nota/fornecedor veio (1↔1, grupo, transferência, ignorado).
 * Usada pela rota do extrato e pelo Pacote do Mês.
 */
async function montarExtratoConciliado(bancoId, de, ate, situacao) {
    const where = { contaFinanceiraCaId: bancoId };
    if (diaIni(de) || diaFim(ate)) {
        where.data = {};
        if (diaIni(de)) where.data.gte = diaIni(de);
        if (diaFim(ate)) where.data.lte = diaFim(ate);
    }
    if (toList(situacao).length) where.status = { in: toList(situacao) };

    const lancs = await prisma.extratoLancamento.findMany({
        where,
        take: LIMITE_LINHAS,
        orderBy: { data: 'asc' },
        select: {
            id: true, data: true, valor: true, tipo: true, descricao: true, checkNum: true,
            status: true, obs: true, conciliadoAuto: true,
            pagamentoParcelaId: true, pagamentoParcelaPagarId: true
        }
    });
    const ids = lancs.map((l) => l.id);

    // 1↔1 receber / pagar
    const [pgsReceber, pgsPagar, grupoItens, transfs, contasFin] = await Promise.all([
        prisma.pagamentoParcela.findMany({
            where: { id: { in: lancs.map((l) => l.pagamentoParcelaId).filter(Boolean) } },
            select: {
                id: true, valorRecebido: true,
                registradoPor: { select: { nome: true } },
                parcela: {
                    select: {
                        numeroParcela: true,
                        contaReceber: {
                            select: {
                                cliente: { select: { Nome: true } },
                                pedido: { select: { numero: true, nfeNumero: true } }
                            }
                        }
                    }
                }
            }
        }),
        prisma.pagamentoParcelaPagar.findMany({
            where: { id: { in: lancs.map((l) => l.pagamentoParcelaPagarId).filter(Boolean) } },
            select: {
                id: true, valorPago: true,
                parcelaPagar: {
                    select: {
                        contaPagar: {
                            select: {
                                descricao: true, numeroNota: true, categoria: true,
                                categoriaDespesa: { select: { nome: true } },
                                fornecedor: { select: { razaoSocial: true } }
                            }
                        }
                    }
                }
            }
        }),
        prisma.conciliacaoGrupoItem.findMany({
            where: { extratoLancamentoId: { in: ids } },
            select: {
                extratoLancamentoId: true,
                grupo: { select: { id: true, valor: true, valorBaixas: true, diferenca: true, motivoDiferenca: true, itens: { select: { pagamentoParcelaId: true, pagamentoParcelaPagarId: true } } } }
            }
        }),
        prisma.transferenciaConta.findMany({
            where: { extratoLancamentoId: { in: ids } },
            select: { extratoLancamentoId: true, contaOrigemId: true, contaDestinoId: true }
        }),
        prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } })
    ]);
    const nomeBanco = new Map(contasFin.map((c) => [c.id, c.nomeBanco]));
    const mapaRec = new Map(pgsReceber.map((p) => [p.id, p]));
    const mapaPag = new Map(pgsPagar.map((p) => [p.id, p]));
    const mapaGrupo = new Map(grupoItens.map((i) => [i.extratoLancamentoId, i.grupo]));
    const mapaTransf = new Map(transfs.map((t) => [t.extratoLancamentoId, t]));

    const linhas = lancs.map((l) => {
        let identTipo = 'PENDENTE';
        let identificacao = null;
        const transf = mapaTransf.get(l.id);
        const grupo = mapaGrupo.get(l.id);
        if (transf) {
            identTipo = 'TRANSFERENCIA';
            const o = transf.contaOrigemId ? (nomeBanco.get(transf.contaOrigemId) || 'conta externa') : 'conta externa';
            const d = transf.contaDestinoId ? (nomeBanco.get(transf.contaDestinoId) || 'conta externa') : 'conta externa';
            identificacao = `Transferência interna ${o} → ${d} (não entra na DRE)`;
        } else if (l.pagamentoParcelaId && mapaRec.get(l.pagamentoParcelaId)) {
            const p = mapaRec.get(l.pagamentoParcelaId);
            const conta = p.parcela.contaReceber;
            identTipo = 'RECEBIMENTO';
            identificacao = `Recebimento ${conta.pedido?.numero ? `pedido #${conta.pedido.numero}` : 'título'} — ${conta.cliente?.Nome || ''}`
                + (conta.pedido?.nfeNumero ? ` · NF-e ${conta.pedido.nfeNumero}` : '')
                + (p.registradoPor?.nome ? ` · baixado por ${p.registradoPor.nome}` : '');
        } else if (l.pagamentoParcelaPagarId && mapaPag.get(l.pagamentoParcelaPagarId)) {
            const p = mapaPag.get(l.pagamentoParcelaPagarId);
            const c = p.parcelaPagar.contaPagar;
            identTipo = 'PAGAMENTO';
            identificacao = `Pagamento ${c.numeroNota ? `NF ${c.numeroNota} — ` : ''}${c.fornecedor?.razaoSocial || c.descricao}`
                + ((c.categoriaDespesa?.nome || c.categoria) ? ` · ${c.categoriaDespesa?.nome || c.categoria}` : '');
        } else if (grupo) {
            identTipo = 'GRUPO';
            const nBaixas = grupo.itens.filter((i) => i.pagamentoParcelaId || i.pagamentoParcelaPagarId).length;
            const dif = Number(grupo.diferenca || 0);
            identificacao = `Grupo: ${nBaixas} baixa(s) conciliada(s) em conjunto`
                + (Math.abs(dif) > 0.009 ? ` · diferença R$ ${dif.toFixed(2)}${grupo.motivoDiferenca ? ` (${grupo.motivoDiferenca})` : ''}` : ' · diferença R$ 0,00');
        } else if (l.status === 'IGNORADO') {
            identTipo = 'IGNORADO';
            identificacao = l.obs ? `Ignorado: ${l.obs}` : 'Ignorado';
        } else if (l.status === 'CONCILIADO') {
            identTipo = 'CONCILIADO';
            identificacao = 'Conciliado';
        }
        return {
            id: l.id, data: l.data, valor: round2(l.valor), tipo: l.tipo,
            descricao: l.descricao, documento: l.checkNum || null,
            status: l.status, conciliadoAuto: l.conciliadoAuto,
            identTipo, identificacao
        };
    });
    const resumo = {
        linhas: linhas.length,
        creditos: round2(linhas.filter((l) => l.tipo === 'CREDITO').reduce((s, l) => s + l.valor, 0)),
        debitos: round2(linhas.filter((l) => l.tipo === 'DEBITO').reduce((s, l) => s + l.valor, 0)),
        conciliados: linhas.filter((l) => l.status !== 'PENDENTE').length
    };
    return { linhas, resumo };
}

// GET /extrato-conciliado?banco=<id>&de&ate&situacao
router.get('/extrato-conciliado', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { banco, de, ate, situacao } = req.query;
        const contasFin = await prisma.contaFinanceira.findMany({
            orderBy: { nomeBanco: 'asc' },
            select: { id: true, nomeBanco: true, ativo: true }
        });
        if (!banco) return res.json({ bancos: contasFin, linhas: [], resumo: null });
        const { linhas, resumo } = await montarExtratoConciliado(String(banco), de, ate, situacao);
        res.json({ bancos: contasFin, linhas, resumo });
    } catch (error) {
        console.error('[Contabilidade] extrato-conciliado:', error);
        res.status(500).json({ error: 'Erro ao montar o extrato.' });
    }
});

// GET /extrato-ofx?banco&de&ate — re-exporta o extrato no formato OFX (sistemas contábeis leem)
router.get('/extrato-ofx', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { banco, de, ate } = req.query;
        if (!banco) return res.status(400).json({ error: 'Informe ?banco=<id da conta>' });
        const conta = await prisma.contaFinanceira.findUnique({ where: { id: String(banco) } });
        const { linhas } = await montarExtratoConciliado(String(banco), de, ate, null);
        const ymd = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
        const trns = linhas.map((l) => `
<STMTTRN>
<TRNTYPE>${l.tipo === 'CREDITO' ? 'CREDIT' : 'DEBIT'}
<DTPOSTED>${ymd(l.data)}
<TRNAMT>${(l.tipo === 'CREDITO' ? l.valor : -l.valor).toFixed(2)}
<FITID>${l.id}
<MEMO>${String(l.identificacao || l.descricao || '').replace(/[<>&]/g, ' ').slice(0, 250)}
</STMTTRN>`).join('');
        const agora = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
        const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1<STATUS><CODE>0<SEVERITY>INFO</STATUS>
<STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0<ACCTID>${String(banco).slice(0, 20)}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>${de ? de.replace(/-/g, '') : ''}<DTEND>${ate ? ate.replace(/-/g, '') : ''}${trns}
</BANKTRANLIST>
<LEDGERBAL><BALAMT>0.00<DTASOF>${agora}</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;
        res.setHeader('Content-Type', 'application/x-ofx');
        res.setHeader('Content-Disposition', `attachment; filename="extrato-${(conta?.nomeBanco || 'conta').replace(/[^\w-]/g, '_')}-${de || 'inicio'}-a-${ate || 'hoje'}.ofx"`);
        res.send(ofx);
    } catch (error) {
        console.error('[Contabilidade] extrato-ofx:', error);
        res.status(500).json({ error: 'Erro ao gerar o OFX.' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 4 — NOTAS DE ENTRADA (produto e serviço) + PACOTE DO MÊS
// ═══════════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');

const DESTINO_NOTA = {
    CONFERIDA: 'GEROU_CP', VINCULADA: 'VINCULADA', ENTRADA_REGISTRADA: 'SEM_PAGAMENTO',
    NOVA: 'PENDENTE', AGUARDANDO_XML: 'PENDENTE', IGNORADA: 'IGNORADA',
    // Recusada na SEFAZ (Desconhecimento / Operação não Realizada): a nota aparece no
    // relatório, mas não gerou nem vai gerar despesa nenhuma.
    RECUSADA: 'RECUSADA',
    CANCELADA_EMITENTE: 'CANCELADA'
};

/** Notas de entrada do período com as parcelas a pagar de cada uma (rota + pacote). */
async function montarNotasEntrada(de, ate, tipo, nomeBanco) {
    const where = {};
    if (diaIni(de) || diaFim(ate)) {
        where.emissao = {};
        if (diaIni(de)) where.emissao.gte = diaIni(de);
        if (diaFim(ate)) where.emissao.lte = diaFim(ate);
    }
    if (toList(tipo).length) where.tipo = { in: toList(tipo) };

    const notas = await prisma.notaEntrada.findMany({
        where,
        take: LIMITE_LINHAS,
        orderBy: { emissao: 'desc' },
        select: {
            id: true, tipo: true, numero: true, serie: true, chave: true,
            fornecedorNome: true, fornecedorCnpj: true,
            fornecedor: { select: { razaoSocial: true, cnpjCpf: true } },
            emissao: true, dataEntrada: true, valorTotal: true, status: true, motivoEntrada: true, xmlPath: true,
            contaPagar: {
                select: {
                    parcelas: {
                        orderBy: { numeroParcela: 'asc' },
                        select: {
                            numeroParcela: true, valor: true, dataVencimento: true, status: true, dataPagamento: true,
                            pagamentos: { where: { estornado: false }, select: { contaFinanceiraCaId: true }, take: 1 }
                        }
                    }
                }
            },
            parcelasVinculadas: {
                select: {
                    valorVinculado: true,
                    parcelaPagar: {
                        select: {
                            dataVencimento: true, valor: true, status: true, dataPagamento: true,
                            contaPagar: { select: { descricao: true } },
                            pagamentos: { where: { estornado: false }, select: { contaFinanceiraCaId: true }, take: 1 }
                        }
                    }
                }
            }
        }
    });

    return notas.map((n) => {
        const parcelas = [];
        for (const p of (n.contaPagar?.parcelas || [])) {
            const bId = p.pagamentos[0]?.contaFinanceiraCaId || null;
            parcelas.push({
                rotulo: `Parcela ${p.numeroParcela}`, valor: round2(p.valor),
                vencimento: p.dataVencimento, status: p.status, dataPagamento: p.dataPagamento,
                bancoNome: bId ? (nomeBanco.get(bId) || 'Conta desconhecida') : null
            });
        }
        for (const v of n.parcelasVinculadas) {
            const bId = v.parcelaPagar.pagamentos[0]?.contaFinanceiraCaId || null;
            parcelas.push({
                rotulo: `Vinculada — ${v.parcelaPagar.contaPagar?.descricao || 'parcela já lançada'}`,
                valor: round2(v.valorVinculado),
                vencimento: v.parcelaPagar.dataVencimento, status: v.parcelaPagar.status,
                dataPagamento: v.parcelaPagar.dataPagamento,
                bancoNome: bId ? (nomeBanco.get(bId) || 'Conta desconhecida') : null
            });
        }
        return {
            id: n.id, tipo: n.tipo, numero: n.numero, serie: n.serie, chave: n.chave,
            fornecedor: n.fornecedor?.razaoSocial || n.fornecedorNome,
            fornecedorDoc: n.fornecedor?.cnpjCpf || n.fornecedorCnpj,
            emissao: n.emissao, dataEntrada: n.dataEntrada,
            valor: n.valorTotal != null ? round2(n.valorTotal) : null,
            destino: DESTINO_NOTA[n.status] || n.status,
            motivoEntrada: n.motivoEntrada || null,
            temXml: !!n.xmlPath,
            parcelas
        };
    });
}

// GET /notas-entrada-relatorio?de&ate&tipo=NFE,NFSE
router.get('/notas-entrada-relatorio', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true } });
        const nomeBanco = new Map(contasFin.map((c) => [c.id, c.nomeBanco]));
        const linhas = await montarNotasEntrada(req.query.de, req.query.ate, req.query.tipo, nomeBanco);
        res.json({
            resumo: {
                linhas: linhas.length,
                nfe: linhas.filter((l) => l.tipo === 'NFE').length,
                nfse: linhas.filter((l) => l.tipo === 'NFSE').length,
                valorTotal: round2(linhas.reduce((s, l) => s + (l.valor || 0), 0)),
                semPagamento: linhas.filter((l) => l.destino === 'SEM_PAGAMENTO').length
            },
            linhas
        });
    } catch (error) {
        console.error('[Contabilidade] notas-entrada-relatorio:', error);
        res.status(500).json({ error: 'Erro ao montar o relatório de notas de entrada.' });
    }
});

// GET /notas-entrada/:id/xml — o XML da nota (consulta; caminho gravado na captura)
router.get('/notas-entrada/:id/xml', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const nota = await prisma.notaEntrada.findUnique({ where: { id: req.params.id }, select: { chave: true, xmlPath: true } });
        if (!nota?.xmlPath) return res.status(404).json({ error: 'Esta nota não tem XML guardado.' });
        const abs = path.join(__dirname, '..', nota.xmlPath.replace(/^\/+/, ''));
        if (!fs.existsSync(abs)) return res.status(404).json({ error: 'O arquivo do XML se perdeu — busque a nota de novo em Notas Recebidas.' });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="nfe-entrada-${nota.chave}.xml"`);
        res.send(fs.readFileSync(abs, 'utf8'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /notas-entrada-zip?de&ate&tipo — ZIP dos XMLs de entrada do período
router.get('/notas-entrada-zip', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const AdmZip = require('adm-zip');
        const { de, ate, tipo } = req.query;
        const where = { xmlPath: { not: null } };
        if (diaIni(de) || diaFim(ate)) {
            where.emissao = {};
            if (diaIni(de)) where.emissao.gte = diaIni(de);
            if (diaFim(ate)) where.emissao.lte = diaFim(ate);
        }
        if (toList(tipo).length) where.tipo = { in: toList(tipo) };
        const notas = await prisma.notaEntrada.findMany({ where, select: { chave: true, numero: true, tipo: true, xmlPath: true } });
        const zip = new AdmZip();
        let incluidos = 0;
        for (const n of notas) {
            const abs = path.join(__dirname, '..', n.xmlPath.replace(/^\/+/, ''));
            if (!fs.existsSync(abs)) continue;
            zip.addFile(`${n.tipo === 'NFSE' ? 'nfse' : 'nfe'}-entrada-${n.numero || n.chave}.xml`, fs.readFileSync(abs));
            incluidos++;
        }
        if (incluidos === 0) return res.status(404).json({ error: 'Nenhum XML de entrada no período.' });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="xmls-entrada-${de || 'inicio'}-a-${ate || 'hoje'}.zip"`);
        res.send(zip.toBuffer());
    } catch (error) {
        console.error('[Contabilidade] notas-entrada-zip:', error);
        res.status(500).json({ error: 'Erro ao gerar o ZIP.' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PACOTE DO MÊS — um ZIP com tudo que a contabilidade precisa
// ═══════════════════════════════════════════════════════════════════
const cCampo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const cNum = (v) => (v == null ? '' : Number(v).toFixed(2).replace('.', ','));
const cData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const montarCsv = (cab, rows) => '﻿' + cab.join(';') + '\n' + rows.map((r) => r.join(';')).join('\n');

// GET /pacote-mes?mes=YYYY-MM
router.get('/pacote-mes', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const mes = String(req.query.mes || '');
        if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: 'Informe ?mes=YYYY-MM' });
        const [ano, m] = mes.split('-').map(Number);
        const de = `${mes}-01`;
        const ate = new Date(ano, m, 0).toISOString().slice(0, 10); // último dia do mês
        const AdmZip = require('adm-zip');
        const zip = new AdmZip();
        const contasFin = await prisma.contaFinanceira.findMany({ select: { id: true, nomeBanco: true, ativo: true } });
        const nomeBanco = new Map(contasFin.map((c) => [c.id, c.nomeBanco]));

        // 1) Receber — títulos criados no mês
        const parcelasRec = await prisma.parcela.findMany({
            where: { contaReceber: { createdAt: { gte: diaIni(de), lte: diaFim(ate) }, OR: SEM_RUIDO_OR } },
            take: LIMITE_LINHAS,
            orderBy: { dataVencimento: 'asc' },
            select: {
                numeroParcela: true, valor: true, dataVencimento: true, status: true, valorPago: true,
                formaPagamento: true, contaFinanceiraCaId: true, dataPagamento: true,
                contaReceber: { select: SELECT_CONTA }
            }
        });
        const impRec = await infoImportadas([...new Set(parcelasRec.filter((p) => !p.contaReceber.pedido).map((p) => p.contaReceber.id))]);
        zip.addFile('01-receber-titulos-criados.csv', Buffer.from(montarCsv(
            ['Pedido', 'Criacao', 'Cliente', 'CNPJ/CPF', 'Documento', 'NF', 'Parcela', 'Vencimento', 'Valor', 'Recebido', 'Forma', 'Banco da baixa', 'Data baixa', 'Status'],
            parcelasRec.map((p) => {
                const conta = p.contaReceber;
                const extra = !conta.pedido ? impRec.get(conta.id) : null;
                let doc = resolverDocumento(conta);
                if (extra?.nfNumero) doc = { tipo: 'NF_CA', numero: extra.nfNumero };
                return [
                    conta.pedido?.numero ? `#${conta.pedido.numero}` : (extra?.numeroVendaCA ? `CA #${extra.numeroVendaCA}` : ''),
                    cData(conta.createdAt), cCampo(conta.cliente?.Nome), cCampo(conta.cliente?.Documento),
                    doc.tipo, doc.numero || '', p.numeroParcela, cData(p.dataVencimento), cNum(p.valor), cNum(p.valorPago),
                    cCampo(p.formaPagamento), cCampo(p.contaFinanceiraCaId ? nomeBanco.get(p.contaFinanceiraCaId) : ''), cData(p.dataPagamento), p.status
                ];
            })
        ), 'utf8'));

        // 2) Receber — recebimentos do mês (ledger)
        const pgsRec = await prisma.pagamentoParcela.findMany({
            where: { estornado: false, dataPagamento: { gte: diaIni(de), lte: diaFim(ate) }, parcela: { contaReceber: { OR: SEM_RUIDO_OR } } },
            take: LIMITE_LINHAS,
            orderBy: { dataPagamento: 'asc' },
            select: {
                valorRecebido: true, valorDesconto: true, formaPagamento: true, contaFinanceiraCaId: true,
                dataPagamento: true, origem: true, registradoPor: { select: { nome: true } },
                parcela: { select: { contaReceber: { select: SELECT_CONTA } } }
            }
        });
        zip.addFile('02-receber-recebimentos.csv', Buffer.from(montarCsv(
            ['Data', 'Cliente', 'Pedido', 'Valor recebido', 'Desconto', 'Forma', 'Banco', 'Origem da baixa', 'Baixado por'],
            pgsRec.map((pg) => [
                cData(pg.dataPagamento), cCampo(pg.parcela.contaReceber.cliente?.Nome),
                pg.parcela.contaReceber.pedido?.numero ? `#${pg.parcela.contaReceber.pedido.numero}` : '',
                cNum(pg.valorRecebido), cNum(pg.valorDesconto), cCampo(pg.formaPagamento),
                cCampo(pg.contaFinanceiraCaId ? nomeBanco.get(pg.contaFinanceiraCaId) : ''), cCampo(pg.origem), cCampo(pg.registradoPor?.nome)
            ])
        ), 'utf8'));

        // 3) Pagar — contas do mês (emissão) com rateio DRE
        const contasPag = await prisma.contaPagar.findMany({
            where: { status: { not: 'CANCELADO' }, dataEmissao: { gte: diaIni(de), lte: diaFim(ate) } },
            take: LIMITE_LINHAS,
            select: SELECT_CONTA_PAGAR
        });
        const rowsPag = [];
        for (const c of contasPag) {
            const doc = resolverDocPagar(c);
            const base = [cCampo(c.fornecedor?.razaoSocial || ''), cCampo(c.fornecedor?.cnpjCpf), cCampo(c.descricao), doc.tipo, doc.numero || '', cData(c.dataEmissao), cNum(c.valorTotal), c.status];
            if (c.rateios.length > 0) c.rateios.forEach((r) => rowsPag.push([...base, cCampo(r.categoria), cNum(r.valor)]));
            else rowsPag.push([...base, cCampo(c.categoriaDespesa?.nome || c.categoria), cNum(c.valorTotal)]);
        }
        zip.addFile('03-pagar-contas-do-mes.csv', Buffer.from(montarCsv(
            ['Fornecedor', 'CNPJ', 'Descricao', 'Documento', 'NF', 'Emissao', 'Valor da conta', 'Status', 'Categoria (rateio)', 'Valor na categoria'],
            rowsPag
        ), 'utf8'));

        // 4) Pagar — pagamentos do mês (ledger)
        const pgsPag = await prisma.pagamentoParcelaPagar.findMany({
            where: { estornado: false, dataPagamento: { gte: diaIni(de), lte: diaFim(ate) } },
            take: LIMITE_LINHAS,
            orderBy: { dataPagamento: 'asc' },
            select: {
                valorPago: true, juros: true, multa: true, desconto: true, formaPagamento: true,
                contaFinanceiraCaId: true, dataPagamento: true,
                parcelaPagar: { select: { contaPagar: { select: { descricao: true, numeroNota: true, fornecedor: { select: { razaoSocial: true } }, categoriaDespesa: { select: { nome: true } }, categoria: true } } } }
            }
        });
        zip.addFile('04-pagar-pagamentos.csv', Buffer.from(montarCsv(
            ['Data', 'Fornecedor', 'Descricao', 'NF', 'Categoria', 'Valor pago', 'Juros', 'Multa', 'Desconto', 'Forma', 'Banco'],
            pgsPag.map((pg) => {
                const c = pg.parcelaPagar.contaPagar;
                return [cData(pg.dataPagamento), cCampo(c.fornecedor?.razaoSocial), cCampo(c.descricao), c.numeroNota || '',
                    cCampo(c.categoriaDespesa?.nome || c.categoria), cNum(pg.valorPago), cNum(pg.juros), cNum(pg.multa), cNum(pg.desconto),
                    cCampo(pg.formaPagamento), cCampo(pg.contaFinanceiraCaId ? nomeBanco.get(pg.contaFinanceiraCaId) : '')];
            })
        ), 'utf8'));

        // 5) Extrato conciliado de cada conta ativa
        for (const cf of contasFin.filter((c) => c.ativo)) {
            const { linhas } = await montarExtratoConciliado(cf.id, de, ate, null);
            if (linhas.length === 0) continue;
            zip.addFile(`05-extrato-${cf.nomeBanco.replace(/[^\w-]/g, '_')}.csv`, Buffer.from(montarCsv(
                ['Data', 'Tipo', 'Valor', 'Descricao no banco', 'Situacao', 'Identificacao'],
                linhas.map((l) => [cData(l.data), l.tipo, cNum(l.valor), cCampo(l.descricao), l.status, cCampo(l.identificacao)])
            ), 'utf8'));
        }

        // 6) Transferências entre contas + ajustes de saldo
        const [transfs, ajustes] = await Promise.all([
            prisma.transferenciaConta.findMany({
                where: { data: { gte: diaIni(de), lte: diaFim(ate) } },
                select: { data: true, valor: true, contaOrigemId: true, contaDestinoId: true, descricao: true }
            }),
            prisma.ajusteSaldoConta.findMany({
                where: { data: { gte: diaIni(de), lte: diaFim(ate) } },
                select: { data: true, valor: true, contaFinanceiraCaId: true, descricao: true }
            })
        ]);
        zip.addFile('06-transferencias-e-ajustes.csv', Buffer.from(montarCsv(
            ['Tipo', 'Data', 'Valor', 'De', 'Para/Conta', 'Descricao'],
            [
                ...transfs.map((t) => ['TRANSFERENCIA', cData(t.data), cNum(t.valor),
                    cCampo(t.contaOrigemId ? nomeBanco.get(t.contaOrigemId) : 'conta externa'),
                    cCampo(t.contaDestinoId ? nomeBanco.get(t.contaDestinoId) : 'conta externa'), cCampo(t.descricao)]),
                ...ajustes.map((a) => ['AJUSTE_SALDO', cData(a.data), cNum(a.valor), '',
                    cCampo(a.contaFinanceiraCaId ? nomeBanco.get(a.contaFinanceiraCaId) : 'Não informado'), cCampo(a.descricao)])
            ]
        ), 'utf8'));

        // 7) Devoluções do mês com NF-e própria (abatem faturamento)
        const devolucoes = await prisma.notaFiscalApp.findMany({
            where: { tipo: 'DEVOLUCAO', status: 'AUTORIZADO', ambiente: 'producao', atualizadoEm: { gte: diaIni(de), lte: diaFim(ate) } },
            select: { numero: true, chave: true, atualizadoEm: true, pedido: { select: { numero: true, cliente: { select: { Nome: true } } } } }
        });
        zip.addFile('07-devolucoes-com-nf.csv', Buffer.from(montarCsv(
            ['NF devolucao', 'Data', 'Pedido', 'Cliente', 'Chave'],
            devolucoes.map((d) => [d.numero || '', cData(d.atualizadoEm), d.pedido?.numero ? `#${d.pedido.numero}` : '', cCampo(d.pedido?.cliente?.Nome), d.chave || ''])
        ), 'utf8'));

        // 8) XMLs de SAÍDA do mês (acervo local; mês = posições 3-6 da chave: AAMM)
        const aamm = `${String(ano).slice(2)}${String(m).padStart(2, '0')}`;
        const DIR_SAIDA = path.join(__dirname, '../uploads/xml-nfe');
        let xmlSaida = 0;
        try {
            for (const arq of fs.readdirSync(DIR_SAIDA).filter((n) => n.endsWith('.xml'))) {
                if (arq.slice(2, 6) !== aamm) continue;
                zip.addFile(`xmls-saida/${arq}`, fs.readFileSync(path.join(DIR_SAIDA, arq)));
                xmlSaida++;
            }
        } catch (_) {}

        // 9) XMLs de ENTRADA do mês (pela emissão da nota do fornecedor)
        const notasEnt = await prisma.notaEntrada.findMany({
            where: { xmlPath: { not: null }, emissao: { gte: diaIni(de), lte: diaFim(ate) } },
            select: { chave: true, numero: true, tipo: true, xmlPath: true }
        });
        let xmlEntrada = 0;
        for (const n of notasEnt) {
            const abs = path.join(__dirname, '..', n.xmlPath.replace(/^\/+/, ''));
            if (!fs.existsSync(abs)) continue;
            zip.addFile(`xmls-entrada/${n.tipo === 'NFSE' ? 'nfse' : 'nfe'}-${n.numero || n.chave}.xml`, fs.readFileSync(abs));
            xmlEntrada++;
        }

        zip.addFile('_LEIA-ME.txt', Buffer.from(
            `Pacote da contabilidade — ${mes}\nGerado pelo sistema CA-Hardt em ${new Date().toLocaleString('pt-BR')}\n\n` +
            `01 Títulos a receber criados no mês\n02 Recebimentos do mês (por baixa, com forma e banco)\n` +
            `03 Contas a pagar do mês (com rateio por categoria DRE)\n04 Pagamentos do mês (com juros/multa/desconto)\n` +
            `05 Extrato de cada conta com a identificação da conciliação\n06 Transferências entre contas e ajustes de saldo (não entram na DRE)\n` +
            `07 Devoluções com NF-e própria\nxmls-saida/ (${xmlSaida} arquivos) — NF-e de venda e devolução\n` +
            `xmls-entrada/ (${xmlEntrada} arquivos) — NF-e/NFS-e de compras\n`, 'utf8'));

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="contabilidade-${mes}.zip"`);
        res.send(zip.toBuffer());
    } catch (error) {
        console.error('[Contabilidade] pacote-mes:', error);
        res.status(500).json({ error: 'Erro ao gerar o pacote do mês.' });
    }
});

module.exports = router;
