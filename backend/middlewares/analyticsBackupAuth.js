// Segunda fechadura do GET /api/analytics/v1/backup.
// A chave dos agentes comerciais (ANALYTICS_API_KEY) é compartilhada entre
// vários agentes de venda. O dump é o banco inteiro — uma chave vazada de
// consulta não pode baixá-lo. Por isso esta rota exige TAMBÉM BACKUP_API_KEY
// (header x-backup-key) e o agente luke.
// O nome do agente não é segredo (qualquer um escreve o header). A chave é.
const crypto = require('crypto');
const { segredoConfere } = require('../utils/segredoConfere');

const JANELA_MS = 60 * 1000;
const LIMITE_FALHA = 20;
const contadores = new Map();

function estourado(bucket) {
    const agora = Date.now();
    const atual = contadores.get(bucket);
    if (!atual || agora >= atual.resetAt) {
        contadores.set(bucket, { count: 1, resetAt: agora + JANELA_MS });
        return false;
    }
    atual.count += 1;
    return atual.count > LIMITE_FALHA;
}

function erro(status, message, codigo) {
    const e = new Error(message);
    e.status = status;
    e.codigo = codigo;
    return e;
}

function exigirBackup(req) {
    const esperada = process.env.BACKUP_API_KEY;
    if (typeof esperada !== 'string' || !esperada.trim()) {
        throw erro(503, 'Backup não configurado (defina BACKUP_API_KEY).', 'BACKUP_NAO_CONFIGURADO');
    }
    if (req.query && ['x-backup-key', 'backup_key', 'backupKey'].some(
        (k) => Object.prototype.hasOwnProperty.call(req.query, k),
    )) {
        throw erro(400, 'A chave vai no header x-backup-key, nunca na URL.', 'CHAVE_NA_URL');
    }
    const recebida = req.headers['x-backup-key'];
    const valor = typeof recebida === 'string' ? recebida : '';
    if (!segredoConfere(valor, esperada)) {
        const ip = req.ip || 'sem-ip';
        const bucket = crypto.createHash('sha256').update(`backup:${ip}`).digest('hex').slice(0, 16);
        if (estourado(bucket)) {
            throw erro(429, 'Muitas tentativas. Tente de novo em instantes.', 'LIMITE');
        }
        throw erro(401, 'Chave de backup inválida.', 'BACKUP_CHAVE_INVALIDA');
    }
    const bruto = req.headers['x-analytics-agent'];
    const nome = typeof bruto === 'string' ? bruto.trim() : '';
    if (nome.toLowerCase() !== 'luke') {
        const rotulo = nome.slice(0, 80) || '(vazio)';
        console.warn(`[Analytics][Backup] recusado codigo=AGENTE_NAO_AUTORIZADO agente=${rotulo}`);
        throw erro(403, 'Este backup só pode ser pedido pelo agente luke.', 'AGENTE_NAO_AUTORIZADO');
    }
    return 'luke';
}

module.exports = { exigirBackup, LIMITE_FALHA };
