/**
 * Configuração da INADIMPLÊNCIA VISÍVEL (selo "em atraso" / "a confirmar" e a
 * trava de venda a cliente devedor). Guardada em `app_configs`, chave abaixo —
 * mesmo padrão de `caixaConferenciaConfig`.
 *
 * ⚠️ NÃO usar `POST /api/config/:key` para gravar isto: aquela rota não checa
 * admin. A gravação passa SEMPRE por `salvar()` (rota PUT /api/inadimplencia/config,
 * só admin) — que valida, trava `siteExigeResponsavel` e grava quem mudou no AuditLog.
 *
 * Carência e valor mínimo valem SÓ para TRAVAR a venda (`bloqueiaVenda`). O selo
 * vermelho aparece desde o 1º dia de atraso.
 */
const prisma = require('./database');

const CHAVE = 'inadimplencia_config';

const PADRAO = {
    carenciaDias: 3,            // dias de atraso até a venda travar
    valorMinimoBloqueio: 50,    // R$ mínimo em atraso (com a carência cumprida) para travar
    prazoAConfirmarDias: 7,     // dinheiro/Pix/cartão apontado e não conferido: depois disso vira "a confirmar"
    funcionarioFora: true,      // compra de funcionário não entra na inadimplência
    motoristaVeAtraso: true,    // motorista vê o aviso de atraso no checkout da entrega
    siteExigeResponsavel: true, // 🔒 TRAVADA: o servidor ignora tentativa de desligar
};

const CHAVES_TRAVADAS = ['siteExigeResponsavel'];
// Campos que o próprio GET devolve junto da config (o front pode reenviar o objeto inteiro no PUT):
// são ignorados em silêncio. Chave realmente desconhecida continua dando erro.
const CHAVES_SOMENTE_LEITURA = ['ultimaMudanca', 'ignoradas'];

const ESPECIFICACAO = {
    carenciaDias: { tipo: 'int', min: 0, max: 365 },
    valorMinimoBloqueio: { tipo: 'num', min: 0, max: 100000 },
    prazoAConfirmarDias: { tipo: 'int', min: 0, max: 365 },
    funcionarioFora: { tipo: 'bool' },
    motoristaVeAtraso: { tipo: 'bool' },
    siteExigeResponsavel: { tipo: 'bool' },
};

// Cache curto para selo/lista. A TRAVA de venda usa get({ fresh: true }).
let _cache = null;
let _cacheEm = 0;
const TTL_MS = 30000;

const get = async ({ fresh = false } = {}) => {
    if (!fresh && _cache && Date.now() - _cacheEm < TTL_MS) return _cache;
    try {
        const linha = await prisma.appConfig.findUnique({ where: { key: CHAVE } });
        const valor = linha?.value && typeof linha.value === 'object' ? linha.value : {};
        const cfg = { ...PADRAO };
        for (const k of Object.keys(PADRAO)) {
            if (valor[k] !== undefined && validarValor(k, valor[k]).ok) cfg[k] = validarValor(k, valor[k]).valor;
        }
        cfg.siteExigeResponsavel = true; // travada, nunca vem do banco
        _cache = cfg;
    } catch (e) {
        // Banco fora do ar não pode derrubar o selo: mantém o ÚLTIMO valor bom (se nunca leu, o padrão).
        // Sobrescrever por PADRAO aqui faria uma queda de banco desfazer o ajuste do admin por 30 s.
        console.error('[Inadimplencia] Falha ao ler config:', e.message);
        if (!_cache) _cache = { ...PADRAO };
    }
    _cacheEm = Date.now();
    return _cache;
};

function validarValor(chave, v) {
    const esp = ESPECIFICACAO[chave];
    if (!esp) return { ok: false, erro: `Chave desconhecida: ${chave}` };
    if (esp.tipo === 'bool') {
        if (typeof v !== 'boolean') return { ok: false, erro: `${chave}: use verdadeiro ou falso.` };
        return { ok: true, valor: v };
    }
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v;
    if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false, erro: `${chave}: informe um número.` };
    if (esp.tipo === 'int' && !Number.isInteger(n)) return { ok: false, erro: `${chave}: informe um número inteiro.` };
    if (n < esp.min || n > esp.max) return { ok: false, erro: `${chave}: use um valor entre ${esp.min} e ${esp.max}.` };
    return { ok: true, valor: esp.tipo === 'num' ? Math.round(n * 100) / 100 : n };
}

/**
 * Grava só o que mudou. `usuario` = { id, nome } (obrigatório para o histórico).
 * Devolve { cfg, erros[], alteradas[], ignoradas[] }.
 */
const salvar = async (parcial, usuario) => {
    const atual = await get({ fresh: true });
    const novo = { ...atual };
    const erros = [];
    const alteradas = [];
    const ignoradas = [];
    for (const [chave, bruto] of Object.entries(parcial || {})) {
        if (CHAVES_SOMENTE_LEITURA.includes(chave)) continue;
        if (!(chave in PADRAO)) { erros.push(`Chave desconhecida: ${chave}`); continue; }
        if (CHAVES_TRAVADAS.includes(chave)) { ignoradas.push(chave); continue; }
        const r = validarValor(chave, bruto);
        if (!r.ok) { erros.push(r.erro); continue; }
        if (atual[chave] !== r.valor) {
            alteradas.push({ chave, de: atual[chave], para: r.valor });
            novo[chave] = r.valor;
        }
    }
    if (erros.length) return { cfg: atual, erros, alteradas: [], ignoradas };
    if (alteradas.length) {
        await prisma.appConfig.upsert({
            where: { key: CHAVE },
            update: { value: novo },
            create: { key: CHAVE, value: novo },
        });
        _cache = novo;
        _cacheEm = Date.now();
        // O cache de 60 s do Set global do service (dashboards/aging) também precisa cair.
        try { require('../services/inadimplenciaService').limparCache(); } catch (_) { /* nunca derruba o salvar */ }
        // Histórico: depois do upsert e fora de qualquer transação — log nunca desfaz a config.
        for (const a of alteradas) {
            try {
                await prisma.auditLog.create({
                    data: {
                        acao: 'CONFIG_INADIMPLENCIA',
                        entidade: 'AppConfig',
                        entidadeId: CHAVE,
                        detalhes: JSON.stringify(a),
                        usuarioId: String(usuario?.id || 'desconhecido'),
                        usuarioNome: String(usuario?.nome || 'Desconhecido'),
                    },
                });
            } catch (e) {
                console.error('[Inadimplencia] Falha ao gravar histórico da config:', e.message);
            }
        }
    }
    return { cfg: novo, erros: [], alteradas, ignoradas };
};

/** Últimas mudanças (mais recentes primeiro). */
const historico = async (limite = 100) => {
    const linhas = await prisma.auditLog.findMany({
        where: { acao: 'CONFIG_INADIMPLENCIA', entidade: 'AppConfig', entidadeId: CHAVE },
        orderBy: { createdAt: 'desc' },
        take: limite,
    });
    return linhas.map((l) => {
        let d = {};
        try { d = JSON.parse(l.detalhes || '{}'); } catch (_) { /* detalhes antigos/ilegíveis */ }
        return { chave: d.chave || null, de: d.de ?? null, para: d.para ?? null, usuarioNome: l.usuarioNome, em: l.createdAt };
    });
};

/** { [chave]: { usuarioNome, em } } — a última mudança de cada chave. */
const ultimaMudancaPorChave = async () => {
    const h = await historico(300);
    const mapa = {};
    for (const l of h) if (l.chave && !mapa[l.chave]) mapa[l.chave] = { usuarioNome: l.usuarioNome, em: l.em };
    return mapa;
};

const limparCache = () => { _cache = null; _cacheEm = 0; };

module.exports = { CHAVE, PADRAO, CHAVES_TRAVADAS, get, salvar, historico, ultimaMudancaPorChave, limparCache, validarValor };
