/**
 * Configurações → Agenda "Produção" (Google Calendar).
 * Permissão: ver (GET / e /status) = configuracoes true/view/edit; alterar = admin, configuracoes true (legado) ou edit (igual configRoutes.js).
 *
 *   GET  /api/config-gcal            → { calendarId, podeEditar }
 *   PUT  /api/config-gcal            → body { calendarId }
 *   GET  /api/config-gcal/status     → { conectado, agenda?, motivo? }
 *   GET  /api/config-gcal/auth-url?redirectUri=...  → { url, escopos }   (reautorização do Google)
 *   POST /api/config-gcal/sincronizar → manda para a agenda os já aprovados/em aberto → { criados, jaExistiam, erros, errosLista }
 *   POST /api/config-gcal/auth-code  → body { code, redirectUri }        (troca o código e salva o refresh token)
 */
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const gcal = require('../services/googleCalendarService');
const gdrive = require('../services/googleDriveService');

const ESCOPOS = ['https://www.googleapis.com/auth/drive', gcal.ESCOPO_CALENDAR];

const getPerms = async (userId) => {
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { permissoes: true } });
    return typeof v?.permissoes === 'string' ? JSON.parse(v.permissoes) : (v?.permissoes || {});
};
// Mesmo critério de configRoutes.js: `configuracoes` pode ser true (legado), {view,edit} ou admin.
const podeEditarConfig = (p) => {
    p = p || {};
    return !!(p.admin === true || p.configuracoes === true || (p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.edit === true));
};
const podeVerConfig = (p) => podeEditarConfig(p) || !!(p && p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.view === true);
const exigir = (teste, msg) => async (req, res, next) => {
    try {
        req._perms = req._perms || await getPerms(req.user.id);
        if (!teste(req._perms)) return res.status(403).json({ error: msg });
        next();
    } catch (e) { res.status(500).json({ error: 'Erro ao validar permissão.' }); }
};
const checkConfig = exigir(podeEditarConfig, 'Sem permissão para alterar configurações.');   // edit
const checkVer = exigir(podeVerConfig, 'Sem permissão para ver as configurações.');          // view ou edit

router.get('/', verificarAuth, checkVer, async (req, res) => {
    try {
        const cfg = await gcal.carregarConfig();
        res.json({ calendarId: cfg.calendarId || '', temWebClient: !!(cfg.webClientId && cfg.webClientSecret), podeEditar: true });
    } catch (e) { res.status(500).json({ error: 'Erro ao consultar a configuração da agenda.' }); }
});

router.put('/', verificarAuth, checkConfig, async (req, res) => {
    try {
        const calendarId = String(req.body?.calendarId ?? '').trim();
        if (calendarId.length > 300) return res.status(400).json({ error: 'ID da agenda inválido.' });
        // preserva webClientId/webClientSecret (gravados por /admin-exec/gcal-web-client)
        const atual = await gcal.carregarConfig();
        const value = { ...atual, calendarId, atualizadoEm: new Date().toISOString(), atualizadoPorNome: req.user.nome || null };
        await prisma.appConfig.upsert({ where: { key: 'gcal_config' }, update: { value }, create: { key: 'gcal_config', value } });
        gcal.limparCacheConfig();
        res.json({ ok: true, calendarId });
    } catch (e) {
        console.error('[GoogleCalendar] salvar config:', e);
        res.status(500).json({ error: 'Erro ao salvar a configuração da agenda.' });
    }
});

router.get('/status', verificarAuth, checkVer, async (req, res) => {
    res.json(await gcal.status());
});

router.post('/sincronizar', verificarAuth, checkConfig, async (req, res) => {
    const r = await gcal.sincronizarExistentes();
    res.json({ ok: !r.erros, ...r });
});

router.get('/auth-url', verificarAuth, checkConfig, async (req, res) => {
    try {
        const redirectUri = String(req.query.redirectUri || '').trim();
        if (!redirectUri) return res.status(400).json({ error: 'Informe redirectUri (cadastrado no OAuth do Google).' });
        const w = await gcal.carregarConfig();
        if (!w.webClientId || !w.webClientSecret) {
            return res.status(400).json({ error: 'Cliente OAuth web não configurado.', motivo: 'sem_web_client' });
        }
        const auth = new google.auth.OAuth2(w.webClientId, w.webClientSecret, redirectUri);
        const state = String(req.query.state || '').trim();
        if (state.length > 128) return res.status(400).json({ error: 'state inválido (máx. 128 caracteres).' });
        const url = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ESCOPOS, include_granted_scopes: true, ...(state ? { state } : {}) });
        res.json({ url, escopos: ESCOPOS });
    } catch (e) { res.status(500).json({ error: 'Erro ao gerar o link de autorização.' }); }
});

router.post('/auth-code', verificarAuth, checkConfig, async (req, res) => {
    try {
        const { code, redirectUri } = req.body || {};
        if (!code || !redirectUri) return res.status(400).json({ error: 'Informe code e redirectUri.' });
        const w = await gcal.carregarConfig();
        if (!w.webClientId || !w.webClientSecret) {
            return res.status(400).json({ error: 'Cliente OAuth web não configurado.', motivo: 'sem_web_client' });
        }
        const row = await prisma.appConfig.findUnique({ where: { key: 'gdrive_config' } });
        const g = row?.value || {};
        const auth = new google.auth.OAuth2(w.webClientId, w.webClientSecret, redirectUri);
        const { tokens } = await auth.getToken(code);
        if (!tokens.refresh_token) return res.status(400).json({ error: 'O Google não devolveu refresh token. Refaça a autorização.' });
        // Consentimento granular: o usuário pode desmarcar um acesso na tela do Google. Exige os dois, antes de gravar.
        const concedidos = String(tokens.scope || '').split(/\s+/);
        if (!ESCOPOS.every(e => concedidos.includes(e))) {
            return res.status(400).json({ error: 'Autorização incompleta: na tela do Google, não desmarque nenhuma opção — autorize os dois acessos (Drive e Agenda) e tente de novo.', motivo: 'escopo_incompleto' });
        }
        // Migra o Drive para o cliente web no mesmo instante em que ganha token válido (gravação única).
        const value = { ...g, ativo: true, clientId: w.webClientId, clientSecret: w.webClientSecret, refreshToken: tokens.refresh_token };
        await prisma.appConfig.update({ where: { key: 'gdrive_config' }, data: { value } });
        gdrive.limparCacheConfig(); gcal.limparCacheConfig();
        // Escopos validados acima: manda os já existentes para a agenda (em segundo plano).
        gcal.disparar(gcal.sincronizarExistentes);
        res.json({ ok: true, escopo: tokens.scope || null, sincronizandoExistentes: true });
    } catch (e) {
        console.error('[GoogleCalendar] auth-code:', e?.message || e);
        res.status(400).json({ error: 'Não foi possível trocar o código do Google.' });
    }
});

module.exports = router;
