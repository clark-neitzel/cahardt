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
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true } }
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

            if (!porCidadeMap[cidade]) porCidadeMap[cidade] = { cidade, valor: 0, clientes: 0 };
            porCidadeMap[cidade].valor += valorEsperado;
            porCidadeMap[cidade].clientes++;

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

        const porCidade = Object.values(porCidadeMap)
            .map(c => ({ ...c, valor: Math.round(c.valor * 100) / 100 }))
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
                metasProdutos: { include: { produto: { select: { nome: true } } } },
                metasPromocoes: { include: { promocao: { select: { nome: true } } } }
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
            include: { itens: true }
        });

        let totalVendidoMes = 0;
        let totalVendidoSemana = 0;
        let flexUtilizadoMes = 0;

        pedidosMes.forEach(p => {
            const valorPedido = p.itens.reduce((acc, item) => acc + (Number(item.valor) * Number(item.quantidade)), 0);
            totalVendidoMes += valorPedido;
            flexUtilizadoMes += Number(p.flexTotal || 0);
            if (dayjs(p.dataVenda).isBetween(inicioSemana, fimSemana, 'day', '[]')) {
                totalVendidoSemana += valorPedido;
            }
        });

        const hojeEhDiaTrabalho = diasTrabalhoMes.some(d => dayjs(d).isSame(dataAtual, 'day'));
        const divisorDiasMes = Math.max(qtdDiasTrabalhadosMesAteHoje, 1);
        const mediaDiariaRealizadaMes = totalVendidoMes / divisorDiasMes;
        const diasRestantesMes = totalDiasMes - qtdDiasTrabalhadosMesAteHoje;
        const projecaoMensal = totalVendidoMes + (mediaDiariaRealizadaMes * diasRestantesMes);
        const diasRestantesSemana = totalDiasSemana - qtdDiasTrabalhadosSemanaAteHoje;
        const projecaoSemanal = totalVendidoSemana + (mediaDiariaRealizadaMes * diasRestantesSemana);

        return {
            temMeta: true,
            dataAtual: dataAtual.format('YYYY-MM-DD'),
            hojeEhDiaTrabalho,
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
            detalhesMetasEspeciais: {
                produtos: meta.metasProdutos,
                promocoes: meta.metasPromocoes
            }
        };
    }
};

module.exports = metaService;
