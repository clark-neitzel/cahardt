const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dayjs = require('dayjs');
const isBetween = require('dayjs/plugin/isBetween');
dayjs.extend(isBetween);

const metaService = {
    /**
     * Cria ou atualiza uma Meta Mensal para um Vendedor
     */
    salvarMetaMensal: async (dados, usuarioLogadoId) => {
        const { vendedorId, mesReferencia, diasTrabalho, valorMensal, flexMensal, metasProdutos, metasPromocoes } = dados;

        // 1. Validar e Upsert da Meta Mensal principal
        const metaSalva = await prisma.metaMensalVendedor.upsert({
            where: {
                vendedorId_mesReferencia: {
                    vendedorId,
                    mesReferencia // Ex: "2026-03"
                }
            },
            update: {
                diasTrabalho,
                valorMensal,
                flexMensal
            },
            create: {
                vendedorId,
                mesReferencia,
                diasTrabalho,
                valorMensal,
                flexMensal,
                criadoPor: usuarioLogadoId
            }
        });

        // 2. Atualizar Metas de Produtos (Deleta anteriores e recria)
        await prisma.metaProduto.deleteMany({
            where: { metaMensalVendedorId: metaSalva.id }
        });

        if (metasProdutos && metasProdutos.length > 0) {
            await prisma.metaProduto.createMany({
                data: metasProdutos.map(mp => ({
                    metaMensalVendedorId: metaSalva.id,
                    produtoId: mp.produtoId,
                    quantidade: mp.quantidade
                }))
            });
        }

        // 3. Atualizar Metas de Promoções (Deleta anteriores e recria)
        await prisma.metaPromocao.deleteMany({
            where: { metaMensalVendedorId: metaSalva.id }
        });

        if (metasPromocoes && metasPromocoes.length > 0) {
            await prisma.metaPromocao.createMany({
                data: metasPromocoes.map(mp => ({
                    metaMensalVendedorId: metaSalva.id,
                    promocaoId: mp.promocaoId,
                    quantidadePedidos: mp.quantidadePedidos
                }))
            });
        }

        return metaSalva;
    },

    /**
     * Busca as metas de um mês específico com filtros
     */
    listarMetasMensais: async (mesReferencia) => {
        return prisma.metaMensalVendedor.findMany({
            where: { mesReferencia },
            include: {
                vendedor: { select: { id: true, nome: true } },
                metasProdutos: { include: { produto: { select: { nome: true, codigo: true } } } },
                metasPromocoes: { include: { promocao: { select: { nome: true } } } }
            }
        });
    },

    /**
     * Motor de Cálculo de Projeções para o Dashboard do Vendedor
     * Calcula o progresso atual e faz projeções baseadas nos dias trabalhados no mês e semana.
     */
    calcularDashboardVendedor: async (vendedorId, dataAtualStr) => {
        const dataAtual = dataAtualStr ? dayjs(dataAtualStr) : dayjs();
        const mesReferencia = dataAtual.format('YYYY-MM'); // "2026-03"

        // 1. Busca a meta do mês atual para o vendedor
        const meta = await prisma.metaMensalVendedor.findUnique({
            where: {
                vendedorId_mesReferencia: { vendedorId, mesReferencia }
            },
            include: {
                metasProdutos: { include: { produto: { select: { nome: true } } } },
                metasPromocoes: { include: { promocao: { select: { nome: true } } } }
            }
        });

        if (!meta) {
            return { temMeta: false, mensagem: "Nenhuma meta definida para este mês." };
        }

        // 2. Extrai e processa os dias de trabalho configurados
        let diasTrabalhoMes = [];
        try {
            diasTrabalhoMes = typeof meta.diasTrabalho === 'string' ? JSON.parse(meta.diasTrabalho) : meta.diasTrabalho;
        } catch (e) {
            console.warn("Erro ao parsear diasTrabalho", e);
        }

        // Ordenar cronologicamente
        diasTrabalhoMes.sort((a, b) => dayjs(a).diff(dayjs(b)));
        const totalDiasMes = diasTrabalhoMes.length;

        if (totalDiasMes === 0) {
            return { temMeta: false, mensagem: "Calendário de dias úteis não preenchido para este mês." };
        }

        // 3. Define os períodos lógicos (Semana atual, Dias passados)
        const inicioSemana = dataAtual.startOf('week'); // Domingo
        const fimSemana = dataAtual.endOf('week');      // Sábado

        // Filtra dias úteis que pertencem à semana atual
        const diasTrabalhoSemana = diasTrabalhoMes.filter(d => dayjs(d).isBetween(inicioSemana, fimSemana, 'day', '[]'));
        const totalDiasSemana = diasTrabalhoSemana.length;

        // Filtra dias úteis que já passaram (ou são hoje) no MÊS
        const diasTrabalhadosMesAteHoje = diasTrabalhoMes.filter(d => dayjs(d).isBefore(dataAtual, 'day') || dayjs(d).isSame(dataAtual, 'day'));
        const qtdDiasTrabalhadosMesAteHoje = diasTrabalhadosMesAteHoje.length;

        // Filtra dias úteis que já passaram (ou são hoje) na SEMANA
        const diasTrabalhadosSemanaAteHoje = diasTrabalhoSemana.filter(d => dayjs(d).isBefore(dataAtual, 'day') || dayjs(d).isSame(dataAtual, 'day'));
        const qtdDiasTrabalhadosSemanaAteHoje = diasTrabalhadosSemanaAteHoje.length;


        // 4. Rateio das Metas (Matemática Pura baseada no Calendário customizado)
        const valorMensalTarget = Number(meta.valorMensal);
        const metaDiariaCalculada = valorMensalTarget / totalDiasMes;
        const metaSemanalCalculada = metaDiariaCalculada * totalDiasSemana;


        // 5. Busca Realização (Pedidos feitos pelo vendedor no mês)
        // Buscamos pedidos com status que contam para meta (ex: não cancelados)
        const dataInicioMesDb = dayjs(mesReferencia + '-01').startOf('month').toDate();
        const dataFimMesDb = dayjs(mesReferencia + '-01').endOf('month').toDate();

        const pedidosMes = await prisma.pedido.findMany({
            where: {
                vendedorId: vendedorId,
                dataVenda: {
                    gte: dataInicioMesDb,
                    lte: dataFimMesDb
                },
                statusEnvio: { not: 'CANCELADO' } // Ajustar conforme regra de negócio
            },
            include: {
                itens: true // Necessário para checar produtos e promoções depois
            }
        });

        // Calcula Totais Realizados
        let totalVendidoMes = 0;
        let totalVendidoSemana = 0;
        let flexUtilizadoMes = 0;

        pedidosMes.forEach(p => {
            // Soma valor total dos itens (valor praticado * qtde) -> simplificação: flexTotal tem desconto, mas a Venda bruta é X
            const valorPedido = p.itens.reduce((acc, item) => acc + (Number(item.valor) * Number(item.quantidade)), 0);

            totalVendidoMes += valorPedido;
            flexUtilizadoMes += Number(p.flexTotal || 0);

            // Checar se o pedido é desta semana específica
            if (dayjs(p.dataVenda).isBetween(inicioSemana, fimSemana, 'day', '[]')) {
                totalVendidoSemana += valorPedido;
            }
        });

        // 6. Projeções Mágicas 🔮
        // Verifica se hoje é um dia útil configurado
        const hojeEhDiaTrabalho = diasTrabalhoMes.some(d => dayjs(d).isSame(dataAtual, 'day'));

        // Média Diária Atual de Vendas -> Se estamos no primeiro dia, usamos 1 como divisor mínimo
        const divisorDiasMes = Math.max(qtdDiasTrabalhadosMesAteHoje, 1);
        const mediaDiariaRealizadaMes = totalVendidoMes / divisorDiasMes;

        // Projeções = Realizado + (Média * Dias Restantes)
        const diasRestantesMes = totalDiasMes - qtdDiasTrabalhadosMesAteHoje;
        const projecaoMensal = totalVendidoMes + (mediaDiariaRealizadaMes * diasRestantesMes);

        const diasRestantesSemana = totalDiasSemana - qtdDiasTrabalhadosSemanaAteHoje;
        const projecaoSemanal = totalVendidoSemana + (mediaDiariaRealizadaMes * diasRestantesSemana);

        // 7. Preparar Payload Resumo
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
            projecoes: {
                mensal: projecaoMensal,
                semanal: projecaoSemanal
            },
            // Dados para os cards de produtos/promoções se existirem
            detalhesMetasEspeciais: {
                produtos: meta.metasProdutos,
                promocoes: meta.metasPromocoes
            }
        };
    }
};

module.exports = metaService;
