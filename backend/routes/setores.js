/**
 * /api/setores — cadastro de Setores (Como Fazer / ficha do funcionário).
 * Montada em index.js com authMiddleware. Leitura: qualquer logado. Escrita: admin ||
 * configuracoes === true || configuracoes.edit === true (permissoes.configuracoes é OBJETO).
 */
const express = require('express');
const router = express.Router();
const svc = require('../services/setoresService');

function permsDe(req) {
    const p = req.user?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
}
function podeGerir(perms) {
    const c = perms.configuracoes;
    return !!(perms.admin || c === true || (c && typeof c === 'object' && c.edit === true));
}
const exigirGerir = (req, res, next) => {
    if (podeGerir(permsDe(req))) return next();
    res.status(403).json({ ok: false, error: 'Só quem edita Configurações pode gerir os setores.', codigo: 'SEM_PERMISSAO' });
};
function responderErro(res, err, ctx) {
    const status = err.status || 500;
    if (status >= 500) {
        console.error(`[setores] ${ctx}:`, err);
        return res.status(500).json({ ok: false, error: 'Erro interno', codigo: 'ERRO_INTERNO' });
    }
    const { message, status: _s, stack: _st, ...extra } = err;
    res.status(status).json({ ok: false, error: message, ...extra });
}

router.get('/', async (req, res) => {
    try {
        const gerir = podeGerir(permsDe(req));
        const todos = req.query.todos === '1' || req.query.todos === 'true';
        const lista = await svc.listar({ incluirInativos: todos });
        let setores = lista;
        if (todos) {
            setores = await Promise.all(lista.map(async s => {
                const u = await svc.contarUso(s.codigo);
                return { ...s, uso: { funcionarios: u.funcionarios, conteudos: u.conteudos } };
            }));
        }
        res.json({ ok: true, setores, permissoes: { gerir } });
    } catch (e) { responderErro(res, e, 'listar'); }
});

router.post('/', exigirGerir, async (req, res) => {
    try { res.status(201).json({ ok: true, setor: await svc.criar(req.body || {}) }); }
    catch (e) { responderErro(res, e, 'criar'); }
});

// declarar ANTES de /:id
router.put('/ordem', exigirGerir, async (req, res) => {
    try { await svc.reordenar(req.body?.itens); res.json({ ok: true }); }
    catch (e) { responderErro(res, e, 'ordem'); }
});

router.put('/:id', exigirGerir, async (req, res) => {
    try { const r = await svc.atualizar(req.params.id, req.body || {}); res.json({ ok: true, ...r }); }
    catch (e) { responderErro(res, e, 'atualizar'); }
});

router.delete('/:id', exigirGerir, async (req, res) => {
    try { await svc.excluir(req.params.id); res.json({ ok: true }); }
    catch (e) { responderErro(res, e, 'excluir'); }
});

module.exports = router;
