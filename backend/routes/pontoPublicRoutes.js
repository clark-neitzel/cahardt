const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const pontoService = require('../services/pontoService');

// Rotas PÚBLICAS (sem login) — usadas pela tela /ponto/:token do funcionário.
// O token pessoal e permanente (Funcionario.pontoToken) identifica a pessoa.

async function buscarPorToken(token) {
    if (!token) return null;
    return prisma.funcionario.findUnique({ where: { pontoToken: token } });
}

// GET /api/ponto-publico/:token → estado atual + batidas do dia
router.get('/:token', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Cadastro inativo. Fale com o RH.' });

        const estado = await pontoService.statusDoDia(funcionario.id);
        const geo = await pontoService.getGeofence();

        res.json({
            nome: funcionario.nome,
            empresa: { geofenceAtivo: geo.ativo, raioMetros: geo.raioMetros, bloquear: geo.bloquear },
            ...estado
        });
    } catch (error) {
        console.error('[PontoPublico] status:', error);
        res.status(500).json({ erro: 'Erro ao carregar o ponto.' });
    }
});

// POST /api/ponto-publico/:token/registrar → grava a batida (alterna E/S)
router.post('/:token/registrar', async (req, res) => {
    try {
        const funcionario = await buscarPorToken(req.params.token);
        if (!funcionario) return res.status(404).json({ erro: 'Link não encontrado. Fale com o RH.' });
        if (!funcionario.ativo) return res.status(403).json({ erro: 'Cadastro inativo. Fale com o RH.' });

        const { latLng } = req.body || {};
        const batida = await pontoService.registrarBatida(funcionario, { latLng, origem: 'LINK' });
        const estado = await pontoService.statusDoDia(funcionario.id);

        res.status(201).json({ batida: pontoService.mapBatida(batida), ...estado });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ erro: error.message, distancia: error.distancia });
        }
        console.error('[PontoPublico] registrar:', error);
        res.status(500).json({ erro: 'Erro ao registrar o ponto.' });
    }
});

module.exports = router;
