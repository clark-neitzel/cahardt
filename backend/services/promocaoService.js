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
    },

    // ── v1.6.0 da API da IA (aditivo; nada acima mudou) ─────────────────────────────────────

    /**
     * Todas as promoções VIGENTES (ATIVA e dentro do período), com grupos/condições.
     * Uma por produto: se houver mais de uma vigente no mesmo produto, fica a criada por
     * último (mesma escolha implícita do findFirst de buscarAtivaPorProduto).
     * @param {{ produtoIds?: string[] | null }} opts — restringe aos produtos informados
     * @returns {Promise<Map<string, object>>} produtoId → promoção
     */
    listarVigentes: async ({ produtoIds = null } = {}) => {
        const agora = new Date();
        const where = { status: 'ATIVA', dataInicio: { lte: agora }, dataFim: { gte: agora } };
        if (Array.isArray(produtoIds)) {
            if (!produtoIds.length) return new Map();
            where.produtoId = { in: produtoIds };
        }
        const lista = await prisma.promocao.findMany({
            where,
            include: { grupos: { include: { condicoes: true } } },
            orderBy: { criadoEm: 'desc' },
        });
        const map = new Map();
        for (const p of lista) if (!map.has(p.produtoId)) map.set(p.produtoId, p); // 1ª = mais recente
        return map;
    },

    /**
     * Promoção vigente pelo id (usada na criação de pedido pela IA). Devolve null se não
     * existe, está ENCERRADA ou fora do período.
     */
    buscarVigentePorId: async (id) => {
        if (!id) return null;
        const agora = new Date();
        return prisma.promocao.findFirst({
            where: { id: String(id), status: 'ATIVA', dataInicio: { lte: agora }, dataFim: { gte: agora } },
            include: { grupos: { include: { condicoes: true } } },
        });
    },

    /**
     * Texto humano da condição (para a Ana falar e para a mensagem de erro):
     *   SIMPLES → null; CONDICIONAL → grupos unidos por " ou ", condições por " e ".
     * @param {object} promo — com grupos.condicoes
     * @param {Map<string,string>|object} nomePorProdutoId — produtoId → nome (opcional)
     */
    descreverCondicao: (promo, nomePorProdutoId = null) => {
        if (!promo || promo.tipo !== 'CONDICIONAL' || !Array.isArray(promo.grupos)) return null;
        const nomeDe = (pid) => {
            if (!nomePorProdutoId) return null;
            if (nomePorProdutoId instanceof Map) return nomePorProdutoId.get(pid) || null;
            return nomePorProdutoId[pid] || null;
        };
        const fmtQtd = (q) => { const n = Number(q || 0); return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, ''); };
        const fmtReal = (v) => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
        const grupos = promo.grupos
            .map(g => (g.condicoes || []).map(c => {
                if (c.tipo === 'PRODUTO_QUANTIDADE') {
                    const nome = nomeDe(c.produtoId);
                    return `a partir de ${fmtQtd(c.quantidadeMinima)} un${nome ? ` de ${nome}` : ''}`;
                }
                if (c.tipo === 'VALOR_TOTAL') return `pedido a partir de ${fmtReal(c.valorMinimo)}`;
                return null;
            }).filter(Boolean).join(' e '))
            .filter(Boolean);
        return grupos.length ? grupos.join(' ou ') : null;
    },
};

module.exports = promocaoService;
