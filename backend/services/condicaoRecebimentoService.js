/**
 * Regras da CONDIÇÃO DE PAGAMENTO no recebimento (entrega e baixa do caixa).
 *
 * A condição liberada para o pedido manda no que pode ser recebido: quais formas
 * (`formasRecebimentoPermitidas`), se exige banco (`exigeBanco`/`bancoPadrao`) e se
 * o valor entra no caixa (`debitaCaixa`).
 *
 * Este módulo existe para que a entrega (routes/entregas.js) e a baixa do caixa
 * (routes/caixa.js, ramo dos especiais) usem EXATAMENTE o mesmo critério — antes a
 * validação só existia na entrega, escrita inline, e a baixa não conferia nada.
 */
const prisma = require('../config/database');

/**
 * Acha a condição (TabelaPreco) do pedido. Mesma prioridade da entrega:
 * nome exato > tipo|opção > opção. (`tipo|opção` é ambíguo em boleto: todos são "1x".)
 */
function acharRegrasCondicao(pedido, condicoes) {
    if (!pedido) return null;
    const chave = `${pedido.tipoPagamento || ''}|${pedido.opcaoCondicaoPagamento || ''}`;
    return (pedido.nomeCondicaoPagamento ? condicoes.find(t => t.nomeCondicao === pedido.nomeCondicaoPagamento) : null)
        || condicoes.find(t => `${t.tipoPagamento || ''}|${t.opcaoCondicao || ''}` === chave)
        || condicoes.find(t => t.opcaoCondicao === pedido.opcaoCondicaoPagamento)
        || null;
}

/** Busca as condições ativas e resolve a do pedido. */
async function buscarRegrasCondicao(pedido, client = prisma) {
    if (!pedido?.opcaoCondicaoPagamento && !pedido?.tipoPagamento && !pedido?.nomeCondicaoPagamento) return null;
    const condicoes = await client.tabelaPreco.findMany({ where: { ativo: true } });
    return acharRegrasCondicao(pedido, condicoes);
}

/**
 * Mapa `_selectId` → nome da forma (`tabela_<idCondicao>` das condições +
 * id das formas de entrega personalizadas). É com ele que a lista de formas
 * permitidas (que guarda ids) é comparada com o nome gravado no pagamento.
 */
async function carregarMapaFormas(client = prisma) {
    const [condicoes, formasCustom] = await Promise.all([
        client.tabelaPreco.findMany({ where: { ativo: true }, select: { idCondicao: true, nomeCondicao: true } }),
        client.formaPagamentoEntrega.findMany({ where: { ativo: true }, select: { id: true, nome: true } })
    ]);
    const mapaNomes = {};
    condicoes.forEach(c => { mapaNomes['tabela_' + c.idCondicao] = c.nomeCondicao; });
    formasCustom.forEach(f => { mapaNomes[f.id] = f.nome; });
    return mapaNomes;
}

/**
 * A forma usada no pagamento é permitida pela condição?
 * Sem lista configurada = tudo permitido (comportamento legado).
 * PIX Asaas (cobrança confirmada pelo banco) é sempre aceito.
 */
function formaPermitida({ regrasCondicao, mapaNomes, formaPagamentoEntregaId, formaPagamentoNome, cobrancaAsaasId }) {
    const permitidas = regrasCondicao?.formasRecebimentoPermitidas;
    if (!Array.isArray(permitidas) || permitidas.length === 0) return true;
    // PIX Asaas é dinheiro confirmado pelo banco — sempre aceito. Aceita tanto pelo
    // vínculo com a cobrança quanto pelo nome padronizado: pagamento antigo/reconciliado
    // pode ter perdido o vínculo, e recusar a baixa por isso travaria o caixa.
    if (cobrancaAsaasId) return true;
    if (String(formaPagamentoNome || '').trim().toLowerCase() === 'pix asaas') return true;
    if (formaPagamentoEntregaId && permitidas.includes(formaPagamentoEntregaId)) return true;
    const nomesPermitidos = permitidas.map(p => mapaNomes?.[p]?.toLowerCase()).filter(Boolean);
    const nomeUsado = String(formaPagamentoNome || '').trim().toLowerCase();
    return !!nomeUsado && nomesPermitidos.includes(nomeUsado);
}

/** Nomes das formas liberadas, para citar na mensagem de erro. */
function nomesFormasPermitidas({ regrasCondicao, mapaNomes }) {
    const permitidas = regrasCondicao?.formasRecebimentoPermitidas;
    if (!Array.isArray(permitidas)) return [];
    return [...new Set(permitidas.map(p => mapaNomes?.[p]).filter(Boolean))];
}

module.exports = {
    acharRegrasCondicao,
    buscarRegrasCondicao,
    carregarMapaFormas,
    formaPermitida,
    nomesFormasPermitidas
};
