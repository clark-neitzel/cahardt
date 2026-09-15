/**
 * /api/cidades — CADASTRO OFICIAL DE CIDADES (09/2026, docs/cidades/PLANO-CADASTRO.md §4).
 *
 * Antes (08/2026) esta rota era só-leitura e montava a lista pelo DISTINCT de clientes/leads/
 * metas. Agora a fonte é a tabela `cidades` (mantida na tela Configurações → Cidades) e todo
 * campo Cidade do app só aceita item dessa lista. O formato do `GET /` foi MANTIDO
 * (`{ ok, total, cidades: string[], detalhe: [{ cidade, registros }] }`) e só ganhou campos —
 * o `CampoCidade` do frontend antigo continua funcionando durante a janela de deploy.
 *
 * Montada em `index.js` com `authMiddleware` (qualquer logado lê; escrita checa permissão aqui).
 *
 * PERMISSÕES (§6 do plano — o frontend espelha EXATAMENTE isto; `GET /` devolve `permissoes`
 * já calculadas para a tela não repetir a conta):
 *   · criar (POST /)                 = admin || clientes.edit || rota.edit
 *     (quem pode abrir cadastro de cliente ou prospectar na Rota pode abrir cidade; a checagem
 *      de "parecida" segura a bagunça)
 *   · gerir (PUT, inativar, reativar, fundir, pendências) = admin || configuracoes
 *     ⚠️ `permissoes.configuracoes` é OBJETO ({view, edit}) — `!!perms.configuracoes` liberaria
 *     quem só vê. Gerir reescreve dado nas 6 tabelas: exige `configuracoes.edit === true`
 *     (ou `configuracoes === true` nos cadastros antigos em que era booleano).
 *
 * Erro padrão das rotas de negócio que gravam cidade (cliente, lead, fornecedor, bairro, meta):
 *   400 { codigo: 'CIDADE_NAO_CADASTRADA', cidade: 'X', sugestoes: [{ id, nome, uf }] }
 * Aqui os códigos próprios: CIDADE_JA_EXISTE (409), CIDADE_PARECIDA (409), UF_INVALIDA (400),
 * CIDADE_EM_USO (400), CIDADE_NAO_ENCONTRADA (404).
 */
const express = require('express');
const router = express.Router();
const cidadeService = require('../services/cidadeService');
const { ufDe } = require('../utils/ufPorCidade');

/** `req.user.permissoes` pode vir string JSON (token velho) ou objeto (authMiddleware atual). */
function permsDe(req) {
    const p = req.user?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
}
function podeCriar(perms) {
    return !!(perms.admin || perms.clientes?.edit || perms.rota?.edit);
}
function podeGerir(perms) {
    const c = perms.configuracoes;
    return !!(perms.admin || c === true || (c && typeof c === 'object' && c.edit === true));
}
const exigir = (teste, mensagem) => (req, res, next) => {
    if (teste(permsDe(req))) return next();
    res.status(403).json({ ok: false, error: mensagem, codigo: 'SEM_PERMISSAO' });
};
const exigirCriar = exigir(podeCriar, 'Sem permissão para cadastrar cidades. Peça ao escritório.');
const exigirGerir = exigir(podeGerir, 'Só quem edita Configurações pode gerir o cadastro de cidades.');

/** Erro do service -> resposta HTTP com os campos que o front trata (`codigo`, `cidade`, `sugestoes`...). */
function responderErro(res, err, contexto) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[cidades] ${contexto}:`, err);
    const { message, status: _s, stack: _st, ...extra } = err;
    res.status(status).json({ ok: false, error: status >= 500 ? 'Erro interno no cadastro de cidades.' : message, ...extra });
}

// GET / — lista (formato antigo mantido + uf/id/ativo/uso). Só ativas por padrão;
// `?todas=1` (ou `?incluirInativas=1`, alias usado pelo front) inclui inativas (tela de gestão).
// `?semUso=1` pula a contagem (mais rápido).
router.get('/', async (req, res) => {
    try {
        const todas = req.query.todas === '1' || req.query.todas === 'true' || req.query.incluirInativas === '1' || req.query.incluirInativas === 'true';
        const comUso = !(req.query.semUso === '1' || req.query.semUso === 'true');
        const { cidades, foraDoCadastro } = await cidadeService.listar({ incluirInativas: todas, comUso });
        const perms = permsDe(req);
        res.json({
            ok: true,
            total: cidades.length,
            cidades: cidades.filter(c => c.ativo).map(c => c.nome),          // string[] — o <option> antigo
            detalhe: cidades.map(c => ({
                cidade: c.nome, registros: c.registros,                         // campos antigos
                id: c.id, uf: c.uf, ibge: c.ibge, ativo: c.ativo, fundidaEmId: c.fundidaEmId,
                uso: c.uso, criadoEm: c.criadoEm, atualizadoEm: c.atualizadoEm,
            })),
            foraDoCadastro,                                                     // grafias no banco sem cidade cadastrada
            permissoes: { criar: podeCriar(perms), gerir: podeGerir(perms) },
        });
    } catch (err) { responderErro(res, err, 'GET /'); }
});

// GET /resolver?nome=X&uf=SC — a cidade existe? (usado pela consulta de CNPJ antes de preencher)
router.get('/resolver', async (req, res) => {
    try {
        const nome = String(req.query.nome || '').trim();
        if (!nome) return res.status(400).json({ ok: false, error: 'Informe ?nome=' });
        try {
            const nomeOficial = await cidadeService.resolver(nome, { modo: 'estrito' });
            if (!nomeOficial) return res.json({ existe: false, nomeSugerido: null, sugestoes: [] });
            const { cidades } = await cidadeService.listar({ comUso: false });
            const cidade = cidades.find(c => c.nome === nomeOficial) || null;
            return res.json({ existe: true, cidade: cidade ? { id: cidade.id, nome: cidade.nome, uf: cidade.uf } : { id: null, nome: nomeOficial, uf: null } });
        } catch (e) {
            if (e.codigo !== 'CIDADE_NAO_CADASTRADA') throw e;
            return res.json({
                existe: false, nomeSugerido: e.cidade, sugestoes: e.sugestoes || [],
                ...(e.cidadeInativa ? { cidadeInativa: e.cidadeInativa } : {}),
                ufSugerida: String(req.query.uf || '').trim().toUpperCase().slice(0, 2) || ufDe(nome),
            });
        }
    } catch (err) { responderErro(res, err, 'GET /resolver'); }
});

// GET /sugestoes?nome=X — "você quis dizer" (máx. 5)
router.get('/sugestoes', async (req, res) => {
    try {
        const nome = String(req.query.nome || '').trim();
        const sugestoes = nome ? await cidadeService.sugerir(nome) : [];
        res.json({ sugestoes, ufSugerida: nome ? ufDe(nome) : null });
    } catch (err) { responderErro(res, err, 'GET /sugestoes'); }
});

// GET /pendentes — cidades que chegaram por CA/IA e não existem na lista (gerir)
router.get('/pendentes', exigirGerir, async (req, res) => {
    try {
        const pendentes = await cidadeService.pendentes();
        res.json({ ok: true, total: pendentes.length, pendentes });
    } catch (err) { responderErro(res, err, 'GET /pendentes'); }
});

// POST /pendentes/:id/resolver { cidadeId } | { criar: { nome, uf } }
router.post('/pendentes/:id/resolver', exigirGerir, async (req, res) => {
    try {
        const r = await cidadeService.resolverPendente(req.params.id, req.body || {}, { usuarioId: req.user?.id || null });
        res.json({ ok: true, ...r });
    } catch (err) { responderErro(res, err, 'POST /pendentes/:id/resolver'); }
});

// POST / { nome, uf, ibge?, confirmarParecida? } -> 201 { cidade }
router.post('/', exigirCriar, async (req, res) => {
    try {
        const b = req.body || {};
        const cidade = await cidadeService.criar(
            { nome: b.nome, uf: b.uf, ibge: b.ibge, confirmarParecida: b.confirmarParecida === true },
            { usuarioId: req.user?.id || null },
        );
        res.status(201).json({ ok: true, cidade });
    } catch (err) { responderErro(res, err, 'POST /'); }
});

// PUT /:id { nome?, uf?, ibge? } — renomear reescreve as 6 tabelas (snapshot)
router.put('/:id', exigirGerir, async (req, res) => {
    try {
        const b = req.body || {};
        const r = await cidadeService.editar(req.params.id, { nome: b.nome, uf: b.uf, ibge: b.ibge }, { usuarioId: req.user?.id || null });
        res.json({ ok: true, ...r });
    } catch (err) { responderErro(res, err, 'PUT /:id'); }
});

router.post('/:id/inativar', exigirGerir, async (req, res) => {
    try {
        res.json({ ok: true, cidade: await cidadeService.inativar(req.params.id) });
    } catch (err) { responderErro(res, err, 'POST /:id/inativar'); }
});

router.post('/:id/reativar', exigirGerir, async (req, res) => {
    try {
        res.json({ ok: true, cidade: await cidadeService.reativar(req.params.id) });
    } catch (err) { responderErro(res, err, 'POST /:id/reativar'); }
});

// POST /:id/fundir { destinoId, dryRun: true|false } — dry-run devolve o plano; real aplica com snapshot
router.post('/:id/fundir', exigirGerir, async (req, res) => {
    try {
        const b = req.body || {};
        const dryRun = b.dryRun !== false;
        const r = await cidadeService.fundir(req.params.id, b.destinoId, { dryRun, usuarioId: req.user?.id || null });
        res.json({ ...r, ok: r.ok !== false });
    } catch (err) { responderErro(res, err, 'POST /:id/fundir'); }
});

module.exports = router;
