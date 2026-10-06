// Pedidos de exemplo p/ os testes de mensagem de WhatsApp (sem banco).
function pedidoFixture(nItens, extra = {}) {
    const itens = [];
    for (let i = 1; i <= nItens; i++) {
        itens.push({
            valor: 3.5 + (i % 7) * 0.75,
            quantidade: 10 + i,
            produto: { nome: `Salgado Congelado Sabor Numero ${i} Especial 500GR` },
        });
    }
    return {
        id: 'abcdef12-0000-0000-0000-000000000000',
        numero: '4321',
        cliente: { NomeFantasia: 'Padaria do Zé', Nome: 'José da Silva' },
        itens,
        valorFrete: 15,
        createdAt: new Date('2026-10-05T15:00:00Z'),
        dataVenda: new Date('2026-10-07T15:00:00Z'),
        nomeCondicaoPagamento: 'Boleto 14 dias',
        observacoes: 'Entregar pela porta dos fundos, antes das 8h.',
        ...extra,
    };
}
module.exports = { pedidoFixture };
