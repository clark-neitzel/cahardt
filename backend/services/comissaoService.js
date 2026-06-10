const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dayjs = require('dayjs');

const comissaoService = {

    // -------------------------------------------------------
    // CONFIGURAÇÃO
    // -------------------------------------------------------

    salvarConfig: async (dados, usuarioLogadoId) => {
        const {
            vendedorId, mesReferencia,
            percAbaixoMeta, percNaMeta, percAcimaMeta,
            bonusCidades, bonusProdutos, bonusFlex, limiteFlexPerc
        } = dados;

        return prisma.comissaoConfig.upsert({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            update: {
                percAbaixoMeta, percNaMeta, percAcimaMeta,
                bonusCidades, bonusProdutos, bonusFlex, limiteFlexPerc
            },
            create: {
                vendedorId, mesReferencia,
                percAbaixoMeta: percAbaixoMeta ?? 0,
                percNaMeta: percNaMeta ?? 0,
                percAcimaMeta: percAcimaMeta ?? 0,
                bonusCidades: bonusCidades ?? 0,
                bonusProdutos: bonusProdutos ?? 0,
                bonusFlex: bonusFlex ?? 0,
                limiteFlexPerc: limiteFlexPerc ?? 100,
                criadoPor: usuarioLogadoId
            }
        });
    },

    listarConfigs: async (mesReferencia) => {
        return prisma.comissaoConfig.findMany({
            where: { mesReferencia },
            include: { vendedor: { select: { id: true, nome: true } } }
        });
    },

    // -------------------------------------------------------
    // APURAÇÃO — calcula comissão de um vendedor no mês
    // -------------------------------------------------------

    apurarVendedor: async (vendedorId, mesReferencia) => {
        const inicio = dayjs(`${mesReferencia}-01`).startOf('month').toDate();
        const fim = dayjs(`${mesReferencia}-01`).endOf('month').toDate();

        // Meta do mês
        const meta = await prisma.metaMensalVendedor.findUnique({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            include: {
                metasCidades: true,
                metasProdutos: { include: { produto: { select: { nome: true, codigo: true } } } }
            }
        });

        // Config de comissão
        const config = await prisma.comissaoConfig.findUnique({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } }
        });

        const vendedor = await prisma.vendedor.findUnique({
            where: { id: vendedorId },
            select: { id: true, nome: true }
        });

        if (!meta) return { vendedorId, vendedor, temMeta: false, temConfig: !!config };
        if (!config) return { vendedorId, vendedor, temMeta: true, temConfig: false };

        // Pedidos válidos do mês (excluindo cancelados, devolvidos e bonificações)
        const pedidos = await prisma.pedido.findMany({
            where: {
                vendedorId,
                dataVenda: { gte: inicio, lte: fim },
                situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] },
                bonificacao: false
            },
            include: {
                itens: { select: { produtoId: true, quantidade: true } },
                cliente: { select: { End_Cidade: true } }
            }
        });

        // Total vendido no mês
        const totalVendidoMes = pedidos.reduce((acc, p) => acc + Number(p.totalLiquido ?? p.total ?? 0), 0);

        // Flex utilizado no mês
        const flexUsadoMes = pedidos.reduce((acc, p) => acc + Math.abs(Number(p.flexTotal ?? 0)), 0);
        const flexMeta = Number(meta.flexMensal) || 0;
        const percFlexUsado = flexMeta > 0 ? (flexUsadoMes / flexMeta) * 100 : 0;

        // Realizado por cidade
        const realizadoPorCidade = {};
        for (const p of pedidos) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            realizadoPorCidade[cidade] = (realizadoPorCidade[cidade] || 0) + Number(p.totalLiquido ?? p.total ?? 0);
        }

        // Realizado por produto (quantidade)
        const qtdPorProduto = {};
        for (const p of pedidos) {
            for (const item of p.itens) {
                qtdPorProduto[item.produtoId] = (qtdPorProduto[item.produtoId] || 0) + Number(item.quantidade);
            }
        }

        // Progresso cidades
        const progressoCidades = meta.metasCidades.map(mc => {
            const realizado = realizadoPorCidade[mc.cidade] || 0;
            return { cidade: mc.cidade, meta: Number(mc.valor), realizado, bateu: realizado >= Number(mc.valor) };
        });

        // Progresso produtos
        const progressoProdutos = meta.metasProdutos.map(mp => {
            const realizado = qtdPorProduto[mp.produtoId] || 0;
            return {
                produtoId: mp.produtoId,
                nome: mp.produto?.nome || '',
                meta: Number(mp.quantidade),
                realizado,
                bateu: realizado >= Number(mp.quantidade)
            };
        });

        // -------------------------------------------------------
        // CÁLCULO DA COMISSÃO
        // -------------------------------------------------------
        const valorMeta = Number(meta.valorMensal);

        // Comissão base
        let comissaoBase = 0;
        let faixaAplicada = 'abaixo';
        if (totalVendidoMes < valorMeta) {
            comissaoBase = totalVendidoMes * (config.percAbaixoMeta / 100);
            faixaAplicada = 'abaixo';
        } else {
            // % na meta sobre o valor integral da meta + % acima só no excedente
            comissaoBase = valorMeta * (config.percNaMeta / 100)
                         + (totalVendidoMes - valorMeta) * (config.percAcimaMeta / 100);
            faixaAplicada = 'acima';
        }

        // Bônus cidades: aplica % sobre total vendido se TODAS cidades bateram meta
        const todasCidadesBateram = progressoCidades.length > 0 && progressoCidades.every(c => c.bateu);
        const bonusCidadesValor = todasCidadesBateram
            ? totalVendidoMes * (config.bonusCidades / 100)
            : 0;
        const cidadesBatidas = progressoCidades.filter(c => c.bateu).length;

        // Bônus produtos: % por cada produto que bateu a meta, aplicado sobre total vendido
        const produtosBatidos = progressoProdutos.filter(p => p.bateu).length;
        const bonusProdutosValor = totalVendidoMes * (config.bonusProdutos / 100) * produtosBatidos;

        // Bônus flex: aplica % sobre total vendido se uso de flex <= limite configurado
        const flexDentroDoLimite = percFlexUsado <= config.limiteFlexPerc;
        const bonusFlexValor = flexDentroDoLimite
            ? totalVendidoMes * (config.bonusFlex / 100)
            : 0;

        const totalComissao = comissaoBase + bonusCidadesValor + bonusProdutosValor + bonusFlexValor;

        return {
            vendedorId,
            vendedor,
            mesReferencia,
            temMeta: true,
            temConfig: true,
            meta: valorMeta,
            realizado: totalVendidoMes,
            percRealizado: valorMeta > 0 ? (totalVendidoMes / valorMeta) * 100 : 0,
            flex: { usado: flexUsadoMes, total: flexMeta, percUsado: percFlexUsado, dentroDoLimite: flexDentroDoLimite },
            config: {
                percAbaixoMeta: config.percAbaixoMeta,
                percNaMeta: config.percNaMeta,
                percAcimaMeta: config.percAcimaMeta,
                bonusCidades: config.bonusCidades,
                bonusProdutos: config.bonusProdutos,
                bonusFlex: config.bonusFlex,
                limiteFlexPerc: config.limiteFlexPerc
            },
            calculo: {
                faixaAplicada,
                comissaoBase,
                bonusCidades: { valor: bonusCidadesValor, conquistado: todasCidadesBateram, cidadesBatidas, totalCidades: progressoCidades.length },
                bonusProdutos: { valor: bonusProdutosValor, produtosBatidos, totalProdutos: progressoProdutos.length },
                bonusFlex: { valor: bonusFlexValor, conquistado: flexDentroDoLimite, percUsado: percFlexUsado, limite: config.limiteFlexPerc },
                totalComissao
            },
            progressoCidades,
            progressoProdutos
        };
    },

    // Apura todos os vendedores com meta no mês
    apurarTodos: async (mesReferencia) => {
        const metas = await prisma.metaMensalVendedor.findMany({
            where: { mesReferencia },
            select: { vendedorId: true }
        });

        const resultados = await Promise.all(
            metas.map(m => comissaoService.apurarVendedor(m.vendedorId, mesReferencia))
        );

        return resultados;
    }
};

module.exports = comissaoService;
