const express = require('express');
const router = express.Router();
const veiculoController = require('../controllers/veiculoController');
const authMiddleware = require('../middlewares/authMiddleware');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Rotas públicas (para vendedores listarem ao iniciar o dia)
router.get('/', authMiddleware, veiculoController.listarAtivos);

// Alertas pendentes de manutenção (deve vir antes de /:id)
router.get('/alertas-pendentes', authMiddleware, async (req, res) => {
    try {
        const alertas = await prisma.manutencaoAlerta.findMany({
            where: { concluido: false },
            include: { veiculo: { select: { placa: true, modelo: true } } },
            orderBy: { createdAt: 'desc' }
        });

        // Buscar último km de cada veículo (do DiarioVendedor mais recente)
        const veiculoIds = [...new Set(alertas.map(a => a.veiculoId))];
        const ultimosKm = {};
        for (const vid of veiculoIds) {
            const ultimo = await prisma.diarioVendedor.findFirst({
                where: { veiculoId: vid, kmFinal: { not: null } },
                orderBy: { dataReferencia: 'desc' },
                select: { kmFinal: true }
            });
            if (ultimo) ultimosKm[vid] = ultimo.kmFinal;
        }

        const resultado = alertas.map(a => ({
            ...a,
            kmAtual: ultimosKm[a.veiculoId] || null,
            vencido: (a.kmAlerta && ultimosKm[a.veiculoId] && ultimosKm[a.veiculoId] >= a.kmAlerta) ||
                (a.dataAlerta && new Date(a.dataAlerta) <= new Date())
        }));

        res.json(resultado);
    } catch (error) {
        console.error('Erro ao buscar alertas:', error);
        res.status(500).json({ error: 'Erro ao buscar alertas de manutenção.' });
    }
});

router.get('/:id/ultimo-km', authMiddleware, veiculoController.ultimoKmFinal);
router.get('/:id/ultimo-km-abastecimento', authMiddleware, async (req, res) => {
    try {
        const veiculoService = require('../services/veiculoService');
        const dado = await veiculoService.ultimoKmAbastecimento(req.params.id);
        res.json(dado || null);
    } catch (error) {
        console.error('Erro ao buscar último KM abastecimento:', error);
        res.status(500).json({ error: 'Erro ao buscar último KM.' });
    }
});
router.get('/:id/ficha', authMiddleware, veiculoController.obterFicha);
router.get('/:id', authMiddleware, veiculoController.obterPorId);

// Rotas Administrativas (apenas quem gerencia)
router.get('/admin/todos', authMiddleware, veiculoController.listarTodos);
router.post('/', authMiddleware, veiculoController.criar);
router.put('/:id', authMiddleware, veiculoController.atualizar);
router.delete('/:id', authMiddleware, veiculoController.excluir);


// ── Manutenção de Veículos ──

// Listar alertas de um veículo
router.get('/:id/manutencao', authMiddleware, async (req, res) => {
    try {
        const alertas = await prisma.manutencaoAlerta.findMany({
            where: { veiculoId: req.params.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(alertas);
    } catch (error) {
        console.error('Erro ao listar manutenções:', error);
        res.status(500).json({ error: 'Erro ao listar manutenções.' });
    }
});

// Criar alerta de manutenção
router.post('/:id/manutencao', authMiddleware, async (req, res) => {
    try {
        const { tipo, descricao, kmAlerta, dataAlerta } = req.body;
        if (!tipo) return res.status(400).json({ error: 'Tipo de manutenção obrigatório.' });

        const alerta = await prisma.manutencaoAlerta.create({
            data: {
                veiculoId: req.params.id,
                tipo,
                descricao: descricao || null,
                kmAlerta: kmAlerta || null,
                dataAlerta: dataAlerta ? new Date(dataAlerta) : null,
                criadoPor: req.user.id
            }
        });

        res.status(201).json(alerta);
    } catch (error) {
        console.error('Erro ao criar alerta:', error);
        res.status(500).json({ error: 'Erro ao criar alerta de manutenção.' });
    }
});

// Concluir alerta de manutenção
router.patch('/manutencao/:alertaId/concluir', authMiddleware, async (req, res) => {
    try {
        const alerta = await prisma.manutencaoAlerta.update({
            where: { id: req.params.alertaId },
            data: {
                concluido: true,
                concluidoEm: new Date(),
                concluidoPor: req.user.id
            }
        });

        res.json(alerta);
    } catch (error) {
        console.error('Erro ao concluir alerta:', error);
        res.status(500).json({ error: 'Erro ao concluir alerta.' });
    }
});

module.exports = router;
