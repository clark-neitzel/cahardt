/**
 * ROTA ADMIN: Reset de Dados Transacionais
 * Limpa dados de teste por categoria, mantendo cadastros base.
 * PROTEGIDO: exige Pode_Resetar_Dados ou admin nas permissões.
 */
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');

// Middleware: auth + permissão de reset
router.use(verificarAuth);
router.use(async (req, res, next) => {
    const perms = req.user?.permissoes || {};
    if (!perms.admin && !perms.Pode_Resetar_Dados) {
        return res.status(403).json({ error: 'Sem permissão para executar reset de dados.' });
    }
    next();
});

// Definição dos grupos de reset
const RESET_GROUPS = {
    pedidos: {
        label: 'Pedidos (itens, pagamentos, devoluções)',
        run: async (tx) => {
            const r1 = await tx.entregaItemDevolvido.deleteMany({});
            const r2 = await tx.pedidoPagamentoReal.deleteMany({});
            const r3 = await tx.pedidoItem.deleteMany({});
            const r4 = await tx.pedido.deleteMany({});
            return { devolucoes: r1.count, pagamentos: r2.count, itens: r3.count, pedidos: r4.count };
        }
    },
    embarques: {
        label: 'Embarques',
        run: async (tx) => {
            const r = await tx.embarque.deleteMany({});
            return { embarques: r.count };
        }
    },
    atendimentos: {
        label: 'Atendimentos / Visitas',
        run: async (tx) => {
            const r = await tx.atendimento.deleteMany({});
            return { atendimentos: r.count };
        }
    },
    leads: {
        label: 'Leads',
        run: async (tx) => {
            const r = await tx.lead.deleteMany({});
            return { leads: r.count };
        }
    },
    despesas: {
        label: 'Despesas e Abastecimentos',
        run: async (tx) => {
            const r = await tx.despesa.deleteMany({});
            return { despesas: r.count };
        }
    },
    caixa: {
        label: 'Caixa Diário',
        run: async (tx) => {
            const r1 = await tx.caixaEntregaConferida.deleteMany({});
            const r2 = await tx.caixaDiario.deleteMany({});
            return { conferidas: r1.count, caixas: r2.count };
        }
    },
    metas: {
        label: 'Metas de Vendas',
        run: async (tx) => {
            const r1 = await tx.metaPromocao.deleteMany({});
            const r2 = await tx.metaProduto.deleteMany({});
            const r3 = await tx.metaMensalVendedor.deleteMany({});
            return { promocoes: r1.count, produtos: r2.count, metas: r3.count };
        }
    },
    insights: {
        label: 'Insights de Clientes',
        run: async (tx) => {
            const r = await tx.clienteInsight.deleteMany({});
            return { insights: r.count };
        }
    },
    roteirizacoes: {
        label: 'Roteirizações',
        run: async (tx) => {
            const r = await tx.roteirizacao.deleteMany({});
            return { roteirizacoes: r.count };
        }
    },
    diario: {
        label: 'Diário do Vendedor',
        run: async (tx) => {
            const r = await tx.diarioVendedor.deleteMany({});
            return { diario: r.count };
        }
    },
    manutencao: {
        label: 'Alertas de Manutenção',
        run: async (tx) => {
            const r = await tx.manutencaoAlerta.deleteMany({});
            return { alertas: r.count };
        }
    },
    sync: {
        label: 'Logs de Sincronização',
        run: async (tx) => {
            const r = await tx.syncLog.deleteMany({});
            return { logs: r.count };
        }
    }
};

/**
 * GET /api/admin/reset-grupos
 * Retorna os grupos disponíveis para reset
 */
router.get('/reset-grupos', (req, res) => {
    const grupos = Object.entries(RESET_GROUPS).map(([key, val]) => ({
        id: key,
        label: val.label
    }));
    res.json(grupos);
});

/**
 * DELETE /api/admin/reset/:grupo
 * Limpa dados de um grupo específico
 */
router.delete('/reset/:grupo', async (req, res) => {
    const { grupo } = req.params;
    const { confirmacao } = req.body;

    if (confirmacao !== 'CONFIRMO_RESET') {
        return res.status(400).json({ error: 'Envie { "confirmacao": "CONFIRMO_RESET" } no body.' });
    }

    const resetGroup = RESET_GROUPS[grupo];
    if (!resetGroup) {
        return res.status(404).json({ error: `Grupo "${grupo}" não existe. Use GET /api/admin/reset-grupos para ver os disponíveis.` });
    }

    try {
        const resultado = await prisma.$transaction(async (tx) => {
            return resetGroup.run(tx);
        }, { timeout: 30000 });

        console.log(`🗑️ RESET [${grupo}] executado por ${req.user.id}:`, resultado);
        res.json({ ok: true, grupo, label: resetGroup.label, detalhes: resultado });
    } catch (error) {
        console.error(`Erro no reset [${grupo}]:`, error);
        res.status(500).json({ error: 'Erro ao executar reset: ' + error.message });
    }
});

/**
 * DELETE /api/admin/reset-transacional
 * Limpa TODOS os dados transacionais de uma vez
 */
router.delete('/reset-transacional', async (req, res) => {
    const { confirmacao } = req.body;
    if (confirmacao !== 'CONFIRMO_RESET_TOTAL') {
        return res.status(400).json({ error: 'Envie { "confirmacao": "CONFIRMO_RESET_TOTAL" } no body.' });
    }

    try {
        const resultado = await prisma.$transaction(async (tx) => {
            const detalhes = {};
            // Ordem respeitando FKs: pedidos requerem embarques vazios depois
            const ordem = ['metas', 'insights', 'caixa', 'pedidos', 'embarques', 'atendimentos', 'leads', 'despesas', 'roteirizacoes', 'diario', 'manutencao', 'sync'];
            for (const grupo of ordem) {
                detalhes[grupo] = await RESET_GROUPS[grupo].run(tx);
            }
            return detalhes;
        }, { timeout: 60000 });

        console.log(`🗑️ RESET TOTAL executado por ${req.user.id}:`, resultado);
        res.json({ ok: true, mensagem: 'Todos os dados transacionais foram limpos.', detalhes: resultado });
    } catch (error) {
        console.error('Erro no reset total:', error);
        res.status(500).json({ error: 'Erro ao executar reset: ' + error.message });
    }
});

module.exports = router;
