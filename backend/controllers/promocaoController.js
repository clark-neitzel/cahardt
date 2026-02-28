const prisma = require('../config/database');
const { randomUUID } = require('crypto');

const promocaoController = {

    /**
     * POST /api/promocoes
     * Cria uma nova promoção para um produto.
     * Regras:
     *  - Apenas 1 promoção ATIVA por produto
     *  - Imutável após criação
     */
    criar: async (req, res) => {
        const { produtoId, nome, tipo, precoPromocional, dataInicio, dataFim, grupos } = req.body;
        const criadoPor = req.user?.id;

        if (!produtoId || !nome || !tipo || !precoPromocional || !dataInicio || !dataFim) {
            return res.status(400).json({ error: 'Campos obrigatórios: produtoId, nome, tipo, precoPromocional, dataInicio, dataFim.' });
        }
        if (!['SIMPLES', 'CONDICIONAL'].includes(tipo)) {
            return res.status(400).json({ error: 'Tipo deve ser SIMPLES ou CONDICIONAL.' });
        }
        if (tipo === 'CONDICIONAL' && (!grupos || grupos.length === 0)) {
            return res.status(400).json({ error: 'Promoção condicional exige pelo menos 1 grupo de condições.' });
        }

        try {
            // Verifica se já existe uma promoção ativa para o produto
            const ativa = await prisma.promocao.findFirst({
                where: { produtoId, status: 'ATIVA' }
            });
            if (ativa) {
                return res.status(409).json({
                    error: 'Já existe uma promoção ativa para este produto. Encerre-a antes de criar uma nova.',
                    promocaoAtiva: { id: ativa.id, nome: ativa.nome }
                });
            }

            // Cria a promoção com grupos e condições aninhados
            const promocao = await prisma.promocao.create({
                data: {
                    id: randomUUID(),
                    produtoId,
                    nome,
                    tipo,
                    precoPromocional: parseFloat(precoPromocional),
                    dataInicio: new Date(dataInicio),
                    dataFim: new Date(dataFim),
                    status: 'ATIVA',
                    criadoPor: criadoPor || 'sistema',
                    grupos: tipo === 'CONDICIONAL' ? {
                        create: grupos.map(grupo => ({
                            id: randomUUID(),
                            condicoes: {
                                create: (grupo.condicoes || []).map(cond => ({
                                    id: randomUUID(),
                                    tipo: cond.tipo,
                                    produtoId: cond.produtoId || null,
                                    quantidadeMinima: cond.quantidadeMinima ? parseFloat(cond.quantidadeMinima) : null,
                                    valorMinimo: cond.valorMinimo ? parseFloat(cond.valorMinimo) : null
                                }))
                            }
                        }))
                    } : undefined
                },
                include: {
                    grupos: { include: { condicoes: true } }
                }
            });

            return res.status(201).json(promocao);
        } catch (error) {
            console.error('Erro ao criar promoção:', error);
            return res.status(500).json({ error: 'Erro interno ao criar promoção.' });
        }
    },

    /**
     * GET /api/promocoes?produtoId=X
     * Lista todo o histórico de promoções do produto (ativas + encerradas).
     */
    listarPorProduto: async (req, res) => {
        const { produtoId } = req.query;
        if (!produtoId) {
            return res.status(400).json({ error: 'produtoId é obrigatório.' });
        }

        try {
            const promocoes = await prisma.promocao.findMany({
                where: { produtoId },
                include: {
                    grupos: { include: { condicoes: true } }
                },
                orderBy: { criadoEm: 'desc' }
            });

            // Enriquecer com nome do criador e encerrador
            const vendedoresIds = [...new Set([
                ...promocoes.map(p => p.criadoPor),
                ...promocoes.filter(p => p.encerradoPor).map(p => p.encerradoPor)
            ])].filter(Boolean);

            const vendedores = await prisma.vendedor.findMany({
                where: { id: { in: vendedoresIds } },
                select: { id: true, nome: true }
            });
            const vendedorMap = Object.fromEntries(vendedores.map(v => [v.id, v.nome]));

            const resultado = promocoes.map(p => ({
                ...p,
                criadoPorNome: vendedorMap[p.criadoPor] || p.criadoPor,
                encerradoPorNome: p.encerradoPor ? (vendedorMap[p.encerradoPor] || p.encerradoPor) : null
            }));

            return res.json(resultado);
        } catch (error) {
            console.error('Erro ao listar promoções:', error);
            return res.status(500).json({ error: 'Erro interno ao listar promoções.' });
        }
    },

    /**
     * GET /api/promocoes/ativa?produtoId=X
     * Retorna a promoção ativa e dentro do período para um produto.
     */
    buscarAtiva: async (req, res) => {
        const { produtoId } = req.query;
        if (!produtoId) {
            return res.status(400).json({ error: 'produtoId é obrigatório.' });
        }

        try {
            const agora = new Date();
            const promo = await prisma.promocao.findFirst({
                where: {
                    produtoId,
                    status: 'ATIVA',
                    dataInicio: { lte: agora },
                    dataFim: { gte: agora }
                },
                include: { grupos: { include: { condicoes: true } } }
            });
            return res.json(promo || null);
        } catch (error) {
            console.error('Erro ao buscar promoção ativa:', error);
            return res.status(500).json({ error: 'Erro interno.' });
        }
    },

    /**
     * GET /api/promocoes/ativas-lote
     * Retorna TODAS as promoções atualmente ativas (dentro do período) em uma única query.
     * Usado pelo NovoPedido para evitar N requisições (1 por produto).
     * Retorna: { [produtoId]: Promocao }
     */
    buscarAtivasLote: async (req, res) => {
        try {
            // Retorna todas as promoções com status ATIVA (inclui futuras/agendadas)
            // O filtro real de período é feito no momento do pedido pelo backend
            const promos = await prisma.promocao.findMany({
                where: { status: 'ATIVA' },
                include: { grupos: { include: { condicoes: true } } }
            });

            // Transformar em mapa produtoId → promocao
            const mapa = {};
            promos.forEach(p => { mapa[p.produtoId] = p; });
            return res.json(mapa);
        } catch (error) {
            console.error('Erro ao buscar promoções ativas (lote):', error);
            return res.status(500).json({ error: 'Erro interno.' });
        }
    },

    /**
     * POST /api/promocoes/:id/encerrar
     * Encerra uma promoção com auditoria completa.
     */
    encerrar: async (req, res) => {
        const { id } = req.params;
        const encerradoPor = req.user?.id;

        try {
            const promocao = await prisma.promocao.findUnique({ where: { id } });
            if (!promocao) {
                return res.status(404).json({ error: 'Promoção não encontrada.' });
            }
            if (promocao.status === 'ENCERRADA') {
                return res.status(409).json({ error: 'Esta promoção já foi encerrada.' });
            }

            const agora = new Date();
            const encerradaAntesPrevisto = agora < new Date(promocao.dataFim);

            const atualizada = await prisma.promocao.update({
                where: { id },
                data: {
                    status: 'ENCERRADA',
                    encerradoPor: encerradoPor || 'sistema',
                    encerradoEm: agora,
                    encerradaAntesPrevisto
                }
            });

            return res.json(atualizada);
        } catch (error) {
            console.error('Erro ao encerrar promoção:', error);
            return res.status(500).json({ error: 'Erro interno ao encerrar promoção.' });
        }
    }
};

module.exports = promocaoController;
