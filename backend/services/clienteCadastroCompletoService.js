// "Cadastro completo para atendimento": o que a Ana (e qualquer agente) exige de um cliente
// para poder atendê-lo. Uma função só, usada pela ficha, pela lista de pendentes e pela tela do app.
//
// Regra (todas precisam estar preenchidas):
//  1. Dia de venda/visita   — Cliente.Dia_de_venda não vazio.
//  2. Dia de entrega        — Cliente.Dia_de_entrega não vazio.
//  3. Tabela de preço       — Cliente.Condicao_de_pagamento aponta para uma TabelaPreco ATIVA.
//     No Hardt "tabela de preço" e "condição de pagamento" são a mesma coisa: a TabelaPreco
//     carrega o acréscimo sobre o preço do produto (preço = valorVenda × (1 + acréscimo/100)) e o
//     prazo. O cliente guarda a favorita em Condicao_de_pagamento (id da TabelaPreco, sem FK; por
//     tolerância também vale o idCondicao). `condicoes_pagamento_permitidas` é só a lista das
//     que ele PODE usar e não substitui a favorita. Valor vazio, ou id que não existe mais / está
//     inativo, conta como faltando — senão o pedido nasceria sem preço definido.
//  4. Vendedor              — Cliente.idVendedor preenchido e apontando para um Vendedor existente.
const prisma = require('../config/database');

const CAMPOS = {
    diaVenda: 'Dia de venda (visita)',
    diaEntrega: 'Dia de entrega',
    tabelaPreco: 'Tabela de preço',
    vendedor: 'Vendedor responsável',
};

const preenchido = (v) => v != null && String(v).trim() !== '';

/**
 * Pura (sem banco). `refs.tabela` = TabelaPreco já resolvida (ou null/undefined);
 * `refs.vendedor` = Vendedor já resolvido (ou null/undefined).
 * Devolve { completo, faltando: [{ campo, rotulo }] } — `campo` é estável para máquina,
 * `rotulo` é o texto em português para mostrar.
 */
function avaliarCadastro(cliente, refs = {}) {
    const c = cliente || {};
    const faltando = [];
    const falta = (campo) => faltando.push({ campo, rotulo: CAMPOS[campo] });
    if (!preenchido(c.Dia_de_venda)) falta('diaVenda');
    if (!preenchido(c.Dia_de_entrega)) falta('diaEntrega');
    if (!preenchido(c.Condicao_de_pagamento) || !refs.tabela || refs.tabela.ativo === false) falta('tabelaPreco');
    if (!preenchido(c.idVendedor) || !refs.vendedor) falta('vendedor');
    return { completo: faltando.length === 0, faltando };
}

/** Acha a tabela do cliente numa lista (por id; na falta, por idCondicao). */
function resolverTabela(valor, tabelas) {
    if (!preenchido(valor)) return null;
    const v = String(valor).trim();
    return tabelas.find((t) => t.id === v) || tabelas.find((t) => t.idCondicao === v) || null;
}

/** Busca (1 query) as tabelas de preço ativas — base para avaliar vários clientes. */
async function tabelasAtivas() {
    return prisma.tabelaPreco.findMany({ where: { ativo: true }, select: { id: true, idCondicao: true, nomeCondicao: true, ativo: true } });
}

/**
 * Avalia um cliente já carregado, com `vendedor` (relação) e as tabelas ativas.
 * Atalho para quem tem a linha do Prisma na mão.
 */
function avaliarLinha(cli, tabelas) {
    return avaliarCadastro(cli, { tabela: resolverTabela(cli.Condicao_de_pagamento, tabelas), vendedor: cli.vendedor || null });
}

module.exports = { CAMPOS, avaliarCadastro, resolverTabela, tabelasAtivas, avaliarLinha };
