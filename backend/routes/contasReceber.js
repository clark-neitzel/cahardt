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
        const { status, clienteId, vencimentoDe, vencimentoAte, origem, busca, ordenarPor } = req.query;

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
                pedido: {
                    select: {
                        id: true, numero: true, especial: true, nomeCondicaoPagamento: true,
                        statusEntrega: true, devolucaoFinalizada: true,
                        itensDevolvidos: { select: { valorBaseItem: true, quantidade: true } },
                        devolucoes: {
                            where: { status: 'ATIVA' },
                            select: { valorTotal: true, escopo: true, dataDevolucao: true, pdfBoletoUrl: true }
                        }
                    }
                },
                parcelas: {
                    orderBy: { numeroParcela: 'asc' }
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
                pedidoEspecial: c.pedido?.especial || false,
                condicaoPagamento: c.pedido?.nomeCondicaoPagamento || null,
                statusEntrega: c.pedido?.statusEntrega || null,
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

// ── POST /baixa-lote — Dar baixa em várias parcelas de uma vez ──
router.post('/baixa-lote', verificarAuth, checkBaixa, async (req, res) => {
    try {
        const { parcelaIds, formaPagamento, dataPagamento, observacao } = req.body;

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
            // 1. Atualizar todas as parcelas
            for (const parcela of elegiveis) {
                await tx.parcela.update({
                    where: { id: parcela.id },
                    data: {
                        status: 'PAGO',
                        valorPago: parcela.valor,
                        formaPagamento: formaPagamento || null,
                        dataPagamento: dataPgto,
                        baixadoPorId: req.user.id,
                        observacao: observacao || null
                    }
                });
            }

            // 2. Recalcular status de cada conta afetada
            const contaIds = [...new Set(elegiveis.map(p => p.contaReceberId))];
            for (const contaId of contaIds) {
                const todasParcelas = await tx.parcela.findMany({
                    where: { contaReceberId: contaId }
                });

                const pagas = todasParcelas.filter(p => p.status === 'PAGO').length;
                const total = todasParcelas.length;
                const canceladas = todasParcelas.filter(p => p.status === 'CANCELADO').length;

                let novoStatus;
                if (pagas + canceladas >= total) novoStatus = 'QUITADO';
                else if (pagas > 0) novoStatus = 'PARCIAL';
                else novoStatus = 'ABERTO';

                await tx.contaReceber.update({
                    where: { id: contaId },
                    data: { status: novoStatus }
                });
            }

            // 3. Registrar no histórico
            for (const parcela of elegiveis) {
                const conta = parcela.contaReceber;
                const formaPg = formaPagamento || 'N/I';
                await tx.atendimento.create({
                    data: {
                        tipo: 'FINANCEIRO',
                        observacao: `Baixa em lote - parcela ${parcela.numeroParcela} - R$ ${Number(parcela.valor).toFixed(2)} (${formaPg})${observacao ? ` | ${observacao}` : ''}`,
                        clienteId: conta.clienteId,
                        idVendedor: req.user.id,
                        pedidoId: conta.pedidoId || null
                    }
                });
            }
        });

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

        // Registrar no histórico do cliente (Atendimento)
        const conta = parcela.contaReceber;
        const valorPagoFinal = valorPago || Number(parcela.valor);
        const formaPg = formaPagamento || 'N/I';
        await prisma.atendimento.create({
            data: {
                tipo: 'FINANCEIRO',
                observacao: `Baixa parcela ${parcela.numeroParcela}/${total} - R$ ${Number(valorPagoFinal).toFixed(2)} (${formaPg})${observacao ? ` | ${observacao}` : ''}`,
                clienteId: conta.clienteId,
                idVendedor: req.user.id,
                pedidoId: conta.pedidoId || null
            }
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

module.exports = router;
