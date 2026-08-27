const prisma = require('../config/database'); // singleton compartilhado (pool único)
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);
const { calcularFlexDinamico } = require('./flexService');
const projecaoVendasService = require('./projecaoVendasService');
const { deduplicarMetasCidades } = require('../utils/metaCidadeMerge'); // fusão de cidades repetidas (@@unique de meta_cidades)
const { normalizarCidade } = require('../utils/cidade'); // grafia oficial da cidade (Fase 1)

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

        // METAS POR CIDADE — normaliza a grafia E deduplica ANTES de gravar.
        //
        // Por que o dedupe é obrigatório aqui (não é zelo, é regressão):
        // `meta_cidades` tem @@unique([metaMensalVendedorId, cidade]). Antes da Fase 1 a
        // cidade era gravada CRUA, então um payload com "JOINVILLE" e "Joinville" criava
        // DUAS linhas (strings diferentes para o Postgres — o índice deixava passar; em
        // produção havia 3 metas assim). Com `normalizarCidade` as duas passam a ter o
        // MESMO nome: sem deduplicar, o `createMany` viola o índice único e a meta
        // simplesmente PARA DE SALVAR (erro 500 na cara do admin).
        // O dedupe do `MetaFormModal.jsx` é de UI e não protege a API.
        //
        // Regra da fusão (a mesma que o dono aprovou no diagnóstico, em
        // `utils/metaCidadeMerge.js`): SOMA os valores e UNE os dias. Somar, e não ficar
        // com a maior — a meta da cidade é uma só, e escolher apagaria meta de verdade.
        await prisma.metaCidade.deleteMany({ where: { metaMensalVendedorId: metaSalva.id } });
        const metasCidadesLimpas = deduplicarMetasCidades(metasCidades);
        if (metasCidadesLimpas.descartadasSemCidade > 0) {
            console.warn(`[Metas] ${metasCidadesLimpas.descartadasSemCidade} meta(s) de cidade sem nome de cidade foram ignoradas (meta ${metaSalva.id}).`);
        }
        if (metasCidadesLimpas.cidades.length > 0) {
            await prisma.metaCidade.createMany({
                data: metasCidadesLimpas.cidades.map(mc => ({
                    metaMensalVendedorId: metaSalva.id,
                    cidade: mc.cidade,
                    valor: mc.valor,
                    diasSemana: mc.diasSemana
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
        }, { timeout: 20000, maxWait: 10000 });
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
        // Clientes cujo cadastro não tem cidade. Contados à parte de propósito — ver o
        // comentário grande no laço abaixo.
        let clientesSemCidade = 0;
        let valorSemCidade = 0;

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

            // ── CIDADE DO CLIENTE — e por que 'Sem cidade' NÃO pode entrar em `porCidade` ──
            //
            // Esta lista não é só informativa: o botão "Preencher cidades" do
            // `MetaFormModal.jsx` despeja `porCidade` INTEIRA em `metasCidades`, e ao salvar
            // cada item vira uma linha de `meta_cidades`. Enquanto o rótulo 'Sem cidade'
            // saía daqui como se fosse cidade, cada clique num vendedor com cliente de
            // cadastro incompleto criava MAIS uma linha `meta_cidades.cidade = 'Sem cidade'` —
            // as 2 linhas que existem em produção não são resto histórico, é esta torneira.
            // (A sentinela em `utils/cidade.js` protege o backfill de reescrever as linhas
            // que já existem; ela continua lá. A correção da ORIGEM é aqui.)
            //
            // `normalizarCidade` devolve `null` para vazio/nulo/só espaço, e o nome oficial
            // para o resto — então o agrupamento também deixa de dividir a mesma cidade em
            // duas linhas por causa da grafia ("JOINVILLE" e "Joinville" viravam 2 itens).
            const cidade = normalizarCidade(cliente?.End_Cidade);

            resultadosClientes.push({
                clienteId,
                nome: cliente?.NomeFantasia || cliente?.Nome || clienteId,
                cidade, // `null` quando o cadastro não tem cidade (antes: o texto 'Sem cidade')
                pedidosBase: ultimos.length,
                valorMedio: Math.round(valorMedio * 100) / 100,
                pedidosPorMes,
                valorEstimado: Math.round(valorEsperado * 100) / 100
            });

            if (cidade) {
                if (!porCidadeMap[cidade]) porCidadeMap[cidade] = { cidade, valor: 0, clientes: 0, diasSet: new Set() };
                porCidadeMap[cidade].valor += valorEsperado;
                porCidadeMap[cidade].clientes++;
                if (cliente?.Dia_de_venda) {
                    cliente.Dia_de_venda.split(',').map(d => d.trim()).filter(Boolean)
                        .forEach(d => porCidadeMap[cidade].diasSet.add(d));
                }
            } else {
                // O cliente NÃO some da sugestão: ele continua em `porCliente` e o valor dele
                // continua dentro de `valorSugerido`. O que ele não faz é virar uma cidade
                // falsa. A contagem sai em `clientesSemCidade` para a tela poder avisar o
                // admin que há cadastro incompleto (Fase 4) — a informação não se perde,
                // muda de lugar.
                clientesSemCidade++;
                valorSemCidade += valorEsperado;
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
            // Campos NOVOS (aditivos): quantos clientes ficaram de fora de `porCidade` por
            // não terem cidade no cadastro, e quanto valor eles representam. Sem isto, a
            // soma de `porCidade` seria menor que `valorSugerido` sem explicação nenhuma.
            clientesSemCidade,
            valorSemCidade: Math.round(valorSemCidade * 100) / 100,
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

        // Venda = pedido FATURADO (ou especial), sem bonificação, menos devoluções
        // ativas — mesma régua da comissão e do Dashboard Geral (projecaoVendasService)
        const [pedidosMes, devolucoesMes] = await Promise.all([
            prisma.pedido.findMany({
                where: {
                    vendedorId,
                    dataVenda: { gte: dataInicioMesDb, lte: dataFimMesDb },
                    ...projecaoVendasService.WHERE_PEDIDO_RECEITA
                },
                include: {
                    itens: true,
                    cliente: { select: { End_Cidade: true } }
                }
            }),
            prisma.devolucao.findMany({
                where: {
                    status: 'ATIVA',
                    dataDevolucao: { gte: dataInicioMesDb, lte: dataFimMesDb },
                    pedidoOriginal: { vendedorId }
                },
                select: {
                    valorTotal: true,
                    dataDevolucao: true,
                    cliente: { select: { End_Cidade: true } },
                    itens: { select: { produtoId: true, quantidade: true } }
                }
            })
        ]);

        let totalVendidoMes = 0;
        let totalVendidoSemana = 0;
        let flexUtilizadoMes = 0;
        const qtdVendidaPorProduto = {};
        const valorVendidoPorCidade = {};
        const valorVendidoPorCidadeSemana = {};
        const vendaPorCidadeEDia = {}; // { cidade: { diaSemana(0-6): { total, pedidos } } }
        const clientesMesPorCidadeVend = {};
        const clientesSemanaPorCidadeVend = {};

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

            // Rastreia clientes únicos por cidade
            if (p.clienteId) {
                if (!clientesMesPorCidadeVend[cidade]) clientesMesPorCidadeVend[cidade] = new Set();
                clientesMesPorCidadeVend[cidade].add(p.clienteId);
                if (naSemana) {
                    if (!clientesSemanaPorCidadeVend[cidade]) clientesSemanaPorCidadeVend[cidade] = new Set();
                    clientesSemanaPorCidadeVend[cidade].add(p.clienteId);
                }
            }

            const diaSemana = dayjs(p.dataVenda).day();
            if (!vendaPorCidadeEDia[cidade]) vendaPorCidadeEDia[cidade] = {};
            if (!vendaPorCidadeEDia[cidade][diaSemana]) vendaPorCidadeEDia[cidade][diaSemana] = { total: 0, pedidos: 0 };
            vendaPorCidadeEDia[cidade][diaSemana].total += valorPedido;
            vendaPorCidadeEDia[cidade][diaSemana].pedidos++;
        });

        // Devoluções descontam o realizado (mês, semana, cidade e quantidade de
        // produto). Flex e clientes visitados não voltam atrás: o flex foi
        // concedido na venda e a visita aconteceu.
        devolucoesMes.forEach(dev => {
            const valorDev = Number(dev.valorTotal || 0);
            const naSemana = dayjs(dev.dataDevolucao).isBetween(inicioSemana, fimSemana, 'day', '[]');
            totalVendidoMes -= valorDev;
            if (naSemana) totalVendidoSemana -= valorDev;

            const cidade = dev.cliente?.End_Cidade || 'Sem cidade';
            valorVendidoPorCidade[cidade] = (valorVendidoPorCidade[cidade] || 0) - valorDev;
            if (naSemana) {
                valorVendidoPorCidadeSemana[cidade] = (valorVendidoPorCidadeSemana[cidade] || 0) - valorDev;
            }

            dev.itens.forEach(item => {
                if (!item.produtoId) return;
                qtdVendidaPorProduto[item.produtoId] = (qtdVendidaPorProduto[item.produtoId] || 0) - Number(item.quantidade);
            });
        });

        // Conta clientes ativos por cidade para este vendedor
        const clientesTotaisPorCidadeVend = {};
        try {
            const clientesVend = await prisma.cliente.findMany({
                where: { idVendedor: vendedorId, Ativo: true, End_Cidade: { not: null } },
                select: { End_Cidade: true }
            });
            for (const cl of clientesVend) {
                if (!cl.End_Cidade) continue;
                clientesTotaisPorCidadeVend[cl.End_Cidade] = (clientesTotaisPorCidadeVend[cl.End_Cidade] || 0) + 1;
            }
        } catch (e) { /* não bloqueia se falhar */ }

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
                where: { idVendedor: vendedorId, Ativo: true, Dia_de_venda: { contains: diaHojeSigla } },
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

        // Flex dinâmico: orçamento = % sobre vendas líquidas dos últimos 30 dias
        const flexDinamico = await calcularFlexDinamico(vendedorId).catch(() => null);

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
                flexMensal: flexDinamico?.orcamento ?? Number(meta.flexMensal)
            },
            realizado: {
                totalVendidoMes,
                totalVendidoSemana,
                flexUtilizadoMes: flexDinamico ? Math.abs(flexDinamico.flexUsado) : flexUtilizadoMes,
                flexDisponivel: flexDinamico?.disponivel ?? null,
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
                    mediasPorDiaSemana,
                    totalClientes: clientesTotaisPorCidadeVend[mc.cidade] || 0,
                    clientesComPedidoSemana: clientesSemanaPorCidadeVend[mc.cidade]?.size || 0,
                    clientesComPedidoMes: clientesMesPorCidadeVend[mc.cidade]?.size || 0
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

        const [pedidosMes, clientesDoDia, clientesVisitamHoje] = await Promise.all([
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
                    End_Cidade: { not: null },
                    Ativo: true
                },
                select: { UUID: true, End_Cidade: true }
            }),
            prisma.cliente.findMany({
                where: {
                    idVendedor: { in: vendedorIds },
                    Ativo: true,
                    Dia_de_venda: { contains: diaHojeSigla },
                    End_Cidade: { not: null }
                },
                select: { idVendedor: true, End_Cidade: true }
            })
        ]);

        // Total de clientes ativos por cidade (todos, sem filtro de dia)
        const totalClientesPorCidade = {};
        for (const cl of clientesDoDia) {
            const cidade = cl.End_Cidade;
            if (!cidade) continue;
            totalClientesPorCidade[cidade] = (totalClientesPorCidade[cidade] || 0) + 1;
        }

        // Cidades que cada vendedor visita no dia selecionado (baseado em Dia_de_venda dos clientes)
        const cidadesHojePorVendedor = {};
        for (const cl of clientesVisitamHoje) {
            if (!cl.idVendedor || !cl.End_Cidade) continue;
            if (!cidadesHojePorVendedor[cl.idVendedor]) cidadesHojePorVendedor[cl.idVendedor] = new Set();
            cidadesHojePorVendedor[cl.idVendedor].add(cl.End_Cidade);
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

                // Mostra cidade se o vendedor tem clientes com Dia_de_venda = hoje nessa cidade
                const cidadesVendedorHoje = cidadesHojePorVendedor[meta.vendedorId] || new Set();
                if (!cidadesVendedorHoje.has(mc.cidade)) continue;

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

        // Filtra cidades pelo Dia_de_venda dos clientes — igual ao filtro da lista Rota
        const clientesVisitamHoje = await prisma.cliente.findMany({
            where: { idVendedor: vendedorId, Ativo: true, Dia_de_venda: { contains: diaHojeSigla } },
            select: { End_Cidade: true }
        });
        const cidadesComClientesHoje = new Set(clientesVisitamHoje.map(c => c.End_Cidade).filter(Boolean));

        const metasCidadesHoje = meta.metasCidades.filter(mc => cidadesComClientesHoje.has(mc.cidade));

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
                    Ativo: true,
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
