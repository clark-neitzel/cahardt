/**
 * Consulta ao bot da Ana: "esse número existe no WhatsApp?".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGRA DE OURO: este arquivo NUNCA envia mensagem.
 * É um GET de consulta. NÃO chama botWhatsappService.enviar, NÃO grava nada
 * em `bot_whatsapp_envios`, NÃO entra na fila. Mandar mensagem "só para testar
 * se o número existe" é exatamente a automação em massa que já derrubou o
 * WhatsApp da empresa uma vez — o acordo com o bot é: só mensagem transacional
 * provocada por um ato concreto do cliente.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Timeout CURTO (2,5s) de propósito: isto roda SÍNCRONO no cadastro de cliente,
 * com o VENDEDOR EM PÉ, na frente do cliente, esperando a tela salvar. O envio
 * (botWhatsappService) usa 30s porque lá a chamada espera a fila do bot — aqui,
 * esperar é pior do que não conferir, e não conferir já tem tratamento (degrada
 * para INDISPONIVEL e salva assim mesmo).
 *
 * Degradação: em QUALQUER problema (env ausente, 404 porque o bot ainda não expôs
 * o endpoint — que é o caso de hoje —, timeout, rede, resposta fora do formato)
 * devolve `disponivel: false`. Quem chama trata isso como "não deu para perguntar"
 * e SALVA o cadastro assim mesmo. Erro nosso não pode impedir o vendedor de
 * cadastrar cliente.
 */
const botWhatsappService = require('./botWhatsappService');

const TIMEOUT_MS = 2500;

const getConfig = () => ({
    url: (process.env.BOT_WHATSAPP_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.BOT_WHATSAPP_API_KEY || '',
});

/**
 * Pergunta ao bot se o número tem WhatsApp.
 * Retorna sempre { disponivel, existe, motivo } — nunca lança.
 *  - disponivel: deu para perguntar e a resposta veio no formato esperado
 *  - existe: true | false | null (null quando indisponível)
 */
const verificarNumero = async (telefone) => {
    const phone = botWhatsappService.normalizarTelefone(telefone);
    if (!phone) return { disponivel: false, existe: null, motivo: 'telefone_invalido' };

    const { url, apiKey } = getConfig();
    if (!url) return { disponivel: false, existe: null, motivo: 'sem_url' };
    if (!apiKey) return { disponivel: false, existe: null, motivo: 'sem_chave' };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const resp = await fetch(
            `${url}/api/integracao/numero-existe?telefone=${encodeURIComponent(phone)}`,
            { method: 'GET', headers: { 'x-api-key': apiKey }, signal: ctrl.signal }
        );

        let corpo = null;
        try { corpo = await resp.json(); } catch { /* corpo vazio/não-JSON */ }

        // 404 hoje é o normal: o bot ainda não expôs esse endpoint.
        if (!resp.ok) {
            return { disponivel: false, existe: null, motivo: corpo?.codigo || `http_${resp.status}` };
        }

        // Aceita { existe: bool } ou { existeWhatsapp: bool } — qualquer outra coisa
        // é formato desconhecido e vira INDISPONIVEL (nunca "não existe").
        const bruto = (corpo && typeof corpo === 'object')
            ? (corpo.existe !== undefined ? corpo.existe : corpo.existeWhatsapp)
            : undefined;
        if (typeof bruto !== 'boolean') {
            return { disponivel: false, existe: null, motivo: 'formato_desconhecido' };
        }

        return { disponivel: true, existe: bruto, motivo: bruto ? 'existe' : 'nao_existe' };
    } catch (e) {
        const abortou = e.name === 'AbortError';
        return { disponivel: false, existe: null, motivo: abortou ? 'timeout' : 'rede' };
    } finally {
        clearTimeout(t);
    }
};

/** Traduz o resultado para o campo `verificacaoStatus` da tabela lateral. */
const statusDaVerificacao = (r) => {
    if (!r || !r.disponivel) return 'INDISPONIVEL';
    return r.existe ? 'EXISTE' : 'NAO_EXISTE';
};

module.exports = { verificarNumero, statusDaVerificacao, TIMEOUT_MS };
