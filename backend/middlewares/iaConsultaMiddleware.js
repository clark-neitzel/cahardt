// Autenticação + limite de uso para a API de consulta dedicada a assistentes de IA externos
// (ex.: bot de WhatsApp). Nunca reaproveitar o ADMIN_SECRET aqui — este canal é somente-leitura
// e precisa poder ser revogado/trocado sem afetar o admin-exec.
const { VERSAO_API, AVISOS } = require('../config/iaConsultaVersao');

const JANELA_MS = 60 * 1000;
const LIMITE_POR_JANELA = 60; // requisições por chave a cada 60s
const contadores = new Map(); // chave -> { count, resetAt }

function limiteExcedido(chave) {
    const agora = Date.now();
    const atual = contadores.get(chave);
    if (!atual || agora >= atual.resetAt) {
        contadores.set(chave, { count: 1, resetAt: agora + JANELA_MS });
        return false;
    }
    atual.count += 1;
    return atual.count > LIMITE_POR_JANELA;
}

function verificarChaveIA(req, res, next) {
    const chaveEsperada = process.env.IA_WHATSAPP_API_KEY;
    if (!chaveEsperada) {
        return res.status(503).json({ error: 'API de consulta para IA não configurada (defina IA_WHATSAPP_API_KEY).' });
    }
    const chaveRecebida = req.headers['x-ia-api-key'];
    if (chaveRecebida !== chaveEsperada) {
        return res.status(401).json({ error: 'Chave de API inválida.' });
    }
    if (limiteExcedido(chaveRecebida)) {
        return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em instantes.' });
    }
    next();
}

// Envolve toda resposta de sucesso em { meta: { versaoApi, avisos, geradoEm }, dados }.
// O app consumidor (Antigravity) deve ler `meta.avisos` e logar/alertar quando não-vazio —
// é o aviso de que uma mudança futura vai exigir ajuste no código dele, ANTES de quebrar de fato.
function envelopeVersao(req, res, next) {
    const jsonOriginal = res.json.bind(res);
    res.json = (payload) => {
        if (res.statusCode >= 400) return jsonOriginal(payload); // erros seguem no formato simples { error }
        return jsonOriginal({
            meta: { versaoApi: VERSAO_API, avisos: AVISOS, geradoEm: new Date().toISOString() },
            dados: payload,
        });
    };
    next();
}

module.exports = { verificarChaveIA, envelopeVersao };
