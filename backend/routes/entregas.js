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

// Middleware interno: Permissão Entregador (ou quem pode ver todas entregas)
const checkAcessoEntregador = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Executar_Entregas || perms.Pode_Ver_Todas_Entregas) {
            req._perms = perms; // Salva para uso no handler
            return next();
        }
        return res.status(403).json({ error: 'Você não tem permissão de Motorista/Entregador.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Middleware interno: Permissão Auditoria/Escritório
const checkAuditor = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Ver_Todas_Entregas || perms.Pode_Ajustar_Entregas) return next();
        return res.status(403).json({ error: 'Acesso negado. Requer privilégio de Auditoria Logística.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// Middleware interno: Permissão Correção Financeira
const checkAjustador = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Ajustar_Entregas) return next();
        return res.status(403).json({ error: 'Acesso negado. Ação restritiva ao Financeiro.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

// ==========================================
// 1. MOTORISTA: MINHAS ATIVAS (PENDENTES)
// ==========================================
router.get('/pendentes', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const perms = req._perms || {};
        const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas;

        const where = { statusEntrega: 'PENDENTE', embarqueId: { not: null } };
        if (!verTodas) where.embarque = { responsavelId: req.user.id };

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, Ponto_GPS: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                vendedor: { select: { id: true, nome: true } },
                usuarioLancamento: { select: { id: true, nome: true } },
                itens: { include: { produto: { select: { id: true, nome: true, unidade: true } } } }
            },
            orderBy: { cliente: { NomeFantasia: 'asc' } }
        });

        // Enriquece com o nome legível da condição de pagamento (join manual sem FK)
        // O pedido salva opcaoCondicaoPagamento = opcaoCondicao da TabelaPreco (não idCondicao!)
        const condicoesCodigos = [...new Set(entregas.map(e => e.opcaoCondicaoPagamento).filter(Boolean))];
        let mapaCondicoes = {};
        if (condicoesCodigos.length > 0) {
            const tabelas = await prisma.tabelaPreco.findMany({
                where: { opcaoCondicao: { in: condicoesCodigos } },
                select: { opcaoCondicao: true, nomeCondicao: true, idCondicao: true }
            });
            mapaCondicoes = Object.fromEntries(tabelas.map(t => [t.opcaoCondicao, { nome: t.nomeCondicao, idCondicao: t.idCondicao }]));
        }

        res.json(entregas.map(e => ({
            ...e,
            nomeCondicaoPagamento: mapaCondicoes[e.opcaoCondicaoPagamento]?.nome || e.opcaoCondicaoPagamento || null,
            idCondicaoResolvido: mapaCondicoes[e.opcaoCondicaoPagamento]?.idCondicao || null
        })));
    } catch (error) {
        console.error('Erro ao listar entregas pendentes:', error);
        res.status(500).json({ error: 'Erro ao buscar roteiro logístico.' });
    }
});

// ==========================================
// 2. MOTORISTA: MEU HISTÓRICO (JÁ CONCLUÍDAS)
// ==========================================
router.get('/concluidas', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const perms = req._perms || {};
        const verTodas = perms.admin || perms.Pode_Ver_Todas_Entregas;

        const where = { statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'] } };
        if (!verTodas) where.embarque = { responsavelId: req.user.id };

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                cliente: { select: { NomeFantasia: true, Nome: true } },
                embarque: { select: { numero: true, responsavel: { select: { id: true, nome: true } } } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { nome: true } } } }
            },
            orderBy: { dataEntrega: 'desc' },
            take: 50
        });

        res.json(entregas);
    } catch (error) {
        console.error('Erro ao listar entregas finalizadas:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico logístico.' });
    }
});

// ==========================================
// 3. MOTORISTA: EXECUTAR A ENTREGA / RECEBER
// ==========================================
router.post('/:id/concluir', verificarAuth, checkAcessoEntregador, async (req, res) => {
    try {
        const { id } = req.params;
        const { statusEntrega, gpsEntrega, divergenciaPagamento, pagamentos, itensDevolvidos } = req.body;

        if (!['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'].includes(statusEntrega)) {
            return res.status(400).json({ error: 'Status de Entrega inválido.' });
        }

        const pedido = await prisma.pedido.findUnique({
            where: { id },
            include: { embarque: true, itens: true }
        });

        if (!pedido) return res.status(404).json({ error: 'Pedido não localizado.' });
        if (pedido.statusEntrega !== 'PENDENTE') return res.status(400).json({ error: `Este pedido já foi finalizado anteriormente como ${pedido.statusEntrega}.` });
        const permsUser = await getPerms(req.user.id);
        if (pedido.embarque.responsavelId !== req.user.id && !permsUser.admin) {
            return res.status(403).json({ error: 'Este pedido pertence à carga de outro motorista.' });
        }

        // Validação Matemática Financeira! (Se o motorista não devolveu tudo, tem que pagar o resto).
        let valorDevolvidoBruto = 0;
        const operacoesItem = [];

        if (statusEntrega === 'ENTREGUE_PARCIAL' && itensDevolvidos && itensDevolvidos.length > 0) {
            for (const item of itensDevolvidos) {
                valorDevolvidoBruto += (Number(item.quantidade) * Number(item.valorBaseItem));
                operacoesItem.push({
                    produtoId: item.produtoId,
                    quantidade: item.quantidade,
                    valorBaseItem: item.valorBaseItem
                });
            }
        }

        let valorSaldoDevedor = 0;
        if (statusEntrega === 'DEVOLVIDO') {
            // Conta morre
            valorSaldoDevedor = 0;
        } else {
            // Calcula total bruto da venda do pedido
            const totalBruto = pedido.itens.reduce((acc, i) => acc + (Number(i.valor) * Number(i.quantidade)), 0);
            valorSaldoDevedor = Number((totalBruto - valorDevolvidoBruto).toFixed(2));
        }

        // Se há saldo a pagar, as linhas de pagamento (Dinheiro, Pix, Dívida Escritório, etc) do array de `pagamentos` devem somar o valor líquido.
        let somaRecebida = 0;
        const operacoesPgto = [];

        if (valorSaldoDevedor > 0) {
            if (!pagamentos || !pagamentos.length) {
                return res.status(400).json({ error: `Falta registrar R$ ${valorSaldoDevedor.toFixed(2)} em pagamentos para esta entrega.` });
            }
            for (const pgto of pagamentos) {
                somaRecebida += Number(pgto.valor);
                operacoesPgto.push({
                    formaPagamentoEntregaId: pgto.formaPagamentoEntregaId,
                    formaPagamentoNome: pgto.formaPagamentoNome,
                    valor: Number(pgto.valor),
                    vendedorResponsavelId: pgto.vendedorResponsavelId || null,
                    escritorioResponsavel: pgto.escritorioResponsavel || false
                });
            }

            // Tolerância de centavos
            if (Math.abs(somaRecebida - valorSaldoDevedor) > 0.05) {
                return res.status(400).json({
                    error: `A conta não fecha: Saldo do Pedido (R$ ${valorSaldoDevedor.toFixed(2)}) e Pagamentos Apontados (R$ ${somaRecebida.toFixed(2)}).`
                });
            }
        }

        // A transação atômica do Prisma vai gravar tudo junto: 
        // 1. Atualiza status do Pedido 
        // 2. Grava extratos recebidos (se houver) 
        // 3. Grava log de itens devolvidos (se houver parcial)
        await prisma.$transaction(async (tx) => {
            await tx.pedido.update({
                where: { id },
                data: {
                    statusEntrega,
                    gpsEntrega: gpsEntrega || null,
                    divergenciaPagamento: divergenciaPagamento || false, // Quando o vendedor previu A Prazo mas o cara pagou PIX na hora.
                    dataEntrega: new Date()
                }
            });

            if (operacoesPgto.length > 0) {
                await tx.pedidoPagamentoReal.createMany({
                    data: operacoesPgto.map(op => ({ ...op, pedidoId: id }))
                });
            }

            if (operacoesItem.length > 0) {
                await tx.entregaItemDevolvido.createMany({
                    data: operacoesItem.map(op => ({ ...op, pedidoId: id }))
                });
            }
        });

        res.json({ message: 'Entrega Finalizada e Registrada com Sucesso!' });
    } catch (error) {
        console.error('Erro na submissão de baixa logística:', error);
        res.status(500).json({ error: 'Erro crítico ao processar o fechamento de caixa do motorista.' });
    }
});

// ==========================================
// 4. ADMIN: LISTAGEM GLOBAL AUDITORIA
// ==========================================
router.get('/auditoria', verificarAuth, checkAuditor, async (req, res) => {
    try {
        const { embarqueId, divergente } = req.query;
        const where = { statusEntrega: { not: 'PENDENTE' } }; // Auditamos o que já foi finalizado

        if (embarqueId) where.embarqueId = embarqueId;
        if (divergente === 'true') where.divergenciaPagamento = true;

        const entregas = await prisma.pedido.findMany({
            where,
            include: {
                embarque: { select: { numero: true, responsavel: { select: { nome: true } } } },
                cliente: { select: { NomeFantasia: true, Nome: true } },
                pagamentosReais: true,
                itensDevolvidos: { include: { produto: { select: { nome: true } } } }
            },
            orderBy: { dataEntrega: 'desc' },
            take: 100
        });

        res.json(entregas);
    } catch (error) {
        console.error('Erro ao listar auditoria de entregas:', error);
        res.status(500).json({ error: 'Erro interno na Auditoria.' });
    }
});

// ==========================================
// 5. ADMIN FINANCEIRO: ESTORNO LOGÍSTICO (UNDO)
// ==========================================
router.delete('/:id/estorno', verificarAuth, checkAjustador, async (req, res) => {
    try {
        const { id } = req.params;

        const pedido = await prisma.pedido.findUnique({ where: { id } });
        if (!pedido) return res.status(404).json({ error: 'Pedido inexistente.' });

        // Transação de Desfazimento (Undo)
        await prisma.$transaction(async (tx) => {
            // Apaga rastros de devoluções físicas
            await tx.entregaItemDevolvido.deleteMany({ where: { pedidoId: id } });
            // Apaga extrato de pagamentos de guichê
            await tx.pedidoPagamentoReal.deleteMany({ where: { pedidoId: id } });

            // Reverte Pedido a Estágio Neutro PENDENTE no Caminhão daquela Carga
            await tx.pedido.update({
                where: { id },
                data: {
                    statusEntrega: 'PENDENTE',
                    gpsEntrega: null,
                    divergenciaPagamento: false,
                    dataEntrega: null
                }
            });
        });

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao estornar check-in logístico:', error);
        res.status(500).json({ error: 'Erro de estorno crítico.' });
    }
});

module.exports = router;
