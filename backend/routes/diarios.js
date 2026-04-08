const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const diarioController = require('../controllers/diarioController');

// Status atual do vendedor
router.get('/status', diarioController.meuStatus);

// Listar veículos em uso hoje (para bloquear no select)
router.get('/veiculos-em-uso-hoje', async (req, res) => {
    try {
        const hoje = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const dataRef = `${hoje.find(p => p.type === 'year').value}-${hoje.find(p => p.type === 'month').value}-${hoje.find(p => p.type === 'day').value}`;

        const diarios = await prisma.diarioVendedor.findMany({
            where: {
                dataReferencia: dataRef,
                modo: 'PRESENCIAL',
                veiculoId: { not: null }
            },
            include: { vendedor: { select: { nome: true } } }
        });

        res.json(diarios.map(d => ({
            veiculoId: d.veiculoId,
            motorista: d.vendedor?.nome || 'Desconhecido'
        })));
    } catch (error) {
        console.error('Erro ao listar veículos em uso:', error);
        res.json([]);
    }
});

// Checkins
router.post('/iniciar', diarioController.iniciar);
router.post('/encerrar', diarioController.encerrar);

// Admin: editar KM inicial de um diário (sem exigir KM final)
router.put('/:id/km', async (req, res) => {
    try {
        const perms = req.user?.permissoes || {};
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas administradores podem ajustar KM.' });
        }

        const { kmInicial } = req.body;
        if (kmInicial === undefined || kmInicial === null) {
            return res.status(400).json({ error: 'Informe o KM inicial.' });
        }

        const diario = await prisma.diarioVendedor.findUnique({ where: { id: req.params.id } });
        if (!diario) return res.status(404).json({ error: 'Diário não encontrado.' });

        const updated = await prisma.diarioVendedor.update({
            where: { id: req.params.id },
            data: { kmInicial: parseInt(kmInicial) }
        });

        res.json(updated);
    } catch (error) {
        console.error('Erro ao editar KM:', error);
        res.status(500).json({ error: 'Erro ao editar KM.' });
    }
});

// Admin: deletar diário do dia para permitir re-inicio (ex: motorista escolheu modo errado)
router.delete('/:id', async (req, res) => {
    try {
        const perms = req.user?.permissoes || {};
        if (!perms.admin) {
            return res.status(403).json({ error: 'Apenas administradores podem reiniciar o diário.' });
        }

        const diario = await prisma.diarioVendedor.findUnique({ where: { id: req.params.id } });
        if (!diario) return res.status(404).json({ error: 'Diário não encontrado.' });

        await prisma.diarioVendedor.delete({ where: { id: req.params.id } });

        res.json({ ok: true, message: 'Diário removido. O vendedor poderá iniciar novamente.' });
    } catch (error) {
        console.error('Erro ao deletar diário:', error);
        res.status(500).json({ error: 'Erro ao reiniciar diário.' });
    }
});

module.exports = router;
