// Ordem dos itens de pedido/nota: alfabética "natural" pelo nome do produto
// (números por valor, depois letras, sem diferenciar maiúscula/acento).
// PedidoItem não tem coluna de posição — a ordem é aplicada na LEITURA/EMISSÃO.
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const nomeDoItem = (it) => String((it && (it.produto?.nome || it.descricao || it.nomeProduto)) || '').trim();

/** Devolve CÓPIA ordenada (estável); não muta o array original. Não-array volta como veio. */
function ordenarItensPorNome(itens) {
    if (!Array.isArray(itens)) return itens;
    return itens
        .map((it, i) => ({ it, i, n: nomeDoItem(it) }))
        .sort((a, b) => collator.compare(a.n, b.n) || a.i - b.i)
        .map(x => x.it);
}

/** Devolve o pedido com `itens` ordenados (objeto novo, raso). null/sem itens volta igual. */
function comItensOrdenados(pedido) {
    if (!pedido || !Array.isArray(pedido.itens)) return pedido;
    return { ...pedido, itens: ordenarItensPorNome(pedido.itens) };
}

module.exports = { ordenarItensPorNome, comItensOrdenados };
