const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const prisma = require('../config/database');
const botWhatsappService = require('../services/botWhatsappService');
const { chaveSensivel, ehAdmin } = require('../config/configChavesSensiveis');

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
// Só admin ou Pode_Editar_Caixa (mesmo critério da seção Backup em Configuracoes.jsx): o status traz nome do
// dump e texto de erro do Drive (app_configs.backup_status, chave sensível).
function guardaBackupStatus(req, res, next) {
    if (ehAdmin(req) || permsDe(req).Pode_Editar_Caixa === true) return next();
    const msg = 'Você não tem permissão para ver o status do backup.';
    return res.status(403).json({ erro: msg, error: msg, codigo: 'SEM_PERMISSAO' });
}
router.get('/backup/status', guardaBackupStatus, async (req, res) => {
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

// Chaves SENSÍVEIS (senha SMTP, token de integração, segredo de webhook...): só admin lê no genérico.
// A listagem `GET /` filtra pelo mesmo critério (ver configController.get).
const guardaChavesSensiveis = (req, res, next) => {
    if (!chaveSensivel(req.params.key) || ehAdmin(req)) return next();
    return res.status(403).json({ erro: 'Você não tem permissão para ver esta configuração.', error: 'Você não tem permissão para ver esta configuração.', codigo: 'SEM_PERMISSAO' });
};

// Escrita no genérico (`POST /:key`): LISTA DE PERMITIDAS. Antes qualquer logado gravava qualquer chave;
// depois quem tinha Configurações→editar ainda gravava chaves que têm rota própria restrita a admin
// (caixa_conferencia, inadimplencia_config, gps_clientes_config, asaas_conta_financeira_ca_id...).
//  - admin: grava qualquer chave;
//  - não-admin: só as chaves abaixo (as ÚNICAS que telas de usuário comum gravam por aqui), cada uma com a
//    permissão que a tela já usa. Chave fora da lista (inclusive sensível/ia_*): 403.
const CHAVES_CONFIG_EDITAVEIS = new Set([
    'categorias_vendas', 'categorias_especial', 'tipos_atendimento', 'origens_lead', 'acoes_atendimento', 'acoes_lead',
]);
const CHAVES_PONTO = new Set(['empresa_geofence', 'ponto_link_base', 'rh_feriados']);
const guardaEscritaConfig = (req, res, next) => {
    const key = String(req.params.key || '');
    const p = permsDe(req);
    if (ehAdmin(req)) return next();
    if (CHAVES_CONFIG_EDITAVEIS.has(key) && podeEditarConfig(p)) return next();
    // toggle da tela Configurações, que o front libera p/ Pode_Editar_Caixa
    if (key === 'whatsapp_ativo' && (podeEditarConfig(p) || p.Pode_Editar_Caixa === true)) return next();
    // tela "Configurar ponto" (Pode_Ver_Ponto / Pode_Editar_Ponto)
    if (CHAVES_PONTO.has(key) && (podeEditarConfig(p) || p.Pode_Ver_Ponto === true || p.Pode_Editar_Ponto === true)) return next();
    const msg = 'Você não tem permissão para alterar esta configuração.';
    return res.status(403).json({ erro: msg, error: msg, codigo: 'SEM_PERMISSAO' });
};

// Rotas de Configuração
router.get('/', configController.get);
router.get('/categorias', configController.getCategorias);
router.get('/:key', guardaChavesIa, guardaChavesSensiveis, configController.get);
router.post('/:key', guardaChavesIa, guardaEscritaConfig, configController.save); // Pode ser PUT também, mas Controller usa upsert

module.exports = router;
