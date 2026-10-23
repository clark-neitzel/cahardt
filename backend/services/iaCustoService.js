/**
 * Preço/custo da IA — resolve SOZINHO:
 *   preço: 1º o que o admin cadastrou (AppConfig `ia_precos`, override) → 2º tabela padrão embutida
 *          (iaPrecosPadrao.js) → 3º null (modelo desconhecido: "sem preço", nunca 0).
 *   cotação USD→BRL: 1º `cotacaoBrl` manual do admin → 2º cotação automática (AwesomeAPI, cache
 *          em memória 6h + persistida em AppConfig `ia_cotacao_auto`) → 3º 5.0 marcada como estimada.
 * Nenhuma falha de rede derruba nada; a busca de cotação nunca é esperada pelo registro de uso.
 */
const prisma = require('../config/database');
const { resolverPreco, PRECOS_PADRAO, COTACAO_ULTIMO_RECURSO } = require('./iaPrecosPadrao');

const CHAVE_PRECOS = 'ia_precos';
const CHAVE_COTACAO_AUTO = 'ia_cotacao_auto';
const URL_COTACAO = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const TTL_COTACAO_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_COTACAO_MS = 4000;

/** Só o que o admin cadastrou (override). Usado pela tela de configuração. */
async function lerPrecos() {
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: CHAVE_PRECOS } });
        return row && row.value && typeof row.value === 'object' ? row.value : {};
    } catch { return {}; }
}

/** Preço efetivo (override > padrão > null). `precosPre` = override já lido. */
function precoDoModelo(modelo, precosPre) { return resolverPreco(modelo, precosPre || {}); }

/** Custo em USD (6 casas) ou null quando não há preço/uso — NUNCA devolve 0 por falta de preço. */
async function custoUsd(modelo, usage, precosPre) {
    if (!usage || usage.prompt == null || usage.resposta == null) return null;
    const p = precoDoModelo(modelo, precosPre || await lerPrecos());
    if (!p) return null;
    return Number(((usage.prompt * p.entradaUsdPorM + usage.resposta * p.saidaUsdPorM) / 1e6).toFixed(6));
}

// ── Cotação automática ──
let _cot = { valor: null, atualizadoEm: 0 };
let _refrescando = null;
let _ultimaTentativaEm = 0;           // falha não é repetida a cada chamada: só após RETENTAR_APOS_MS
const RETENTAR_APOS_MS = 10 * 60 * 1000;

function valorValido(v) { return Number.isFinite(v) && v > 0.5 && v < 100; }

async function buscarCotacaoRede() {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_COTACAO_MS);
    try {
        const r = await fetch(URL_COTACAO, { signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const v = Number(j && j.USDBRL && j.USDBRL.bid);
        if (!valorValido(v)) throw new Error('cotação inválida');
        return Number(v.toFixed(4));
    } finally { clearTimeout(t); }
}

async function lerCotacaoSalva() {
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: CHAVE_COTACAO_AUTO } });
        const v = row && row.value;
        if (v && valorValido(Number(v.valor))) return { valor: Number(v.valor), atualizadoEm: Date.parse(v.atualizadoEm) || 0 };
    } catch { /* sem salvo */ }
    return null;
}

/** Busca na rede e persiste. NUNCA lança; devolve true se atualizou. Uma busca por vez. */
function atualizarCotacao() {
    if (_refrescando) return _refrescando;
    _ultimaTentativaEm = Date.now();
    _refrescando = (async () => {
        try {
            const valor = await buscarCotacaoRede();
            const agora = Date.now();
            _cot = { valor, atualizadoEm: agora };
            try {
                const value = { valor, atualizadoEm: new Date(agora).toISOString(), fonte: 'awesomeapi' };
                await prisma.appConfig.upsert({ where: { key: CHAVE_COTACAO_AUTO }, update: { value }, create: { key: CHAVE_COTACAO_AUTO, value } });
            } catch (e) { console.error('[IaCusto] cotação não persistida:', e.message); }
            return true;
        } catch (e) {
            console.error('[IaCusto] cotação automática indisponível (usando a última salva):', e.message);
            return false;
        } finally { _refrescando = null; }
    })();
    return _refrescando;
}

/**
 * Cotação efetiva { valor, estimada, fonte }. Nunca espera rede, exceto `aguardarRede:true`
 * (só o painel, e só quando NUNCA houve cotação). Dispara refresh em segundo plano quando velha.
 */
async function cotacaoEfetiva(precosPre, { aguardarRede = false } = {}) {
    const manual = Number((precosPre || {}).cotacaoBrl);
    if (Number.isFinite(manual) && manual > 0) return { valor: manual, estimada: false, fonte: 'manual' };
    if (!_cot.valor) {
        const salva = await lerCotacaoSalva();
        if (salva) _cot = salva;
    }
    const podeTentar = Date.now() - _ultimaTentativaEm > RETENTAR_APOS_MS;
    if (!_cot.valor && aguardarRede && podeTentar) await atualizarCotacao();
    else if ((!_cot.valor || Date.now() - _cot.atualizadoEm > TTL_COTACAO_MS) && podeTentar) atualizarCotacao().catch(() => {});
    if (_cot.valor) return { valor: _cot.valor, estimada: false, fonte: 'automatica', atualizadoEm: new Date(_cot.atualizadoEm).toISOString() };
    return { valor: COTACAO_ULTIMO_RECURSO, estimada: true, fonte: 'estimada' };
}

module.exports = {
    CHAVE_PRECOS, CHAVE_COTACAO_AUTO, PRECOS_PADRAO, lerPrecos, precoDoModelo, custoUsd,
    cotacaoEfetiva, atualizarCotacao,
    _t: { zerarCache() { _cot = { valor: null, atualizadoEm: 0 }; _refrescando = null; _ultimaTentativaEm = 0; }, buscarCotacaoRede },
};
