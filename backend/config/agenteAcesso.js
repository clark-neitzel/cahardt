// Allowlist de caminhos que um USUÁRIO-AGENTE (token cah_ag_...) pode alcançar.
// NEGA POR PADRÃO: o que não está na lista dá 403 AGENTE_BLOQUEADO no authMiddleware.
//
// PR1: só `/api/auth/me` e `/api/agente/v1/*`. As famílias de rotas (pedidos, clientes...)
// entram nos PRs seguintes, acrescentando linhas em REGRAS_AGENTE — nunca afrouxando a
// função `agentePodeAcessar`. Cada regra: { metodos: [...], caminho: RegExp } (sobre o
// caminho em minúsculas, SEM query string).
const REGRAS_AGENTE = [
    { metodos: ['GET'], caminho: /^\/api\/auth\/me\/?$/ },
    { metodos: ['GET'], caminho: /^\/api\/agente\/v1(\/|$)/ },
];

function agentePodeAcessar(metodo, urlOriginal) {
    const bruto = String(urlOriginal || '').split('?')[0].split('#')[0].toLowerCase();
    // sem truque de caminho: '..', '//', barra invertida ou separador/ponto/nulo codificado
    if (bruto.includes('..') || bruto.includes('//') || bruto.includes('\\') || /%(2e|2f|5c|00)/.test(bruto)) return false;
    const m = String(metodo || '').toUpperCase();
    return REGRAS_AGENTE.some((r) => r.metodos.includes(m) && r.caminho.test(bruto));
}

// Lista legível dos caminhos liberados (devolvida por /api/agente/v1/meu-acesso).
function caminhosPermitidos() {
    return REGRAS_AGENTE.map((r) => ({ metodos: r.metodos, caminho: r.caminho.source }));
}

module.exports = { agentePodeAcessar, caminhosPermitidos, REGRAS_AGENTE };
