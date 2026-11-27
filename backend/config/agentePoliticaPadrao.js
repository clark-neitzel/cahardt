// POLÍTICA PADRÃO do usuário-agente (token cah_ag_...): o que o agente pode fazer em cada função do sistema.
// Três níveis: LIBERADO (passa) · PEDE (precisa de autorização do dono) · BLOQUEADO (nega).
//
// Resolução (services/agentePoliticaService.js): bloqueio fixo -> sempre liberado -> override FUNCAO do dono
// -> override FAMILIA do dono -> SEED abaixo -> BLOQUEADO. Função/família NOVA nasce BLOQUEADA: nada fica
// liberado sem alguém decidir.
//
// PR-A: só LEITURA (GET) é liberada. Escrita (POST/PUT/PATCH/DELETE) em família do seed resolve como PEDE.
// PR-B: PEDE tem fila — o middleware NÃO executa, guarda o pedido (agente_solicitacoes) e responde 202; o dono
// autoriza ou recusa (services/agenteSolicitacaoService.js). Mexer em REGRA de LIBERAR escrita é decisão do PR-D.
const NIVEIS = ['LIBERADO', 'PEDE', 'BLOQUEADO'];
const RESTRICAO = { LIBERADO: 0, PEDE: 1, BLOQUEADO: 2 }; // maior = mais restritivo
const PADRAO_DESCONHECIDO = 'BLOQUEADO';

// ───────────────────────── bloqueios FIXOS (nem override do dono libera) ─────────────────────────
// Prefixos (sem fronteira: `/api/config*` pega config-notas e config-gcal; `/api/admin*` pega admin-exec...).
// Dois grupos (o efeito é o MESMO — bloqueio fixo; a separação é só para a tela explicar o motivo):
//  - FIXO_DURO: as categorias que o dono definiu como "nunca" (gestão de agentes/usuários, admin, config com
//    senhas e chaves, NF-e, Asaas, WhatsApp, cobrança);
//  - FORA_DE_ESCOPO: módulos com dado pessoal ou sem uso para o agente; candidatos a virar módulo da matriz
//    numa etapa futura (decisão 5 do plano). Não afrouxar aqui.
const FIXO_DURO_PREFIXOS = ['agentes', 'admin', 'vendedores', 'migrations', 'config', 'notas-fiscais', 'asaas', 'whatsapp-clientes', 'mensagens-agendadas', 'cobranca'];
const FORA_DE_ESCOPO_PREFIXOS = ['cobrancas-rota', 'impressao', 'copiloto', 'rh', 'ponto', 'curriculos', 'funcionarios', 'comissoes', 'ia-uso', 'ia-logs', 'visitors', 'diarios', 'gps-clientes'];
const BLOQUEIO_PREFIXOS = new RegExp(`^\\/api\\/(${[...FIXO_DURO_PREFIXOS, ...FORA_DE_ESCOPO_PREFIXOS].join('|')})`);
const RE_FORA_DE_ESCOPO = new RegExp(`^\\/api\\/(${FORA_DE_ESCOPO_PREFIXOS.join('|')})`);
// `/api/auth/*` inteiro, EXCETO `GET /api/auth/me` (tratado em ehBloqueioFixo).
const AUTH_TUDO = /^\/api\/auth(\/|$)/;
const AUTH_ME = /^\/api\/auth\/me\/?$/;
// Consultas/manifestação na SEFAZ (notasEntrada.js): ato fiscal, nunca do agente.
const BLOQUEIO_SEFAZ = [
    /^POST \/api\/notas-entrada\/consultar-agora\/?$/,
    /^POST \/api\/notas-entrada\/buscar-chave\/?$/,
    /^POST \/api\/notas-entrada\/buscar-chave\/agendar\/?$/,
    /^POST \/api\/notas-entrada\/[^/]+\/manifestar\/?$/,
];

/** `caminho`: minúsculo, sem query. Vale tanto para o caminho do catálogo (`:p`) quanto para a URL crua. */
function ehBloqueioFixo(metodo, caminho) {
    const m = String(metodo || '').toUpperCase();
    const c = String(caminho || '').toLowerCase();
    if (BLOQUEIO_PREFIXOS.test(c)) return true;
    if (AUTH_TUDO.test(c) && !(m === 'GET' && AUTH_ME.test(c))) return true;
    const mc = `${m} ${c}`;
    return BLOQUEIO_SEFAZ.some((re) => re.test(mc));
}

// ───────────────────────── bloqueio fixo POR CHAVE (só com a MATRIZ ativa) ─────────────────────────
// Rotas de famílias liberadas que mandam/consultam serviço EXTERNO (Conta Azul, Asaas, WhatsApp, geocodificação):
// nunca do agente, nem pedindo. Valem só para agente com a matriz ativa (marcador MATRIZ/ativa) — sem o marcador a
// política antiga segue idêntica (essas rotas resolvem como PEDE, e o efeito externo já é cortado por assertNaoAgente).
// Chave = a do catálogo ("MÉTODO /api/caminho/:p"). Plano, seção 7.
const BLOQUEIO_CHAVES_MATRIZ = Object.freeze({
    'POST /api/contas-pagar/:p/reenviar-ca': 'Envio ao Conta Azul',
    'POST /api/conciliacao-bancaria/sincronizar-asaas': 'Consulta ao Asaas e conciliação automática',
    'POST /api/conciliacao-bancaria/identificar-debitos-ca': 'Consulta ao Conta Azul',
    'POST /api/contas-receber/:p/sync-ca': 'Consulta ao Conta Azul com baixa automática',
    'POST /api/contas-receber/sync-ca/todas': 'Consulta ao Conta Azul com baixa automática (em massa)',
    'POST /api/estoque/sync-produto/:p': 'Sincronização com o Conta Azul',
    'POST /api/pedidos/:p/enviar-whatsapp': 'Envio de WhatsApp ao cliente',
    'POST /api/pedidos/:p/consultar-ca': 'Consulta ao Conta Azul',
    'POST /api/pedidos/imprimir-lote': 'Busca nota/boleto em Focus, Conta Azul e Asaas',
    'POST /api/pedidos/imprimir-lote/checar': 'Consulta ao Conta Azul',
    'POST /api/pedidos/imprimir-lote/checar-pedido': 'Consulta ao Conta Azul',
    'POST /api/embarques/sugerir-divisao': 'Geocodificação em serviço externo',
    'POST /api/embarques/estimar-rotas': 'Geocodificação em serviço externo',
});
function ehBloqueioFixoPorChave(chave) { return Object.prototype.hasOwnProperty.call(BLOQUEIO_CHAVES_MATRIZ, String(chave || '')); }

/** Grupo do bloqueio fixo por prefixo/regra: 'FIXO_DURO' | 'FORA_DE_ESCOPO' | null (não é bloqueio fixo). Só para exibição. */
function grupoBloqueioFixo(metodo, caminho) {
    if (!ehBloqueioFixo(metodo, caminho)) return null;
    const c = String(caminho || '').toLowerCase();
    if (RE_FORA_DE_ESCOPO.test(c)) return 'FORA_DE_ESCOPO';
    return 'FIXO_DURO';
}

// ───────────────────────── sempre liberado ─────────────────────────
const REGRAS_SEMPRE_LIBERADO = [
    { metodos: ['GET'], caminho: /^\/api\/auth\/me\/?$/ },
    { metodos: ['GET'], caminho: /^\/api\/agente\/v1(\/|$)/ },
];
function ehSempreLiberado(metodo, caminho) {
    const m = String(metodo || '').toUpperCase();
    const c = String(caminho || '').toLowerCase();
    return REGRAS_SEMPRE_LIBERADO.some((r) => r.metodos.includes(m) && r.caminho.test(c));
}

// ───────────────────────── SEED de leitura ─────────────────────────
// Famílias cujas rotas GET entram LIBERADAS. Família fora desta lista = BLOQUEADA por padrão.
const FAMILIAS_LEITURA = [
    '/api/contas-pagar', '/api/anexos', '/api/contas-receber', '/api/fornecedores', '/api/notas-entrada',
    '/api/financeiro-gerencial', '/api/conciliacao-bancaria', '/api/contas-financeiras', '/api/categorias-estoque',
    '/api/pcp/itens', '/api/pcp/receitas', '/api/pcp/estoque', '/api/produtos', '/api/estoque', '/api/pedidos',
    '/api/clientes', '/api/indicadores-gestao', '/api/dashboards', '/api/caixa', '/api/embarques', '/api/entregas',
    '/api/contabilidade',
];

// POST que é só PRÉVIA/leitura (não grava): entram LIBERADOS como as leituras.
const POST_LEITURA = new Set([
    'POST /api/contas-pagar/avaliar-custo',
    'POST /api/notas-entrada/:p/avaliar-custo',
]);

// GET de família liberada que fica FORA do seed (relatado ao dono). Só um override FUNCAO explícito libera.
// motivo: 'pesado' (gera arquivo grande) · 'grava' (o GET escreve no banco/disco) · 'externo' (chama API de terceiro)
//         · 'sensivel' (devolve dado de todo o sistema).
const EXCECOES_LEITURA = {
    'GET /api/contabilidade/pacote-mes': 'pesado',
    'GET /api/contabilidade/notas-entrada-zip': 'pesado',
    'GET /api/caixa/resumo': 'grava',                           // cria o CaixaDiario do dia se não existir
    'GET /api/caixa/conferencia-dinheiro/config': 'grava',      // semeia a configuração padrão na 1ª leitura (1 linha)
    'GET /api/caixa/conferencia-dinheiro/autorizadores': 'grava', // idem (config semeada na leitura)
    'GET /api/caixa/audit-logs': 'sensivel',                    // devolve as últimas 50 ações de TODO o sistema
    'GET /api/embarques/mapa': 'externo',                       // geocodifica endereços de clientes em serviço externo
    'GET /api/pedidos/:p/nota-fiscal': 'externo',               // chama o Conta Azul até 12x e grava cache nfeChave/nfeNumero
    'GET /api/pedidos/:p/danfe': 'grava',                       // baixa XML da Focus/CA e grava cópia em disco
    'GET /api/pedidos/:p/cobrancas-ca': 'externo',              // consulta a API do Conta Azul
    'GET /api/clientes/consulta-cnpj/:p': 'externo',            // BrasilAPI/CNPJá + SEFAZ (IE)
    'GET /api/clientes/:p/endereco-historico/:p/geocode': 'externo', // serviço de geocodificação
    'GET /api/financeiro-gerencial/categorias-despesa': 'grava', // semeia/ajusta categorias e grupos DRE
    'GET /api/financeiro-gerencial/grupos-dre': 'grava',         // semeia os grupos padrão
};

/** Seed para uma entrada do catálogo { chave, metodo, familia, complexa }. Devolve { nivel, origem }. */
function nivelSeed(entrada) {
    if (entrada.complexa) return { nivel: 'BLOQUEADO', origem: 'padrao' };
    if (FAMILIAS_LEITURA.includes(entrada.familia)) {
        if (EXCECOES_LEITURA[entrada.chave]) return { nivel: 'BLOQUEADO', origem: 'padrao' };
        if (entrada.metodo === 'GET' || POST_LEITURA.has(entrada.chave)) return { nivel: 'LIBERADO', origem: 'seed' };
        return { nivel: 'PEDE', origem: 'seed' }; // escrita em família com política: PEDE (fila de solicitações: 202)
    }
    return { nivel: PADRAO_DESCONHECIDO, origem: 'padrao' };
}

/** Esta função é "leitura" (pode receber LIBERADO)? GET ou POST de prévia. */
function ehLeitura(entrada) {
    return entrada.metodo === 'GET' || POST_LEITURA.has(entrada.chave);
}

module.exports = {
    NIVEIS, RESTRICAO, PADRAO_DESCONHECIDO,
    BLOQUEIO_PREFIXOS, BLOQUEIO_SEFAZ, REGRAS_SEMPRE_LIBERADO,
    FIXO_DURO_PREFIXOS, FORA_DE_ESCOPO_PREFIXOS, BLOQUEIO_CHAVES_MATRIZ,
    ehBloqueioFixo, ehBloqueioFixoPorChave, grupoBloqueioFixo, ehSempreLiberado,
    FAMILIAS_LEITURA, POST_LEITURA, EXCECOES_LEITURA,
    nivelSeed, ehLeitura,
};
