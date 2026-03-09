/**
 * ROTA ADMIN: Reset de Dados Transacionais
 * Limpa todos os dados de teste, mantendo apenas cadastros base.
 * PROTEGIDO: exige admin = true nas permissões.
 */
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');

// Middleware: apenas admin
router.use(verificarAuth);
router.use(async (req, res, next) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: req.user.id },
        select: { permissoes: true }
    });
    const perms = typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
    if (!perms.admin) return res.status(403).json({ error: 'Apenas administradores podem executar esta operação.' });
    next();
});

/**
 * DELETE /api/admin/reset-transacional
 * Apaga todos os dados transacionais em ordem correta (FKs).
 * Mantém: clientes, produtos, vendedores, veículos, configs, tabela_precos,
 *          contas_financeiras, diario_vendedor, manutencao_alertas.
 */
router.delete('/reset-transacional', async (req, res) => {
    const { confirmacao } = req.body;
    if (confirmacao !== 'CONFIRMO_RESET_TOTAL') {
        return res.status(400).json({
            error: 'Confirmação obrigatória. Envie { "confirmacao": "CONFIRMO_RESET_TOTAL" } no body.'
        });
    }

    try {
        const resultado = await prisma.$transaction(async (tx) => {
            // 1. Metas (filhas primeiro)
            const delMetaPromocoes = await tx.metaPromocao.deleteMany({});
            const delMetaProdutos = await tx.metaProduto.deleteMany({});
            const delMetas = await tx.metaMensalVendedor.deleteMany({});

            // 2. Insights de clientes
            const delInsights = await tx.clienteInsight.deleteMany({});

            // 3. Caixa (filhas primeiro)
            const delCaixaConferidas = await tx.caixaEntregaConferida.deleteMany({});
            const delCaixas = await tx.caixaDiario.deleteMany({});

            // 4. Tabelas filhas de Pedido
            const delDevolucoes = await tx.entregaItemDevolvido.deleteMany({});
            const delPagamentos = await tx.pedidoPagamentoReal.deleteMany({});
            const delPedidoItens = await tx.pedidoItem.deleteMany({});

            // 5. Atendimentos
            const delAtendimentos = await tx.atendimento.deleteMany({});

            // 6. Pedidos
            const delPedidos = await tx.pedido.deleteMany({});

            // 7. Embarques
            const delEmbarques = await tx.embarque.deleteMany({});

            // 8. Leads
            const delLeads = await tx.lead.deleteMany({});

            // 9. Despesas (abastecimentos, etc)
            const delDespesas = await tx.despesa.deleteMany({});

            // 10. Roteirizações
            const delRotas = await tx.roteirizacao.deleteMany({});

            // 11. Diário do vendedor
            const delDiario = await tx.diarioVendedor.deleteMany({});

            // 12. Alertas de manutenção
            const delAlertas = await tx.manutencaoAlerta.deleteMany({});

            // 13. Logs de sync
            const delSync = await tx.syncLog.deleteMany({});

            return {
                metaPromocoes: delMetaPromocoes.count,
                metaProdutos: delMetaProdutos.count,
                metas: delMetas.count,
                insights: delInsights.count,
                caixaConferidas: delCaixaConferidas.count,
                caixasDiarios: delCaixas.count,
                devolucoes: delDevolucoes.count,
                pagamentos: delPagamentos.count,
                pedidoItens: delPedidoItens.count,
                atendimentos: delAtendimentos.count,
                pedidos: delPedidos.count,
                embarques: delEmbarques.count,
                leads: delLeads.count,
                despesas: delDespesas.count,
                roteirizacoes: delRotas.count,
                diarioVendedor: delDiario.count,
                alertasManutencao: delAlertas.count,
                syncLogs: delSync.count,
            };
        }, {
            timeout: 60000 // 60s para operações grandes
        });

        console.log(`🗑️ RESET TRANSACIONAL executado por ${req.user.id}:`, resultado);

        res.json({
            ok: true,
            mensagem: '✅ Dados transacionais limpos com sucesso. Cadastros preservados.',
            detalhes: resultado
        });
    } catch (error) {
        console.error('Erro no reset transacional:', error);
        res.status(500).json({ error: 'Erro ao executar o reset: ' + error.message });
    }
});

module.exports = router;
