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
            faixaAbaixo, percAbaixoMeta, percNaMeta, faixaAcima, percAcimaMeta,
            bonusCidades, bonusProdutos, bonusFlex, limiteFlexPerc
        } = dados;

        const campos = {
            faixaAbaixo: faixaAbaixo ?? 0,
            percAbaixoMeta: percAbaixoMeta ?? 0,
            percNaMeta: percNaMeta ?? 0,
            faixaAcima: faixaAcima ?? 0,
            percAcimaMeta: percAcimaMeta ?? 0,
            bonusCidades: bonusCidades ?? 0,
            bonusProdutos: bonusProdutos ?? 0,
            bonusFlex: bonusFlex ?? 0,
            limiteFlexPerc: limiteFlexPerc ?? 100,
        };

        return prisma.comissaoConfig.upsert({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            update: campos,
            create: { vendedorId, mesReferencia, ...campos, criadoPor: usuarioLogadoId }
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

        // Pedidos válidos do mês — mesmo filtro do metaService
        // (exclui cancelados/devolvidos mas mantém situacaoCA null, exclui bonificações)
        const pedidos = await prisma.pedido.findMany({
            where: {
                vendedorId,
                dataVenda: { gte: inicio, lte: fim },
                bonificacao: false,
                OR: [
                    { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } },
                    { situacaoCA: null }
                ]
            },
            include: {
                itens: { select: { produtoId: true, quantidade: true, valor: true } },
                cliente: { select: { End_Cidade: true } }
            }
        });

        // Valor de cada pedido = soma dos itens (igual ao metaService)
        const valorPedido = (p) => p.itens.reduce((acc, item) => acc + (Number(item.valor) * Number(item.quantidade)), 0);

        // Total vendido no mês
        const totalVendidoMes = pedidos.reduce((acc, p) => acc + valorPedido(p), 0);

        // Flex utilizado no mês
        const flexUsadoMes = pedidos.reduce((acc, p) => acc + Number(p.flexTotal || 0), 0);
        const flexMeta = Number(meta.flexMensal) || 0;
        const percFlexUsado = flexMeta > 0 ? (flexUsadoMes / flexMeta) * 100 : 0;

        // Realizado por cidade
        const realizadoPorCidade = {};
        for (const p of pedidos) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            realizadoPorCidade[cidade] = (realizadoPorCidade[cidade] || 0) + valorPedido(p);
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

        // Fronteiras das faixas
        // limiteAbaixo: se realizado < limiteAbaixo → aplica percAbaixoMeta
        //               se realizado entre limiteAbaixo e meta → aplica percNaMeta
        // limiteAcima:  se realizado <= limiteAcima → percNaMeta sobre tudo
        //               se realizado > limiteAcima → percNaMeta até o limite + percAcimaMeta sobre o excedente
        const limiteAbaixo = valorMeta * (1 - (config.faixaAbaixo ?? 0) / 100);
        const limiteAcima  = valorMeta * (1 + (config.faixaAcima  ?? 0) / 100);

        let comissaoBase = 0;
        let faixaAplicada = 'abaixo';

        if (totalVendidoMes < limiteAbaixo) {
            // Faixa abaixo: abaixo do limite inferior
            comissaoBase = totalVendidoMes * (config.percAbaixoMeta / 100);
            faixaAplicada = 'abaixo';
        } else if (totalVendidoMes < valorMeta) {
            // Faixa intermediária: entre o limite inferior e a meta (tolerância)
            comissaoBase = totalVendidoMes * (config.percNaMeta / 100);
            faixaAplicada = 'na_meta';
        } else if (totalVendidoMes <= limiteAcima) {
            // Atingiu/superou a meta mas ainda dentro da faixa "na meta"
            comissaoBase = valorMeta * (config.percNaMeta / 100)
                         + (totalVendidoMes - valorMeta) * (config.percNaMeta / 100);
            faixaAplicada = 'na_meta';
        } else {
            // Acima do limite superior: percNaMeta até o limiteAcima + percAcimaMeta no excedente
            comissaoBase = limiteAcima * (config.percNaMeta / 100)
                         + (totalVendidoMes - limiteAcima) * (config.percAcimaMeta / 100);
            faixaAplicada = 'acima';
        }

        // Bônus cidades: proporção cidades batidas / total cidades × taxa × total vendido
        // Ex: 7 de 10 cidades = 70% do bônus; todas = 100%
        const totalCidades = progressoCidades.length;
        const cidadesBatidas = progressoCidades.filter(c => c.bateu).length;
        const todasCidadesBateram = totalCidades > 0 && cidadesBatidas === totalCidades;
        const ratioCidades = totalCidades > 0 ? cidadesBatidas / totalCidades : 0;
        const bonusCidadesValor = totalVendidoMes * (config.bonusCidades / 100) * ratioCidades;

        // Bônus produtos: proporção produtos batidos / total produtos × taxa × total vendido
        const totalProdutos = progressoProdutos.length;
        const produtosBatidos = progressoProdutos.filter(p => p.bateu).length;
        const ratioProdutos = totalProdutos > 0 ? produtosBatidos / totalProdutos : 0;
        const bonusProdutosValor = totalVendidoMes * (config.bonusProdutos / 100) * ratioProdutos;

        // Bônus flex: % de comissão sobre o saldo não usado do flex (se uso <= limite configurado)
        const flexDentroDoLimite = percFlexUsado <= config.limiteFlexPerc;
        const saldoFlex = Math.max(0, flexMeta - flexUsadoMes);
        const bonusFlexValor = flexDentroDoLimite
            ? saldoFlex * (config.bonusFlex / 100)
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
                faixaAbaixo: config.faixaAbaixo ?? 0,
                percAbaixoMeta: config.percAbaixoMeta,
                percNaMeta: config.percNaMeta,
                faixaAcima: config.faixaAcima ?? 0,
                percAcimaMeta: config.percAcimaMeta,
                bonusCidades: config.bonusCidades,
                bonusProdutos: config.bonusProdutos,
                bonusFlex: config.bonusFlex,
                limiteFlexPerc: config.limiteFlexPerc,
                limiteAbaixo,
                limiteAcima
            },
            calculo: {
                faixaAplicada,
                comissaoBase,
                bonusCidades: { valor: bonusCidadesValor, conquistado: todasCidadesBateram, cidadesBatidas, totalCidades, ratio: ratioCidades },
                bonusProdutos: { valor: bonusProdutosValor, produtosBatidos, totalProdutos, ratio: ratioProdutos },
                bonusFlex: { valor: bonusFlexValor, conquistado: flexDentroDoLimite, percUsado: percFlexUsado, limite: config.limiteFlexPerc, saldoFlex },
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
