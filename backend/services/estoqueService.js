const prisma = require('../config/database');

// Status de pedido que geram reserva de estoque (excluído e recebido/faturado não reservam)
const STATUS_RESERVA = ['ABERTO', 'ENVIAR', 'SINCRONIZANDO', 'ERRO'];

// Verifica se a categoria de produto (campo livre do CA) controla estoque
async function categoriaControlaEstoque(categoriaNome, db) {
    if (!categoriaNome) return false;
    const cat = await (db || prisma).categoriaEstoque.findUnique({
        where: { nome: categoriaNome },
        select: { controlaEstoque: true }
    });
    return cat?.controlaEstoque === true;
}

// Recalcula estoqueReservado e estoqueDisponivel para um produto com base nos pedidos ativos.
// Só atua se a categoria do produto tiver controlaEstoque=true.
// Pode receber uma transaction Prisma (tx) para rodar dentro de uma transação.
async function recalcularEstoqueProduto(produtoId, tx) {
    const db = tx || prisma;

    const produto = await db.produto.findUnique({
        where: { id: produtoId },
        select: { id: true, estoqueTotal: true, categoria: true }
    });
    if (!produto) return null;

    const controla = await categoriaControlaEstoque(produto.categoria, db);
    if (!controla) return null;

    // Soma itens de pedidos ativos (todos os pedidos que ainda não saíram do estoque)
    const reservaResult = await db.pedidoItem.aggregate({
        where: {
            produtoId,
            pedido: { statusEnvio: { in: STATUS_RESERVA } }
        },
        _sum: { quantidade: true }
    });

    const reservado = parseFloat(reservaResult._sum.quantidade || 0);
    const total = parseFloat(produto.estoqueTotal || 0);
    const disponivel = total - reservado;

    await db.produto.update({
        where: { id: produtoId },
        data: { estoqueReservado: reservado, estoqueDisponivel: disponivel }
    });

    return { estoqueTotal: total, estoqueReservado: reservado, estoqueDisponivel: disponivel };
}

const estoqueService = {

    recalcularEstoqueProduto,

    // Ajuste manual de estoque: afeta somente estoqueTotal, depois recalcula disponivel/reservado.
    // tipo: 'ENTRADA' | 'SAIDA'
    // motivo: 'AJUSTE_MANUAL' (padrão para ajustes via painel)
    ajustar: async ({ produtoId, vendedorId = null, pedidoId = null, tipo, quantidade, motivo = 'AJUSTE_MANUAL', observacao = null }) => {
        const produto = await prisma.produto.findUnique({
            where: { id: produtoId },
            select: { id: true, estoqueTotal: true, estoqueReservado: true, estoqueDisponivel: true, categoria: true }
        });
        if (!produto) throw new Error('Produto não encontrado');

        const delta = tipo === 'ENTRADA' ? Math.abs(quantidade) : -Math.abs(quantidade);
        const totalAntes = parseFloat(produto.estoqueTotal || 0);
        const totalDepois = Math.max(0, totalAntes + delta);

        const result = await prisma.$transaction(async (tx) => {
            // Atualiza estoqueTotal; estoqueDisponivel parte do mesmo valor e será corrigido
            // pelo recalculo se a categoria controlar estoque (com reservas de pedidos).
            await tx.produto.update({
                where: { id: produtoId },
                data: { estoqueTotal: totalDepois, estoqueDisponivel: totalDepois }
            });

            const mov = await tx.movimentacaoEstoque.create({
                data: {
                    produtoId,
                    vendedorId,
                    pedidoId,
                    tipo,
                    quantidade: Math.abs(quantidade),
                    motivo,
                    observacao,
                    estoqueAntes: totalAntes,
                    estoqueDepois: totalDepois,
                    sincCA: false,
                    erroCA: null
                }
            });

            // Se a categoria controla estoque, recalcula reservado/disponivel
            const recalc = await recalcularEstoqueProduto(produtoId, tx);
            return { movId: mov.id, recalc };
        });

        const reservado = result.recalc?.estoqueReservado ?? parseFloat(produto.estoqueReservado || 0);
        const disponivel = result.recalc?.estoqueDisponivel ?? totalDepois;

        return {
            estoqueAntes: totalAntes,
            estoqueDepois: totalDepois,
            estoqueTotal: result.recalc?.estoqueTotal ?? totalDepois,
            estoqueReservado: reservado,
            estoqueDisponivel: disponivel
        };
    },

    // Chamado quando um pedido é faturado/recebido: deduz os itens do estoqueTotal e recalcula.
    // Para pedidos já reservados, o reservado cai automaticamente ao recalcular (pois o statusEnvio
    // sai de STATUS_RESERVA), e o estoqueTotal também é reduzido, resultando em saldo correto.
    faturarPedido: async (pedidoId, vendedorId = null) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                itens: {
                    include: {
                        produto: { select: { id: true, nome: true, estoqueTotal: true, categoria: true } }
                    }
                }
            }
        });
        if (!pedido) throw new Error('Pedido não encontrado');

        const motivo = pedido.bonificacao ? 'PEDIDO_BONIFICACAO' : (pedido.especial ? 'PEDIDO_ESPECIAL' : 'FATURAMENTO');
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of pedido.itens) {
                if (!item.produto) continue;

                const controla = await categoriaControlaEstoque(item.produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(item.produto.estoqueTotal || 0);
                const totalDepois = totalAntes - qtd;

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'SAIDA',
                        quantidade: qtd,
                        motivo,
                        observacao: `Faturamento pedido #${pedido.numero || pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Credita estoque de volta quando um pedido faturado é cancelado/excluído no CA.
    // Idempotente: se já existe movimentação CANCELAMENTO_CA para este pedido, ignora.
    cancelarPedido: async (pedidoId) => {
        const jaCreditado = await prisma.movimentacaoEstoque.findFirst({
            where: { pedidoId, motivo: 'CANCELAMENTO_CA' },
            select: { id: true }
        });
        if (jaCreditado) return [];

        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            include: {
                itens: { include: { produto: { select: { id: true, nome: true, estoqueTotal: true, categoria: true } } } }
            }
        });
        if (!pedido) return [];

        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of pedido.itens) {
                if (!item.produto) continue;
                const controla = await categoriaControlaEstoque(item.produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(item.produto.estoqueTotal || 0);
                const totalDepois = totalAntes + qtd;

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        pedidoId,
                        tipo: 'ENTRADA',
                        quantidade: qtd,
                        motivo: 'CANCELAMENTO_CA',
                        observacao: `Estorno por cancelamento pedido #${pedido.numero || pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: item.produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Credita itens devolvidos de volta ao estoque (ENTRADA com motivo DEVOLUCAO).
    // itens: [{ produtoId, quantidade }]
    creditarDevolucao: async (pedidoId, itens, vendedorId = null) => {
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of itens) {
                const produto = await tx.produto.findUnique({
                    where: { id: item.produtoId },
                    select: { id: true, nome: true, estoqueTotal: true, categoria: true }
                });
                if (!produto) continue;

                const controla = await categoriaControlaEstoque(produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(produto.estoqueTotal || 0);
                const totalDepois = totalAntes + qtd;

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'ENTRADA',
                        quantidade: qtd,
                        motivo: 'DEVOLUCAO',
                        observacao: `Devolução de itens do pedido ${pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Debita itens quando uma devolução é revertida (SAIDA com motivo REVERSAO_DEVOLUCAO).
    // itens: [{ produtoId, quantidade }]
    debitarReversaoDevolucao: async (pedidoId, itens, vendedorId = null) => {
        const produtosAfetados = new Set();
        const resultados = [];

        await prisma.$transaction(async (tx) => {
            for (const item of itens) {
                const produto = await tx.produto.findUnique({
                    where: { id: item.produtoId },
                    select: { id: true, nome: true, estoqueTotal: true, categoria: true }
                });
                if (!produto) continue;

                const controla = await categoriaControlaEstoque(produto.categoria, tx);
                if (!controla) continue;

                const qtd = parseFloat(item.quantidade || 0);
                const totalAntes = parseFloat(produto.estoqueTotal || 0);
                const totalDepois = totalAntes - qtd;

                await tx.produto.update({
                    where: { id: item.produtoId },
                    data: { estoqueTotal: totalDepois }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        produtoId: item.produtoId,
                        vendedorId,
                        pedidoId,
                        tipo: 'SAIDA',
                        quantidade: qtd,
                        motivo: 'REVERSAO_DEVOLUCAO',
                        observacao: `Reversão de devolução do pedido ${pedidoId}`,
                        estoqueAntes: totalAntes,
                        estoqueDepois: totalDepois,
                        sincCA: false,
                        erroCA: null
                    }
                });

                produtosAfetados.add(item.produtoId);
                resultados.push({ produtoId: item.produtoId, nome: produto.nome, totalAntes, totalDepois });
            }

            for (const pid of produtosAfetados) {
                await recalcularEstoqueProduto(pid, tx);
            }
        });

        return resultados;
    },

    // Recalcula reserva para todos os produtos de um pedido.
    // Usar em: criar pedido, editar itens, cancelar, excluir.
    recalcularPedido: async (pedidoId) => {
        const pedido = await prisma.pedido.findUnique({
            where: { id: pedidoId },
            select: { itens: { select: { produtoId: true } } }
        });
        if (!pedido) return;

        const produtosUnicos = [...new Set(pedido.itens.map(i => i.produtoId))];
        for (const produtoId of produtosUnicos) {
            await recalcularEstoqueProduto(produtoId);
        }
    },

    // Análise de demanda: compara saída líquida (descontando devoluções) dos últimos 15 dias
    // com a mesma quinzena do mês anterior. Calcula mínimo sugerido para 7d e 15d.
    getAnaliseDemanda: async ({ search, categorias, categoriasComerciais, permissoes }) => {
        function subtractOneMonth(date) {
            const d = new Date(date);
            const day = d.getDate();
            d.setDate(1);
            d.setMonth(d.getMonth() - 1);
            const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
            d.setDate(Math.min(day, daysInMonth));
            return d;
        }

        const hoje = new Date();
        const inicioAtual = new Date(hoje);
        inicioAtual.setDate(inicioAtual.getDate() - 15);

        const fimAnterior = subtractOneMonth(hoje);
        const inicioAnterior = subtractOneMonth(inicioAtual);

        const periodoAtualDe = new Date(inicioAtual); periodoAtualDe.setHours(0, 0, 0, 0);
        const periodoAtualAte = new Date(hoje); periodoAtualAte.setHours(23, 59, 59, 999);
        const periodoAnteriorDe = new Date(inicioAnterior); periodoAnteriorDe.setHours(0, 0, 0, 0);
        const periodoAnteriorAte = new Date(fimAnterior); periodoAnteriorAte.setHours(23, 59, 59, 999);

        function fmt(d) { return d.toISOString().split('T')[0]; }

        function getCategoriasPermitidas() {
            if (!permissoes || permissoes.admin) return null;
            const regras = Array.isArray(permissoes.estoque) ? permissoes.estoque : [];
            if (regras.length === 0) return [];
            if (regras.some(r => !r.categoria)) return null;
            return [...new Set(regras.map(r => r.categoria).filter(Boolean))];
        }

        const catPermitidas = getCategoriasPermitidas();
        const whereProduto = { ativo: true };

        const periodoInfo = {
            periodoAtual: { de: fmt(periodoAtualDe), ate: fmt(hoje) },
            periodoAnterior: { de: fmt(periodoAnteriorDe), ate: fmt(fimAnterior) }
        };

        if (catPermitidas !== null) {
            if (catPermitidas.length === 0) return { ...periodoInfo, produtos: [] };
            whereProduto.categoria = { in: catPermitidas };
        }

        if (search?.trim()) {
            whereProduto.OR = [
                { nome: { contains: search.trim(), mode: 'insensitive' } },
                { codigo: { contains: search.trim(), mode: 'insensitive' } }
            ];
        }

        if (categorias) {
            const cats = categorias.split(',').map(c => c.trim()).filter(Boolean);
            if (cats.length > 0) {
                if (catPermitidas !== null) {
                    const filtradas = cats.filter(c => new Set(catPermitidas).has(c));
                    if (filtradas.length === 0) return { ...periodoInfo, produtos: [] };
                    whereProduto.categoria = { in: filtradas };
                } else {
                    whereProduto.categoria = { in: cats };
                }
            }
        }

        if (categoriasComerciais) {
            const cats = categoriasComerciais.split(',').map(c => c.trim()).filter(Boolean);
            if (cats.length > 0) whereProduto.categoriaProdutoId = { in: cats };
        }

        const produtos = await prisma.produto.findMany({
            where: whereProduto,
            select: {
                id: true, nome: true, codigo: true, unidade: true, categoria: true,
                estoqueDisponivel: true, estoqueMinimo: true,
                categoriaProduto: { select: { id: true, nome: true } }
            },
            orderBy: [{ categoria: 'asc' }, { nome: 'asc' }]
        });

        if (produtos.length === 0) return { ...periodoInfo, produtos: [] };

        const produtoIds = produtos.map(p => p.id);
        const MOTIVOS_SAIDA = ['FATURAMENTO', 'PEDIDO_ESPECIAL', 'PEDIDO_BONIFICACAO'];

        // 4 queries em paralelo: saídas e devoluções de cada período
        const [movsAtual, movsAnterior, devsAtual, devsAnterior] = await Promise.all([
            prisma.movimentacaoEstoque.groupBy({
                by: ['produtoId'],
                where: { produtoId: { in: produtoIds }, tipo: 'SAIDA', motivo: { in: MOTIVOS_SAIDA }, createdAt: { gte: periodoAtualDe, lte: periodoAtualAte } },
                _sum: { quantidade: true }
            }),
            prisma.movimentacaoEstoque.groupBy({
                by: ['produtoId'],
                where: { produtoId: { in: produtoIds }, tipo: 'SAIDA', motivo: { in: MOTIVOS_SAIDA }, createdAt: { gte: periodoAnteriorDe, lte: periodoAnteriorAte } },
                _sum: { quantidade: true }
            }),
            prisma.movimentacaoEstoque.groupBy({
                by: ['produtoId'],
                where: { produtoId: { in: produtoIds }, tipo: 'ENTRADA', motivo: 'DEVOLUCAO', createdAt: { gte: periodoAtualDe, lte: periodoAtualAte } },
                _sum: { quantidade: true }
            }),
            prisma.movimentacaoEstoque.groupBy({
                by: ['produtoId'],
                where: { produtoId: { in: produtoIds }, tipo: 'ENTRADA', motivo: 'DEVOLUCAO', createdAt: { gte: periodoAnteriorDe, lte: periodoAnteriorAte } },
                _sum: { quantidade: true }
            })
        ]);

        const toMap = (arr) => Object.fromEntries(arr.map(m => [m.produtoId, parseFloat(m._sum.quantidade || 0)]));
        const mapSaidaAtual = toMap(movsAtual);
        const mapSaidaAnterior = toMap(movsAnterior);
        const mapDevAtual = toMap(devsAtual);
        const mapDevAnterior = toMap(devsAnterior);

        const resultado = produtos.map(p => {
            const saidaAtual = Math.max(0, (mapSaidaAtual[p.id] || 0) - (mapDevAtual[p.id] || 0));
            const saidaAnterior = Math.max(0, (mapSaidaAnterior[p.id] || 0) - (mapDevAnterior[p.id] || 0));

            const mediaDiaria = saidaAtual / 15;
            const minimoSugerido7d = Math.ceil(mediaDiaria * 7);
            const minimoSugerido15d = Math.ceil(saidaAtual);

            let variacaoPercent = null;
            let tendencia = 'SEM_MOVIMENTO';

            if (saidaAtual === 0 && saidaAnterior === 0) {
                tendencia = 'SEM_MOVIMENTO';
            } else if (saidaAnterior === 0 && saidaAtual > 0) {
                tendencia = 'NOVA_DEMANDA';
            } else {
                variacaoPercent = Math.round(((saidaAtual - saidaAnterior) / saidaAnterior) * 100);
                if (variacaoPercent > 10) tendencia = 'ALTA';
                else if (variacaoPercent < -10) tendencia = 'QUEDA';
                else tendencia = 'ESTAVEL';
            }

            return {
                id: p.id, nome: p.nome, codigo: p.codigo, unidade: p.unidade,
                categoria: p.categoria, categoriaProduto: p.categoriaProduto,
                estoqueDisponivel: parseFloat(p.estoqueDisponivel || 0),
                estoqueMinimo: parseFloat(p.estoqueMinimo || 0),
                saidaAtual, saidaAnterior, variacaoPercent,
                mediaDiariaAtual: parseFloat(mediaDiaria.toFixed(2)),
                minimoSugerido7d, minimoSugerido15d, tendencia
            };
        });

        const ordemTendencia = { ALTA: 0, NOVA_DEMANDA: 1, ESTAVEL: 2, QUEDA: 3, SEM_MOVIMENTO: 4 };
        resultado.sort((a, b) => {
            const diff = (ordemTendencia[a.tendencia] ?? 5) - (ordemTendencia[b.tendencia] ?? 5);
            if (diff !== 0) return diff;
            return (b.variacaoPercent ?? 0) - (a.variacaoPercent ?? 0);
        });

        return { ...periodoInfo, produtos: resultado };
    },

    // Listagem de movimentações com filtros e paginação
    listarMovimentacoes: async ({ produtoId, vendedorId, motivo, tipo, dataInicio, dataFim, pagina = 1, tamanhoPagina = 50 }) => {
        const where = {};
        if (produtoId) where.produtoId = produtoId;
        if (vendedorId) where.vendedorId = vendedorId;
        if (motivo) where.motivo = motivo;
        if (tipo) where.tipo = tipo;
        if (dataInicio || dataFim) {
            where.createdAt = {};
            if (dataInicio) where.createdAt.gte = new Date(dataInicio + 'T00:00:00.000Z');
            if (dataFim) where.createdAt.lte = new Date(dataFim + 'T23:59:59.999Z');
        }

        const skip = (pagina - 1) * tamanhoPagina;
        const [items, total] = await Promise.all([
            prisma.movimentacaoEstoque.findMany({
                where,
                include: {
                    produto: { select: { nome: true, codigo: true, ean: true } },
                    vendedor: { select: { nome: true } }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: tamanhoPagina
            }),
            prisma.movimentacaoEstoque.count({ where })
        ]);

        return { items, total, pagina, tamanhoPagina };
    }
};

module.exports = estoqueService;
