const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { verificarAuth } = require('../middlewares/auth');

// GET: Listar formas (Se entregador, só ativas)
router.get('/', verificarAuth, async (req, res) => {
    try {
        const { permissoes } = req.user;
        const isAdmin = permissoes && (permissoes.master || permissoes.Pode_Ajustar_Entregas || permissoes.Pode_Ver_Todas_Entregas);

        const query = { orderBy: { nome: 'asc' } };

        if (!isAdmin) {
            query.where = { ativo: true };
        }

        const formas = await prisma.formaPagamentoEntrega.findMany(query);
        res.json(formas);
    } catch (error) {
        console.error('Erro ao listar Formas de Pagamento de Entrega:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// POST: Criar nova forma (Somente ADMIN)
router.post('/', verificarAuth, async (req, res) => {
    try {
        const { permissoes } = req.user;
        const isAdmin = permissoes && (permissoes.master || permissoes.Pode_Ajustar_Entregas);

        if (!isAdmin) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        const { nome, permiteVendedorResponsavel, permiteEscritorioResponsavel, ativo } = req.body;

        if (!nome) {
            return res.status(400).json({ error: 'Nome é obrigatório.' });
        }

        const novaForma = await prisma.formaPagamentoEntrega.create({
            data: {
                nome,
                permiteVendedorResponsavel: Boolean(permiteVendedorResponsavel),
                permiteEscritorioResponsavel: Boolean(permiteEscritorioResponsavel),
                ativo: ativo !== undefined ? Boolean(ativo) : true
            }
        });

        res.status(201).json(novaForma);
    } catch (error) {
        console.error('Erro ao criar Forma de Pagamento de Entrega:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// PUT: Atualizar forma (Somente ADMIN)
router.put('/:id', verificarAuth, async (req, res) => {
    try {
        const { permissoes } = req.user;
        const isAdmin = permissoes && (permissoes.master || permissoes.Pode_Ajustar_Entregas);

        if (!isAdmin) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        const { id } = req.params;
        const { nome, permiteVendedorResponsavel, permiteEscritorioResponsavel, ativo } = req.body;

        const updated = await prisma.formaPagamentoEntrega.update({
            where: { id },
            data: {
                ...(nome ? { nome } : {}),
                ...(permiteVendedorResponsavel !== undefined ? { permiteVendedorResponsavel: Boolean(permiteVendedorResponsavel) } : {}),
                ...(permiteEscritorioResponsavel !== undefined ? { permiteEscritorioResponsavel: Boolean(permiteEscritorioResponsavel) } : {}),
                ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {})
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Erro ao atualizar Forma de Pagamento de Entrega:', error);
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

// DELETE: Excluir forma (Somente ADMIN)
router.delete('/:id', verificarAuth, async (req, res) => {
    try {
        const { permissoes } = req.user;
        const isAdmin = permissoes && (permissoes.master || permissoes.Pode_Ajustar_Entregas);

        if (!isAdmin) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        const { id } = req.params;

        await prisma.formaPagamentoEntrega.delete({
            where: { id }
        });

        res.status(204).send();
    } catch (error) {
        console.error('Erro ao deletar Forma de Pagamento de Entrega:', error);
        if (error.code === 'P2003') { // Foreign key constraint failed
            return res.status(400).json({ error: 'Esta forma já possui transações atreladas. Recomendamos apenas desativá-la.' });
        }
        res.status(500).json({ error: 'Erro ao processar a requisição.' });
    }
});

module.exports = router;
