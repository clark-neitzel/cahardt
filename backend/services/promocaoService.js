const prisma = require('../config/database');

/**
 * Serviço de Promoções
 * Responsável pela lógica de avaliação de promoções simples e condicionais.
 */

const promocaoService = {

    /**
     * Busca a promoção ativa de um produto, se existir e estiver dentro do período.
     * @param {string} produtoId
     * @returns {Promise<object|null>} Promoção com grupos e condições, ou null
     */
    buscarAtivaPorProduto: async (produtoId) => {
        const agora = new Date();
        return await prisma.promocao.findFirst({
            where: {
                produtoId,
                status: 'ATIVA',
                dataInicio: { lte: agora },
                dataFim: { gte: agora }
            },
            include: {
                grupos: {
                    include: { condicoes: true }
                }
            }
        });
    },

    /**
     * Avalia se a promoção está "liberada" para o conjunto de itens do pedido atual.
     * Para promoção SIMPLES: sempre liberada (apenas período conta).
     * Para promoção CONDICIONAL: avalia os grupos SE/OU.
     *
     * Lógica: Grupos = OU entre si. Condições dentro do grupo = E entre si.
     *
     * @param {object} promocao - Promoção com grupos e condições incluídos
     * @param {Array} itensPedido - Array de { produtoId, quantidade, valorTotal }
     * @param {number} valorTotalPedido - Valor total do pedido atual
     * @returns {boolean} true se liberada
     */
    avaliarLiberada: (promocao, itensPedido, valorTotalPedido) => {
        if (promocao.tipo === 'SIMPLES') return true;

        // CONDICIONAL: pelo menos 1 grupo deve ser totalmente verdadeiro (OU)
        for (const grupo of promocao.grupos) {
            let grupoAtendido = true;

            for (const cond of grupo.condicoes) {
                if (cond.tipo === 'PRODUTO_QUANTIDADE') {
                    const itemEncontrado = itensPedido.find(item =>
                        item.produtoId === cond.produtoId
                    );
                    const qtdAtual = itemEncontrado
                        ? parseFloat(itemEncontrado.quantidade)
                        : 0;
                    if (qtdAtual < parseFloat(cond.quantidadeMinima)) {
                        grupoAtendido = false;
                        break;
                    }
                } else if (cond.tipo === 'VALOR_TOTAL') {
                    if (parseFloat(valorTotalPedido) < parseFloat(cond.valorMinimo)) {
                        grupoAtendido = false;
                        break;
                    }
                }
            }

            if (grupoAtendido) return true; // OU: basta 1 grupo passar
        }

        return false;
    },

    /**
     * Calcula o flex considerando a promoção ativa.
     * Regra do negócio:
     *   - vendido > precoPromo (base tabela) → flex POSITIVO = 0
     *   - vendido < precoPromo (base tabela) → flex negativo normalmente
     *
     * @param {number} valorDigitado - Valor de venda praticado
     * @param {number} valorBase - Preço base aplicado com multiplicador de tabela
     * @param {number} precoPromoBase - Preço promo já com multiplicador de tabela
     * @param {number} quantidade
     * @returns {number} flex gerado
     */
    calcularFlexComPromocao: (valorDigitado, valorBase, precoPromoBase, quantidade) => {
        const flex = (valorDigitado - precoPromoBase) * quantidade;
        // Se tentar vender acima do promo, flex positivo é zerado
        if (flex > 0) return 0;
        // Se vender abaixo do promo, flex negativo normalmente
        return flex;
    }
};

module.exports = promocaoService;
