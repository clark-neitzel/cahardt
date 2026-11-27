/**
 * Chaves de `app_configs` que NUNCA saem pelo genérico `GET /api/config[/:key]` para quem
 * não é admin (guardam senha SMTP, token de integração, segredo de webhook, hash de aparelho...).
 *
 * Fecha o buraco "qualquer usuário logado lia todo o app_configs". Chaves NOVAS com segredo
 * entram sozinhas se o nome tiver secret/senha/password/token/key/webhook/smtp/credential.
 *
 * ⚠️ A regex NÃO pega tudo: chave nova cujo nome não tenha essas palavras (ex.: 'chave_pix',
 * 'conta_bancaria', 'cert_...') PRECISA entrar na lista explícita abaixo — senão qualquer usuário
 * logado a lê em GET /api/config. A comparação ignora maiúsculas/minúsculas e espaços nas pontas.
 * (A ESCRITA é o inverso: lista de PERMITIDAS em routes/configRoutes.js; chave fora dela = só admin.)
 */
const CHAVES_SENSIVEIS = new Set([
    'email_config',            // senha SMTP
    'sms_config',              // credenciais do provedor de SMS
    'gdrive_config',           // OAuth/refresh token do Google Drive
    'gcal_config',             // OAuth/refresh token do Google Agenda
    'asaas_config',            // chave de API do Asaas
    'asaas_boleto_config',     // legado do Asaas (chave de API)
    'focus_nfe_config',        // token da Focus NFe
    'focus_nfe_webhook_secret',
    'como_fazer_aparelhos',    // hash das chaves de aparelho (tablets da cozinha)
    'webhook_botconversa_url', // URL do webhook (legado BotConversa)
    'backup_status',           // nome do dump e texto de erro do Drive (a tela de Backup usa GET /config/backup/status)
    'diag_pdf_extrato_ultimo', // ~15 mil caracteres de linhas de extrato bancário (só o diagnóstico em adminExec lê)
]);

// Dado de OUTRO usuário (o próprio usuário lê o dele por /auth/menu-favoritos, não por aqui).
const PREFIXOS_SENSIVEIS = ['menu_favoritos_'];

const RE_SENSIVEL = /(secret|senha|password|passwd|token|key|credential|webhook|smtp)/i;

function chaveSensivel(chave) {
    const k = String(chave || '').trim().toLowerCase();
    if (CHAVES_SENSIVEIS.has(k)) return true;
    if (PREFIXOS_SENSIVEIS.some(p => k.startsWith(p))) return true;
    return RE_SENSIVEL.test(k);
}

// Permissões podem vir como objeto ou string JSON.
function permsDe(req) {
    const p = req.user?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
}

const ehAdmin = (req) => permsDe(req).admin === true;

module.exports = { CHAVES_SENSIVEIS, chaveSensivel, permsDe, ehAdmin };
