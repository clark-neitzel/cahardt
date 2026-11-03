// Filtro de "condição/tipo de pagamento" (ContaPagar.metodoPagamentoCA) compartilhado entre
// Contas a Pagar e a Conciliação bancária (vários títulos). Extraído de routes/contasPagar.js
// SEM mudar o comportamento.

// Grupos de tipo de pagamento aceitos em GET /?metodo=
const GRUPOS_METODO = {
    BOLETO: ['BOLETO_BANCARIO'],
    CARTAO: ['CARTAO_CREDITO', 'CARTAO_DEBITO', 'CARTAO_CREDITO_VIA_LINK'],
    PIX: ['PIX_PAGAMENTO_INSTANTANEO']
};

// Devolve um pedaço de `where` do Prisma (ou null se nada filtrar).
const montarFiltroMetodo = (param) => {
    if (!param) return null;
    const itens = String(param).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
    if (!itens.length) return null;
    const valores = new Set();
    let incluiNulo = false;
    let incluiOutros = false;
    for (const it of itens) {
        if (it === 'NAO_INFORMADO') incluiNulo = true;
        else if (it === 'OUTROS') incluiOutros = true;
        else if (GRUPOS_METODO[it]) GRUPOS_METODO[it].forEach((v) => valores.add(v));
        else valores.add(it);
    }
    const or = [];
    if (valores.size) or.push({ metodoPagamentoCA: { in: [...valores] } });
    if (incluiNulo) or.push({ metodoPagamentoCA: null });
    // OUTROS = tem tipo (não nulo) e não pertence a nenhum grupo Boleto/Cartão/Pix
    // (carteira digital, dinheiro, cheque, valores legados...). AND explícito: `notIn` sozinho não cobre null.
    if (incluiOutros) {
        const todos = Object.values(GRUPOS_METODO).flat();
        or.push({ AND: [{ metodoPagamentoCA: { not: null } }, { metodoPagamentoCA: { notIn: todos } }] });
    }
    return or.length === 1 ? or[0] : { OR: or };
};

module.exports = { GRUPOS_METODO, montarFiltroMetodo };
