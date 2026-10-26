// Gate do Painel de Atendimentos (Pode_Ver_Atendimentos) — espelha o hasPermission do frontend.
// Sempre `=== true` / `.view === true`, nunca `!!perm` (objeto { view:false } é truthy).
const podeVerAtendimentos = (req, res, next) => {
    let perms = req.user?.permissoes;
    if (typeof perms === 'string') { try { perms = JSON.parse(perms); } catch { perms = {}; } }
    perms = perms || {};

    if (perms.admin === true) return next();

    const p = perms.Pode_Ver_Atendimentos;
    if (p === true) return next();
    if (p && typeof p === 'object' && p.view === true) return next();

    return res.status(403).json({ error: 'Você não tem permissão para ver o Painel de Atendimentos.' });
};

module.exports = podeVerAtendimentos;
