// Chave estática da API dos agentes comerciais (/api/analytics/v1).
// Separada do JWT dos usuários e da chave da IA do WhatsApp (IA_WHATSAPP_API_KEY).
// Se ANALYTICS_API_KEY não estiver definida, a API fica desligada (503).
// A chave só vale no header x-analytics-key — nunca na URL, porque o servidor
// registra a URL no log e a senha iria parar no arquivo de log.
const crypto = require('crypto');
const { segredoConfere } = require('../utils/segredoConfere');

const JANELA_MS = 60 * 1000;
const LIMITE_OK = 300; // leituras/escritas autenticadas por minuto
const LIMITE_FALHA = 30; // tentativas com chave errada por IP por minuto
const contadores = new Map();

function estourado(bucket, limite) {
    const agora = Date.now();
    const atual = contadores.get(bucket);
    if (!atual || agora >= atual.resetAt) {
        contadores.set(bucket, { count: 1, resetAt: agora + JANELA_MS });
        return false;
    }
    atual.count += 1;
    return atual.count > limite;
}

function bucketDe(texto) {
    return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);
}

function verificarChaveAnalytics(req, res, next) {
    const esperada = process.env.ANALYTICS_API_KEY;
    if (typeof esperada !== 'string' || !esperada.trim()) {
        return res.status(503).json({
            error: 'API de analytics não configurada (defina ANALYTICS_API_KEY).',
            codigo: 'NAO_CONFIGURADA',
        });
    }
    // Recusa a chave na query string sem repetir o valor na resposta.
    if (req.query && (Object.prototype.hasOwnProperty.call(req.query, 'x-analytics-key')
        || Object.prototype.hasOwnProperty.call(req.query, 'analytics_key')
        || Object.prototype.hasOwnProperty.call(req.query, 'key'))) {
        return res.status(400).json({
            error: 'A chave vai no header x-analytics-key, nunca na URL.',
            codigo: 'CHAVE_NA_URL',
        });
    }
    const recebida = req.headers['x-analytics-key'];
    const valor = typeof recebida === 'string' ? recebida : '';
    if (!segredoConfere(valor, esperada)) {
        const ip = req.ip || 'sem-ip';
        if (estourado(`falha:${bucketDe(ip)}`, LIMITE_FALHA)) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em instantes.', codigo: 'LIMITE' });
        }
        return res.status(401).json({ error: 'Chave de API inválida.', codigo: 'CHAVE_INVALIDA' });
    }
    if (estourado(`ok:${bucketDe(esperada)}`, LIMITE_OK)) {
        return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em instantes.', codigo: 'LIMITE' });
    }
    next();
}

module.exports = { verificarChaveAnalytics };
