// Pessoas do WhatsApp na ficha do cliente (app, com login).
// A API dos agentes fica em analyticsRoutes — lá não há exclusão.
const contato = require('../services/clienteContatoService');

function permissoes(req) {
    const p = req.user?.permissoes;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
}

function podeEditar(req) {
    const p = permissoes(req);
    return !!(p.admin || p.clientes?.edit || p.Pode_Editar_GPS);
}

function ator(req) {
    return { id: req.user?.id || null, nome: req.user?.nome || req.user?.login || null };
}

function responderErro(res, err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error('[ClienteContato]', err?.message || err);
    if (res.headersSent) return;
    const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
    if (err?.codigo && status < 500) body.codigo = err.codigo;
    if (err?.contatos && status < 500) body.contatos = err.contatos;
    if (err?.pessoas && status < 500) body.pessoas = err.pessoas;
    res.status(status).json(body);
}

function asyncRoute(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((err) => responderErro(res, err));
    };
}

const clienteContatoController = {
    listar: asyncRoute(async (req, res) => {
        res.json(await contato.listar(req.params.uuid));
    }),

    criar: asyncRoute(async (req, res) => {
        if (!podeEditar(req)) {
            return res.status(403).json({ error: 'Sem permissão para editar contatos do cliente.', codigo: 'SEM_PERMISSAO' });
        }
        const r = await contato.gravar(req.params.uuid, req.body, ator(req));
        res.status(r.status).json(r);
    }),

    atualizar: asyncRoute(async (req, res) => {
        if (!podeEditar(req)) {
            return res.status(403).json({ error: 'Sem permissão para editar contatos do cliente.', codigo: 'SEM_PERMISSAO' });
        }
        res.json(await contato.atualizar(req.params.contatoId, req.body, ator(req), req.params.uuid));
    }),

    excluir: asyncRoute(async (req, res) => {
        if (!podeEditar(req)) {
            return res.status(403).json({ error: 'Sem permissão para editar contatos do cliente.', codigo: 'SEM_PERMISSAO' });
        }
        res.json(await contato.excluir(req.params.contatoId, ator(req), req.params.uuid));
    }),
};

module.exports = clienteContatoController;
