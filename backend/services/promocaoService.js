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

    /**
     * Converte a data digitada na tela para o instante certo (horário de Brasília, -03:00 fixo;
     * o servidor roda em UTC, então nada de setHours). "YYYY-MM-DD" → início = 00:00:00.000 do dia,
     * fim = 23:59:59.999 do dia. String ISO completa (com hora) passa como está.
     * @param {string|Date} valor
     * @param {'inicio'|'fim'} ponta
     * @returns {Date|null} null se inválida
     */
    parseDataPromocao: (valor, ponta) => {
        if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;
        const str = String(valor ?? '').trim();
        let d;
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            d = new Date(`${str}T${ponta === 'fim' ? '23:59:59.999' : '00:00:00.000'}-03:00`);
            // rejeita dia inexistente (ex.: 2026-02-30 que o JS "rola" para março)
            if (!isNaN(d.getTime()) && new Date(`${str}T12:00:00.000Z`).toISOString().slice(0, 10) !== str) return null;
        } else {
            d = new Date(str);
        }
        return isNaN(d.getTime()) ? null : d;
    },

    /**
     * Promoções para o seletor de metas: vigentes + agendadas (ATIVA e dataFim >= agora).
     * Vencida e ENCERRADA ficam de fora.
     */
    listarParaMeta: async (agora = new Date()) => {
        const lista = await prisma.promocao.findMany({
            where: { status: 'ATIVA', dataFim: { gte: agora } },
            include: { produto: { select: { id: true, nome: true } } },
        });
        return lista
            .map(p => ({
                id: p.id,
                nome: p.nome,
                tipo: p.tipo,
                produtoId: p.produtoId,
                produtoNome: p.produto?.nome || null,
                dataInicio: new Date(p.dataInicio).toISOString(),
                dataFim: new Date(p.dataFim).toISOString(),
                agendada: new Date(p.dataInicio) > agora,
            }))
            .sort((a, b) => (a.produtoNome || '').localeCompare(b.produtoNome || '', 'pt-BR')
                || a.dataInicio.localeCompare(b.dataInicio));
    },

    /**
     * Encerra (status ENCERRADA) as promoções ATIVA com dataFim já passada. Vencer não encerra
     * sozinho e o produto só aceita uma ATIVA — a vencida trava a criação da próxima.
     * Sem aplicar: só lista. Idempotente (2ª chamada → encerradas 0).
     */
    encerrarVencidas: async ({ aplicar = false } = {}) => {
        const agora = new Date();
        const lista = await prisma.promocao.findMany({
            where: { status: 'ATIVA', dataFim: { lt: agora } },
            include: { produto: { select: { codigo: true, nome: true } } },
            orderBy: { dataFim: 'asc' },
        });
        const promocoes = lista.map(p => ({
            id: p.id, nome: p.nome, tipo: p.tipo, produtoId: p.produtoId,
            produtoCodigo: p.produto?.codigo ?? null, produtoNome: p.produto?.nome ?? null,
            precoPromocional: Number(p.precoPromocional),
            dataInicio: p.dataInicio, dataFim: p.dataFim, criadoPor: p.criadoPor,
        }));
        if (!aplicar) return { simulacao: true, agora, total: promocoes.length, promocoes };
        // UM updateMany (atômico); o where repete o critério para não pegar o que mudou entre a leitura e a escrita
        const r = promocoes.length ? await prisma.promocao.updateMany({
            where: { id: { in: promocoes.map(p => p.id) }, status: 'ATIVA', dataFim: { lt: agora } },
            data: { status: 'ENCERRADA', encerradoPor: 'sistema', encerradoEm: agora, encerradaAntesPrevisto: false },
        }) : { count: 0 };
        return { simulacao: false, encerradas: r.count, promocoes };
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
