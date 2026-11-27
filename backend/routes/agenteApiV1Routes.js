// /api/agente/v1 — as rotas que o PRÓPRIO agente (token cah_ag_) alcança neste PR.
// A autenticação (authMiddleware) e a allowlist (config/agenteAcesso.js) são aplicadas na montagem.
// Só leitura: nenhuma rota daqui escreve nada.
const express = require('express');
const prisma = require('../config/database');
const { caminhosPermitidos } = require('../config/agenteAcesso');

const router = express.Router();

const DIA_MS = 24 * 60 * 60 * 1000;

// Dados (sem segredo) do token em uso: o Luke consegue avisar quando faltar pouco para vencer.
async function infoTokenEmUso(tokenId) {
    if (!tokenId) return null;
    try {
        const t = await prisma.agenteToken.findUnique({ where: { id: String(tokenId) }, select: { prefixo: true, expiraEm: true } });
        if (!t) return null;
        const exp = t.expiraEm ? new Date(t.expiraEm) : null;
        return {
            prefixo: t.prefixo,
            expiraEm: exp,
            diasRestantes: exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / DIA_MS)) : null,
        };
    } catch (e) {
        console.error('[Agente] meu-acesso: falha ao ler o token em uso:', e.message);
        return null; // nunca derruba a rota por causa do campo informativo
    }
}

// Quem sou eu e até onde posso ir: nome, permissões VIVAS do banco e caminhos liberados.
// `token` (acrescentado): { prefixo, expiraEm, diasRestantes } do token em uso — sem segredo/hash.
router.get('/meu-acesso', async (req, res) => {
    res.json({
        id: req.user.id,
        nome: req.user.nome,
        agente: req.user.agente === true,
        permissoes: req.user.permissoes || {},
        caminhosPermitidos: caminhosPermitidos(),
        token: await infoTokenEmUso(req.user.agenteTokenId),
    });
});

module.exports = router;
