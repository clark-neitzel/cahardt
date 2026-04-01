/**
 * Funções puras de cálculo para pedidos.
 * Sem acesso a banco, sem side-effects — apenas entrada → saída.
 */
const promocaoService = require('./promocaoService');

/**
 * Calcula itens do pedido com flex e avaliação de promoção.
 * Retorna { itensData, flexTotalPedido }.
 */
function calcularItensComFlex(itens, promocoesAtivas, valorTotalEstimado) {
    let flexTotalPedido = 0;

    const itensData = itens.map(item => {
        const valorDigitado = parseFloat(item.valor);
        const valorBase = parseFloat(item.valorBase);
        const quantidade = parseFloat(item.quantidade);

        const promo = promocoesAtivas[item.produtoId] || null;
        let emPromocao = false;
        let flexItem;

        if (promo) {
            const liberada = promocaoService.avaliarLiberada(promo, itens, valorTotalEstimado);
            if (liberada) {
                emPromocao = true;
                const precoPromoBase = parseFloat(promo.precoPromocional);
                flexItem = promocaoService.calcularFlexComPromocao(valorDigitado, valorBase, precoPromoBase, quantidade);
            } else {
                flexItem = (valorDigitado - valorBase) * quantidade;
            }
        } else {
            flexItem = (valorDigitado - valorBase) * quantidade;
        }

        flexTotalPedido += flexItem;

        return {
            produtoId: item.produtoId,
            descricao: item.descricao,
            quantidade,
            valor: valorDigitado,
            valorBase,
            flexGerado: flexItem,
            emPromocao,
            promocaoId: emPromocao && promo ? promo.id : null,
            nomePromocao: emPromocao && promo ? promo.nome : null,
            tipoPromocao: emPromocao && promo ? promo.tipo : null
        };
    });

    return { itensData, flexTotalPedido };
}

/**
 * Calcula a diferença de flex entre pedido novo e antigo (para edição).
 * Retorna { diferencaFlex, diferencaModulo }.
 */
function calcularDiferencaFlex(flexTotalPedido, pedidoAntigo) {
    let diferencaFlex = flexTotalPedido;
    let diferencaModulo = Math.abs(flexTotalPedido);

    if (pedidoAntigo.statusEnvio === 'ENVIAR') {
        diferencaFlex = flexTotalPedido - Number(pedidoAntigo.flexTotal || 0);
        diferencaModulo = Math.abs(flexTotalPedido) - Math.abs(Number(pedidoAntigo.flexTotal || 0));
    }

    return { diferencaFlex, diferencaModulo };
}

/**
 * Converte string de data "YYYY-MM-DD" para Date BRT (evita UTC -1 dia).
 * Se já for um objeto Date ou string ISO completa, usa diretamente.
 */
function parseDateBRT(val) {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    const str = String(val);
    // Apenas "YYYY-MM-DD" sem horário → interpreta como meia-noite BRT
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(`${str}T00:00:00-03:00`);
    return new Date(str);
}

/**
 * Gera array de parcelas com datas de vencimento e valores.
 * Última parcela absorve diferença de arredondamento.
 */
function gerarParcelasData({ valorTotal, qtdParcelas, intervaloDias, primeiroVencimento, dataVenda }) {
    const numParcelas = parseInt(qtdParcelas) || 1;
    const intervalo = parseInt(intervaloDias) || 0;
    const baseDate = primeiroVencimento ? parseDateBRT(primeiroVencimento) : parseDateBRT(dataVenda);
    const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;

    const parcelas = [];
    for (let i = 0; i < numParcelas; i++) {
        const vencimento = new Date(baseDate);
        vencimento.setDate(vencimento.getDate() + (i * intervalo));
        const val = i === numParcelas - 1
            ? Math.round((valorTotal - valorParcela * (numParcelas - 1)) * 100) / 100
            : valorParcela;
        parcelas.push({
            numeroParcela: i + 1,
            valor: val,
            dataVencimento: vencimento
        });
    }

    return parcelas;
}

module.exports = { calcularItensComFlex, calcularDiferencaFlex, gerarParcelasData };
