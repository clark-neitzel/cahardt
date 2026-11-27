// Política do agente: decide LIBERADO / PEDE / BLOQUEADO para cada requisição do token cah_ag_ e
// gerencia as exceções do dono (tabela agente_politicas).
//
// Ordem de resolução: bloqueio fixo -> sempre liberado -> override FUNCAO -> override FAMILIA -> seed -> BLOQUEADO.
//
// MATRIZ (módulo × ação): quando o agente tem o marcador `escopo=MATRIZ, chave=ativa` em agente_politicas, a ordem passa a
// ser: bloqueio fixo (prefixo OU chave) -> sempre liberado -> rota complexa -> só-admin -> exceção FUNCAO -> célula da
// matriz (`escopo=MODULO`, chave `<modulo>.<acao>`). Linhas FAMILIA são ignoradas. SEM o marcador nada muda: a
// resolução é a de cima, linha por linha. Ver config/agenteModulos.js e config/agenteClassificacao.js.
// Quando a URL casa com mais de uma função do catálogo, vale a MAIS RESTRITIVA (BLOQUEADO > PEDE > LIBERADO).
// Token e permissões do agente continuam lidos do banco a cada chamada (agenteTokenService); só os overrides
// ficam em cache (TTL curto + invalidação imediata ao alterar pela API).
const prisma = require('../config/database');
const padrao = require('../config/agentePoliticaPadrao');
const { rotuloDe } = require('../config/agenteRotulos');
const modulos = require('../config/agenteModulos');
const classificacao = require('../config/agenteClassificacao');
const catalogo = require('./agenteCatalogoRotas');

const TTL_MS = 15 * 1000;
const STALE_MAX_MS = 5 * 60 * 1000; // banco de políticas fora: usa o último cache por no máximo 5 min, depois 503 (fecha)
const cache = new Map();       // vendedorId -> { ate, funcao: Map, familia: Map }
const geracao = new Map();     // vendedorId -> número (sobe a cada invalidação; descarta carga que começou antes)
const carregando = new Map();  // vendedorId -> Promise (várias requisições simultâneas dividem 1 consulta)

function erro(status, msg, codigo) { const e = new Error(msg); e.status = status; if (codigo) e.codigo = codigo; return e; }

// ───────────────────────── overrides (cache) ─────────────────────────
function montarMapas(linhas) {
    const funcao = new Map();
    const familia = new Map();
    const modulo = new Map(); // `<modulo>.<acao>` -> nivel (células da matriz)
    let matrizAtiva = false;
    for (const l of linhas) {
        if (!padrao.NIVEIS.includes(l.nivel)) continue; // linha inválida é ignorada
        if (l.escopo === 'FUNCAO') funcao.set(String(l.chave), l.nivel);
        else if (l.escopo === 'FAMILIA') familia.set(String(l.chave), l.nivel);
        else if (l.escopo === 'MODULO') { if (modulos.lerChaveCelula(l.chave)) modulo.set(String(l.chave), l.nivel); }
        else if (l.escopo === 'MATRIZ' && l.chave === 'ativa' && l.nivel === 'LIBERADO') matrizAtiva = true;
    }
    return { funcao, familia, modulo, matrizAtiva };
}

async function overridesDe(vendedorId) {
    const agora = Date.now();
    const c = cache.get(vendedorId);
    if (c && agora < c.ate) return c;
    if (carregando.has(vendedorId)) return carregando.get(vendedorId);
    const g = geracao.get(vendedorId) || 0;
    const p = (async () => {
        try {
            const linhas = await prisma.agentePolitica.findMany({ where: { vendedorId }, select: { escopo: true, chave: true, nivel: true } });
            const novo = { ate: Date.now() + TTL_MS, ...montarMapas(linhas) };
            if ((geracao.get(vendedorId) || 0) === g) cache.set(vendedorId, novo); // invalidou no meio? não guarda
            return novo;
        } catch (e) {
            console.error('[AgentePolitica] falha ao ler os overrides:', e.message);
            // usa o último conhecido (vencido) em vez de derrubar o agente — mas só por STALE_MAX_MS desde a última carga boa
            if (c && Date.now() - (c.ate - TTL_MS) <= STALE_MAX_MS) return c;
            throw erro(503, 'Política do agente indisponível no momento.', 'AGENTE_POLITICA_INDISPONIVEL');
        } finally {
            carregando.delete(vendedorId);
        }
    })();
    carregando.set(vendedorId, p);
    return p;
}

function invalidar(vendedorId) {
    cache.delete(vendedorId);
    carregando.delete(vendedorId);
    geracao.set(vendedorId, (geracao.get(vendedorId) || 0) + 1);
}

// ───────────────────────── resolução de uma função do catálogo ─────────────────────────
/**
 * Função resolvida pela MATRIZ (só chamada com o marcador ativo, depois de bloqueio fixo / sempre liberado / complexa).
 * Devolve os campos de sempre { nivel, origem, fixo } MAIS (aditivos): matriz:true, modulo, acao, classificada,
 * codigo (AGENTE_SO_ADMIN | AGENTE_SEM_PERMISSAO quando nega) e motivoGuarda (quando um SIM é rebaixado a PEDE).
 */
function resolverPelaMatriz(entrada, ov) {
    const mod = modulos.moduloDaFamilia(entrada.familia);
    if (!mod) return { nivel: padrao.PADRAO_DESCONHECIDO, origem: 'padrao', fixo: false, matriz: true }; // família sem módulo: como hoje
    const cls = classificacao.classificar(entrada.chave);
    const ehGet = entrada.metodo === 'GET';
    const base = { fixo: false, matriz: true, modulo: mod.chave };
    // só-admin: o agente nunca é admin -> nem adianta pedir (o pedido autorizado voltaria 403 da própria rota)
    if (cls && cls.soAdmin) return { ...base, nivel: 'BLOQUEADO', origem: 'so_admin', acao: cls.acao, classificada: true, codigo: 'AGENTE_SO_ADMIN' };
    if (cls && cls.morta) return { ...base, nivel: 'BLOQUEADO', origem: 'padrao', acao: cls.acao, classificada: true };
    const acao = cls ? cls.acao : (ehGet ? 'ver' : null);
    // exceção por FUNÇÃO (do dono) vence a célula. LIBERADO só para leitura ou função de escrita CLASSIFICADA
    // (escrita não classificada nunca ganha autonomia: cai na regra abaixo).
    const nf = ov.funcao.get(entrada.chave);
    if (nf && padrao.NIVEIS.includes(nf) && (nf !== 'LIBERADO' || ehGet || cls)) {
        return { ...base, nivel: nf, origem: 'override', acao: acao || 'editar', classificada: !!(cls || ehGet) };
    }
    // GET que grava / chama serviço externo / é pesado: segue fora (só exceção FUNCAO explícita libera)
    if (ehGet && padrao.EXCECOES_LEITURA[entrada.chave]) return { ...base, nivel: 'BLOQUEADO', origem: 'padrao', acao: 'ver', classificada: true };
    if (!acao) {
        // escrita NÃO classificada em família com módulo: nasce em PEDE (se `editar` do módulo não for NÃO), nunca em SIM
        const ed = ov.modulo.get(modulos.chaveCelula(mod.chave, 'editar'));
        if (ed && ed !== 'BLOQUEADO') return { ...base, nivel: 'PEDE', origem: 'matriz', acao: 'editar', classificada: false };
        return { ...base, nivel: 'BLOQUEADO', origem: 'matriz', acao: 'editar', classificada: false, codigo: 'AGENTE_SEM_PERMISSAO' };
    }
    let nivel = ov.modulo.get(modulos.chaveCelula(mod.chave, acao)) || 'BLOQUEADO'; // célula sem linha = NÃO (nega por padrão)
    if (acao === 'ver' && nivel === 'PEDE') nivel = 'BLOQUEADO'; // `ver` não aceita PEDE (o PUT recusa; linha torta fecha)
    if (nivel === 'BLOQUEADO') return { ...base, nivel, origem: 'matriz', acao, classificada: true, codigo: 'AGENTE_SEM_PERMISSAO' };
    if (nivel === 'LIBERADO' && cls && cls.semprePede) {
        return { ...base, nivel: 'PEDE', origem: 'matriz', acao, classificada: true, motivoGuarda: cls.semprePede };
    }
    return { ...base, nivel, origem: 'matriz', acao, classificada: true };
}

/** { nivel, origem: fixo|override|seed|padrao|matriz|so_admin, fixo } de UMA função, dados os overrides do agente. */
function resolverEntrada(entrada, ov) {
    if (padrao.ehBloqueioFixo(entrada.metodo, entrada.exemplo)) return { nivel: 'BLOQUEADO', origem: 'fixo', fixo: true };
    const matrizAtiva = !!(ov && ov.matrizAtiva);
    // bloqueio fixo POR CHAVE (envio/consulta externa): só existe para agente com a matriz ativa
    if (matrizAtiva && padrao.ehBloqueioFixoPorChave(entrada.chave)) return { nivel: 'BLOQUEADO', origem: 'fixo', fixo: true, matriz: true };
    if (padrao.ehSempreLiberado(entrada.metodo, entrada.exemplo)) return { nivel: 'LIBERADO', origem: 'fixo', fixo: true };
    if (entrada.complexa) return { nivel: 'BLOQUEADO', origem: 'padrao', fixo: false };
    if (matrizAtiva) return resolverPelaMatriz(entrada, ov);
    const leitura = padrao.ehLeitura(entrada);
    const nf = ov && ov.funcao.get(entrada.chave);
    if (nf && padrao.NIVEIS.includes(nf) && (nf !== 'LIBERADO' || leitura)) return { nivel: nf, origem: 'override', fixo: false };
    const nfam = ov && ov.familia.get(entrada.familia);
    // família LIBERADA só vale para leitura e nunca abre uma exceção "grava/externo/pesado" (essas só por FUNCAO)
    if (nfam && padrao.NIVEIS.includes(nfam) && (nfam !== 'LIBERADO' || (leitura && !padrao.EXCECOES_LEITURA[entrada.chave]))) {
        return { nivel: nfam, origem: 'override', fixo: false };
    }
    const s = padrao.nivelSeed(entrada);
    return { nivel: s.nivel, origem: s.origem, fixo: false };
}

function maisRestritivo(a, b) { return padrao.RESTRICAO[b.nivel] > padrao.RESTRICAO[a.nivel] ? b : a; }

/**
 * Decisão para uma requisição concreta.
 * Devolve { nivel, chave, familia, fixo, origem }. `chave` é a função do catálogo que decidiu (ou o caminho
 * normalizado quando a rota é desconhecida; null se o caminho for tortuoso).
 */
async function avaliar(app, vendedorId, metodo, urlOriginal) {
    const n = catalogo.normalizarUrl(metodo, urlOriginal);
    if (!n) return { nivel: 'BLOQUEADO', chave: null, familia: null, fixo: true, origem: 'fixo', motivo: 'caminho_invalido' };
    const chaveCrua = `${n.metodo} ${n.caminho}`;
    // defesa dupla: bloqueio fixo também sobre o caminho CRU, mesmo que o catálogo não conheça a rota
    if (padrao.ehBloqueioFixo(n.metodo, n.caminho)) {
        return { nivel: 'BLOQUEADO', chave: chaveCrua, familia: catalogo.familiaDe(n.caminho), fixo: true, origem: 'fixo' };
    }
    if (padrao.ehSempreLiberado(n.metodo, n.caminho)) {
        return { nivel: 'LIBERADO', chave: chaveCrua, familia: catalogo.familiaDe(n.caminho), fixo: true, origem: 'fixo' };
    }
    const { entradas, complexa } = catalogo.resolver(app, metodo, urlOriginal);
    if (complexa) { // casa com o prefixo de uma rota com regex no caminho: não dá para saber qual rota ganha -> fecha
        return { nivel: 'BLOQUEADO', chave: chaveCrua, familia: catalogo.familiaDe(n.caminho), fixo: false, origem: 'padrao', motivo: 'rota_complexa' };
    }
    if (!entradas.length) {
        return { nivel: padrao.PADRAO_DESCONHECIDO, chave: chaveCrua, familia: catalogo.familiaDe(n.caminho), fixo: false, origem: 'padrao', desconhecida: true };
    }
    const ov = await overridesDe(vendedorId);
    let pior = null;
    for (const e of entradas) {
        const r = { ...resolverEntrada(e, ov), chave: e.chave, familia: e.familia };
        pior = pior ? maisRestritivo(pior, r) : r;
    }
    // aditivo: quando a URL casa com mais de uma função, as guardas olham todas
    if (entradas.length > 1) pior = { ...pior, chavesCasadas: entradas.map((e) => e.chave) };
    return pior;
}

// ───────────────────────── leitura administrativa ─────────────────────────
async function linhasFrescas(vendedorId) {
    return prisma.agentePolitica.findMany({ where: { vendedorId }, orderBy: { atualizadoEm: 'desc' } });
}

function paraItem(e, ov, info) {
    const r = resolverEntrada(e, ov);
    const linha = r.origem === 'override' ? (info.funcao.get(e.chave) || info.familia.get(e.familia) || null) : null;
    return {
        chave: e.chave, metodo: e.metodo, exemplo: e.exemplo, familia: e.familia,
        rotulo: rotuloDe(e.chave), nivelEfetivo: r.nivel, origem: r.origem, fixo: r.fixo,
        ...(r.matriz ? { modulo: r.modulo || null, acao: r.acao || null } : {}),
        ...(linha ? { motivo: linha.motivo || null, atualizadoPorNome: linha.atualizadoPorNome, atualizadoEm: linha.atualizadoEm, escopoOverride: linha.escopo } : {}),
    };
}

async function contexto(app, vendedorId) {
    const linhas = await linhasFrescas(vendedorId);
    const ov = montarMapas(linhas);
    const info = { funcao: new Map(), familia: new Map() };
    for (const l of linhas) {
        if (!padrao.NIVEIS.includes(l.nivel)) continue;
        if (l.escopo === 'FUNCAO') info.funcao.set(String(l.chave), l);
        else if (l.escopo === 'FAMILIA') info.familia.set(String(l.chave), l);
    }
    return { cat: catalogo.catalogoDe(app), ov, info, linhas };
}

/** Catálogo mesclado com a política efetiva: filtros familia, nivel, semRegra, q; paginado. */
async function listar(app, vendedorId, { familia, nivel, semRegra, q, pagina, porPagina } = {}) {
    const { cat, ov, info } = await contexto(app, vendedorId);
    let itens = cat.rotas.map((e) => paraItem(e, ov, info));
    if (familia) { const f = String(familia).toLowerCase().replace(/\/+$/, ''); itens = itens.filter((i) => i.familia === f); }
    if (nivel) { const n = String(nivel).toUpperCase(); itens = itens.filter((i) => i.nivelEfetivo === n); }
    if (semRegra === true || semRegra === '1' || semRegra === 'true') itens = itens.filter((i) => i.origem !== 'override' && !i.fixo);
    if (q) { const t = String(q).toLowerCase(); itens = itens.filter((i) => i.chave.toLowerCase().includes(t) || (i.rotulo || '').toLowerCase().includes(t)); }
    itens.sort((a, b) => a.familia.localeCompare(b.familia) || a.chave.localeCompare(b.chave));
    const pp = Math.min(Math.max(parseInt(porPagina, 10) || 50, 1), 200);
    const pg = Math.max(parseInt(pagina, 10) || 1, 1);
    return { total: itens.length, pagina: pg, porPagina: pp, itens: itens.slice((pg - 1) * pp, pg * pp) };
}

/** Contagem por família e nível. */
async function resumoPorFamilia(app, vendedorId) {
    const { cat, ov } = await contexto(app, vendedorId);
    const por = new Map();
    for (const e of cat.rotas) {
        const r = resolverEntrada(e, ov);
        let f = por.get(e.familia);
        if (!f) { f = { familia: e.familia, total: 0, liberado: 0, pede: 0, bloqueado: 0, comOverride: 0 }; por.set(e.familia, f); }
        f.total += 1;
        f[r.nivel.toLowerCase()] += 1;
        if (r.origem === 'override') f.comOverride += 1;
    }
    return [...por.values()].sort((a, b) => a.familia.localeCompare(b.familia));
}

/** Resumo curto para /api/agente/v1/meu-acesso (usa o cache de overrides: rota quente do agente). */
async function resumoCurto(app, vendedorId) {
    const cat = catalogo.catalogoDe(app);
    const ov = await overridesDe(vendedorId);
    const total = { liberado: 0, pede: 0, bloqueado: 0 };
    const por = new Map();
    for (const e of cat.rotas) {
        const n = resolverEntrada(e, ov).nivel.toLowerCase();
        total[n] += 1;
        let f = por.get(e.familia);
        if (!f) { f = { familia: e.familia, liberado: 0, pede: 0, bloqueado: 0 }; por.set(e.familia, f); }
        f[n] += 1;
    }
    return { ...total, familias: [...por.values()].sort((a, b) => a.familia.localeCompare(b.familia)) };
}

// ───────────────────────── escrita (admin humano) ─────────────────────────
function normalizarChaveFuncao(texto) {
    const m = String(texto || '').trim().match(/^([A-Za-z]+)\s+(\/\S*)$/);
    if (!m) return null;
    let caminho = m[2].toLowerCase().replace(/:\w+/g, ':p').replace(/\/{2,}/g, '/');
    if (caminho.length > 1) caminho = caminho.replace(/\/+$/, '');
    return `${m[1].toUpperCase()} ${caminho}`;
}
function normalizarChaveFamilia(texto) {
    const t = String(texto || '').trim().toLowerCase().replace(/\/+$/, '');
    return t.startsWith('/') ? t : null;
}

// Valida e normaliza um pedido de override. Devolve { escopo, chave, nivel, entrada?, familiaEntradas? } ou lança 400/422.
function validarOverride(app, { escopo, chave, nivel }, { matrizAtiva = false } = {}) {
    const esc = String(escopo || '').toUpperCase();
    const niv = String(nivel || '').toUpperCase();
    if (esc !== 'FUNCAO' && esc !== 'FAMILIA') throw erro(400, 'escopo deve ser FUNCAO ou FAMILIA.');
    if (!padrao.NIVEIS.includes(niv)) throw erro(400, 'nivel deve ser LIBERADO, PEDE ou BLOQUEADO.');
    const cat = catalogo.catalogoDe(app);
    if (esc === 'FUNCAO') {
        const k = normalizarChaveFuncao(chave);
        const entrada = k && cat.porChave.get(k);
        if (!entrada) throw erro(422, 'Função desconhecida: não está no catálogo de rotas do sistema.');
        const r = resolverEntrada(entrada, null);
        if (r.fixo) {
            if (niv === 'BLOQUEADO' && r.nivel === 'BLOQUEADO') return { escopo: esc, chave: k, nivel: niv, semEfeito: true };
            throw erro(422, 'Bloqueio fixo (ou acesso sempre liberado): não pode ser alterado.');
        }
        if (matrizAtiva && padrao.ehBloqueioFixoPorChave(k)) {
            if (niv === 'BLOQUEADO') return { escopo: esc, chave: k, nivel: niv, semEfeito: true };
            throw erro(422, 'Bloqueio fixo (efeito externo): não pode ser alterado.');
        }
        if (niv === 'LIBERADO' && !padrao.ehLeitura(entrada)) {
            // Com a MATRIZ ativa, o dono pode liberar por exceção uma escrita CLASSIFICADA (as guardas e a
            // Idempotency-Key continuam valendo). Sem a matriz, ou função não classificada / só-admin: como antes.
            const cls = classificacao.classificar(k);
            const liberavel = matrizAtiva && cls && !cls.soAdmin && !cls.morta;
            if (!liberavel) throw erro(422, matrizAtiva
                ? 'Esta função não pode ser liberada direto para o agente (não classificada ou só de administrador).'
                : 'Liberar escrita para o agente ainda não é permitido (só leitura por enquanto).');
        }
        return { escopo: esc, chave: k, nivel: niv, entrada };
    }
    const f = normalizarChaveFamilia(chave);
    const entradas = f ? cat.rotas.filter((e) => e.familia === f) : [];
    if (!entradas.length) throw erro(422, 'Família desconhecida: não está no catálogo de rotas do sistema.');
    if (entradas.every((e) => resolverEntrada(e, null).fixo)) {
        if (niv === 'BLOQUEADO') return { escopo: esc, chave: f, nivel: niv, semEfeito: true };
        throw erro(422, 'Família de bloqueio fixo (ou sempre liberada): não pode ser alterada.');
    }
    return { escopo: esc, chave: f, nivel: niv };
}

// Só consulta o banco quando a resposta depende da matriz (liberar escrita, ou mexer num bloqueio fixo por chave).
async function matrizAtivaSeImporta(vendedorId, body) {
    const b = body || {};
    if (String(b.escopo || '').toUpperCase() !== 'FUNCAO') return false;
    const k = normalizarChaveFuncao(b.chave);
    if (!k) return false;
    const liberandoEscrita = String(b.nivel || '').toUpperCase() === 'LIBERADO' && !/^GET /.test(k) && !padrao.POST_LEITURA.has(k);
    if (!liberandoEscrita && !padrao.ehBloqueioFixoPorChave(k)) return false;
    const marcador = await prisma.agentePolitica.findUnique({
        where: { vendedorId_escopo_chave: { vendedorId, escopo: 'MATRIZ', chave: 'ativa' } }, select: { nivel: true },
    });
    return !!(marcador && marcador.nivel === 'LIBERADO');
}

async function definirOverride(app, vendedorId, body, autor) {
    const v = validarOverride(app, body || {}, { matrizAtiva: await matrizAtivaSeImporta(vendedorId, body) });
    if (v.semEfeito) return { ok: true, semEfeito: true, escopo: v.escopo, chave: v.chave, nivel: v.nivel, antes: null };
    const motivo = body.motivo == null ? null : String(body.motivo).trim().slice(0, 300) || null;
    const onde = { vendedorId, escopo: v.escopo, chave: v.chave };
    const antesRow = await prisma.agentePolitica.findUnique({ where: { vendedorId_escopo_chave: onde }, select: { nivel: true, motivo: true } });
    const dados = { nivel: v.nivel, motivo, atualizadoPorId: autor.id, atualizadoPorNome: autor.nome || 'admin' };
    const row = await prisma.agentePolitica.upsert({
        where: { vendedorId_escopo_chave: onde },
        create: { ...onde, ...dados },
        update: dados,
        select: { id: true, escopo: true, chave: true, nivel: true, motivo: true, atualizadoPorNome: true, atualizadoEm: true },
    });
    invalidar(vendedorId);
    return { ok: true, ...row, antes: antesRow ? antesRow.nivel : null };
}

async function removerOverride(app, vendedorId, body) {
    const esc = String(body?.escopo || '').toUpperCase();
    if (esc !== 'FUNCAO' && esc !== 'FAMILIA') throw erro(400, 'escopo deve ser FUNCAO ou FAMILIA.');
    const chave = esc === 'FUNCAO' ? normalizarChaveFuncao(body?.chave) : normalizarChaveFamilia(body?.chave);
    if (!chave) throw erro(400, 'Informe a chave.');
    const onde = { vendedorId, escopo: esc, chave };
    const antes = await prisma.agentePolitica.findUnique({ where: { vendedorId_escopo_chave: onde }, select: { nivel: true } });
    if (!antes) return { ok: true, removido: false, escopo: esc, chave, antes: null };
    await prisma.agentePolitica.delete({ where: { vendedorId_escopo_chave: onde } });
    invalidar(vendedorId);
    return { ok: true, removido: true, escopo: esc, chave, antes: antes.nivel };
}

function limparCache() { cache.clear(); carregando.clear(); geracao.clear(); }

module.exports = {
    avaliar, resolverEntrada, overridesDe, invalidar, limparCache, montarMapas, linhasFrescas,
    listar, resumoPorFamilia, resumoCurto, definirOverride, removerOverride,
    normalizarChaveFuncao, normalizarChaveFamilia, TTL_MS, STALE_MAX_MS,
};
