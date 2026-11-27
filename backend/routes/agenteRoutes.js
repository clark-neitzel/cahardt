// /api/agentes — gestão de usuários-agente (ex.: "Luke") e dos tokens de API deles.
// SOMENTE admin humano (o próprio agente nunca chega aqui: /api/agentes* é bloqueio FIXO da política
// (config/agentePoliticaPadrao.js), e este router ainda recusa req.user.agente).
// O token em claro aparece UMA vez, na resposta de POST /:id/tokens; GET nunca devolve token nem hash.
const express = require('express');
const prisma = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const svc = require('../services/agenteTokenService');
const politica = require('../services/agentePoliticaService');
const solicitacoes = require('../services/agenteSolicitacaoService');
const matriz = require('../services/agenteMatrizService');
const kit = require('../services/agenteKitService');

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

// ───────────── Fila de SOLICITAÇÕES do agente (PR-B) ─────────────
// DECLARADAS ANTES de qualquer rota `/:id/...`: `/solicitacoes` nunca pode ser lido como id de agente.
// Só admin humano decide (router.use acima). Autorizar EXECUTA a chamada guardada (loopback) e responde com o resultado.
function tratarSolicitacao(res, e, msg) {
    if (e && e.status) {
        return res.status(e.status).json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}), ...(e.extra || {}) });
    }
    console.error(msg, e && e.message);
    return res.status(500).json({ error: msg });
}

router.get('/solicitacoes', async (req, res) => {
    try { res.json(await solicitacoes.listar(req.query || {})); }
    catch (e) { tratarSolicitacao(res, e, 'Erro ao listar as solicitações do agente.'); }
});

router.get('/solicitacoes/contagem', async (req, res) => {
    try { res.json(await solicitacoes.contagem()); }
    catch (e) { tratarSolicitacao(res, e, 'Erro ao contar as solicitações do agente.'); }
});

router.get('/solicitacoes/:id', async (req, res) => {
    try { res.json(await solicitacoes.item(req.params.id)); }
    catch (e) { tratarSolicitacao(res, e, 'Erro ao ler a solicitação do agente.'); }
});

router.post('/solicitacoes/:id/autorizar', async (req, res) => {
    try {
        const item = await solicitacoes.autorizar(req.params.id, { id: req.user.id, nome: req.user.nome || 'admin' }, {
            app: req.app, porta: req.socket && req.socket.localPort, confirmarMudanca: req.body && req.body.confirmarMudanca === true,
        });
        res.json(item);
    } catch (e) { tratarSolicitacao(res, e, 'Erro ao autorizar a solicitação do agente.'); }
});

router.post('/solicitacoes/:id/recusar', async (req, res) => {
    try {
        res.json(await solicitacoes.recusar(req.params.id, { id: req.user.id, nome: req.user.nome || 'admin' }, req.body && req.body.observacao));
    } catch (e) { tratarSolicitacao(res, e, 'Erro ao recusar a solicitação do agente.'); }
});

router.post('/solicitacoes/:id/repetir', async (req, res) => {
    try {
        const item = await solicitacoes.repetir(req.params.id, { id: req.user.id, nome: req.user.nome || 'admin' }, {
            app: req.app, porta: req.socket && req.socket.localPort, confirmarRepeticao: req.body && req.body.confirmarRepeticao === true,
        });
        res.json({ ...item, aviso: 'Repetido com a mesma Idempotency-Key. As rotas do sistema ainda não leem essa chave: confira se o efeito já existia antes de repetir.' });
    } catch (e) { tratarSolicitacao(res, e, 'Erro ao repetir a solicitação do agente.'); }
});

router.get('/', async (req, res) => {
    try {
        res.json(await svc.listarAgentes());
    } catch (e) { tratar(res, e, 'Erro ao listar agentes.'); }
});

router.post('/', async (req, res) => {
    try {
        const agente = await svc.criarAgente(
            { nome: req.body?.nome, copiarPermissoesBase: req.body?.copiarPermissoesBase === true },
            req.user
        );
        await auditar(req, 'AGENTE_CRIADO', 'Agente', agente.id, {
            nome: agente.nome,
            copiouPermissoesBase: req.body?.copiarPermissoesBase === true,
        });
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
        let recusadasAutomaticamente = 0;
        if (!jaRevogado) {
            await auditar(req, 'AGENTE_TOKEN_REVOGADO', 'AgenteToken', registro.id, { agenteId: agente.id, agenteNome: agente.nome, tokenNome: registro.nome, prefixo: registro.prefixo });
            // token revogado: os pedidos pendentes do agente não valem mais (o que já está EXECUTANDO segue)
            recusadasAutomaticamente = await solicitacoes.recusarPendentesDoAgente(agente.id, 'token revogado', { id: req.user.id, nome: req.user.nome || 'admin' });
        }
        res.json({ ok: true, jaRevogado, ...registro, recusadasAutomaticamente });
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

// ───────────── MATRIZ de permissões da API (módulo × ação) ─────────────
// O dono decide, por módulo e por ação (ver/criar/editar/excluir/estornar/baixar): NAO · PEDE · SIM.
// Mora em agente_politicas (escopo MODULO) — nunca em Vendedor.permissoes. Só vale para o agente quando a matriz
// está ATIVA (marcador); sem isso a política antiga segue idêntica. Só admin humano (router.use acima).
function tratarMatriz(res, e, msg) {
    if (e && e.status) return res.status(e.status).json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) });
    console.error(msg, e && e.message);
    return res.status(500).json({ error: msg });
}

// Matriz atual + prontidão (permissões-base que faltam) + o que é sempre bloqueado e por quê.
router.get('/:id/matriz', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        res.json(await matriz.ler(req.app, { id: agente.id, nome: agente.nome, permissoes: await matriz.permissoesDoAgente(agente.id) }));
    } catch (e) { tratarMatriz(res, e, 'Erro ao ler a matriz do agente.'); }
});

// Funções dentro de um módulo (e, opcionalmente, de uma ação): ?modulo=contas_pagar&acao=criar
router.get('/:id/matriz/funcoes', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        res.json({ agente: { id: agente.id, nome: agente.nome }, ...(await matriz.funcoes(req.app, agente.id, { modulo: req.query.modulo, acao: req.query.acao })) });
    } catch (e) { tratarMatriz(res, e, 'Erro ao listar as funções da matriz.'); }
});

// Grava um lote de células. Body: { celulas: [{ modulo, acao, nivel: 'SIM'|'PEDE'|'NAO' }], ativar?: true|false }
// Tudo ou nada (transação com timeout); a auditoria vem DEPOIS, fora dela.
router.put('/:id/matriz', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        const r = await matriz.gravar(req.app, agente.id, req.body || {}, { id: req.user.id, nome: req.user.nome });
        if (!r.semMudanca) {
            await auditar(req, 'AGENTE_MATRIZ_ALTERADA', 'AgentePolitica', `${agente.id}:MATRIZ`, {
                agenteId: agente.id, agenteNome: agente.nome, alteradas: r.alteradas, marcador: r.marcador, ativa: r.ativa,
            });
        }
        res.json(r);
    } catch (e) { tratarMatriz(res, e, 'Erro ao gravar a matriz do agente.'); }
});

// ACRESCENTA ao agente as permissões que o administrador logado tem e o agente não (nunca `admin` nem
// `Usuario_Externo`). Aditivo: não remove nem desliga nada do que o agente já tem.
router.post('/:id/permissoes-base/sincronizar', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        const r = await matriz.sincronizarPermissoesBase(
            agente.id,
            { id: req.user.id, nome: req.user.nome, permissoes: req.user.permissoes },
            { incluirModulos: req.body?.incluirModulos === true }
        );
        if (r.alterou) {
            await auditar(req, 'AGENTE_PERMISSOES_BASE_SINCRONIZADAS', 'Agente', agente.id, {
                agenteId: agente.id, agenteNome: agente.nome, origemId: req.user.id, ligadasAntes: r.ligadasAntes, ligadasDepois: r.ligadasDepois,
                adicionadas: r.adicionadas.slice(0, 200), removidas: r.removidas.slice(0, 200),
            });
        }
        res.json(r);
    } catch (e) { tratarMatriz(res, e, 'Erro ao sincronizar as permissões de base do agente.'); }
});

// Kit de conexão (.md pronto para copiar ou baixar, sem nenhum segredo).
router.get('/:id/kit', async (req, res) => {
    try {
        const agente = await svc.agentePorId(req.params.id);
        res.set('Cache-Control', 'no-store');
        res.json(await kit.gerarKit(req.app, agente, { baseUrl: kit.baseUrlDe(req) }));
    } catch (e) { tratarMatriz(res, e, 'Erro ao gerar o kit de conexão do agente.'); }
});

module.exports = router;
