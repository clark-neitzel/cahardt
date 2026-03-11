const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');

router.get('/', verificarAuth, async (req, res) => {
    try {
        // Verifica permissões - Apenas admins ou quem pode editar caixa
        const perms = req._perms || { admin: false }; // Isso deve ser validado via middleware ou buscar no BD
        // Exemplo seguro: Buscando permissão real (se o authMiddleware não fez)
        const user = await prisma.vendedor.findUnique({
            where: { id: req.user.id }
        });

        // Parse de Permissões
        const permissoesObj = user?.permissoes
            ? (typeof user.permissoes === 'string' ? JSON.parse(user.permissoes) : user.permissoes)
            : {};

        const isSuperAdmin = permissoesObj?.admin ||
            permissoesObj?.Pode_Editar_Caixa ||
            user?.email === 'clarksonneitzel@gmail.com' ||
            (user?.login && user.login.toLowerCase().includes('clark'));

        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        // 1. Caixas Pendentes de Conferência
        const caixasPendentes = await prisma.caixaDiario.count({
            where: {
                status: {
                    in: ['CONFERIDO', 'ABERTO'] // ABERTO pode ser um problema se de dias anteriores, mas vamos focar em CONFERIDO (enviado pelo motorista) e ABERTO antigos
                }
            }
        });

        const caixasAConferir = await prisma.caixaDiario.count({ where: { status: 'CONFERIDO' } });

        // 2. Pedidos com Erro de Sincronização
        const pedidosComErro = await prisma.pedido.count({
            where: { statusEnvio: 'ERRO' }
        });

        // 3. Pedidos Especiais (Sem Nota) pendentes
        const pedidosEspeciais = await prisma.pedido.count({
            where: {
                especial: true,
                statusEnvio: { not: 'CONCLUIDO' }
            }
        });

        // 4. Vendas de Hoje
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const pedidosHoje = await prisma.pedido.findMany({
            where: {
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: { itens: true }
        });

        const vendasHojeNum = pedidosHoje.reduce((total, p) => {
            return total + p.itens.reduce((sum, item) => sum + (Number(item.valor) * Number(item.quantidade)), 0);
        }, 0);

        // 5. Entregas Realizadas Hoje (Valores Recebidos)
        const entregasHoje = await prisma.pedido.findMany({
            where: {
                dataEntrega: {
                    gte: startOfDay,
                    lte: endOfDay
                },
                statusEntrega: { not: 'PENDENTE' }
            },
            include: { pagamentosReais: true, itens: true, itensDevolvidos: true }
        });

        const valorEntregueHoje = entregasHoje.reduce((total, p) => {
            const sumPags = p.pagamentosReais.reduce((s, pag) => s + Number(pag.valor), 0);
            return total + sumPags;
        }, 0);


        res.json({
            caixasAConferir,
            pedidosComErro,
            pedidosEspeciais,
            vendasHojeNum,
            valorEntregueHoje
        });

    } catch (error) {
        console.error('Erro no admin dashboard:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard.' });
    }
});

module.exports = router;
