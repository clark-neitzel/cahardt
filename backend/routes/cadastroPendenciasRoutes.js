// Telas do app: "Cadastros pra acertar" e a fila de pedidos de inativação feitos pelos agentes.
// Autenticada pelo JWT do app (montada com authMiddleware). Não existe rota de exclusão.
const express = require('express');
const fichaSvc = require('../services/analyticsClienteFichaService');
const inativacao = require('../services/clienteInativacaoService');

const router = express.Router();

function permissoes(req) {
    const p = req.user?.permissoes;
    try { return typeof p === 'string' ? JSON.parse(p) : (p || {}); } catch { return {}; }
}

// Mesma régua de quem edita clientes (PATCH /clientes/:uuid): admin, clientes.edit ou Pode_Editar_GPS.
const podeEditarClientes = (req) => {
    const p = permissoes(req);
    return !!(p.admin || p.clientes?.edit || p.Pode_Editar_GPS);
};

function exigirPermissao(req, res, next) {
    if (!podeEditarClientes(req)) {
        return res.status(403).json({ error: 'Sem permissão. Peça a quem edita clientes.', codigo: 'SEM_PERMISSAO' });
    }
    next();
}

function asyncRoute(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((err) => {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error('[CadastroPendencias]', err?.message || err);
            if (res.headersSent) return;
            const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
            if (err?.codigo && status < 500) body.codigo = err.codigo;
            res.status(status).json(body);
        });
    };
}

router.use(exigirPermissao);

router.get('/pendentes', asyncRoute(async (req, res) => {
    res.json(await fichaSvc.cadastrosPendentes(req.query));
}));

router.get('/inativacoes', asyncRoute(async (req, res) => {
    res.json(await inativacao.listar(req.query));
}));

router.get('/inativacoes/contagem', asyncRoute(async (_req, res) => {
    res.json(await inativacao.contarPendentes());
}));

router.post('/inativacoes/:id/aprovar', asyncRoute(async (req, res) => {
    res.json({ solicitacao: await inativacao.aprovar(req.params.id, req.user, req.body) });
}));

router.post('/inativacoes/:id/recusar', asyncRoute(async (req, res) => {
    res.json({ solicitacao: await inativacao.recusar(req.params.id, req.user, req.body) });
}));

router.podeEditarClientes = podeEditarClientes;
module.exports = router;
