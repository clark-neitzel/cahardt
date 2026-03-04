const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const verificarAuth = require('../middlewares/authMiddleware');

// ── Helpers ──
const getPerms = async (userId) => {
    const vendedor = await prisma.vendedor.findUnique({
        where: { id: userId },
        select: { permissoes: true }
    });
    return typeof vendedor?.permissoes === 'string'
        ? JSON.parse(vendedor.permissoes)
        : (vendedor?.permissoes || {});
};

// ── Middleware: Acesso ao Caixa ──
const checkAcessoCaixa = async (req, res, next) => {
    try {
        const perms = await getPerms(req.user.id);
        if (perms.admin || perms.Pode_Acessar_Caixa || perms.Pode_Editar_Caixa) {
            req._perms = perms;
            return next();
        }
        return res.status(403).json({ error: 'Sem permissão para acessar Despesas.' });
    } catch (e) {
        return res.status(403).json({ error: 'Erro ao verificar permissão.' });
    }
};

router.use(verificarAuth);
router.use(checkAcessoCaixa);

// ── GET / — Listar despesas do dia ──
router.get('/', async (req, res) => {
    try {
        const { data, vendedorId } = req.query;
        if (!data) return res.status(400).json({ error: 'Parâmetro "data" obrigatório (YYYY-MM-DD).' });

        const targetVendedor = vendedorId || req.user.id;

        // Apenas admin/editor pode ver despesas de outros
        if (targetVendedor !== req.user.id && !req._perms.admin && !req._perms.Pode_Editar_Caixa) {
            return res.status(403).json({ error: 'Sem permissão para ver despesas de outro usuário.' });
        }

        const despesas = await prisma.despesa.findMany({
            where: { vendedorId: targetVendedor, dataReferencia: data },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'asc' }
        });

        res.json(despesas);
    } catch (error) {
        console.error('Erro ao listar despesas:', error);
        res.status(500).json({ error: 'Erro ao listar despesas.' });
    }
});

// ── POST / — Criar despesa ──
router.post('/', async (req, res) => {
    try {
        const { vendedorId, dataReferencia, categoria, descricao, valor, veiculoId, litros, kmNoAbastecimento, tipoManutencao } = req.body;

        if (!dataReferencia || !categoria || valor === undefined) {
            return res.status(400).json({ error: 'Campos obrigatórios: dataReferencia, categoria, valor.' });
        }

        const targetVendedor = vendedorId || req.user.id;

        const despesa = await prisma.despesa.create({
            data: {
                vendedorId: targetVendedor,
                dataReferencia,
                categoria,
                descricao: descricao || null,
                valor,
                veiculoId: categoria === 'COMBUSTIVEL' ? veiculoId : null,
                litros: categoria === 'COMBUSTIVEL' ? litros : null,
                kmNoAbastecimento: categoria === 'COMBUSTIVEL' ? kmNoAbastecimento : null,
                tipoManutencao: categoria === 'MANUTENCAO_VEICULO' ? tipoManutencao : null,
                criadoPor: req.user.id
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        res.status(201).json(despesa);
    } catch (error) {
        console.error('Erro ao criar despesa:', error);
        res.status(500).json({ error: 'Erro ao criar despesa.' });
    }
});

// ── PUT /:id — Editar despesa ──
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const despesa = await prisma.despesa.findUnique({ where: { id } });

        if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada.' });

        // Dono pode editar se caixa ABERTO, admin/editor sempre
        const isOwner = despesa.vendedorId === req.user.id;
        const isEditor = req._perms.admin || req._perms.Pode_Editar_Caixa;

        if (!isOwner && !isEditor) {
            return res.status(403).json({ error: 'Sem permissão para editar esta despesa.' });
        }

        if (isOwner && !isEditor) {
            // Verificar se caixa ainda está aberto
            const caixa = await prisma.caixaDiario.findUnique({
                where: { vendedorId_dataReferencia: { vendedorId: despesa.vendedorId, dataReferencia: despesa.dataReferencia } }
            });
            if (caixa && caixa.status !== 'ABERTO') {
                return res.status(400).json({ error: 'Caixa já fechado. Não é possível editar.' });
            }
        }

        const { categoria, descricao, valor, veiculoId, litros, kmNoAbastecimento, tipoManutencao } = req.body;

        const updated = await prisma.despesa.update({
            where: { id },
            data: {
                categoria: categoria || despesa.categoria,
                descricao: descricao !== undefined ? descricao : despesa.descricao,
                valor: valor !== undefined ? valor : despesa.valor,
                veiculoId: categoria === 'COMBUSTIVEL' ? veiculoId : null,
                litros: categoria === 'COMBUSTIVEL' ? litros : null,
                kmNoAbastecimento: categoria === 'COMBUSTIVEL' ? kmNoAbastecimento : null,
                tipoManutencao: categoria === 'MANUTENCAO_VEICULO' ? tipoManutencao : null
            },
            include: { veiculo: { select: { placa: true, modelo: true } } }
        });

        res.json(updated);
    } catch (error) {
        console.error('Erro ao editar despesa:', error);
        res.status(500).json({ error: 'Erro ao editar despesa.' });
    }
});

// ── DELETE /:id — Excluir despesa ──
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const despesa = await prisma.despesa.findUnique({ where: { id } });

        if (!despesa) return res.status(404).json({ error: 'Despesa não encontrada.' });

        const isOwner = despesa.vendedorId === req.user.id;
        const isEditor = req._perms.admin || req._perms.Pode_Editar_Caixa;

        if (!isOwner && !isEditor) {
            return res.status(403).json({ error: 'Sem permissão para excluir esta despesa.' });
        }

        if (isOwner && !isEditor) {
            const caixa = await prisma.caixaDiario.findUnique({
                where: { vendedorId_dataReferencia: { vendedorId: despesa.vendedorId, dataReferencia: despesa.dataReferencia } }
            });
            if (caixa && caixa.status !== 'ABERTO') {
                return res.status(400).json({ error: 'Caixa já fechado. Não é possível excluir.' });
            }
        }

        await prisma.despesa.delete({ where: { id } });
        res.json({ ok: true });
    } catch (error) {
        console.error('Erro ao excluir despesa:', error);
        res.status(500).json({ error: 'Erro ao excluir despesa.' });
    }
});

module.exports = router;
