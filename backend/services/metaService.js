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
                    valor: mc.valor
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
                situacaoCA: 'FATURADO',
                bonificacao: false,
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
        const vendaPorCidadeEDia = {}; // { cidade: { diaSemana(0-6): { total, pedidos } } }

        pedidosMes.forEach(p => {
            const valorPedido = p.itens.reduce((acc, item) => acc + (Number(item.valor) * Number(item.quantidade)), 0);
            totalVendidoMes += valorPedido;
            flexUtilizadoMes += Number(p.flexTotal || 0);
            if (dayjs(p.dataVenda).isBetween(inicioSemana, fimSemana, 'day', '[]')) {
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

        const clientesHoje = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Dia_de_venda: { contains: diaHojeSigla } },
            select: { End_Cidade: true }
        });
        const cidadesDeHoje = [...new Set(clientesHoje.map(c => c.End_Cidade).filter(Boolean))];

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
                return {
                    cidade: mc.cidade,
                    meta: Number(mc.valor),
                    realizado: valorVendidoPorCidade[mc.cidade] || 0,
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

    calcularCidadesHojeAdmin: async () => {
        const dataAtual = dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM');
        const DIAS_SIGLA_LIST = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const diaHojeSigla = DIAS_SIGLA_LIST[dataAtual.day()];

        // Busca todas as metas do mês com metasCidades e vendedor
        const metas = await prisma.metaMensalVendedor.findMany({
            where: { mesReferencia },
            include: {
                metasCidades: true,
                vendedor: { select: { id: true, nome: true } }
            }
        });

        if (!metas.length) return [];

        // Map: vendedorId -> totalDiasMes
        const totalDiasPorVendedor = {};
        for (const m of metas) {
            let dias = [];
            try { dias = typeof m.diasTrabalho === 'string' ? JSON.parse(m.diasTrabalho) : (m.diasTrabalho || []); } catch (e) { /* */ }
            totalDiasPorVendedor[m.vendedorId] = dias.length;
        }

        // Clientes que visitam hoje (para todos os vendedores)
        const clientesHoje = await prisma.cliente.findMany({
            where: { Dia_de_venda: { contains: diaHojeSigla } },
            select: { End_Cidade: true, idVendedor: true }
        });

        // Map: vendedorId -> Set<cidade>
        const cidadesPorVendedor = {};
        for (const c of clientesHoje) {
            if (!c.idVendedor || !c.End_Cidade) continue;
            if (!cidadesPorVendedor[c.idVendedor]) cidadesPorVendedor[c.idVendedor] = new Set();
            cidadesPorVendedor[c.idVendedor].add(c.End_Cidade);
        }

        // Pedidos de hoje (todos os vendedores)
        const inicioDia = dataAtual.startOf('day').toDate();
        const fimDia = dataAtual.endOf('day').toDate();
        const pedidosHoje = await prisma.pedido.findMany({
            where: { dataVenda: { gte: inicioDia, lte: fimDia }, bonificacao: false, NOT: { situacaoCA: 'CANCELADO' } },
            include: { itens: true, cliente: { select: { End_Cidade: true } } }
        });

        // Map: `vendedorId|cidade` -> vendidoHoje
        const vendidoMap = {};
        for (const p of pedidosHoje) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            const key = `${p.vendedorId}|${cidade}`;
            vendidoMap[key] = (vendidoMap[key] || 0) + valor;
        }

        // Agrega por cidade → vendedores
        const porCidadeMap = {};
        for (const meta of metas) {
            const cidadesHoje = cidadesPorVendedor[meta.vendedorId];
            if (!cidadesHoje?.size) continue;
            const totalDias = totalDiasPorVendedor[meta.vendedorId] || 1;

            for (const mc of meta.metasCidades) {
                if (!cidadesHoje.has(mc.cidade)) continue;
                const metaDia = Math.round((Number(mc.valor) / totalDias) * 100) / 100;
                const vendidoHoje = Math.round((vendidoMap[`${meta.vendedorId}|${mc.cidade}`] || 0) * 100) / 100;

                if (!porCidadeMap[mc.cidade]) {
                    porCidadeMap[mc.cidade] = { cidade: mc.cidade, totalMetaDia: 0, totalVendidoHoje: 0, vendedores: [] };
                }
                porCidadeMap[mc.cidade].totalMetaDia += metaDia;
                porCidadeMap[mc.cidade].totalVendidoHoje += vendidoHoje;
                porCidadeMap[mc.cidade].vendedores.push({
                    vendedorId: meta.vendedorId,
                    nome: meta.vendedor?.nome || '',
                    metaDia,
                    vendidoHoje
                });
            }
        }

        return Object.values(porCidadeMap).sort((a, b) => b.totalMetaDia - a.totalMetaDia);
    },

    calcularMetaHoje: async (vendedorId) => {
        const dataAtual = dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM');
        const DIAS_SIGLA_LIST = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const diaHojeSigla = DIAS_SIGLA_LIST[dataAtual.day()];

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

        const clientesHoje = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Dia_de_venda: { contains: diaHojeSigla } },
            select: { End_Cidade: true }
        });
        const cidadesHoje = [...new Set(clientesHoje.map(c => c.End_Cidade).filter(Boolean))];

        const metasCidadesHoje = meta.metasCidades.filter(mc => cidadesHoje.includes(mc.cidade));
        if (metasCidadesHoje.length === 0) {
            return { temMeta: true, cidadesDeHoje: [] };
        }

        const inicioDia = dataAtual.startOf('day').toDate();
        const fimDia = dataAtual.endOf('day').toDate();

        const [pedidosHoje, pedidosSemana] = await Promise.all([
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte: inicioDia, lte: fimDia }, bonificacao: false, NOT: { situacaoCA: 'CANCELADO' } },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
            }),
            prisma.pedido.findMany({
                where: { vendedorId, dataVenda: { gte: inicioSemana.toDate(), lte: fimSemana.toDate() }, bonificacao: false, NOT: { situacaoCA: 'CANCELADO' } },
                include: { itens: true, cliente: { select: { End_Cidade: true } } }
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
        for (const p of pedidosSemana) {
            const cidade = p.cliente?.End_Cidade;
            if (!cidade) continue;
            const valor = p.itens.reduce((acc, item) => acc + Number(item.valor) * Number(item.quantidade), 0);
            vendidoSemanaPorCidade[cidade] = (vendidoSemanaPorCidade[cidade] || 0) + valor;
        }

        const cidadesDeHoje = metasCidadesHoje.map(mc => ({
            cidade: mc.cidade,
            metaMensal: Number(mc.valor),
            metaSemana: totalDiasMes > 0 ? Math.round((Number(mc.valor) * diasTrabalhoSemana / totalDiasMes) * 100) / 100 : 0,
            vendidoHoje: Math.round((vendidoHojePorCidade[mc.cidade] || 0) * 100) / 100,
            vendidoSemana: Math.round((vendidoSemanaPorCidade[mc.cidade] || 0) * 100) / 100
        }));

        return { temMeta: true, cidadesDeHoje };
    }
};

module.exports = metaService;
