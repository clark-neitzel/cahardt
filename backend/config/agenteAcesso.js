// COMPAT (shim). A decisão de acesso do agente agora é a POLÍTICA (LIBERADO / PEDE / BLOQUEADO):
//   config/agentePoliticaPadrao.js (padrão) + services/agentePoliticaService.js (resolução + exceções do dono).
// O authMiddleware NÃO usa mais `agentePodeAcessar`. Este arquivo mantém a API antiga para quem ainda a importa
// (testes e /api/agente/v1/meu-acesso -> `caminhosPermitidos`): ela cobre só o que é SEMPRE LIBERADO
// (`GET /api/auth/me` e `GET /api/agente/v1/**`), exatamente como no PR1.
const { REGRAS_SEMPRE_LIBERADO } = require('./agentePoliticaPadrao');

// Cada regra: { metodos: [...], caminho: RegExp } (sobre o caminho em minúsculas, SEM query string).
const REGRAS_AGENTE = REGRAS_SEMPRE_LIBERADO;

function agentePodeAcessar(metodo, urlOriginal) {
    const bruto = String(urlOriginal || '').split('?')[0].split('#')[0].toLowerCase();
    // sem truque de caminho: '..', '//', barra invertida ou separador/ponto/nulo codificado
    if (bruto.includes('..') || bruto.includes('//') || bruto.includes('\\') || /%(2e|2f|5c|00)/.test(bruto)) return false;
    const m = String(metodo || '').toUpperCase();
    return REGRAS_AGENTE.some((r) => r.metodos.includes(m) && r.caminho.test(bruto));
}

// Lista legível dos caminhos sempre liberados (devolvida por /api/agente/v1/meu-acesso).
function caminhosPermitidos() {
    return REGRAS_AGENTE.map((r) => ({ metodos: r.metodos, caminho: r.caminho.source }));
}

module.exports = { agentePodeAcessar, caminhosPermitidos, REGRAS_AGENTE };
