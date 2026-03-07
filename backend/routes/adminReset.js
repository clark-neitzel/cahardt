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
            // 1. Tabelas filhas de Pedido (cascade, mas garantindo)
            const delPagamentos = await tx.pedidoPagamentoReal.deleteMany({});
            const delDevolucoes = await tx.entregaItemDevolvido.deleteMany({});

            // 2. Atendimentos (referencia leads e clientes)
            const delAtendimentos = await tx.atendimento.deleteMany({});

            // 3. Pedidos (desvincula embarque antes, depois deleta)
            const delPedidos = await tx.pedido.deleteMany({});

            // 4. Embarques (agora sem pedidos vinculados)
            const delEmbarques = await tx.embarque.deleteMany({});

            // 5. Leads
            const delLeads = await tx.lead.deleteMany({});

            // 6. Despesas (combustível, manutenção, etc)
            const delDespesas = await tx.despesa.deleteMany({});

            // 7. Caixa Diário
            const delCaixas = await tx.caixaDiario.deleteMany({});

            return {
                pagamentos: delPagamentos.count,
                devolucoes: delDevolucoes.count,
                atendimentos: delAtendimentos.count,
                pedidos: delPedidos.count,
                embarques: delEmbarques.count,
                leads: delLeads.count,
                despesas: delDespesas.count,
                caixasDiarios: delCaixas.count,
            };
        }, {
            timeout: 30000 // 30s para operações grandes
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
