// /api/agentes — gestão de usuários-agente (ex.: "Luke") e dos tokens de API deles.
// SOMENTE admin humano (o próprio agente nunca chega aqui: /api/agentes* é bloqueio FIXO da política
// (config/agentePoliticaPadrao.js), e este router ainda recusa req.user.agente).
// O token em claro aparece UMA vez, na resposta de POST /:id/tokens; GET nunca devolve token nem hash.
const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const svc = require('../services/agenteTokenService');
const politica = require('../services/agentePoliticaService');

const router = express.Router();

function exigirAdminHumano(req, res, next) {
    if (req.user?.agente === true || req.user?.permissoes?.admin !== true) {
        return res.status(403).json({ error: 'Apenas administradores podem gerir agentes.' });
    }
    next();
}

router.use(authMiddleware, exigirAdminHumano);

// Auditoria fora do fluxo principal: log lento/falho nunca desfaz a criação/revogação. Nunca grava token/hash.
async function auditar(req, acao, entidade, entidadeId, detalhes) {
    try {
        await prisma.auditLog.create({
            data: { acao, entidade, entidadeId: String(entidadeId), detalhes: JSON.stringify(detalhes), usuarioId: req.user.id, usuarioNome: req.user.nome || 'admin' },
        });
    } catch (e) {
        console.error('[Agente] falha ao gravar auditoria (operação já efetivada):', e.message);
    }
}

function tratar(res, e, msg) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    console.error(msg, e);
    return res.status(500).json({ error: msg });
}

router.get('/', async (req, res) => {
    try {
        res.json(await svc.listarAgentes());
    } catch (e) { tratar(res, e, 'Erro ao listar agentes.'); }
});

router.post('/', async (req, res) => {
    try {
        const agente = await svc.criarAgente({ nome: req.body?.nome });
        await auditar(req, 'AGENTE_CRIADO', 'Agente', agente.id, { nome: agente.nome });
        res.status(201).json(agente);
    } catch (e) { tratar(res, e, 'Erro ao criar agente.'); }
});

router.post('/:id/tokens', async (req, res) => {
    try {
        const { agente, registro, token } = await svc.criarTokenParaAgente(req.params.id, req.body || {}, req.user.id);
        await auditar(req, 'AGENTE_TOKEN_CRIADO', 'AgenteToken', registro.id, {
            agenteId: agente.id, agenteNome: agente.nome, tokenNome: registro.nome, prefixo: registro.prefixo, expiraEm: registro.expiraEm, limitePorMinuto: registro.limitePorMinuto,
        });
        res.status(201).json({
            token, // em claro SÓ aqui — guarde agora, não há como ver de novo
            aviso: 'Guarde este token agora: ele não será mostrado novamente.',
            ...registro,
        });
    } catch (e) { tratar(res, e, 'Erro ao criar token do agente.'); }
});

router.delete('/:id/tokens/:tid', async (req, res) => {
    try {
        const { agente, registro, jaRevogado } = await svc.revogarToken(req.params.id, req.params.tid);
        if (!jaRevogado) {
            await auditar(req, 'AGENTE_TOKEN_REVOGADO', 'AgenteToken', registro.id, { agenteId: agente.id, agenteNome: agente.nome, tokenNome: registro.nome, prefixo: registro.prefixo });
        }
        res.json({ ok: true, jaRevogado, ...registro });
    } catch (e) { tratar(res, e, 'Erro ao revogar token do agente.'); }
});

// ───────────── Política do agente (LIBERADO / PEDE / BLOQUEADO) ─────────────
// Catálogo mesclado: cada função do sistema com o nível efetivo e de onde ele vem (fixo|override|seed|padrao).
// Filtros: ?familia=/api/contas-pagar &nivel=LIBERADO|PEDE|BLOQUEADO &semRegra=1 &q=texto &pagina= &porPagina=
router.get('/:id/politicas', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        res.json({ agente: { id: agente.id, nome: agente.nome }, ...(await politica.listar(req.app, agente.id, req.query)) });
    } catch (e) { tratar(res, e, 'Erro ao listar a política do agente.'); }
});

router.get('/:id/politicas/familias', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        res.json({ agente: { id: agente.id, nome: agente.nome }, familias: await politica.resumoPorFamilia(req.app, agente.id) });
    } catch (e) { tratar(res, e, 'Erro ao resumir a política do agente.'); }
});

// Define uma exceção do dono. Body: { escopo: 'FUNCAO'|'FAMILIA', chave, nivel, motivo? }
router.put('/:id/politicas', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        const r = await politica.definirOverride(req.app, agente.id, req.body || {}, { id: req.user.id, nome: req.user.nome });
        if (!r.semEfeito) {
            await auditar(req, 'AGENTE_POLITICA_ALTERADA', 'AgentePolitica', `${agente.id}:${r.escopo}:${r.chave}`, {
                agenteId: agente.id, agenteNome: agente.nome, escopo: r.escopo, chave: r.chave, antes: r.antes, depois: r.nivel, motivo: r.motivo || null,
            });
        }
        res.json(r);
    } catch (e) { tratar(res, e, 'Erro ao alterar a política do agente.'); }
});

// Restaura o padrão (apaga a exceção). Body (ou query): { escopo, chave }
router.delete('/:id/politicas', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        const r = await politica.removerOverride(req.app, agente.id, { ...(req.query || {}), ...(req.body || {}) });
        if (r.removido) {
            await auditar(req, 'AGENTE_POLITICA_ALTERADA', 'AgentePolitica', `${agente.id}:${r.escopo}:${r.chave}`, {
                agenteId: agente.id, agenteNome: agente.nome, escopo: r.escopo, chave: r.chave, antes: r.antes, depois: 'PADRAO',
            });
        }
        res.json(r);
    } catch (e) { tratar(res, e, 'Erro ao restaurar o padrão da política do agente.'); }
});

module.exports = router;
