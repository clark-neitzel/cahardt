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
const SEM_RUIDO_OR = [
    { pedidoId: null },
    {
        pedido: {
            statusEnvio: { notIn: ['EXCLUIDO'] },
            situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] },
            bonificacao: false
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

module.exports = router;
