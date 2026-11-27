// /api/agente/v1 — as rotas que o PRÓPRIO agente (token cah_ag_) alcança neste PR.
// A autenticação e a POLÍTICA do agente (authMiddleware -> services/agentePoliticaService.js) são aplicadas na montagem.
// Só leitura: nenhuma rota daqui escreve nada (as solicitações só são LIDAS; quem decide é o dono, em /api/agentes/solicitacoes).
const express = require('express');
const prisma = require('../config/database');
const { caminhosPermitidos } = require('../config/agenteAcesso');
const politica = require('../services/agentePoliticaService');
const solicitacoes = require('../services/agenteSolicitacaoService');

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
// `politica` (acrescentado, PR-A): resumo do que a política libera/pede/bloqueia hoje para ESTE agente
// (contagem de funções por nível e por família — sem listar as ~1200 rotas). `caminhosPermitidos` segue
// mostrando só o que é SEMPRE liberado (contrato antigo, não removido).
router.get('/meu-acesso', async (req, res) => {
    let resumo = null;
    try {
        resumo = await politica.resumoCurto(req.app, req.user.id);
    } catch (e) {
        console.error('[Agente] meu-acesso: falha ao resumir a política:', e.message);
    }
    let pendentes = 0;
    try {
        pendentes = await solicitacoes.pendentesDoAgente(req.user.id);
    } catch (e) {
        console.error('[Agente] meu-acesso: falha ao contar as solicitações:', e.message);
    }
    res.json({
        id: req.user.id,
        nome: req.user.nome,
        agente: req.user.agente === true,
        permissoes: req.user.permissoes || {},
        caminhosPermitidos: caminhosPermitidos(),
        token: await infoTokenEmUso(req.user.agenteTokenId),
        politica: resumo,
        solicitacoes: { pendentes },
        observacao: 'A política vale por função (MÉTODO + caminho): LIBERADO passa; PEDE guarda o pedido e responde 202 (o dono autoriza ou recusa; acompanhe em /api/agente/v1/solicitacoes/:id); BLOQUEADO nega. Função nova nasce BLOQUEADA. Escrita nunca é liberada direto: sempre passa pela autorização do dono.',
    });
});

function tratar(res, e, msg) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    console.error(msg, e && e.message);
    return res.status(500).json({ error: msg });
}

// As solicitações do PRÓPRIO agente (nunca as de outro): andamento e resultado de cada pedido de autorização.
// { status, resultadoStatus, resultado, idsResultado, decididoPorNome, observacaoDecisao, createdAt, expiraEm } (+ id, resumo).
router.get('/solicitacoes', async (req, res) => {
    try { res.json(await solicitacoes.listarDoAgente(req.user.id, req.query || {})); }
    catch (e) { tratar(res, e, 'Erro ao listar as suas solicitações.'); }
});

router.get('/solicitacoes/:id', async (req, res) => {
    try { res.json(await solicitacoes.doAgente(req.user.id, req.params.id)); }
    catch (e) { tratar(res, e, 'Erro ao ler a solicitação.'); }
});

module.exports = router;
