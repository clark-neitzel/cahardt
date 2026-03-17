const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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

// ── GET / — Listar contas a receber com filtros ──
router.get('/', verificarAuth, checkAcesso, async (req, res) => {
    try {
        const { status, clienteId, vencimentoDe, vencimentoAte, origem, busca } = req.query;

        const where = {};
        if (status) where.status = status;
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

        // Filtro por período de vencimento (filtra contas que TÊM parcelas no período)
        let parcelaWhere = undefined;
        if (vencimentoDe || vencimentoAte) {
            parcelaWhere = {};
            if (vencimentoDe) parcelaWhere.gte = new Date(vencimentoDe + 'T00:00:00.000Z');
            if (vencimentoAte) parcelaWhere.lte = new Date(vencimentoAte + 'T23:59:59.999Z');

            where.parcelas = {
                some: { dataVencimento: parcelaWhere }
            };
        }

        const contas = await prisma.contaReceber.findMany({
            where,
            include: {
                cliente: { select: { UUID: true, NomeFantasia: true, Nome: true } },
                pedido: { select: { id: true, numero: true, especial: true, nomeCondicaoPagamento: true } },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
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
                }
                if (p.status === 'PAGO' && p.dataPagamento) {
                    const pgto = new Date(p.dataPagamento);
                    if (pgto >= inicioMes && pgto <= fimMes) {
                        totalQuitadasMes += Number(p.valorPago || p.valor);
                    }
                }
            });
        });

        // Formatar resposta
        const contasFormatadas = contas.map(c => {
            const parcelasPagas = c.parcelas.filter(p => p.status === 'PAGO').length;
            const proximaVencimento = c.parcelas
                .filter(p => p.status === 'PENDENTE' || p.status === 'VENCIDO')
                .sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento))[0];

            return {
                id: c.id,
                clienteNome: c.cliente?.NomeFantasia || c.cliente?.Nome || '-',
                clienteId: c.clienteId,
                pedidoNumero: c.pedido?.numero || null,
                pedidoEspecial: c.pedido?.especial || false,
                condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
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
                    formaPagamento: p.formaPagamento,
                    status: p.status,
                    observacao: p.observacao
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

// ── POST /:parcelaId/baixa — Dar baixa em parcela ──
router.post('/:parcelaId/baixa', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId } = req.params;
        const { valorPago, formaPagamento, dataPagamento, observacao } = req.body;

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status === 'PAGO') return res.status(400).json({ error: 'Parcela já está paga.' });
        if (parcela.status === 'CANCELADO') return res.status(400).json({ error: 'Parcela cancelada.' });

        // Atualizar parcela
        await prisma.parcela.update({
            where: { id: parcelaId },
            data: {
                status: 'PAGO',
                valorPago: valorPago || parcela.valor,
                formaPagamento: formaPagamento || null,
                dataPagamento: dataPagamento ? new Date(dataPagamento) : new Date(),
                baixadoPorId: req.user.id,
                observacao: observacao || null
            }
        });

        // Recalcular status da conta
        const todasParcelas = await prisma.parcela.findMany({
            where: { contaReceberId: parcela.contaReceberId }
        });

        const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
        const total = todasParcelas.length;
        const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;

        let novoStatus;
        if (pagas + canceladas >= total) novoStatus = 'QUITADO';
        else if (pagas > 0) novoStatus = 'PARCIAL';
        else novoStatus = 'ABERTO';

        await prisma.contaReceber.update({
            where: { id: parcela.contaReceberId },
            data: { status: novoStatus }
        });

        res.json({ message: 'Baixa realizada com sucesso!', novoStatus });
    } catch (error) {
        console.error('Erro ao dar baixa:', error);
        res.status(500).json({ error: 'Erro ao dar baixa na parcela.' });
    }
});

// ── DELETE /:parcelaId/baixa — Estornar baixa ──
router.delete('/:parcelaId/baixa', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaId } = req.params;

        const parcela = await prisma.parcela.findUnique({
            where: { id: parcelaId },
            include: { contaReceber: true }
        });

        if (!parcela) return res.status(404).json({ error: 'Parcela não encontrada.' });
        if (parcela.status !== 'PAGO') return res.status(400).json({ error: 'Parcela não está paga.' });

        await prisma.parcela.update({
            where: { id: parcelaId },
            data: {
                status: 'PENDENTE',
                valorPago: null,
                formaPagamento: null,
                dataPagamento: null,
                baixadoPorId: null,
                observacao: null
            }
        });

        // Recalcular status da conta
        const todasParcelas = await prisma.parcela.findMany({
            where: { contaReceberId: parcela.contaReceberId }
        });

        const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
        const novoStatus = pagas > 0 ? 'PARCIAL' : 'ABERTO';

        await prisma.contaReceber.update({
            where: { id: parcela.contaReceberId },
            data: { status: novoStatus }
        });

        res.json({ message: 'Baixa estornada com sucesso!', novoStatus });
    } catch (error) {
        console.error('Erro ao estornar baixa:', error);
        res.status(500).json({ error: 'Erro ao estornar baixa.' });
    }
});

// ── PATCH /:id/cancelar — Cancelar conta ──
router.patch('/:id/cancelar', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const conta = await prisma.contaReceber.findUnique({
            where: { id: req.params.id }
        });

        if (!conta) return res.status(404).json({ error: 'Conta não encontrada.' });
        if (conta.status === 'QUITADO') return res.status(400).json({ error: 'Conta já quitada, não pode cancelar.' });

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

module.exports = router;
