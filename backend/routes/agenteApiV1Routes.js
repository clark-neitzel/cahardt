// /api/agente/v1 — as rotas que o PRÓPRIO agente (token cah_ag_) alcança neste PR.
// A autenticação (authMiddleware) e a allowlist (config/agenteAcesso.js) são aplicadas na montagem.
// Só leitura: nenhuma rota daqui escreve nada.
const express = require('express');
const { caminhosPermitidos } = require('../config/agenteAcesso');

const router = express.Router();

// Quem sou eu e até onde posso ir: nome, permissões VIVAS do banco e caminhos liberados.
router.get('/meu-acesso', (req, res) => {
    res.json({
        id: req.user.id,
        nome: req.user.nome,
        agente: req.user.agente === true,
        permissoes: req.user.permissoes || {},
        caminhosPermitidos: caminhosPermitidos(),
    });
});

module.exports = router;
