const svc = require('../services/iaCatalogoService');

// Mesmo padrão de erro do restante da API de IA (iaClienteController.js): erro com `e.status`
// próprio usa esse status (até 4xx), senão cai em 400; `e.code` (quando existir) acompanha.
const erro = (res, e, ctx) => {
    console.error(`[IaCatalogo] ${ctx}:`, e.message);
    res.status(e.status && e.status < 500 ? e.status : 400).json(e.code ? { error: e.message, code: e.code } : { error: e.message });
};

module.exports = {
    // POST /catalogo/gerar — pode ser tool da IA (ação transacional a pedido do cliente na
    // conversa). Ver backend/docs/ia-consulta-api.md, seção "Catálogo personalizado (v1.6.5)".
    gerar: async (req, res) => {
        try {
            const { telefone, produtoIds, todos, titulo, observacoes, condicaoId, idempotencyKey } = req.body || {};
            res.json(await svc.gerar({ telefone, produtoIds, todos: todos === true, titulo, observacoes, condicaoId, idempotencyKey }));
        } catch (e) { erro(res, e, 'gerar'); }
    },
    // GET /catalogo/:token — sem telefone (o token já é o segredo, igual ao link público).
    obter: async (req, res) => {
        try { res.json(await svc.obterPorToken(req.params.token)); }
        catch (e) { erro(res, e, 'obter'); }
    },
    // POST /catalogo/listar
    listar: async (req, res) => {
        try { res.json(await svc.listarPorTelefone(req.body?.telefone, req.body?.limite)); }
        catch (e) { erro(res, e, 'listar'); }
    },
};
