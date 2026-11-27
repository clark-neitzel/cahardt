// Modelo `agenteSolicitacao` em memória para os testes (mesma semântica do Prisma nos filtros usados pelo código:
// igualdade, { gt, gte, lt, lte, in }). `db.solicitacoes` é o array vivo; `db.semTeto` faz count devolver 0.
const { Prisma } = require('@prisma/client');

function casa(linha, where) {
    for (const [k, v] of Object.entries(where || {})) {
        if (k === 'OR') { if (!v.some((w) => casa(linha, w))) return false; continue; }
        const x = linha[k];
        if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
            if ('gt' in v && !(x != null && x > v.gt)) return false;
            if ('gte' in v && !(x != null && x >= v.gte)) return false;
            if ('lt' in v && !(x != null && x < v.lt)) return false;
            if ('lte' in v && !(x != null && x <= v.lte)) return false;
            if ('in' in v && !v.in.includes(x)) return false;
            if ('not' in v && x === v.not) return false;
        } else if (v instanceof Date) {
            if (!(x instanceof Date) || x.getTime() !== v.getTime()) return false;
        } else if ((x === undefined ? null : x) !== v) return false;
    }
    return true;
}

function modeloSolicitacoes(db) {
    db.solicitacoes = db.solicitacoes || [];
    const lista = () => db.solicitacoes;
    const pick = (o, sel) => { if (!sel) return { ...o }; const r = {}; for (const k of Object.keys(sel)) if (sel[k] === true) r[k] = o[k]; return r; };
    return {
        create: async ({ data }) => {
            const agora = new Date();
            const l = {
                id: data.id || `sol-${lista().length + 1}`, tokenPrefixo: null, body: null, antes: null, status: 'PENDENTE', decididoPorId: null, decididoPorNome: null, decididoEm: null,
                observacaoDecisao: null, resultadoStatus: null, resultado: null, idsResultado: null, execHash: null, execComecouEm: null, idempotencyKey: null, query: '',
                createdAt: agora, updatedAt: agora, ...data,
            };
            for (const k of ['body', 'antes']) if (l[k] === undefined) l[k] = null;
            lista().push(l);
            return { ...l };
        },
        findFirst: async ({ where }) => { const l = lista().find((x) => casa(x, where)); return l ? { ...l } : null; },
        findUnique: async ({ where, select }) => {
            const l = lista().find((x) => Object.entries(where).every(([k, v]) => x[k] === v));
            return l ? pick(l, select) : null;
        },
        findMany: async ({ where, orderBy, skip = 0, take, select } = {}) => {
            let r = lista().filter((x) => casa(x, where));
            if (orderBy && orderBy.createdAt) r = r.sort((a, b) => (orderBy.createdAt === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
            r = r.slice(skip, take ? skip + take : undefined);
            return r.map((x) => pick(x, select));
        },
        count: async ({ where } = {}) => (db.semTeto ? 0 : lista().filter((x) => casa(x, where)).length),
        updateMany: async ({ where, data }) => {
            // atômico: node é single-thread e não há await entre achar e gravar
            const alvos = lista().filter((x) => casa(x, where));
            for (const l of alvos) { for (const [k, v] of Object.entries(data)) if (v !== undefined) l[k] = v === Prisma.DbNull ? null : v; l.updatedAt = new Date(); }
            return { count: alvos.length };
        },
    };
}

/** `$transaction` em memória: callbacks SERIALIZADOS (faz o papel do pg_advisory_xact_lock) e `tx.$executeRaw` aceito. */
function transacaoSolicitacoes(model) {
    let fila = Promise.resolve();
    return (fn) => {
        const rodar = fila.then(() => fn({ $executeRaw: async () => 1, agenteSolicitacao: model }));
        fila = rodar.catch(() => {});
        return rodar;
    };
}

module.exports = { modeloSolicitacoes, transacaoSolicitacoes, casa };
