const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);

const metaService = {
    salvarMetaMensal: async (dados, usuarioLogadoId) => {
        const { vendedorId, mesReferencia, diasTrabalho, valorMensal, flexMensal, metasProdutos, metasPromocoes, metasCidades } = dados;

        const metaSalva = await prisma.metaMensalVendedor.upsert({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            update: { diasTrabalho, valorMensal, flexMensal },
            create: { vendedorId, mesReferencia, diasTrabalho, valorMensal, flexMensal, criadoPor: usuarioLogadoId }
        });

        await prisma.metaProduto.deleteMany({ where: { metaMensalVendedorId: metaSalva.id } });
        if (metasProdutos?.length > 0) {
            await prisma.metaProduto.createMany({
                data: metasProdutos.map(mp => ({
                    metaMensalVendedorId: metaSalva.id,
                    produtoId: mp.produtoId,
                    quantidade: mp.quantidade
                }))
            });
        }

        await prisma.metaPromocao.deleteMany({ where: { metaMensalVendedorId: metaSalva.id } });
        if (metasPromocoes?.length > 0) {
            await prisma.metaPromocao.createMany({
                data: metasPromocoes.map(mp => ({
                    metaMensalVendedorId: metaSalva.id,
                    promocaoId: mp.promocaoId,
                    quantidadePedidos: mp.quantidadePedidos
                }))
            });
        }

        await prisma.metaCidade.deleteMany({ where: { metaMensalVendedorId: metaSalva.id } });
        if (metasCidades?.length > 0) {
            await prisma.metaCidade.createMany({
                data: metasCidades.map(mc => ({
                    metaMensalVendedorId: metaSalva.id,
                    cidade: mc.cidade,
                    valor: mc.valor,
                    diasSemana: mc.diasSemana || null
                }))
            });
        }

        return metaSalva;
    },

    excluir: async (id) => {
        const meta = await prisma.metaMensalVendedor.findUnique({ where: { id } });
        if (!meta) throw new Error('Meta não encontrada.');

        return await prisma.$transaction(async (tx) => {
            await tx.metaProduto.deleteMany({ where: { metaMensalVendedorId: id } });
            await tx.metaPromocao.deleteMany({ where: { metaMensalVendedorId: id } });
            await tx.metaCidade.deleteMany({ where: { metaMensalVendedorId: id } });
            return await tx.metaMensalVendedor.delete({ where: { id } });
        });
    },

    listarMetasMensais: async (mesReferencia) => {
        return prisma.metaMensalVendedor.findMany({
            where: { mesReferencia },
            include: {
                vendedor: { select: { id: true, nome: true } },
                metasProdutos: { include: { produto: { select: { nome: true, codigo: true } } } },
                metasPromocoes: { include: { promocao: { select: { nome: true } } } },
                metasCidades: true
            }
        });
    },

    calcularSugestaoMeta: async (vendedorId, fatorCrescimento = 1.0) => {
        const seisAnosAtras = dayjs().subtract(6, 'month').startOf('month').toDate();

        const pedidos = await prisma.pedido.findMany({
            where: {
                vendedorId,
                situacaoCA: 'FATURADO',
                bonificacao: false,
                dataVenda: { gte: seisAnosAtras }
            },
            include: {
                itens: {
                    include: {
                        produto: { select: { id: true, nome: true, codigo: true } }
                    }
                },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, Dia_de_venda: true } }
            },
            orderBy: { dataVenda: 'desc' }
        });

        // Agrupa por cliente, mantém só os 5 mais recentes
        const porClienteMap = {};
        for (const pedido of pedidos) {
            const cid = pedido.clienteId;
            if (!porClienteMap[cid]) {
                porClienteMap[cid] = { cliente: pedido.cliente, pedidos: [] };
            }
            if (porClienteMap[cid].pedidos.length < 5) {
                porClienteMap[cid].pedidos.push(pedido);
            }
        }

        const resultadosClientes = [];
        const porCidadeMap = {};
        const porProdutoMap = {};

        for (const [clienteId, dados] of Object.entries(porClienteMap)) {
            const { cliente, pedidos: ultimos } = dados;

            const valoresPedidos = ultimos.map(p =>
                p.itens.reduce((sum, item) => sum + (Number(item.valor) * Number(item.quantidade)), 0)
            );
            const valorMedio = valoresPedidos.reduce((a, b) => a + b, 0) / valoresPedidos.length;

            let pedidosPorMes = 1;
            if (ultimos.length >= 2) {
                const datas = ultimos
                    .map(p => dayjs(p.dataVenda))
                    .sort((a, b) => a.diff(b));
                let totalDias = 0;
                for (let i = 1; i < datas.length; i++) {
                    totalDias += datas[i].diff(datas[i - 1], 'day');
                }
                const intervaloMedio = totalDias / (datas.length - 1);
                // Intervalo mínimo de 7 dias para evitar distorções
                pedidosPorMes = Math.max(1, Math.round(30 / Math.max(intervaloMedio, 7)));
            }

            const valorEsperado = valorMedio * pedidosPorMes * fatorCrescimento;
            const cidade = cliente?.End_Cidade || 'Sem cidade';

            resultadosClientes.push({
                clienteId,
                nome: cliente?.NomeFantasia || cliente?.Nome || clienteId,
                cidade,
                pedidosBase: ultimos.length,
                valorMedio: Math.round(valorMedio * 100) / 100,
                pedidosPorMes,
                valorEstimado: Math.round(valorEsperado * 100) / 100
            });

            if (!porCidadeMap[cidade]) porCidadeMap[cidade] = { cidade, valor: 0, clientes: 0, diasSet: new Set() };
            porCidadeMap[cidade].valor += valorEsperado;
            porCidadeMap[cidade].clientes++;
            if (cliente?.Dia_de_venda) {
                cliente.Dia_de_venda.split(',').map(d => d.trim()).filter(Boolean)
                    .forEach(d => porCidadeMap[cidade].diasSet.add(d));
            }

            // Produtos: média por pedido × pedidos estimados no mês
            const qtdPedidos = ultimos.length;
            const produtosAgg = {};
            for (const p of ultimos) {
                for (const item of p.itens) {
                    if (!item.produtoId) continue;
                    if (!produtosAgg[item.produtoId]) {
                        produtosAgg[item.produtoId] = {
                            produtoId: item.produtoId,
                            nome: item.produto?.nome || '',
                            codigo: item.produto?.codigo || '',
                            qtdTotal: 0,
                            valorTotal: 0
                        };
                    }
                    produtosAgg[item.produtoId].qtdTotal += Number(item.quantidade);
                    produtosAgg[item.produtoId].valorTotal += Number(item.quantidade) * Number(item.valor);
                }
            }

            for (const [prodId, prod] of Object.entries(produtosAgg)) {
                const qtdMediaPorPedido = prod.qtdTotal / qtdPedidos;
                const valorMedioPorPedido = prod.valorTotal / qtdPedidos;
                const qtdEstimada = qtdMediaPorPedido * pedidosPorMes * fatorCrescimento;
                const valorEstimadoProd = valorMedioPorPedido * pedidosPorMes * fatorCrescimento;

                if (!porProdutoMap[prodId]) {
                    porProdutoMap[prodId] = {
                        produtoId: prodId,
                        nome: prod.nome,
                        codigo: prod.codigo,
                        qtdEstimada: 0,
                        valorEstimado: 0
                    };
                }
                porProdutoMap[prodId].qtdEstimada += qtdEstimada;
                porProdutoMap[prodId].valorEstimado += valorEstimadoProd;
            }
        }

        const ORDEM_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
        const porCidade = Object.values(porCidadeMap)
            .map(c => {
                const diasVisita = [...(c.diasSet || new Set())].sort((a, b) => ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b));
                return {
                    cidade: c.cidade,
                    valor: Math.round(c.valor * 100) / 100,
                    clientes: c.clientes,
                    diasVisita,
                    vezesSemanais: diasVisita.length
                };
            })
            .sort((a, b) => b.valor - a.valor);

        const porProduto = Object.values(porProdutoMap)
            .map(p => ({
                ...p,
                qtdEstimada: Math.round(p.qtdEstimada * 100) / 100,
                valorEstimado: Math.round(p.valorEstimado * 100) / 100
            }))
            .sort((a, b) => b.valorEstimado - a.valorEstimado);

        const valorSugerido = resultadosClientes.reduce((sum, c) => sum + c.valorEstimado, 0);

        return {
            valorSugerido: Math.round(valorSugerido * 100) / 100,
            fatorCrescimento,
            totalClientes: resultadosClientes.length,
            porCidade,
            porProduto: porProduto.slice(0, 50), // Top 50 produtos
            porCliente: resultadosClientes.sort((a, b) => b.valorEstimado - a.valorEstimado)
        };
    },

    calcularDashboardVendedor: async (vendedorId, dataAtualStr) => {
        const dataAtual = dataAtualStr ? dayjs(dataAtualStr) : dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM');

        const meta = await prisma.metaMensalVendedor.findUnique({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            include: {
                metasProdutos: { include: { produto: { select: { nome: true, codigo: true } } } },
                metasPromocoes: { include: { promocao: { select: { nome: true } } } },
                metasCidades: true
            }
        });

        if (!meta) {
            return { temMeta: false, mensagem: "Nenhuma meta definida para este mês." };
        }

        let diasTrabalhoMes = [];
        try {
            diasTrabalhoMes = typeof meta.diasTrabalho === 'string' ? JSON.parse(meta.diasTrabalho) : meta.diasTrabalho;
        } catch (e) {
            console.warn("Erro ao parsear diasTrabalho", e);
        }

        diasTrabalhoMes.sort((a, b) => dayjs(a).diff(dayjs(b)));
        const totalDiasMes = diasTrabalhoMes.length;

        if (totalDiasMes === 0) {
            return { temMeta: false, mensagem: "Calendário de dias úteis não preenchido para este mês." };
        }

        const inicioSemana = dataAtual.startOf('week');
        const fimSemana = dataAtual.endOf('week');

        const diasTrabalhoSemana = diasTrabalhoMes.filter(d => dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]'));
        const totalDiasSemana = diasTrabalhoSemana.length;

        const diasTrabalhadosMesAteHoje = diasTrabalhoMes.filter(d => dayjs(d).isBefore(dataAtual, 'day') || dayjs(d).isSame(dataAtual, 'day'));
        const qtdDiasTrabalhadosMesAteHoje = diasTrabalhadosMesAteHoje.length;

        const diasTrabalhadosSemanaAteHoje = diasTrabalhoSemana.filter(d => dayjs(d).isBefore(dataAtual, 'day') || dayjs(d).isSame(dataAtual, 'day'));
        const qtdDiasTrabalhadosSemanaAteHoje = diasTrabalhadosSemanaAteHoje.length;

        const valorMensalTarget = Number(meta.valorMensal);
        const metaDiariaCalculada = valorMensalTarget / totalDiasMes;
        const metaSemanalCalculada = metaDiariaCalculada * totalDiasSemana;

        const dataInicioMesDb = dayjs(mesReferencia + '-01').startOf('month').toDate();
        const dataFimMesDb = dayjs(mesReferencia + '-01').endOf('month').toDate();

        const pedidosMes = await prisma.pedido.findMany({
            where: {
                vendedorId,
                dataVenda: { gte: dataInicioMesDb, lte: dataFimMesDb },
                bonificacao: false,
                OR: [
                    { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } },
                    { situacaoCA: null }
                ]
            },
            include: {
                itens: true,
                cliente: { select: { End_Cidade: true } }
            }
        });

        let totalVendidoMes = 0;
        let totalVendidoSemana = 0;
        let flexUtilizadoMes = 0;
        const qtdVendidaPorProduto = {};
        const valorVendidoPorCidade = {};
        const valorVendidoPorCidadeSemana = {};
        const vendaPorCidadeEDia = {}; // { cidade: { diaSemana(0-6): { total, pedidos } } }

        pedidosMes.forEach(p => {
            const valorPedido = p.itens.reduce((acc, item) => acc + (Number(item.valor) * Number(item.quantidade)), 0);
            totalVendidoMes += valorPedido;
            flexUtilizadoMes += Number(p.flexTotal || 0);
            const naSemana = dayjs(p.dataVenda).isBetween(inicioSemana, fimSemana, 'day', '[]');
            if (naSemana) {
                totalVendidoSemana += valorPedido;
            }

            // Progresso por produto
            p.itens.forEach(item => {
                if (!item.produtoId) return;
                qtdVendidaPorProduto[item.produtoId] = (qtdVendidaPorProduto[item.produtoId] || 0) + Number(item.quantidade);
            });

            // Progresso por cidade
            const cidade = p.cliente?.End_Cidade || 'Sem cidade';
            valorVendidoPorCidade[cidade] = (valorVendidoPorCidade[cidade] || 0) + valorPedido;
            if (naSemana) {
                valorVendidoPorCidadeSemana[cidade] = (valorVendidoPorCidadeSemana[cidade] || 0) + valorPedido;
            }

            const diaSemana = dayjs(p.dataVenda).day();
            if (!vendaPorCidadeEDia[cidade]) vendaPorCidadeEDia[cidade] = {};
            if (!vendaPorCidadeEDia[cidade][diaSemana]) vendaPorCidadeEDia[cidade][diaSemana] = { total: 0, pedidos: 0 };
            vendaPorCidadeEDia[cidade][diaSemana].total += valorPedido;
            vendaPorCidadeEDia[cidade][diaSemana].pedidos++;
        });

        const hojeEhDiaTrabalho = diasTrabalhoMes.some(d => dayjs(d).isSame(dataAtual, 'day'));

        const DIAS_SIGLA_LIST = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const diaHojeSigla = DIAS_SIGLA_LIST[dataAtual.day()];
        const diasRestantesMesArr = diasTrabalhoMes.filter(d => dayjs(d).isAfter(dataAtual, 'day'));
        const diasRestantesMes = diasRestantesMesArr.length;
        const proximosDias = diasRestantesMesArr.slice(0, 5).map(d => dayjs(d).format('YYYY-MM-DD'));

        // cidadesDeHoje: cidades com diasSemana configurado incluindo hoje
        // (fallback para detecção automática se nenhuma cidade tiver diasSemana)
        const cidadesComConfig = meta.metasCidades.filter(mc => mc.diasSemana);
        let cidadesDeHoje;
        if (cidadesComConfig.length > 0) {
            cidadesDeHoje = cidadesComConfig
                .filter(mc => mc.diasSemana.split(',').map(d => d.trim().toUpperCase()).includes(diaHojeSigla))
                .map(mc => mc.cidade);
        } else {
            const clientesHoje = await prisma.cliente.findMany({
                where: { idVendedor: vendedorId, Dia_de_venda: { contains: diaHojeSigla } },
                select: { End_Cidade: true }
            });
            cidadesDeHoje = [...new Set(clientesHoje.map(c => c.End_Cidade).filter(Boolean))];
        }

        const divisorDiasMes = Math.max(qtdDiasTrabalhadosMesAteHoje, 1);
        const mediaDiariaRealizadaMes = totalVendidoMes / divisorDiasMes;
        const diasRestantesMesProj = totalDiasMes - qtdDiasTrabalhadosMesAteHoje;
        const projecaoMensal = totalVendidoMes + (mediaDiariaRealizadaMes * diasRestantesMesProj);
        const diasRestantesSemana = totalDiasSemana - qtdDiasTrabalhadosSemanaAteHoje;
        const projecaoSemanal = totalVendidoSemana + (mediaDiariaRealizadaMes * diasRestantesSemana);

        return {
            temMeta: true,
            dataAtual: dataAtual.format('YYYY-MM-DD'),
            hojeEhDiaTrabalho,
            cidadesDeHoje,
            resumoCalendario: {
                totalDiasMes,
                diasTrabalhadosMesAteHoje: qtdDiasTrabalhadosMesAteHoje,
                totalDiasSemana,
                diasTrabalhadosSemanaAteHoje: qtdDiasTrabalhadosSemanaAteHoje
            },
            metasAlvo: {
                mensal: valorMensalTarget,
                semanal: metaSemanalCalculada,
                diaria: metaDiariaCalculada,
                flexMensal: Number(meta.flexMensal)
            },
            realizado: {
                totalVendidoMes,
                totalVendidoSemana,
                flexUtilizadoMes,
                mediaDiariaAtual: mediaDiariaRealizadaMes
            },
            projecoes: { mensal: projecaoMensal, semanal: projecaoSemanal },
            progressoProdutos: meta.metasProdutos.map(mp => ({
                produtoId: mp.produtoId,
                nome: mp.produto?.nome || '',
                codigo: mp.produto?.codigo || '',
                meta: Number(mp.quantidade),
                realizado: qtdVendidaPorProduto[mp.produtoId] || 0
            })),
            progressoCidades: meta.metasCidades.map(mc => {
                const cityDayData = vendaPorCidadeEDia[mc.cidade] || {};
                const mediasPorDiaSemana = Array.from({ length: 7 }, (_, dia) => {
                    const d = cityDayData[dia] || { total: 0, pedidos: 0 };
                    return {
                        dia,
                        total: Math.round(d.total * 100) / 100,
                        pedidos: d.pedidos,
                        media: d.pedidos > 0 ? Math.round((d.total / d.pedidos) * 100) / 100 : 0
                    };
                });

                const diasConfig = mc.diasSemana ? mc.diasSemana.split(',').map(d => d.trim().toUpperCase()) : [];
                const totalVisitasMes = diasConfig.length > 0
                    ? diasTrabalhoMes.filter(d => diasConfig.includes(DIAS_SIGLA_LIST[dayjs(d).day()])).length
                    : totalDiasMes;
                const visitasSemanaCount = diasConfig.length > 0
                    ? diasTrabalhoMes.filter(d =>
                        dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]') &&
                        diasConfig.includes(DIAS_SIGLA_LIST[dayjs(d).day()])
                    ).length
                    : totalDiasSemana;
                const metaSemana = totalVisitasMes > 0
                    ? Math.round((Number(mc.valor) * visitasSemanaCount / totalVisitasMes) * 100) / 100
                    : 0;

                return {
                    cidade: mc.cidade,
                    meta: Number(mc.valor),
                    metaSemana,
                    diasSemana: diasConfig,
                    realizado: valorVendidoPorCidade[mc.cidade] || 0,
                    realizadoSemana: Math.round((valorVendidoPorCidadeSemana[mc.cidade] || 0) * 100) / 100,
                    diasRestantesMes,
                    proximosDias,
                    mediasPorDiaSemana
                };
            }),
            progressoPromocoes: meta.metasPromocoes.map(mp => ({
                promocaoId: mp.promocaoId,
                nome: mp.promocao?.nome || '',
                meta: mp.quantidadePedidos,
                realizado: null // rastreamento futuro
            }))
        };
    },

    calcularCidadesHojeAdmin: async (diaSiglaParam) => {
        const dataAtual = dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM');
        const DIAS_SIGLA_LIST = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const diaHojeSigla = diaSiglaParam
            ? diaSiglaParam.toUpperCase()
            : DIAS_SIGLA_LIST[dataAtual.day()];
        const inicioSemana = dataAtual.startOf('week');
        const fimSemana = dataAtual.endOf('week');

        const metas = await prisma.metaMensalVendedor.findMany({
            where: { mesReferencia },
            include: {
                metasCidades: true,
                vendedor: { select: { id: true, nome: true } }
            }
        });

        if (!metas.length) return [];

        // Map: vendedorId -> diasTrabalhoMes[]
        const diasTrabalhoPorVendedor = {};
        for (const m of metas) {
            let dias = [];
            try { dias = typeof m.diasTrabalho === 'string' ? JSON.parse(m.diasTrabalho) : (m.diasTrabalho || []); } catch (e) { /* */ }
            diasTrabalhoPorVendedor[m.vendedorId] = dias;
        }

        // Uma query mensal com o filtro padrão: todos exceto cancelado, devolvido e bonificação
        const vendedorIds = metas.map(m => m.vendedorId);
        const inicioMes = dataAtual.startOf('month').toDate();
        const fimMes = dataAtual.endOf('month').toDate();

        const [pedidosMes, clientesDoDia] = await Promise.all([
            prisma.pedido.findMany({
                where: {
                    vendedorId: { in: vendedorIds },
                    dataVenda: { gte: inicioMes, lte: fimMes },
                    bonificacao: false,
                    OR: [
                        { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } },
                        { situacaoCA: null }
                    ]
                },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
            }),
            prisma.cliente.findMany({
                where: {
                    idVendedor: { in: vendedorIds },
                    Dia_de_venda: { contains: diaHojeSigla },
                    End_Cidade: { not: null }
                },
                select: { UUID: true, End_Cidade: true }
            })
        ]);

        // Total de clientes por cidade no dia
        const totalClientesPorCidade = {};
        for (const cl of clientesDoDia) {
            const cidade = cl.End_Cidade;
            if (!cidade) continue;
            totalClientesPorCidade[cidade] = (totalClientesPorCidade[cidade] || 0) + 1;
        }

        // Deriva semana e hoje a partir do mês; rastreia clientes únicos por cidade
        const vendidoMesMap = {};
        const vendidoSemanaMap = {};
        const vendidoHojeMap = {};
        const clientesMesPorCidade = {};
        const clientesSemanaPorCidade = {};
        for (const p of pedidosMes) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            const key = `${p.vendedorId}|${cidade}`;
            vendidoMesMap[key] = (vendidoMesMap[key] || 0) + valor;
            if (p.clienteId) {
                if (!clientesMesPorCidade[cidade]) clientesMesPorCidade[cidade] = new Set();
                clientesMesPorCidade[cidade].add(p.clienteId);
            }
            if (dayjs(p.dataVenda).isBetween(inicioSemana, fimSemana, 'day', '[]')) {
                vendidoSemanaMap[key] = (vendidoSemanaMap[key] || 0) + valor;
                if (p.clienteId) {
                    if (!clientesSemanaPorCidade[cidade]) clientesSemanaPorCidade[cidade] = new Set();
                    clientesSemanaPorCidade[cidade].add(p.clienteId);
                }
            }
            if (dayjs(p.dataVenda).isSame(dataAtual, 'day')) {
                vendidoHojeMap[key] = (vendidoHojeMap[key] || 0) + valor;
            }
        }

        // Agrega por cidade → vendedores
        const porCidadeMap = {};
        for (const meta of metas) {
            const diasTrabalhoMes = diasTrabalhoPorVendedor[meta.vendedorId] || [];
            const totalDiasMes = diasTrabalhoMes.length;
            if (totalDiasMes === 0) continue;

            for (const mc of meta.metasCidades) {
                const diasConfig = mc.diasSemana
                    ? mc.diasSemana.split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
                    : [];

                // Verifica se hoje é dia de atendimento desta cidade
                const ehHoje = diasConfig.length > 0
                    ? diasConfig.includes(diaHojeSigla)
                    : true; // sem config, sempre aparece
                if (!ehHoje) continue;

                // Calcula metaSemana pelo mesmo critério de calcularMetaHoje
                const totalVisitasMes = diasConfig.length > 0
                    ? diasTrabalhoMes.filter(d => diasConfig.includes(DIAS_SIGLA_LIST[dayjs(d).day()])).length
                    : totalDiasMes;

                const visitasSemana = diasConfig.length > 0
                    ? diasTrabalhoMes.filter(d =>
                        dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]') &&
                        diasConfig.includes(DIAS_SIGLA_LIST[dayjs(d).day()])
                    ).length
                    : diasTrabalhoMes.filter(d => dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]')).length;

                const metaSemana = totalVisitasMes > 0
                    ? Math.round((Number(mc.valor) * visitasSemana / totalVisitasMes) * 100) / 100
                    : 0;

                const key = `${meta.vendedorId}|${mc.cidade}`;
                const vendidoHoje = Math.round((vendidoHojeMap[key] || 0) * 100) / 100;
                const vendidoSemana = Math.round((vendidoSemanaMap[key] || 0) * 100) / 100;
                const vendidoMes = Math.round((vendidoMesMap[key] || 0) * 100) / 100;
                const metaMensal = Number(mc.valor);

                if (!porCidadeMap[mc.cidade]) {
                    porCidadeMap[mc.cidade] = {
                        cidade: mc.cidade,
                        totalMetaSemana: 0, totalVendidoSemana: 0,
                        totalMetaMensal: 0, totalVendidoMes: 0,
                        totalVendidoHoje: 0, vendedores: [],
                        totalClientesDia: totalClientesPorCidade[mc.cidade] || 0,
                        clientesComPedidoSemana: clientesSemanaPorCidade[mc.cidade]?.size || 0,
                        clientesComPedidoMes: clientesMesPorCidade[mc.cidade]?.size || 0
                    };
                }
                porCidadeMap[mc.cidade].totalMetaSemana += metaSemana;
                porCidadeMap[mc.cidade].totalVendidoSemana += vendidoSemana;
                porCidadeMap[mc.cidade].totalMetaMensal += metaMensal;
                porCidadeMap[mc.cidade].totalVendidoMes += vendidoMes;
                porCidadeMap[mc.cidade].totalVendidoHoje += vendidoHoje;
                porCidadeMap[mc.cidade].vendedores.push({
                    vendedorId: meta.vendedorId,
                    nome: meta.vendedor?.nome || '',
                    metaSemana, vendidoSemana,
                    metaMensal, vendidoMes,
                    vendidoHoje
                });
            }
        }

        return Object.values(porCidadeMap).sort((a, b) => b.totalMetaSemana - a.totalMetaSemana);
    },

    calcularMetaHoje: async (vendedorId, diaSiglaParam) => {
        const dataAtual = dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM');
        const DIAS_SIGLA_LIST = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const diaHojeSigla = diaSiglaParam
            ? diaSiglaParam.toUpperCase()
            : DIAS_SIGLA_LIST[dataAtual.day()];

        const meta = await prisma.metaMensalVendedor.findUnique({
            where: { vendedorId_mesReferencia: { vendedorId, mesReferencia } },
            include: { metasCidades: true }
        });

        if (!meta || !meta.metasCidades?.length) {
            return { temMeta: false, cidadesDeHoje: [] };
        }

        let diasTrabalhoMes = [];
        try {
            diasTrabalhoMes = typeof meta.diasTrabalho === 'string' ? JSON.parse(meta.diasTrabalho) : (meta.diasTrabalho || []);
        } catch (e) { /* ignore */ }
        const totalDiasMes = diasTrabalhoMes.length;

        const inicioSemana = dataAtual.startOf('week');
        const fimSemana = dataAtual.endOf('week');
        const diasTrabalhoSemana = diasTrabalhoMes.filter(d =>
            dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]')
        ).length;

        // Filtra cidades que têm hoje como dia de atendimento (diasSemana configurado)
        // Fallback: cidades sem diasSemana configurado aparecem sempre
        const metasCidadesHoje = meta.metasCidades.filter(mc => {
            if (!mc.diasSemana) return true; // sem configuração, aparece sempre
            const dias = mc.diasSemana.split(',').map(d => d.trim().toUpperCase());
            return dias.includes(diaHojeSigla);
        });

        if (metasCidadesHoje.length === 0) {
            return { temMeta: true, cidadesDeHoje: [], conversaoHoje: { totalClientes: 0, comPedido: 0 } };
        }

        const inicioDia = dataAtual.startOf('day').toDate();
        const fimDia = dataAtual.endOf('day').toDate();
        const inicioMes = dataAtual.startOf('month').toDate();
        const fimMes = dataAtual.endOf('month').toDate();

        const filtroValido = {
            bonificacao: false,
            OR: [
                { situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } },
                { situacaoCA: null }
            ]
        };

        const cidadesHojeNomes = metasCidadesHoje.map(mc => mc.cidade);

        const [pedidosHoje, pedidosSemana, pedidosMes, clientesDeHoje] = await Promise.all([
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte: inicioDia, lte: fimDia }, ...filtroValido },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
            }),
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte: inicioSemana.toDate(), lte: fimSemana.toDate() }, ...filtroValido },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
            }),
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte: inicioMes, lte: fimMes }, ...filtroValido },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
            }),
            prisma.cliente.findMany({
                where: {
                    idVendedor: vendedorId,
                    Dia_de_venda: { contains: diaHojeSigla },
                    End_Cidade: { in: cidadesHojeNomes }
                },
                select: { UUID: true, End_Cidade: true }
            })
        ]);

        const vendidoHojePorCidade = {};
        for (const p of pedidosHoje) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            vendidoHojePorCidade[cidade] = (vendidoHojePorCidade[cidade] || 0) + valor;
        }

        const vendidoSemanaPorCidade = {};
        const clientesComPedidoSemana = new Set();
        for (const p of pedidosSemana) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            vendidoSemanaPorCidade[cidade] = (vendidoSemanaPorCidade[cidade] || 0) + valor;
            if (p.clienteId) clientesComPedidoSemana.add(p.clienteId);
        }

        const vendidoMesPorCidade = {};
        for (const p of pedidosMes) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            vendidoMesPorCidade[cidade] = (vendidoMesPorCidade[cidade] || 0) + valor;
        }

        const totalClientesHoje = clientesDeHoje.length;
        const comPedidoHoje = clientesDeHoje.filter(c => clientesComPedidoSemana.has(c.UUID)).length;

        // Mapa: diaSigla → índice dayjs (0=Dom..6=Sab)
        const SIGLA_TO_DAY = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 };

        const cidadesDeHoje = metasCidadesHoje.map(mc => {
            const diasConfig = mc.diasSemana
                ? mc.diasSemana.split(',').map(d => d.trim().toUpperCase()).filter(Boolean)
                : [];

            // Total de dias de visita no mês (diasTrabalhoMes que batem com diasConfig)
            const totalVisitasMes = diasConfig.length > 0
                ? diasTrabalhoMes.filter(d => {
                    const diaSigla = DIAS_SIGLA_LIST[dayjs(d).day()];
                    return diasConfig.includes(diaSigla);
                }).length
                : totalDiasMes;

            // Visitas desta semana (diasTrabalhoMes que estão na semana e batem com diasConfig)
            const visitasSemana = diasConfig.length > 0
                ? diasTrabalhoMes.filter(d => {
                    if (!dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]')) return false;
                    const diaSigla = DIAS_SIGLA_LIST[dayjs(d).day()];
                    return diasConfig.includes(diaSigla);
                })
                : diasTrabalhoMes.filter(d => dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]'));

            const metaSemana = totalVisitasMes > 0
                ? Math.round((Number(mc.valor) * visitasSemana.length / totalVisitasMes) * 100) / 100
                : 0;

            // Visitas restantes na semana (a partir de amanhã)
            const visitasRestantesSemana = visitasSemana
                .filter(d => dayjs(d).isAfter(dataAtual, 'day'))
                .map(d => dayjs(d).format('YYYY-MM-DD'));

            const vendidoSemana = Math.round((vendidoSemanaPorCidade[mc.cidade] || 0) * 100) / 100;
            const faltaSemana = Math.max(metaSemana - vendidoSemana, 0);
            const porVisita = visitasRestantesSemana.length > 0
                ? Math.round((faltaSemana / visitasRestantesSemana.length) * 100) / 100
                : faltaSemana;

            return {
                cidade: mc.cidade,
                diasSemana: diasConfig,
                metaMensal: Number(mc.valor),
                metaSemana,
                visitasSemana: visitasSemana.map(d => dayjs(d).format('YYYY-MM-DD')),
                visitasRestantesSemana,
                vendidoHoje: Math.round((vendidoHojePorCidade[mc.cidade] || 0) * 100) / 100,
                vendidoSemana,
                realizadoMes: Math.round((vendidoMesPorCidade[mc.cidade] || 0) * 100) / 100,
                faltaSemana,
                porVisita
            };
        });

        return {
            temMeta: true,
            cidadesDeHoje,
            conversaoHoje: { totalClientes: totalClientesHoje, comPedido: comPedidoHoje }
        };
    }
};

module.exports = metaService;
