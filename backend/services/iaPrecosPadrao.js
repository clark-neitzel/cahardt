/**
 * Tabela de preços PADRÃO da IA (USD por 1 milhão de tokens), embutida no código para o custo
 * se resolver SOZINHO — ninguém precisa cadastrar nada em Configurações → IA.
 *
 * FONTE (consultada em out/2026): sites comparadores de preço (eesel.ai, anotherwrapper.com).
 * NÃO é a página oficial da OpenAI — conferir em https://openai.com/api/pricing quando possível.
 * O que o admin cadastrar em `ia_precos` (Configurações → IA) SEMPRE vale mais que esta tabela.
 *
 * Só entram modelos com preço conhecido. Modelo fora da tabela => sem preço (null), nunca inventado.
 * gemini-1.5-flash (referenciado no aiProvider) fica de fora de propósito: sem preço seguro => "sem preço".
 */
const PRECOS_PADRAO = {
    'gpt-6-luna':   { entradaUsdPorM: 0.10, saidaUsdPorM: 0.50, entradaCacheUsdPorM: 0.01 }, // cache de entrada: não usado hoje
    'gpt-6-sol':    { entradaUsdPorM: 2.00, saidaUsdPorM: 10.00 },
    'gpt-6-astra':  { entradaUsdPorM: 10.00, saidaUsdPorM: 50.00 },
    'gpt-5.6-luna': { entradaUsdPorM: 0.20, saidaUsdPorM: 1.20 },
    // Modelos aposentados em 14/10/2026 — ficam só para precificar o histórico (linhas antigas).
    // Preços de lista conhecidos da OpenAI (gerações 4o/4.1); conferir se possível.
    'gpt-4o-mini':  { entradaUsdPorM: 0.15, saidaUsdPorM: 0.60 },
    'gpt-4o':       { entradaUsdPorM: 2.50, saidaUsdPorM: 10.00 },
    'gpt-4.1-mini': { entradaUsdPorM: 0.40, saidaUsdPorM: 1.60 },
    'gpt-4.1':      { entradaUsdPorM: 2.00, saidaUsdPorM: 8.00 },
};

const COTACAO_ULTIMO_RECURSO = 5.0;

/**
 * Acha o preço de um modelo numa tabela { nome: {entradaUsdPorM, saidaUsdPorM} }.
 * 1) nome exato; 2) nome com sufixo de versão/data (`gpt-6-luna-2026-10-01`, `gpt-6-luna-latest`)
 * => escolhe o MAIOR nome da tabela que seja prefixo seguido de '-' (assim `gpt-6-luna` nunca casa com `gpt-6-sol`).
 */
function acharPreco(tabela, modelo) {
    if (!tabela || !modelo) return null;
    const nome = String(modelo).trim().toLowerCase();
    const chaves = Object.keys(tabela).filter((k) => k !== 'cotacaoBrl');
    const exato = chaves.find((k) => k.toLowerCase() === nome);
    if (exato) return tabela[exato];
    let melhor = null;
    for (const k of chaves) {
        const kl = k.toLowerCase();
        if (nome.startsWith(`${kl}-`) && /^(\d|latest|preview)/.test(nome.slice(kl.length + 1)) && (!melhor || kl.length > melhor.length)) melhor = k;
    }
    return melhor ? tabela[melhor] : null;
}

const precoValido = (p) => !!p && Number.isFinite(p.entradaUsdPorM) && Number.isFinite(p.saidaUsdPorM);

/** Override do admin primeiro, depois o padrão. null se desconhecido. */
function resolverPreco(modelo, overrides) {
    const o = acharPreco(overrides, modelo);
    if (precoValido(o)) return o;
    const d = acharPreco(PRECOS_PADRAO, modelo);
    return precoValido(d) ? d : null;
}

module.exports = { PRECOS_PADRAO, COTACAO_ULTIMO_RECURSO, acharPreco, resolverPreco, precoValido };
