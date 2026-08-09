// Lista oficial de vendedores do Bot Hardt que podem receber clientes escolhidos no site.
// Fonte: GET {BOT_WHATSAPP_URL}/api/site/vendedores (autenticado por x-api-key — por isso
// o site NUNCA chama o bot direto; este backend faz a ponte e o front consome
// /api/congelados-publico/vendedores-site).
//
// Contrato com o bot: a lista só traz pessoas ativas e marcadas no Painel Hardt com
// "Receber novos clientes escolhidos no site", e não pode ser guardada por mais de
// 5 minutos — daí o cache abaixo.

const CACHE_OK_MS = 5 * 60 * 1000;   // teto permitido pelo bot
const CACHE_ERRO_MS = 60 * 1000;     // falhou: tenta de novo em 1 min (sem martelar o bot)
const TIMEOUT_MS = 6000;

let cache = { em: 0, ttl: 0, vendedores: [] };

const getConfig = () => ({
    url: (process.env.BOT_WHATSAPP_URL || 'https://bot.hardtsalgados.com.br').replace(/\/+$/, ''),
    apiKey: process.env.BOT_WHATSAPP_API_KEY || '',
});

/**
 * Devolve [{ nome, setor }]. Em erro/indisponibilidade devolve [] — o site trata
 * lista vazia como "sem escolha de vendedor" e cai no botão "Falar com a equipe".
 */
async function listarVendedoresSite() {
    if (Date.now() - cache.em < cache.ttl) return cache.vendedores;

    const { url, apiKey } = getConfig();
    if (!apiKey) {
        console.warn('[BotSiteVendedores] BOT_WHATSAPP_API_KEY não configurada — lista vazia');
        cache = { em: Date.now(), ttl: CACHE_ERRO_MS, vendedores: [] };
        return [];
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const resp = await fetch(`${url}/api/site/vendedores`, {
            headers: { 'x-api-key': apiKey },
            signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const corpo = await resp.json();
        // Repassa SÓ nome e setor — nunca telefone, e-mail ou id interno do bot.
        const vendedores = (Array.isArray(corpo?.vendedores) ? corpo.vendedores : [])
            .map(v => ({ nome: String(v?.nome || '').trim(), setor: String(v?.setor || '').trim() }))
            .filter(v => v.nome);
        cache = { em: Date.now(), ttl: CACHE_OK_MS, vendedores };
        return vendedores;
    } catch (e) {
        console.error('[BotSiteVendedores] Falha ao consultar o bot:', e.message);
        cache = { em: Date.now(), ttl: CACHE_ERRO_MS, vendedores: [] };
        return [];
    } finally {
        clearTimeout(t);
    }
}

module.exports = { listarVendedoresSite };
