const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const prisma = require('../config/database');
const botWhatsappService = require('../services/botWhatsappService');

// Health-check da integração de WhatsApp (bot da Ana) + estado da fila de reenvio.
// Precisa vir ANTES de '/:key', senão o Express casa 'bot-whatsapp' como uma chave de config.
router.get('/bot-whatsapp/status', async (req, res) => {
    try {
        const [bot, pendentes, comErro] = await Promise.all([
            botWhatsappService.status(),
            prisma.botWhatsappEnvio.count({ where: { status: 'PENDENTE' } }),
            prisma.botWhatsappEnvio.count({
                where: { status: 'ERRO', createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } }
            }),
        ]);
        res.json({ bot, fila: { pendentes, comErro24h: comErro } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Status do backup automático (banco 15min + arquivos diário → Google Drive).
// Precisa vir ANTES de '/:key' pelo mesmo motivo da rota acima.
router.get('/backup/status', async (req, res) => {
    try {
        const backupService = require('../services/backupService');
        const { status, driveConfigurado } = await backupService.statusBackup();
        res.json({ status, driveConfigurado });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Inteligência artificial (Como Fazer) ─────────────────────────────────────
// Permissão objeto (igual cidades.js): `configuracoes` pode ser true, {view,edit} ou admin.
// Estas rotas precisam vir ANTES de '/:key'.
function permsDe(req) {
    const p = req.user?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
}
const podeEditarConfig = (p) => !!(p.admin === true || p.configuracoes === true || (p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.edit === true));
const podeVerConfig = (p) => podeEditarConfig(p) || !!(p.configuracoes && typeof p.configuracoes === 'object' && p.configuracoes.view === true);
const exigirConfig = (teste, msg) => (req, res, next) => (teste(permsDe(req)) ? next() : res.status(403).json({ erro: msg, error: msg, codigo: 'SEM_PERMISSAO' }));
const verConfig = exigirConfig(podeVerConfig, 'Você não tem permissão para ver as Configurações.');
const editarConfig = exigirConfig(podeEditarConfig, 'Você não tem permissão para alterar as Configurações.');

router.get('/ia', verConfig, async (req, res) => {
    try { res.json(await require('../services/comoFazerIaService').visaoConfig()); }
    catch (e) { console.error('[config/ia] GET:', e); res.status(500).json({ erro: 'Erro ao ler a configuração da IA.', codigo: 'ERRO_INTERNO' }); }
});
router.put('/ia', editarConfig, async (req, res) => {
    try { res.json(await require('../services/comoFazerIaService').salvarConfig(req.body)); }
    catch (e) {
        if (e && e.status && e.codigo) return res.status(e.status).json({ erro: e.message, codigo: e.codigo });
        console.error('[config/ia] PUT:', e); res.status(500).json({ erro: 'Erro ao salvar a configuração da IA.', codigo: 'ERRO_INTERNO' });
    }
});
router.get('/ia/uso', verConfig, async (req, res) => {
    try { res.json(await require('../services/comoFazerIaService').usoDoMes(req.query.mes)); }
    catch (e) { console.error('[config/ia] uso:', e); res.status(500).json({ erro: 'Erro ao ler o uso da IA.', codigo: 'ERRO_INTERNO' }); }
});

// Guarda no genérico: chaves `ia_*` (config e preços da IA) exigem Configurações — o genérico é aberto a qualquer logado.
const guardaChavesIa = (req, res, next) => {
    if (!String(req.params.key || '').startsWith('ia_')) return next();
    return (req.method === 'GET' ? verConfig : editarConfig)(req, res, next);
};

// Rotas de Configuração
router.get('/', configController.get);
router.get('/categorias', configController.getCategorias);
router.get('/:key', guardaChavesIa, configController.get);
router.post('/:key', guardaChavesIa, configController.save); // Pode ser PUT também, mas Controller usa upsert

module.exports = router;
