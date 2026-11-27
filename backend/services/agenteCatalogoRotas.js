// Catálogo das rotas REAIS do sistema, montado uma única vez a partir da pilha do Express 4
// (`app._router.stack`) na 1ª requisição de um agente. É a "lista de funções" sobre a qual o dono
// define a política do agente (LIBERADO / PEDE AUTORIZAÇÃO / BLOQUEADO).
//
//  - CHAVE da função = `MÉTODO /api/caminho/normalizado` (todo parâmetro vira `:p`, minúsculo, sem barra final)
//  - FAMÍLIA        = prefixo do caminho (`/api/contas-pagar`; para `pcp` são dois níveis: `/api/pcp/itens`)
//  - A chave NÃO depende de `req.route`: o authMiddleware roda ANTES de o Express casar a rota
//    em muitos mounts. Aqui a URL concreta é casada contra as regex do catálogo.
//  - Rota com regex no caminho (não dá para normalizar) entra marcada `complexa` e fica BLOQUEADA.
//  - URL que casa com vários padrões: vale o mais restritivo (quem chama decide). Não casou: BLOQUEADO.
const METODOS_ALL = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const PADRAO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEMO_MAX = 5000;
const MAX_CAMINHO = 300; // caminho maior que isto nunca é rota real: BLOQUEADO antes do memo (não incha memória/auditoria)

function escaparRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function juntar(...partes) {
    let s = partes.filter((p) => p !== '' && p != null).join('/');
    s = s.replace(/\/{2,}/g, '/');
    if (!s.startsWith('/')) s = '/' + s;
    if (s.length > 1) s = s.replace(/\/+$/, '');
    return s;
}

// Caminho de um `app.use('/x', router)` a partir da regex do layer do Express 4 (path-to-regexp 0.1.x).
function prefixoDoLayer(layer) {
    if (layer.regexp && layer.regexp.fast_slash) return { caminho: '', complexo: false };
    let src = layer.regexp ? layer.regexp.source : '';
    src = src.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\/\?\$$/, '').replace(/\$$/, '');
    const comParam = src.replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':p');
    // sobrou metacaractere de regex além de `\/` e `\-`/`\.`? então não dá para normalizar
    if (/[()[\]{}|*+?^$]/.test(comParam.replace(/\\./g, ''))) return { caminho: comParam, complexo: true };
    return { caminho: comParam.replace(/\\(.)/g, '$1').toLowerCase(), complexo: false };
}

// Caminho declarado numa rota (`router.get('/x/:id', ...)`).
function caminhoDeRota(p) {
    if (typeof p !== 'string') return { caminho: String(p), complexo: true };
    let s = p.toLowerCase();
    s = s.replace(/:\w+(\([^)]*\))?/g, ':p'); // `:id`, `:id(\\d+)`
    if (/:p[?*+]/.test(s) || /[*()+?]/.test(s.replace(/:p/g, ''))) return { caminho: s, complexo: true };
    return { caminho: s, complexo: false };
}

// "/api/contas-pagar/:p" -> família "/api/contas-pagar"; "/api/pcp/itens/x" -> "/api/pcp/itens"
function familiaDe(caminho) {
    const seg = String(caminho).split('/').filter(Boolean);
    if (seg[0] !== 'api') return '/' + (seg[0] || '');
    if (seg[1] === 'pcp' && seg[2] && !seg[2].startsWith(':')) return `/api/pcp/${seg[2]}`;
    return '/api/' + (seg[1] || '');
}

function regexDoCaminho(caminho) {
    // `:p` vale um segmento qualquer; também dentro do segmento (ex.: `/receita/:p.pdf`)
    const partes = caminho.split('/').map((seg) => seg.split(':p').map(escaparRegex).join('[^/]+'));
    return new RegExp('^' + partes.join('/') + '/?$', 'i');
}

function percorrer(stack, prefixo, prefixoComplexo, saida) {
    for (const layer of stack || []) {
        if (layer.route) {
            const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
            const metodos = layer.route.methods._all ? METODOS_ALL : Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]).map((m) => m.toUpperCase());
            for (const p of paths) {
                const r = caminhoDeRota(p);
                const caminho = juntar(prefixo, r.caminho);
                // rota complexa: o catálogo guarda só o trecho LITERAL do começo (até o 1º segmento com regex);
                // regex de verdade (RegExp) ou prefixo de mount complexo: só o que vem do mount.
                const complexa = r.complexo || prefixoComplexo;
                let prefixoLiteral = null;
                if (complexa) {
                    const base = typeof p === 'string' && !prefixoComplexo ? caminho : prefixo;
                    prefixoLiteral = base.split('/').filter(Boolean).reduce((acc, seg) => (acc.stop || /[()[\]{}|*+?^$\\]/.test(seg) ? { ...acc, stop: true } : { ...acc, segs: [...acc.segs, seg] }), { segs: [], stop: false }).segs.join('/');
                    prefixoLiteral = '/' + prefixoLiteral;
                }
                for (const metodo of metodos) saida.push({ metodo, caminho, complexa, prefixoLiteral });
            }
        } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
            const pre = prefixoDoLayer(layer);
            percorrer(layer.handle.stack, juntar(prefixo, pre.caminho), prefixoComplexo || pre.complexo, saida);
        }
    }
}

function construir(app) {
    const brutas = [];
    const stack = app && app._router && app._router.stack;
    percorrer(stack, '', false, brutas);
    const porChave = new Map();
    for (const b of brutas) {
        const chave = `${b.metodo} ${b.caminho}`;
        const ja = porChave.get(chave);
        if (ja) { ja.ocorrencias += 1; ja.complexa = ja.complexa || b.complexa; ja.prefixoLiteral = ja.prefixoLiteral || b.prefixoLiteral; continue; }
        porChave.set(chave, {
            chave, metodo: b.metodo, exemplo: b.caminho, familia: familiaDe(b.caminho),
            complexa: b.complexa, prefixoLiteral: b.prefixoLiteral || null, ocorrencias: 1, regex: b.complexa ? null : regexDoCaminho(b.caminho),
        });
    }
    const rotas = [...porChave.values()];
    // prefixos (únicos) de rotas complexas: URL que casa com um deles é BLOQUEADA por segurança (não dá para saber qual rota ganha)
    const prefixosComplexos = [...new Set(rotas.filter((r) => r.complexa && r.prefixoLiteral && r.prefixoLiteral !== '/').map((r) => r.prefixoLiteral))];
    return { rotas, porChave, memo: new Map(), prefixosComplexos, construidoEm: Date.now() };
}

// Catálogo por instância de app (cada teste pode ter o seu). Em produção há um só.
const cache = new WeakMap();
function catalogoDe(app) {
    let c = cache.get(app);
    if (!c) { c = construir(app); cache.set(app, c); }
    return c;
}

// URL concreta -> { metodo, caminho } normalizados: sem query/fragmento, minúsculo, sem barra final,
// UUID/numérico/hex longo viram `:p`. Devolve null se o caminho for suspeito (tortuoso).
function normalizarUrl(metodo, urlOriginal) {
    const bruto = String(urlOriginal || '').split('?')[0].split('#')[0].toLowerCase();
    if (bruto.includes('..') || bruto.includes('//') || bruto.includes('\\') || /%(2e|2f|5c|00)/.test(bruto)) return null;
    if (!bruto.startsWith('/') || bruto.length > MAX_CAMINHO) return null;
    let caminho = bruto.length > 1 ? bruto.replace(/\/+$/, '') : bruto;
    caminho = caminho.split('/').map((seg) => (PADRAO_UUID.test(seg) || /^\d+$/.test(seg) || /^[0-9a-f]{24,}$/.test(seg) ? ':p' : seg)).join('/');
    return { metodo: String(metodo || '').toUpperCase(), caminho };
}

/**
 * Casa a URL concreta com o catálogo. Devolve { normalizado, entradas: [entrada...] } (memoizado por
 * MÉTODO+caminho normalizado). `entradas` vazio = rota que o catálogo não conhece (política: BLOQUEADO).
 */
function resolver(app, metodo, urlOriginal) {
    const n = normalizarUrl(metodo, urlOriginal);
    if (!n) return { normalizado: null, entradas: [], tortuosa: true };
    const cat = catalogoDe(app);
    const k = `${n.metodo} ${n.caminho}`;
    let r = cat.memo.get(k);
    if (r) { cat.memo.delete(k); cat.memo.set(k, r); return r; } // LRU: reinsere como o mais recente
    const complexa = cat.prefixosComplexos.some((p) => n.caminho === p || n.caminho.startsWith(p + '/'));
    const entradas = complexa ? [] : cat.rotas.filter((e) => e.metodo === n.metodo && e.regex && e.regex.test(n.caminho));
    r = { normalizado: k, entradas, tortuosa: false, complexa };
    if (cat.memo.size >= MEMO_MAX) { // descarta ~10% dos mais antigos (não zera tudo)
        let n10 = Math.ceil(MEMO_MAX / 10);
        for (const chave of cat.memo.keys()) { cat.memo.delete(chave); if (--n10 <= 0) break; }
    }
    cat.memo.set(k, r);
    return r;
}

module.exports = { construir, catalogoDe, resolver, normalizarUrl, familiaDe, METODOS_ALL, MAX_CAMINHO, MEMO_MAX };
