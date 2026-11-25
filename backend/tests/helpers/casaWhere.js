// Avaliador mínimo de `where` do Prisma sobre objetos em memória (testes sem banco).
// Suporta: igualdade, {in}, {notIn}, {not:null}, {startsWith}, {gte,lte} (Date/string/número),
// OR/AND e relações aninhadas (objeto → recursão; relação null nunca casa).
function cmp(v) { return v instanceof Date ? v.getTime() : v; }

function casaCampo(valor, cond) {
    if (cond === null || typeof cond !== 'object' || cond instanceof Date) return cmp(valor) === cmp(cond);
    if ('in' in cond && !cond.in.includes(valor)) return false;
    if ('notIn' in cond && cond.notIn.includes(valor)) return false;
    if ('not' in cond && (cond.not === null ? valor == null : valor === cond.not)) return false;
    if ('startsWith' in cond && !String(valor ?? '').startsWith(cond.startsWith)) return false;
    if ('gte' in cond && !(cmp(valor) >= cmp(cond.gte))) return false;
    if ('lte' in cond && !(cmp(valor) <= cmp(cond.lte))) return false;
    return true;
}

function casa(obj, where) {
    if (!where) return true;
    for (const [k, cond] of Object.entries(where)) {
        if (k === 'OR') { if (!cond.some((w) => casa(obj, w))) return false; continue; }
        if (k === 'AND') { if (!cond.every((w) => casa(obj, w))) return false; continue; }
        const valor = obj?.[k];
        const ehOperador = cond && typeof cond === 'object' && !(cond instanceof Date)
            && Object.keys(cond).some((x) => ['in', 'notIn', 'not', 'startsWith', 'gte', 'lte'].includes(x));
        if (cond && typeof cond === 'object' && !(cond instanceof Date) && !ehOperador) {
            if (valor == null || !casa(valor, cond)) return false; // relação aninhada
        } else if (!casaCampo(valor, cond)) return false;
    }
    return true;
}

module.exports = { casa };
