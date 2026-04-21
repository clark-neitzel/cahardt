const prisma = require('../config/database');

const iaLogController = {
    listar: async (req, res) => {
        try {
            const {
                dataInicio,
                dataFim,
                clienteId,
                vendedorId,
                disparadoPor,
                usuarioId,
                sucesso,
                busca,
                page = 1,
                limit = 50,
            } = req.query;

            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
            const skip = (pageNum - 1) * limitNum;

            // Montar filtros de data — padrão: hoje
            const agora = new Date();
            const inicioDia = new Date(agora);
            inicioDia.setHours(0, 0, 0, 0);
            const fimDia = new Date(agora);
            fimDia.setHours(23, 59, 59, 999);

            const inicio = dataInicio ? new Date(dataInicio + 'T00:00:00') : inicioDia;
            const fim = dataFim ? new Date(dataFim + 'T23:59:59') : fimDia;

            const where = {
                criadoEm: { gte: inicio, lte: fim },
            };

            if (clienteId) where.clienteId = clienteId;
            if (vendedorId) where.vendedorId = vendedorId;
            if (disparadoPor) where.disparadoPor = disparadoPor;
            if (usuarioId) where.disparadoPorUsuarioId = usuarioId;
            if (sucesso === 'true') where.sucesso = true;
            if (sucesso === 'false') where.sucesso = false;

            if (busca) {
                where.cliente = {
                    OR: [
                        { Nome: { contains: busca, mode: 'insensitive' } },
                        { NomeFantasia: { contains: busca, mode: 'insensitive' } },
                    ]
                };
            }

            const [logs, total, aggSucesso, aggErro, aggTokens, aggDuracao] = await Promise.all([
                prisma.iaAnaliseLog.findMany({
                    where,
                    orderBy: { criadoEm: 'desc' },
                    skip,
                    take: limitNum,
                    select: {
                        id: true,
                        criadoEm: true,
                        clienteId: true,
                        cliente: { select: { Nome: true, NomeFantasia: true } },
                        vendedorId: true,
                        disparadoPor: true,
                        disparadoPorUsuarioId: true,
                        atendimentoId: true,
                        modelo: true,
                        promptEnviado: true,
                        dadosEntrada: true,
                        respostaIa: true,
                        tokensPrompt: true,
                        tokensResposta: true,
                        tokensTotal: true,
                        duracaoMs: true,
                        sucesso: true,
                        erroMsg: true,
                    }
                }),
                prisma.iaAnaliseLog.count({ where }),
                prisma.iaAnaliseLog.count({ where: { ...where, sucesso: true } }),
                prisma.iaAnaliseLog.count({ where: { ...where, sucesso: false } }),
                prisma.iaAnaliseLog.aggregate({ where, _sum: { tokensTotal: true } }),
                prisma.iaAnaliseLog.aggregate({ where: { ...where, sucesso: true }, _avg: { duracaoMs: true } }),
            ]);

            res.json({
                data: logs,
                total,
                totalPages: Math.ceil(total / limitNum),
                page: pageNum,
                resumo: {
                    total,
                    sucesso: aggSucesso,
                    erro: aggErro,
                    tokensTotal: aggTokens._sum.tokensTotal || 0,
                    duracaoMedia: aggDuracao._avg.duracaoMs ? Math.round(aggDuracao._avg.duracaoMs) : null,
                },
            });
        } catch (error) {
            console.error('[iaLogController.listar]', error);
            res.status(500).json({ error: 'Erro ao listar logs de análise da IA.' });
        }
    },
};

module.exports = iaLogController;
