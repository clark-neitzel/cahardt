// Autenticação + limite de uso para a API de consulta dedicada a assistentes de IA externos
// (ex.: bot de WhatsApp). Nunca reaproveitar o ADMIN_SECRET aqui — este canal é somente-leitura
// e precisa poder ser revogado/trocado sem afetar o admin-exec.
const jwt = require('jsonwebtoken');
const { VERSAO_API, AVISOS } = require('../config/iaConsultaVersao');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

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

// Exige o token do PRÓPRIO cliente (emitido por login/criarSenha/resetSenha do site de Congelados),
// além da x-ia-api-key do bot. Duas camadas: a chave prova que é o bot da Antigravity chamando;
// este token prova qual cliente autorizou a consulta (por senha, código, ou telefone reconhecido).
// Sem isso, bastaria saber o CPF/CNPJ de alguém pra ver o preço negociado e os pedidos dela.
function exigirClienteCongelados(req, res, next) {
    const h = req.headers.authorization;
    const token = h && h.startsWith('Bearer ') ? h.split(' ')[1] : null;
    if (!token) return res.status(401).json({ error: 'Faça login (ou reconhecimento por telefone) antes de consultar dados deste cliente.' });
    try {
        const dec = jwt.verify(token, JWT_SECRET);
        if (dec.tipo !== 'congelados') throw new Error('tipo inválido');
        req.congelados = { id: dec.id, documento: dec.documento, nome: dec.nome };
        next();
    } catch (_) {
        return res.status(401).json({ error: 'Sessão do cliente inválida ou expirada.' });
    }
}

module.exports = { verificarChaveIA, envelopeVersao, exigirClienteCongelados };
