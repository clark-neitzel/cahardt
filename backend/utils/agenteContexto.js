// Contexto "esta requisição é de um agente de IA" (AsyncLocalStorage), ligado no authMiddleware.
// DEFESA EM PROFUNDIDADE: mesmo que uma rota proibida escapasse da política, as funções que mandam
// WhatsApp, emitem NF-e ou falam com a SEFAZ chamam assertNaoAgente() e recusam quando o contexto é de agente.
// Requisição humana, worker e script: não há contexto -> assertNaoAgente não faz nada (comportamento idêntico).
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/** Roda `fn` dentro do contexto de agente. Tudo que `fn` dispara (inclusive await/timers) herda o contexto. */
function rodarComoAgente(info, fn) {
    return als.run({ agente: true, ...(info || {}) }, fn);
}

function contextoAgente() {
    const s = als.getStore();
    return s && s.agente === true ? s : null;
}

/** Lança se a chamada acontece dentro de uma requisição de agente. `acao`: 'WHATSAPP' | 'NFE' | 'SEFAZ'. */
function assertNaoAgente(acao) {
    if (contextoAgente()) {
        const e = new Error(`Ação ${acao} não é permitida ao agente de IA.`);
        e.status = 403;
        e.codigo = 'AGENTE_ACAO_PROIBIDA';
        throw e;
    }
}

module.exports = { rodarComoAgente, contextoAgente, assertNaoAgente };
