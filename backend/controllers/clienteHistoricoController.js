// Histórico de alterações do cliente — só leitura. Não existe rota para editar ou apagar.
// Visível só para quem edita clientes (mesma régua do PATCH /clientes/:uuid).
const historico = require('../services/clienteHistoricoService');

function permissoes(req) {
    const p = req.user?.permissoes;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
}

const podeVer = (req) => {
    const p = permissoes(req);
    return !!(p.admin || p.clientes?.edit || p.Pode_Editar_GPS);
};

module.exports = {
    podeVer,
    listar: async (req, res) => {
        try {
            if (!podeVer(req)) {
                return res.status(403).json({ error: 'Sem permissão para ver o histórico de alterações do cliente.', codigo: 'SEM_PERMISSAO' });
            }
            res.json(await historico.listar(req.params.uuid, req.query));
        } catch (err) {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error('[ClienteHistorico]', err?.message || err);
            const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
            if (err?.codigo && status < 500) body.codigo = err.codigo;
            res.status(status).json(body);
        }
    },
};
