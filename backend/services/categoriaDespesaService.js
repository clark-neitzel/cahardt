/**
 * Categoria de despesa — resolução NOME → ID (Fase 0 Contabilidade).
 *
 * O Conta Azul identifica categoria por NOME; internamente o app passa a gravar
 * também o ID da linha em CategoriaDespesa (FK), para os relatórios contábeis
 * não dependerem de igualdade de string. Este service é o único caminho para
 * transformar nomes em IDs — cria a categoria que ainda não existe (como
 * A_CLASSIFICAR, mesmo comportamento da importação do CA).
 */
const prisma = require('../config/database');

// Rótulos que NÃO são categoria de verdade (agregações da tela) — nunca criar linha p/ eles.
const NOMES_IGNORADOS = new Set(['vários', 'varios', 'sem categoria', '']);

function limparNome(nome) {
    const n = String(nome || '').trim();
    if (!n || NOMES_IGNORADOS.has(n.toLowerCase())) return null;
    return n;
}

/**
 * Garante que exista uma linha em CategoriaDespesa para cada nome e devolve
 * um Map nome→id. Nomes vazios/"Vários"/"Sem categoria" são ignorados (não
 * entram no Map). Aceita `tx` para rodar dentro de uma transação.
 */
async function garantirIds(nomes, tx = prisma) {
    const unicos = [...new Set((nomes || []).map(limparNome).filter(Boolean))];
    const mapa = new Map();
    if (unicos.length === 0) return mapa;

    const existentes = await tx.categoriaDespesa.findMany({
        where: { nome: { in: unicos } },
        select: { id: true, nome: true }
    });
    for (const c of existentes) mapa.set(c.nome, c.id);

    for (const nome of unicos.filter((n) => !mapa.has(n))) {
        try {
            const nova = await tx.categoriaDespesa.create({ data: { nome } });
            mapa.set(nome, nova.id);
        } catch (_) {
            // corrida entre requisições: outra criou primeiro — busca de novo
            const c = await tx.categoriaDespesa.findUnique({ where: { nome }, select: { id: true } });
            if (c) mapa.set(nome, c.id);
        }
    }
    return mapa;
}

/** Id de UMA categoria pelo nome (null para vazio/"Vários"). */
async function idPorNome(nome, tx = prisma) {
    const limpo = limparNome(nome);
    if (!limpo) return null;
    const mapa = await garantirIds([limpo], tx);
    return mapa.get(limpo) || null;
}

module.exports = { garantirIds, idPorNome, limparNome };
