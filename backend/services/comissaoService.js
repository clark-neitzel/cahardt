const prisma = require('../config/database'); // singleton compartilhado (pool único)
const dayjs = require('dayjs');

// Calcula o valor da comissão base para um determinado valor de vendas
function calcularComissaoBase(totalVendido, valorMeta, config) {
    const limiteAbaixo = valorMeta * (1 - (config.faixaAbaixo ?? 0) / 100);
    const limiteAcima  = valorMeta * (1 + (config.faixaAcima  ?? 0) / 100);
    if (totalVendido < limiteAbaixo) {
        return { valor: totalVendido * (config.percAbaixoMeta / 100), faixa: 'abaixo' };
    } else if (totalVendido <= limiteAcima) {
        // cobre tanto "entre limiteAbaixo e meta" quanto "entre meta e limiteAcima"
        return { valor: totalVendido * (config.percNaMeta / 100), faixa: 'na_meta' };
    } else {
        return {
            valor: limiteAcima * (config.percNaMeta / 100) + (totalVendido - limiteAcima) * (config.percAcimaMeta / 100),
            faixa: 'acima'
        };
    }
}

const comissaoService = {

    // -------------------------------------------------------
    // CONFIGURAÇÃO
    // -------------------------------------------------------

    salvarConfig: async (dados, usuarioLogadoId) => {
        const {
            vendedorId, mesReferencia,
            percMinimoMeta, faixaAbaixo, percAbaixoMeta, percNaMeta, faixaAcima, percAcimaMeta,
            bonusCidades, bonusProdutos, bonusFlex, limiteFlexPerc,
            popupAtivo, popupManha, popupTarde
        } = dados;

        // Horário do popup: HH:MM válido ou '' (não mostra no período)
        const hora = (v, padrao) => {
            if (v === '' || v == null) return v === '' ? '' : padrao;
            return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : padrao;
        };

        const campos = {
            popupAtivo: popupAtivo !== false,
            popupManha: hora(popupManha, '08:00'),
            popupTarde: hora(popupTarde, '18:00'),
            percMinimoMeta: percMinimoMeta ?? 0,
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

    // Config "vigente" de um vendedor: a do próprio mês ou, na falta, a mais
    // recente de um mês anterior (a configuração vale até ser alterada).
    buscarConfigVigente: async (vendedorId, mesReferencia) => {
        return prisma.comissaoConfig.findFirst({
            where: { vendedorId, mesReferencia: { lte: mesReferencia } },
            orderBy: { mesReferencia: 'desc' }
        });
    },

    listarConfigs: async (mesReferencia) => {
        const configs = await prisma.comissaoConfig.findMany({
            where: { mesReferencia: { lte: mesReferencia } },
            orderBy: { mesReferencia: 'desc' },
            include: { vendedor: { select: { id: true, nome: true } } }
        });
        // 1ª ocorrência por vendedor = mais recente; marca de onde veio quando herdada
        const porVendedor = new Map();
        for (const c of configs) {
            if (!porVendedor.has(c.vendedorId)) {
                porVendedor.set(c.vendedorId, {
                    ...c,
                    herdadaDe: c.mesReferencia !== mesReferencia ? c.mesReferencia : null
                });
            }
        }
        return [...porVendedor.values()];
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

        // Config de comissão (vigente: do mês ou herdada do último mês configurado)
        const config = await comissaoService.buscarConfigVigente(vendedorId, mesReferencia);

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
        const limiteAbaixo = valorMeta * (1 - (config.faixaAbaixo ?? 0) / 100);
        const limiteAcima  = valorMeta * (1 + (config.faixaAcima  ?? 0) / 100);

        // Mínimo para comissionar: abaixo de X% da meta, comissão zerada por inteiro
        const percMinimoMeta = config.percMinimoMeta ?? 0;
        const percRealizadoMes = valorMeta > 0 ? (totalVendidoMes / valorMeta) * 100 : 0;
        const minimoNaoAtingido = percMinimoMeta > 0 && percRealizadoMes < percMinimoMeta;

        const { valor: comissaoBase, faixa: faixaAplicada } = minimoNaoAtingido
            ? { valor: 0, faixa: 'abaixo_minimo' }
            : calcularComissaoBase(totalVendidoMes, valorMeta, config);

        // Bônus cidades: proporção cidades batidas / total cidades × taxa × total vendido
        // Ex: 7 de 10 cidades = 70% do bônus; todas = 100%
        const totalCidades = progressoCidades.length;
        const cidadesBatidas = progressoCidades.filter(c => c.bateu).length;
        const todasCidadesBateram = totalCidades > 0 && cidadesBatidas === totalCidades;
        const ratioCidades = totalCidades > 0 ? cidadesBatidas / totalCidades : 0;
        const bonusCidadesValor = minimoNaoAtingido ? 0 : totalVendidoMes * (config.bonusCidades / 100) * ratioCidades;

        // Bônus produtos: proporção produtos batidos / total produtos × taxa × total vendido
        const totalProdutos = progressoProdutos.length;
        const produtosBatidos = progressoProdutos.filter(p => p.bateu).length;
        const ratioProdutos = totalProdutos > 0 ? produtosBatidos / totalProdutos : 0;
        const bonusProdutosValor = minimoNaoAtingido ? 0 : totalVendidoMes * (config.bonusProdutos / 100) * ratioProdutos;

        // Bônus flex: % de comissão sobre o saldo não usado do flex (se uso <= limite configurado)
        const flexDentroDoLimite = percFlexUsado <= config.limiteFlexPerc;
        const saldoFlex = Math.max(0, flexMeta - flexUsadoMes);
        const bonusFlexValor = (flexDentroDoLimite && !minimoNaoAtingido)
            ? saldoFlex * (config.bonusFlex / 100)
            : 0;

        const totalComissao = comissaoBase + bonusCidadesValor + bonusProdutosValor + bonusFlexValor;

        // -------------------------------------------------------
        // PROJEÇÃO — cada dia de trabalho restante é projetado pela média das
        // últimas ocorrências daquele dia da semana (últimas segundas, últimas
        // terças…) nos dias de trabalho do vendedor (mês atual + metas
        // anteriores). Dia sem histórico suficiente cai na média diária simples.
        // -------------------------------------------------------
        const hoje = dayjs();
        const diasTrabalho = Array.isArray(meta.diasTrabalho) ? meta.diasTrabalho : JSON.parse(meta.diasTrabalho || '[]');
        const diasPassados = diasTrabalho.filter(d => !dayjs(d).isAfter(hoje, 'day'));
        const diasRestantes = diasTrabalho.filter(d => dayjs(d).isAfter(hoje, 'day'));
        const qtdPassados = diasPassados.length;
        const qtdRestantes = diasRestantes.length;
        const mediaDiaria = qtdPassados > 0 ? totalVendidoMes / qtdPassados : 0;

        // Vendas por dia do mês atual
        const vendasPorDia = {};
        for (const p of pedidos) {
            const d = dayjs(p.dataVenda).format('YYYY-MM-DD');
            vendasPorDia[d] = (vendasPorDia[d] || 0) + valorPedido(p);
        }

        // Dias de trabalho dos 2 últimos meses com meta (histórico de mesmos dias da semana)
        const metasAnteriores = await prisma.metaMensalVendedor.findMany({
            where: { vendedorId, mesReferencia: { lt: mesReferencia } },
            orderBy: { mesReferencia: 'desc' },
            take: 2,
            select: { diasTrabalho: true }
        });
        const diasAnteriores = metasAnteriores
            .flatMap(m => Array.isArray(m.diasTrabalho) ? m.diasTrabalho : JSON.parse(m.diasTrabalho || '[]'))
            .filter(d => dayjs(d).isBefore(hoje, 'day'));

        if (diasAnteriores.length > 0) {
            const ordenados = [...diasAnteriores].sort();
            const pedidosHist = await prisma.pedido.findMany({
                where: {
                    vendedorId,
                    dataVenda: {
                        gte: dayjs(ordenados[0]).startOf('day').toDate(),
                        lte: dayjs(ordenados[ordenados.length - 1]).endOf('day').toDate()
                    },
                    bonificacao: false,
                    OR: [
                        { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } },
                        { situacaoCA: null }
                    ]
                },
                select: { dataVenda: true, itens: { select: { quantidade: true, valor: true } } }
            });
            for (const p of pedidosHist) {
                const d = dayjs(p.dataVenda).format('YYYY-MM-DD');
                vendasPorDia[d] = (vendasPorDia[d] || 0) + valorPedido(p);
            }
        }

        // Média por dia da semana: últimas 4 ocorrências de cada dia trabalhado
        // (dia trabalhado sem venda conta como zero — é sinal real)
        const diasHistorico = [...new Set([...diasPassados, ...diasAnteriores])].sort().reverse();
        const mediaPorDiaSemana = {};
        for (let dow = 0; dow < 7; dow++) {
            const amostras = diasHistorico.filter(d => dayjs(d).day() === dow).slice(0, 4);
            if (amostras.length >= 2) {
                mediaPorDiaSemana[dow] = amostras.reduce((acc, d) => acc + (vendasPorDia[d] || 0), 0) / amostras.length;
            }
        }
        const usouDiasSemana = diasRestantes.some(d => mediaPorDiaSemana[dayjs(d).day()] != null);
        const projecaoRestante = diasRestantes.reduce((acc, d) => {
            const m = mediaPorDiaSemana[dayjs(d).day()];
            return acc + (m != null ? m : mediaDiaria);
        }, 0);
        const valorProjetado = totalVendidoMes + projecaoRestante;

        // Calcula comissão sobre o valor projetado (mantém bônus cidades/produtos como estão agora)
        const percMetaProj = valorMeta > 0 ? (valorProjetado / valorMeta) * 100 : 0;
        const minimoNaoAtingidoProj = percMinimoMeta > 0 && percMetaProj < percMinimoMeta;
        const { valor: comissaoBaseProj } = minimoNaoAtingidoProj
            ? { valor: 0 }
            : calcularComissaoBase(valorProjetado, valorMeta, config);
        // Bônus sobre projeção (cidades/produtos mantidos na proporção atual; flex projetado)
        const flexUsadoProj = flexUsadoMes + (projecaoRestante > 0 && flexMeta > 0
            ? (flexUsadoMes / Math.max(totalVendidoMes, 1)) * projecaoRestante
            : 0);
        const saldoFlexProj = Math.max(0, flexMeta - flexUsadoProj);
        const percFlexUsadoProj = flexMeta > 0 ? (flexUsadoProj / flexMeta) * 100 : 0;
        const bonusFlexProj = (percFlexUsadoProj <= config.limiteFlexPerc && !minimoNaoAtingidoProj)
            ? saldoFlexProj * (config.bonusFlex / 100)
            : 0;
        const bonusCidadesProj = minimoNaoAtingidoProj ? 0 : valorProjetado * (config.bonusCidades / 100) * ratioCidades;
        const bonusProdutosProj = minimoNaoAtingidoProj ? 0 : valorProjetado * (config.bonusProdutos / 100) * ratioProdutos;
        const totalComissaoProj = comissaoBaseProj + bonusCidadesProj + bonusProdutosProj + bonusFlexProj;

        const projecao = {
            valorProjetado,
            percMeta: percMetaProj,
            minimoNaoAtingido: minimoNaoAtingidoProj,
            metodo: usouDiasSemana ? 'dias_semana' : 'media_simples',
            mediaDiaria,
            diasPassados: qtdPassados,
            diasRestantes: qtdRestantes,
            totalDias: diasTrabalho.length,
            comissao: {
                base: comissaoBaseProj,
                bonusCidades: bonusCidadesProj,
                bonusProdutos: bonusProdutosProj,
                bonusFlex: bonusFlexProj,
                total: totalComissaoProj,
            }
        };

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
                percMinimoMeta,
                popupAtivo: config.popupAtivo !== false,
                popupManha: config.popupManha ?? '08:00',
                popupTarde: config.popupTarde ?? '18:00',
                mesReferenciaConfig: config.mesReferencia,
                herdadaDe: config.mesReferencia !== mesReferencia ? config.mesReferencia : null,
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
                minimoNaoAtingido,
                percMinimoMeta,
                comissaoBase,
                bonusCidades: { valor: bonusCidadesValor, conquistado: todasCidadesBateram, cidadesBatidas, totalCidades, ratio: ratioCidades },
                bonusProdutos: { valor: bonusProdutosValor, produtosBatidos, totalProdutos, ratio: ratioProdutos },
                bonusFlex: { valor: bonusFlexValor, conquistado: flexDentroDoLimite, percUsado: percFlexUsado, limite: config.limiteFlexPerc, saldoFlex },
                totalComissao
            },
            progressoCidades,
            progressoProdutos,
            projecao
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
