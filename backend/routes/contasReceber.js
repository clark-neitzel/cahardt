const express = require('express');
const router = express.Router();
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const verificarAuth = require('../middlewares/authMiddleware');
const contasReceberSyncService = require('../services/contasReceberSyncService');

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
    if (!perms.admin && !perms.Pode_Acessar_Contas_Receber) {
        return res.status(403).json({ error: 'Sem permissão para acessar contas a receber.' });
    }
    next();
};

const checkBaixa = async (req, res, next) => {
    const perms = req._perms || await getPerms(req.user.id);
    req._perms = perms;
    if (!perms.admin && !perms.Pode_Baixar_Contas_Receber) {
        return res.status(403).json({ error: 'Sem permissão para dar baixa em parcelas.' });
    }
    next();
};

// ── Cobrança (como o título é cobrado: Boleto, Pix, Dinheiro, Cartão) ──
// Vem da CONDIÇÃO do pedido (tabela_precos.tipo_pagamento), não da baixa. É o único jeito de
// filtrar boleto/pix numa conta AINDA EM ABERTO — parcela.formaPagamento só é preenchido na baixa.
const LABEL_TIPO_COBRANCA = {
    BOLETO_BANCARIO: 'Boleto',
    PIX: 'Pix',
    DINHEIRO: 'Dinheiro',
    CARTAO: 'Cartão'
};

// Cláusula Prisma para filtrar contas por tipo de cobrança.
// O pedido guarda o tipo em `tipoPagamento`, mas pedidos antigos podem ter só o nome da condição
// (`nomeCondicaoPagamento`) — daí o OR com os nomes das condições daquele tipo.
const filtroTipoCobranca = async (tipos) => {
    const condicoes = await prisma.tabelaPreco.findMany({
        where: { tipoPagamento: { in: tipos } },
        select: { nomeCondicao: true }
    });
    const nomes = [...new Set(condicoes.map(c => c.nomeCondicao).filter(Boolean))];
    return {
        pedido: {
            OR: [
                { tipoPagamento: { in: tipos } },
                { nomeCondicaoPagamento: { in: nomes } }
            ]
        }
    };
};

// ── GET /tipos-cobranca — opções do filtro de cobrança (derivadas das condições cadastradas) ──
router.get('/tipos-cobranca', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const rows = await prisma.tabelaPreco.findMany({
            select: { tipoPagamento: true },
            distinct: ['tipoPagamento']
        });
        const tipos = rows
            .map(r => r.tipoPagamento)
            .filter(Boolean)
            .map(t => ({ valor: t, label: LABEL_TIPO_COBRANCA[t] || t }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        res.json({ tipos });
    } catch (e) {
        res.json({ tipos: [] });
    }
});

// ── GET /baixado-por — quem já deu baixa em alguma parcela (opções do filtro "Baixado por") ──
router.get('/baixado-por', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const rows = await prisma.parcela.findMany({
            where: { baixadoPorId: { not: null } },
            distinct: ['baixadoPorId'],
            select: { baixadoPorId: true, baixadoPor: { select: { id: true, nome: true } } }
        });
        const usuarios = rows
            .map(r => r.baixadoPor)
            .filter(Boolean)
            .map(u => ({ valor: u.id, label: u.nome }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
        res.json({ usuarios });
    } catch (e) {
        res.json({ usuarios: [] });
    }
});

// ── GET /contas-financeiras — bancos/caixas do CA para o seletor da baixa ──
router.get('/contas-financeiras', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const caSync = require('../services/contasPagarCaSyncService');
        const contasFinanceiras = await caSync.listarContasFinanceirasSeguro();
        res.json({ contasFinanceiras });
    } catch (e) {
        res.json({ contasFinanceiras: [] });
    }
});

// Recalcula o status de uma Parcela a partir do total já recebido/descontado (não estornado)
const calcularStatusParcela = (valor, valorPago, valorDescontoTotal) => {
    const recebidoTotal = Number(valorPago || 0) + Number(valorDescontoTotal || 0);
    if (recebidoTotal <= 0) return 'PENDENTE';
    if (recebidoTotal >= Number(valor) - 0.01) return 'PAGO';
    return 'PARCIAL';
};

// Recalcula o status de uma ContaReceber a partir do status de todas as suas parcelas
const calcularStatusConta = (todasParcelas) => {
    const total = todasParcelas.length;
    const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
    const parciais = todasParcelas.filter(p => p.status === 'PARCIAL').length;
    const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;
    if (pagas + canceladas >= total) return 'QUITADO';
    if (pagas > 0 || parciais > 0) return 'PARCIAL';
    return 'ABERTO';
};

// ── GET / — Listar contas a receber com filtros ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            status, clienteId, vencimentoDe, vencimentoAte, origem, busca, ordenarPor,
            vendedorId, condicaoPagamento, formaPagamento, statusParcela,
            pagamentoDe, pagamentoAte, categoriaClienteId, formaPagamentoEntrega, tipoCobranca,
            baixadoPorId
        } = req.query;

        const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean);

        const where = {};
        if (status) {
            const arr = toList(status);
            where.status = arr.length > 1 ? { in: arr } : arr[0];
        }
        if (origem) where.origem = origem;
        if (clienteId) where.clienteId = clienteId;

        // Filtro por busca no nome do cliente
        if (busca) {
            where.cliente = {
                OR: [
                    { NomeFantasia: { contains: busca, mode: 'insensitive' } },
                    { Nome: { contains: busca, mode: 'insensitive' } }
                ]
            };
        }

        // Filtro por categoria de cliente
        if (categoriaClienteId) {
            where.cliente = { ...(where.cliente || {}), categoriaClienteId };
        }

        // Sempre esconde contas cujo pedido foi excluído/cancelado no CA.
        // pedidoId é nullable (contas ESPECIAL sem pedido vinculado) — aquelas passam livres.
        where.OR = [
            { pedidoId: null },
            {
                pedido: {
                    statusEnvio: { notIn: ['EXCLUIDO'] },
                    situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] },
                    bonificacao: false
                }
            }
        ];

        // Filtros via pedido (vendedor, condição de pagamento e condição na entrega)
        if (vendedorId || condicaoPagamento || formaPagamentoEntrega) {
            where.pedido = {};
            if (vendedorId) where.pedido.vendedorId = vendedorId;
            if (condicaoPagamento) {
                const arr = toList(condicaoPagamento);
                where.pedido.nomeCondicaoPagamento = arr.length > 1 ? { in: arr } : arr[0];
            }
            if (formaPagamentoEntrega) {
                const arr = toList(formaPagamentoEntrega);
                where.pedido.pagamentosReais = { some: { formaPagamentoNome: arr.length > 1 ? { in: arr } : arr[0], valor: { gt: 0 } } };
            }
        }

        // Cobrança (Boleto/Pix/...) — vale para parcela em aberto, pois olha a condição do pedido
        if (tipoCobranca) {
            where.AND = [...(where.AND || []), await filtroTipoCobranca(toList(tipoCobranca))];
        }

        // Filtros que atuam no nível de parcela (precisam de "some")
        const parcelaSome = {};
        if (vencimentoDe || vencimentoAte) {
            parcelaSome.dataVencimento = {};
            if (vencimentoDe) parcelaSome.dataVencimento.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) parcelaSome.dataVencimento.lte = new Date(vencimentoAte + 'T23:59:59.999Z');
        }
        if (pagamentoDe || pagamentoAte) {
            parcelaSome.dataPagamento = {};
            if (pagamentoDe) parcelaSome.dataPagamento.gte = new Date(pagamentoDe + 'T00:00:00.000Z');
            if (pagamentoAte) parcelaSome.dataPagamento.lte = new Date(pagamentoAte + 'T23:59:59.999Z');
        }
        if (statusParcela) {
            const arr = toList(statusParcela);
            parcelaSome.status = arr.length > 1 ? { in: arr } : arr[0];
        }
        if (formaPagamento) {
            const arr = toList(formaPagamento);
            parcelaSome.formaPagamento = arr.length > 1 ? { in: arr } : arr[0];
        }
        // Quem deu a baixa (só faz sentido em parcela já baixada)
        if (baixadoPorId) {
            const arr = toList(baixadoPorId);
            parcelaSome.baixadoPorId = arr.length > 1 ? { in: arr } : arr[0];
        }
        if (Object.keys(parcelaSome).length > 0) {
            where.parcelas = { some: parcelaSome };
        }

        // Otimização (peso): na VISÃO PADRÃO — sem filtro de situação (status), sem filtro de
        // status de parcela e sem filtrar por pagamento (data/forma) — a tela só exibe parcelas
        // que ainda faltam receber. Então o servidor só busca contas que TÊM pelo menos uma
        // parcela a receber, em vez de trazer o monte de contas já QUITADAS/CANCELADAS só para o
        // cliente escondê-las. Provado equivalente ao comportamento antigo (mesmas parcelas
        // visíveis) e ~80% menos contas carregadas. Com qualquer filtro explícito acima, não
        // entra (aí o cliente pode querer ver parcelas pagas/canceladas).
        const filtrandoPagas = !!pagamentoDe || !!pagamentoAte || !!formaPagamento || !!baixadoPorId;
        if (!status && !statusParcela && !filtrandoPagas) {
            where.AND = [
                ...(where.AND || []),
                { parcelas: { some: { status: { in: ['PENDENTE', 'VENCIDO', 'PARCIAL'] } } } }
            ];
        }

        const contas = await prisma.contaReceber.findMany({
            where,
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: {
                    select: {
                        id: true, numero: true, especial: true, nomeCondicaoPagamento: true,
                        statusEntrega: true, devolucaoFinalizada: true, dataVenda: true,
                        idVendaContaAzul: true,
                        vendedor: { select: { id: true, nome: true } },
                        itensDevolvidos: { select: { valorBaseItem: true, quantidade: true } },
                        devolucoes: {
                            where: { status: 'ATIVA' },
                            select: { valorTotal: true, escopo: true, dataDevolucao: true, pdfBoletoUrl: true }
                        },
                        pagamentosReais: {
                            where: { valor: { gt: 0 } },
                            select: { formaPagamentoNome: true, valor: true, escritorioResponsavel: true, vendedorResponsavelId: true }
                        }
                    }
                },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' },
                    include: { baixadoPor: { select: { id: true, nome: true } } }
                }
            },
            orderBy: ordenarPor === 'vencimento' ? { createdAt: 'asc' } : { createdAt: 'desc' }
        });

        // Calcular indicadores
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const em7dias = new Date(hoje);
        em7dias.setDate(em7dias.getDate() + 7);

        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

        let totalEmAberto = 0;
        let totalVencidas = 0;
        let totalAVencer7d = 0;
        let totalQuitadasMes = 0;

        contas.forEach(conta => {
            conta.parcelas.forEach(p => {
                const venc = new Date(p.dataVencimento);
                venc.setHours(0, 0, 0, 0);

                if (p.status === 'PENDENTE' || p.status === 'VENCIDO') {
                    totalEmAberto += Number(p.valor);
                    if (venc < hoje) totalVencidas += Number(p.valor);
                    else if (venc <= em7dias) totalAVencer7d += Number(p.valor);
                } else if (p.status === 'PARCIAL') {
                    const saldo = Number(p.valor) - Number(p.valorPago || 0) - Number(p.valorDescontoTotal || 0);
                    totalEmAberto += saldo;
                    if (venc < hoje) totalVencidas += saldo;
                    else if (venc <= em7dias) totalAVencer7d += saldo;
                }
            });
        });

        // Quitadas no mês: soma dos pagamentos/descontos (do ledger) lançados no mês corrente,
        // independente do status atual da parcela (cobre baixas parciais e totais).
        const pagamentosDoMes = await prisma.pagamentoParcela.findMany({
            where: { estornado: false, dataPagamento: { gte: inicioMes, lte: fimMes } },
            select: { valorRecebido: true, valorDesconto: true }
        });
        totalQuitadasMes = pagamentosDoMes.reduce((s, p) => s + Number(p.valorRecebido) + Number(p.valorDesconto), 0);

        // Formatar resposta
        const contasFormatadas = contas.map(c => {
            const parcelasPagas = c.parcelas.filter(p => p.status === 'PAGO').length;
            const proximaVencimento = c.parcelas
                .filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
                .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0];

            // Calcular valor devolvido
            const valorDevolvido = (c.pedido?.itensDevolvidos || []).reduce(
                (s, i) => s + Number(i.valorBaseItem) * Number(i.quantidade), 0
            );
            const devolucaoAtiva = c.pedido?.devolucoes?.[0] || null;

            return {
                id: c.id,
                clienteNome: c.cliente?.NomeFantasia || c.cliente?.Nome || '-',
                clienteId: c.clienteId,
                pedidoNumero: c.pedido?.numero || null,
                pedidoId: c.pedido?.id || null,
                pedidoEspecial: c.pedido?.especial || false,
                idVendaContaAzul: c.pedido?.idVendaContaAzul || null,
                dataVenda: c.pedido?.dataVenda || null,
                vendedorId: c.pedido?.vendedor?.id || null,
                vendedorNome: c.pedido?.vendedor?.nome || null,
                condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
                statusEntrega: c.pedido?.statusEntrega || null,
                pagamentosEntrega: (c.pedido?.pagamentosReais || []).map(p => ({
                    formaPagamentoNome: p.formaPagamentoNome,
                    valor: Number(p.valor),
                    escritorioResponsavel: p.escritorioResponsavel,
                    vendedorResponsavelId: p.vendedorResponsavelId || null
                })),
                devolucaoFinalizada: c.pedido?.devolucaoFinalizada || false,
                valorDevolvido: valorDevolvido > 0 ? Math.round(valorDevolvido * 100) / 100 : null,
                devolucaoEscopo: devolucaoAtiva?.escopo || null,
                pdfBoletoUrl: devolucaoAtiva?.pdfBoletoUrl || null,
                origem: c.origem,
                valorTotal: Number(c.valorTotal),
                status: c.status,
                observacao: c.observacao,
                parcelasTotal: c.parcelas.length,
                parcelasPagas,
                proximoVencimento: proximaVencimento?.dataVencimento || null,
                parcelas: c.parcelas.map(p => ({
                    id: p.id,
                    numeroParcela: p.numeroParcela,
                    valor: Number(p.valor),
                    dataVencimento: p.dataVencimento,
                    dataPagamento: p.dataPagamento,
                    valorPago: p.valorPago ? Number(p.valorPago) : null,
                    valorDescontoTotal: Number(p.valorDescontoTotal || 0),
                    formaPagamento: p.formaPagamento,
                    status: p.status,
                    observacao: p.observacao,
                    baixadoPorId: p.baixadoPor?.id || null,
                    baixadoPorNome: p.baixadoPor?.nome || null
                })),
                createdAt: c.createdAt
            };
        });

        res.json({
            contas: contasFormatadas,
            indicadores: {
                totalEmAberto: Math.round(totalEmAberto * 100) / 100,
                totalVencidas: Math.round(totalVencidas * 100) / 100,
                totalAVencer7d: Math.round(totalAVencer7d * 100) / 100,
                totalQuitadasMes: Math.round(totalQuitadasMes * 100) / 100
            }
        });
    } catch (error) {
        console.error('Erro ao listar contas a receber:', error);
        res.status(500).json({ error: 'Erro ao listar contas a receber.' });
    }
});

// ── GET /relatorio-itens — Relatório de itens por pedido ──
router.get('/relatorio-itens', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const {
            status, clienteId, vencimentoDe, vencimentoAte, origem, busca,
            vendedorId, condicaoPagamento, formaPagamento, statusParcela,
            pagamentoDe, pagamentoAte, categoriaClienteId, tipoCobranca, baixadoPorId
        } = req.query;

        const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(s => s.trim()).filter(Boolean);

        const where = {};
        if (status) { const arr = toList(status); where.status = arr.length > 1 ? { in: arr } : arr[0]; }
        if (origem) where.origem = origem;
        if (clienteId) where.clienteId = clienteId;
        if (busca) {
            where.cliente = { OR: [
                { NomeFantasia: { contains: busca, mode: 'insensitive' } },
                { Nome: { contains: busca, mode: 'insensitive' } }
            ]};
        }
        if (categoriaClienteId) {
            where.cliente = { ...(where.cliente || {}), categoriaClienteId };
        }
        where.OR = [
            { pedidoId: null },
            { pedido: { statusEnvio: { notIn: ['EXCLUIDO'] }, situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] }, bonificacao: false } }
        ];
        if (vendedorId || condicaoPagamento) {
            where.pedido = {};
            if (vendedorId) where.pedido.vendedorId = vendedorId;
            if (condicaoPagamento) { const arr = toList(condicaoPagamento); where.pedido.nomeCondicaoPagamento = arr.length > 1 ? { in: arr } : arr[0]; }
        }
        if (tipoCobranca) {
            where.AND = [...(where.AND || []), await filtroTipoCobranca(toList(tipoCobranca))];
        }
        const parcelaSome = {};
        if (vencimentoDe || vencimentoAte) {
            parcelaSome.dataVencimento = {};
            if (vencimentoDe) parcelaSome.dataVencimento.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) parcelaSome.dataVencimento.lte = new Date(vencimentoAte + 'T23:59:59.999Z');
        }
        if (pagamentoDe || pagamentoAte) {
            parcelaSome.dataPagamento = {};
            if (pagamentoDe) parcelaSome.dataPagamento.gte = new Date(pagamentoDe + 'T00:00:00.000Z');
            if (pagamentoAte) parcelaSome.dataPagamento.lte = new Date(pagamentoAte + 'T23:59:59.999Z');
        }
        if (statusParcela) { const arr = toList(statusParcela); parcelaSome.status = arr.length > 1 ? { in: arr } : arr[0]; }
        if (formaPagamento) { const arr = toList(formaPagamento); parcelaSome.formaPagamento = arr.length > 1 ? { in: arr } : arr[0]; }
        if (baixadoPorId) { const arr = toList(baixadoPorId); parcelaSome.baixadoPorId = arr.length > 1 ? { in: arr } : arr[0]; }
        if (Object.keys(parcelaSome).length > 0) where.parcelas = { some: parcelaSome };

        const contas = await prisma.contaReceber.findMany({
            where,
            select: {
                id: true, pedidoId: true,
                pedido: {
                    select: {
                        id: true, numero: true, especial: true, dataVenda: true,
                        cliente: { select: { NomeFantasia: true, Nome: true } },
                        vendedor: { select: { nome: true } },
                        itens: {
                            select: {
                                id: true, descricao: true, quantidade: true, valor: true,
                                produto: { select: { nome: true } }
                            }
                        }
                    }
                }
            }
        });

        const pedidosMap = new Map();
        for (const conta of contas) {
            if (!conta.pedidoId || !conta.pedido) continue;
            if (pedidosMap.has(conta.pedidoId)) continue;
            const p = conta.pedido;
            const clienteNome = p.cliente?.NomeFantasia || p.cliente?.Nome || '-';
            const itens = (p.itens || []).map(it => {
                const quantidade = Number(it.quantidade);
                const valorUnitario = Number(it.valor);
                return {
                    produtoNome: it.produto?.nome || it.descricao || '-',
                    descricao: it.descricao || null,
                    quantidade, valorUnitario,
                    total: Math.round(quantidade * valorUnitario * 100) / 100
                };
            });
            pedidosMap.set(conta.pedidoId, {
                pedidoId: p.id, contaId: conta.id,
                pedidoNumero: p.numero || null, pedidoEspecial: p.especial || false,
                clienteNome, vendedorNome: p.vendedor?.nome || '-',
                dataVenda: p.dataVenda, itens,
                subtotal: itens.reduce((s, i) => s + i.total, 0)
            });
        }

        const resultado = [...pedidosMap.values()];
        res.json({ pedidos: resultado, total: resultado.length });
    } catch (error) {
        console.error('Erro ao gerar relatório de itens:', error);
        res.status(500).json({ error: 'Erro ao gerar relatório de itens.' });
    }
});

// ── GET /:id — Detalhe de uma conta ──
router.get('/:id', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: { select: { id: true, numero: true, especial: true, nomeCondicaoPagamento: true, itens: true } },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' },
                    include: { baixadoPor: { select: { nome: true } } }
                }
            }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        res.json(conta);
    } catch (error) {
        console.error('Erro ao buscar conta:', error);
        res.status(500).json({ error: 'Erro ao buscar conta.' });
    }
});

// ── POST /baixa-lote — Dar baixa em várias parcelas de uma vez ──
router.post('/baixa-lote', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaIds, formaPagamento, dataPagamento, observacao, contaFinanceiraCaId } = req.body;

        if (!Array.isArray(parcelaIds) || parcelaIds.length === 0) {
            return res.status(400).json({ error: 'Informe ao menos uma parcela.' });
        }

        if (parcelaIds.length > 200) {
            return res.status(400).json({ error: 'Máximo de 200 parcelas por vez.' });
        }

        const parcelas = await prisma.parcela.findMany({
            where: { id: { in: parcelaIds } },
            include: { contaReceber: true }
        });

        const elegiveis = parcelas.filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO');
        if (elegiveis.length === 0) {
            return res.status(400).json({ error: 'Nenhuma parcela elegível para baixa.' });
        }

        const dataPgto = dataPagamento ? new Date(dataPagamento) : new Date();

        // Executar tudo em transação
        await prisma.$transaction(async (tx) => {
            // 1. Atualizar todas as parcelas (sempre pelo valor cheio — baixa em lote não aceita parcial/desconto)
            for (const parcela of elegiveis) {
                await tx.parcela.update({
                    where: { id: parcela.id },
                    data: {
                        status: 'PAGO',
                        valorPago: parcela.valor,
                        formaPagamento: formaPagamento || null,
                        contaFinanceiraCaId: contaFinanceiraCaId || parcela.contaFinanceiraCaId,
                        dataPagamento: dataPgto,
                        baixadoPorId: req.user.id,
                        observacao: observacao || null
                    }
                });
                await tx.pagamentoParcela.create({
                    data: {
                        parcelaId: parcela.id,
                        valorRecebido: parcela.valor,
                        formaPagamento: formaPagamento || null,
                        contaFinanceiraCaId: contaFinanceiraCaId || null,
                        dataPagamento: dataPgto,
                        observacao: observacao || null,
                        registradoPorId: req.user.id
                    }
                });
            }

            // 2. Recalcular status de cada conta afetada
            const contaIds = [...new Set(elegiveis.map(p => p.contaReceberId))];
            for (const contaId of contaIds) {
                const todasParcelas = await tx.parcela.findMany({
                    where: { contaReceberId: contaId }
                });
                await tx.contaReceber.update({
                    where: { id: contaId },
                    data: { status: calcularStatusConta(todasParcelas) }
                });
            }
        }, { timeout: 20000, maxWait: 10000 });

        // Registrar no histórico — fora da transação para não derrubar a baixa
        // se o banco estiver lento (a baixa em si já foi efetivada).
        try {
            for (const parcela of elegiveis) {
                const conta = parcela.contaReceber;
                const formaPg = formaPagamento || 'N/I';
                await prisma.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO',
                        observacao: `Baixa em lote - parcela ${parcela.numeroParcela} - R$ ${Number(parcela.valor).toFixed(2)} (${formaPg})${observacao ? ` | ${observacao}` : ''}`,
                        clienteId: conta.clienteId,
                        idVendedor: req.user.id,
                        pedidoId: conta.pedidoId || null
                    }
                });
            }
        } catch (logErr) {
            console.error('Falha ao registrar histórico da baixa em lote (baixa já efetivada):', logErr);
        }

        res.json({
            message: `Baixa realizada em ${elegiveis.length} parcela(s)!`,
            totalBaixadas: elegiveis.length,
            totalIgnoradas: parcelas.length - elegiveis.length
        });
    } catch (error) {
        console.error('Erro ao dar baixa em lote:', error);
        res.status(500).json({ error: 'Erro ao dar baixa em lote.' });
    }
});

// ── GET /:parcelaId/pagamentos — Histórico de pagamentos (ledger) de uma parcela ──
router.get('/:parcelaId/pagamentos', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { parcelaId } = req.params;
        const pagamentos = await prisma.pagamentoParcela.findMany({
            where: { parcelaId },
            include: {
                registradoPor: { select: { id: true, nome: true } },
                estornadoPor: { select: { id: true, nome: true } }
            },
            orderBy: { dataPagamento: 'asc' }
        });
        res.json(pagamentos);
    } catch (error) {
        console.error('Erro ao buscar histórico de pagamentos:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico de pagamentos.' });
    }
});

// ── POST /:parcelaId/baixa — Dar baixa em parcela (total, parcial, com ou sem desconto) ──
router.post('/:parcelaId/baixa', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId } = req.params;
        const { valorRecebido, valorDesconto, motivoDesconto, formaPagamento, dataPagamento, observacao, contaFinanceiraCaId } = req.body;
        const perms = req._perms;

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status === 'PAGO') return res.status(400).json({ error: 'Parcela já está paga. Estorne antes de lançar um novo pagamento.' });
        if (parcela.status === 'CANCELADO') return res.status(400).json({ error: 'Parcela cancelada.' });

        const recebido = Math.max(0, Number(valorRecebido) || 0);
        const desconto = Math.max(0, Number(valorDesconto) || 0);

        if (recebido <= 0 && desconto <= 0) {
            return res.status(400).json({ error: 'Informe um valor recebido ou um desconto.' });
        }
        if (desconto > 0 && !perms.admin && !perms.Pode_Dar_Desconto_Baixa) {
            return res.status(403).json({ error: 'Sem permissão para dar desconto na baixa.' });
        }
        if (desconto > 0 && !motivoDesconto?.trim()) {
            return res.status(400).json({ error: 'Informe o motivo do desconto.' });
        }

        const saldoRestante = Number(parcela.valor) - Number(parcela.valorPago || 0) - Number(parcela.valorDescontoTotal || 0);
        if (recebido + desconto > saldoRestante + 0.01) {
            return res.status(400).json({ error: `Valor informado (R$ ${(recebido + desconto).toFixed(2)}) é maior que o saldo restante (R$ ${saldoRestante.toFixed(2)}).` });
        }

        const dataPgto = dataPagamento ? new Date(dataPagamento) : new Date();
        const novoValorPago = Number(parcela.valorPago || 0) + recebido;
        const novoValorDescontoTotal = Number(parcela.valorDescontoTotal || 0) + desconto;
        const novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, novoValorDescontoTotal);

        let novoStatusConta;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.create({
                data: {
                    parcelaId,
                    valorRecebido: recebido,
                    valorDesconto: desconto,
                    motivoDesconto: desconto > 0 ? motivoDesconto.trim() : null,
                    formaPagamento: formaPagamento || null,
                    contaFinanceiraCaId: contaFinanceiraCaId || null,
                    dataPagamento: dataPgto,
                    observacao: observacao || null,
                    registradoPorId: req.user.id
                }
            });

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: novoStatusParcela,
                    valorPago: novoValorPago,
                    valorDescontoTotal: novoValorDescontoTotal,
                    formaPagamento: formaPagamento || parcela.formaPagamento,
                    contaFinanceiraCaId: contaFinanceiraCaId || parcela.contaFinanceiraCaId,
                    dataPagamento: novoStatusParcela === 'PAGO' ? dataPgto : parcela.dataPagamento,
                    baixadoPorId: req.user.id,
                    observacao: observacao || parcela.observacao
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: novoStatusParcela } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({
                where: { id: parcela.contaReceberId },
                data: { status: novoStatusConta }
            });
        }, { timeout: 20000, maxWait: 10000 });

        // Log de auditoria no histórico do cliente — fora da transação para não
        // derrubar a baixa se estiver lento (a baixa em si já foi efetivada).
        try {
            const conta = parcela.contaReceber;
            const partes = [];
            if (recebido > 0) partes.push(`recebido R$ ${recebido.toFixed(2)}${formaPagamento ? ` (${formaPagamento})` : ''}`);
            if (desconto > 0) partes.push(`desconto R$ ${desconto.toFixed(2)} (${motivoDesconto.trim()})`);
            await prisma.atendimento.create({
                data: {
                    tipo: 'FINANCEIRO',
                    observacao: `Baixa parcela ${parcela.numeroParcela} - ${partes.join(' + ')} - status: ${novoStatusParcela}${observacao ? ` | ${observacao}` : ''}`,
                    clienteId: conta.clienteId,
                    idVendedor: req.user.id,
                    pedidoId: conta.pedidoId || null
                }
            });
        } catch (logErr) {
            console.error('Falha ao registrar histórico da baixa (baixa já efetivada):', logErr);
        }

        // Parcela quitada na mão → cancela boleto/PIX Asaas pendente dela (senão o
        // cliente ainda pode pagar o boleto antigo = pagamento em dobro). Melhor
        // esforço, fora da resposta: falha aqui nunca desfaz a baixa.
        if (novoStatusParcela === 'PAGO') {
            const asaasService = require('../services/asaasService');
            asaasService.cancelarCobrancasDaParcela(parcelaId, 'baixa manual no app')
                .catch(e => console.error('[Baixa] Falha ao cancelar cobrança Asaas (baixa já efetivada):', e.message));
        }

        res.json({
            message: novoStatusParcela === 'PAGO' ? 'Parcela quitada com sucesso!' : 'Baixa parcial registrada com sucesso!',
            novoStatusParcela,
            novoStatusConta,
            saldoRestante: Math.max(0, Number(parcela.valor) - novoValorPago - novoValorDescontoTotal)
        });
    } catch (error) {
        console.error('Erro ao dar baixa:', error);
        res.status(500).json({ error: 'Erro ao dar baixa na parcela.' });
    }
});

// ── DELETE /:parcelaId/pagamentos/:pagamentoId — Estornar um pagamento específico do histórico ──
router.delete('/:parcelaId/pagamentos/:pagamentoId', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId, pagamentoId } = req.params;

        const pagamento = await prisma.pagamentoParcela.findUnique({ where: { id: pagamentoId } });
        if (!pagamento || pagamento.parcelaId !== parcelaId) return res.status(404).json({ error: 'Pagamento não encontrado.' });
        if (pagamento.estornado) return res.status(400).json({ error: 'Este pagamento já foi estornado.' });

        const parcela = await prisma.parcela.findUnique({ where: { id: parcelaId }, include: { contaReceber: true } });
        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });

        let novoStatusConta;
        let novoValorPago, novoValorDescontoTotal, novoStatusParcela;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.update({
                where: { id: pagamentoId },
                data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
            });

            const restantes = await tx.pagamentoParcela.findMany({ where: { parcelaId, estornado: false } });
            novoValorPago = restantes.reduce((s, p) => s + Number(p.valorRecebido), 0);
            novoValorDescontoTotal = restantes.reduce((s, p) => s + Number(p.valorDesconto), 0);
            novoStatusParcela = calcularStatusParcela(parcela.valor, novoValorPago, novoValorDescontoTotal);

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: novoStatusParcela,
                    valorPago: novoValorPago,
                    valorDescontoTotal: novoValorDescontoTotal,
                    dataPagamento: novoStatusParcela === 'PAGO' ? parcela.dataPagamento : null
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: novoStatusParcela } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({ where: { id: parcela.contaReceberId }, data: { status: novoStatusConta } });
        }, { timeout: 20000, maxWait: 10000 });

        // Conciliação bancária presa nesta baixa volta para pendente (estorno já efetivado).
        try {
            await require('../services/conciliacaoBancariaService').desconciliarPorBaixa({ pagamentoParcelaId: pagamentoId });
        } catch (e) {
            console.error('Falha ao desconciliar extrato após estorno (estorno já efetivado):', e);
        }

        res.json({ message: 'Pagamento estornado com sucesso!', novoStatusParcela, novoStatusConta });
    } catch (error) {
        console.error('Erro ao estornar pagamento:', error);
        res.status(500).json({ error: 'Erro ao estornar pagamento.' });
    }
});

// ── DELETE /:parcelaId/baixa — Estornar TODOS os pagamentos da parcela (desfaz baixa total ou parcial) ──
router.delete('/:parcelaId/baixa', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId } = req.params;

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status !== 'PAGO' && parcela.status !== 'PARCIAL') {
            return res.status(400).json({ error: 'Parcela não tem baixa para estornar.' });
        }

        // Ids ANTES do estorno em lote — para soltar a conciliação bancária depois
        const idsEstornar = (await prisma.pagamentoParcela.findMany({
            where: { parcelaId, estornado: false }, select: { id: true }
        })).map(p => p.id);

        let novoStatusConta;
        await prisma.$transaction(async (tx) => {
            await tx.pagamentoParcela.updateMany({
                where: { parcelaId, estornado: false },
                data: { estornado: true, estornadoEm: new Date(), estornadoPorId: req.user.id }
            });

            await tx.parcela.update({
                where: { id: parcelaId },
                data: {
                    status: 'PENDENTE',
                    valorPago: null,
                    valorDescontoTotal: 0,
                    formaPagamento: null,
                    dataPagamento: null,
                    baixadoPorId: null,
                    observacao: null
                }
            });

            const todasParcelas = await tx.parcela.findMany({ where: { contaReceberId: parcela.contaReceberId } });
            const parcelasAtualizadas = todasParcelas.map(p => p.id === parcelaId ? { ...p, status: 'PENDENTE' } : p);
            novoStatusConta = calcularStatusConta(parcelasAtualizadas);

            await tx.contaReceber.update({ where: { id: parcela.contaReceberId }, data: { status: novoStatusConta } });
        }, { timeout: 20000, maxWait: 10000 });

        // Conciliação bancária presa nestas baixas volta para pendente (estorno já efetivado).
        for (const pid of idsEstornar) {
            try {
                await require('../services/conciliacaoBancariaService').desconciliarPorBaixa({ pagamentoParcelaId: pid });
            } catch (e) {
                console.error('Falha ao desconciliar extrato após estorno (estorno já efetivado):', e);
            }
        }

        res.json({ message: 'Baixa estornada com sucesso!', novoStatus: novoStatusConta });
    } catch (error) {
        console.error('Erro ao estornar baixa:', error);
        res.status(500).json({ error: 'Erro ao estornar baixa.' });
    }
});

// ── PATCH /:id/cancelar — Cancelar conta ──
router.patch('/:id/cancelar', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { pedido: { select: { embarqueId: true, statusEntrega: true } } }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status === 'QUITADO') return res.status(400).json({ error: 'Conta já quitada, não pode cancelar.' });

        // Trava: não pode cancelar se o pedido está em uma carga (embarque)
        if (conta.pedido?.embarqueId) {
            return res.status(400).json({
                error: 'Este pedido está em uma carga. Remova da carga primeiro ou aguarde a quitação/devolução pela carga.'
            });
        }

        await prisma.$transaction([
            prisma.parcela.updateMany({
                where: { contaReceberId: conta.id, status: { not: 'PAGO' } },
                data: { status: 'CANCELADO' }
            }),
            prisma.contaReceber.update({
                where: { id: conta.id },
                data: { status: 'CANCELADO' }
            })
        ]);

        res.json({ message: 'Conta cancelada com sucesso!' });
    } catch (error) {
        console.error('Erro ao cancelar conta:', error);
        res.status(500).json({ error: 'Erro ao cancelar conta.' });
    }
});

// ── PATCH /:id/reverter-cancelamento — Reverter cancelamento de conta ──
router.patch('/:id/reverter-cancelamento', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (!perms.admin && !perms.Pode_Reverter_Cancelamento_CR) {
            return res.status(403).json({ error: 'Sem permissão para reverter cancelamento.' });
        }

        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { parcelas: true }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status !== 'CANCELADO') return res.status(400).json({ error: 'Conta não está cancelada.' });

        // Reverter parcelas canceladas para PENDENTE
        const parcelasCanceladas = conta.parcelas.filter(p => p.status === 'CANCELADO');
        const parcelasPagas = conta.parcelas.filter(p => p.status === 'PAGO');

        await prisma.$transaction([
            prisma.parcela.updateMany({
                where: { contaReceberId: conta.id, status: 'CANCELADO' },
                data: { status: 'PENDENTE' }
            }),
            prisma.contaReceber.update({
                where: { id: conta.id },
                data: { status: parcelasPagas.length > 0 ? 'PARCIAL' : 'ABERTO' }
            }),
            prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_CANCELAMENTO',
                    entidade: 'ContaReceber',
                    entidadeId: conta.id,
                    detalhes: `Cancelamento revertido por ${req.user.nome || req.user.login}. ${parcelasCanceladas.length} parcela(s) voltaram para PENDENTE.`,
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || req.user.login || '-'
                }
            })
        ]);

        res.json({ message: 'Cancelamento revertido! Parcelas voltaram para PENDENTE.' });
    } catch (error) {
        console.error('Erro ao reverter cancelamento:', error);
        res.status(500).json({ error: 'Erro ao reverter cancelamento.' });
    }
});

// ── PUT /:id/reverter-quitacao — Estornar todas as parcelas pagas (reverter quitação) ──
router.put('/:id/reverter-quitacao', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        req._perms = perms;
        if (!perms.admin && !perms.Pode_Reverter_Especial) {
            return res.status(403).json({ error: 'Sem permissão para estornar quitação.' });
        }

        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id },
            include: { parcelas: true }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status !== 'QUITADO' && conta.status !== 'PARCIAL') {
            return res.status(400).json({ error: 'Conta não está quitada nem parcialmente paga.' });
        }

        // Estornar todas as parcelas pagas
        await prisma.parcela.updateMany({
            where: { contaReceberId: conta.id, status: 'PAGO' },
            data: {
                status: 'PENDENTE',
                valorPago: null,
                formaPagamento: null,
                dataPagamento: null,
                baixadoPorId: null,
                observacao: null
            }
        });

        await prisma.contaReceber.update({
            where: { id: conta.id },
            data: { status: 'ABERTO' }
        });

        // Auditoria
        await prisma.auditLog.create({
            data: {
                acao: 'REVERTER_QUITACAO',
                entidade: 'ContaReceber',
                entidadeId: conta.id,
                detalhes: `Quitação revertida por ${req.user.nome || req.user.login}. ${conta.parcelas.filter(p => p.status === 'PAGO').length} parcela(s) estornada(s).`,
                usuarioId: req.user.id,
                usuarioNome: req.user.nome || req.user.login || '-'
            }
        });

        res.json({ message: 'Quitação revertida com sucesso! Todas as parcelas voltaram para PENDENTE.' });
    } catch (error) {
        console.error('Erro ao reverter quitação:', error);
        res.status(500).json({ error: 'Erro ao reverter quitação.' });
    }
});

// ── ADMIN: Sincronizar contas a receber com pedidos (criar contas faltantes) ──
router.post('/admin/sincronizar', verificarAuth, async (req, res) => {
    try {
        const perms = req._perms || await getPerms(req.user.id);
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas admin pode sincronizar contas.' });
        }

        // Buscar todos os pedidos enviados que NÃO têm conta a receber
        const pedidosSemConta = await prisma.pedido.findMany({
            where: {
                statusEnvio: 'ENVIAR',
                contaReceber: null
            },
            include: {
                itens: true
            }
        });

        let criadas = 0;
        for (const pedido of pedidosSemConta) {
            // Calcular valor total do pedido
            const valorTotal = pedido.itens.reduce((sum, item) => {
                return sum + (Number(item.valor) * Number(item.quantidade));
            }, 0);

            // Calcular parcelas
            const numParcelas = pedido.qtdParcelas || 1;
            const intervalo = pedido.intervaloDias || 0;
            const baseDate = pedido.primeiroVencimento || pedido.dataVenda;
            const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

            const parcelasData = [];
            for (let i = 0; i < numParcelas; i++) {
                const vencimento = new Date(baseDate);
                vencimento.setDate(vencimento.getDate() + (i * intervalo));
                const val = i === numParcelas - 1
                    ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
                    : valorParcela;
                parcelasData.push({
                    numeroParcela: i + 1,
                    valor: val,
                    dataVencimento: vencimento
                });
            }

            // Criar conta a receber
            await prisma.contaReceber.create({
                data: {
                    pedidoId: pedido.id,
                    clienteId: pedido.clienteId,
                    origem: pedido.especial ? 'ESPECIAL' : 'FATURADO_CA',
                    valorTotal: Math.round(valorTotal * 100) / 100,
                    status: 'ABERTO',
                    parcelas: { create: parcelasData }
                }
            });
            criadas++;
        }

        res.json({
            message: `${criadas} contas a receber criadas com sucesso!`,
            criadasCount: criadas,
            totalPedidos: pedidosSemConta.length
        });
    } catch (error) {
        console.error('Erro ao sincronizar contas a receber:', error);
        res.status(500).json({ error: 'Erro ao sincronizar contas a receber.' });
    }
});

// ── POST /:id/sync-ca — Sincroniza baixas do Conta Azul para uma conta local ──
router.post('/:id/sync-ca', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const r = await contasReceberSyncService.sincronizarConta(req.params.id, {
            baixadoPorId: req.user.id,
            origem: 'MANUAL'
        });
        const partes = [];
        if (r.aplicadas > 0) partes.push(`${r.aplicadas} parcela(s) baixada(s)`);
        if (r.vencimentosAtualizados > 0) partes.push(`${r.vencimentosAtualizados} vencimento(s) atualizado(s)`);
        res.json({
            message: partes.length > 0 ? partes.join(' + ') + '.' : (r.mensagem || 'Nenhuma alteração necessária.'),
            ...r
        });
    } catch (error) {
        console.error('Erro ao sincronizar com CA:', error?.response?.data || error);
        res.status(400).json({ error: error.message || 'Erro ao sincronizar com Conta Azul.', detalhe: error?.response?.data });
    }
});

// ── POST /sync-ca/todas — Sincroniza todas as contas abertas (admin) ──
router.post('/sync-ca/todas', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const r = await contasReceberSyncService.sincronizarTodasAbertas();
        res.json({ message: `Sync concluído: ${r.totalParcelasBaixadas} parcela(s) baixadas em ${r.totalContasAtualizadas} conta(s).`, ...r });
    } catch (error) {
        console.error('Erro ao sincronizar todas com CA:', error);
        res.status(500).json({ error: 'Erro ao sincronizar com Conta Azul.' });
    }
});

module.exports = router;
