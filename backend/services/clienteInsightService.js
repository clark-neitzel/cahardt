const prisma = require('../config/database');
const moment = require('moment'); // Assumindo moment.js para dadas, ou date-fns (vou adaptar se houver outro)
const orientacaoService = require('./orientacaoService');

// 5. Centralizar critérios de pedido válido
const STATUS_PEDIDO_VALIDO = ['ENVIAR', 'RECEBIDO'];

const clienteInsightService = {
    // Utilitário para exportar a constante se necessário
    STATUS_PEDIDO_VALIDO,

    async recalcularCliente(clienteId) {
        try {
            // console.log(`[InsightService] Recalculando insights para cliente ${clienteId}...`);

            const hoje = moment();

            // 1. Buscar Cliente e Preferências de Referência
            const cliente = await prisma.cliente.findUnique({
                where: { UUID: clienteId },
                include: { categoriaCliente: true }
            });

            if (!cliente) return null;

            // 2.2 Ciclo de referência
            let cicloReferenciaDias = 7;
            let origemCiclo = 'PADRAO';

            if (cliente.cicloCompraPersonalizadoDias) {
                cicloReferenciaDias = cliente.cicloCompraPersonalizadoDias;
                origemCiclo = 'PERSONALIZADO';
            } else if (cliente.categoriaCliente && cliente.categoriaCliente.cicloPadraoDias) {
                cicloReferenciaDias = cliente.categoriaCliente.cicloPadraoDias;
                origemCiclo = 'CATEGORIA';
            }

            // 1. Busca Histórico Válido de Pedidos
            const pedidosValidos = await prisma.pedido.findMany({
                where: {
                    clienteId: clienteId,
                    statusEnvio: { in: STATUS_PEDIDO_VALIDO }
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    itens: true
                }
            });

            // Status Recompra Base
            let diasSemComprar = null;
            let dataUltimoPedido = null;
            let statusRecompra = 'SEM_HISTORICO';
            let qtdPedidosUltimos30d = 0;

            if (pedidosValidos.length > 0) {
                const ultimo = pedidosValidos[0];
                dataUltimoPedido = ultimo.createdAt;
                diasSemComprar = hoje.diff(moment(ultimo.createdAt), 'days');

                // Filtro 30 dias
                const trintaDiasAtras = hoje.clone().subtract(30, 'days');
                qtdPedidosUltimos30d = pedidosValidos.filter(p => moment(p.createdAt).isAfter(trintaDiasAtras)).length;

                // 2.3 Status recompra
                if (diasSemComprar <= cicloReferenciaDias) {
                    statusRecompra = 'NO_PRAZO';
                } else if (diasSemComprar <= cicloReferenciaDias + 2) {
                    statusRecompra = 'ATENCAO';
                } else if (diasSemComprar <= cicloReferenciaDias + 5) {
                    statusRecompra = 'ATRASADO';
                } else {
                    statusRecompra = 'CRITICO';
                }
            }

            // 2.4 Janela Histórica
            // Recente = 2 mais recentes (índice 0 e 1)
            // Base = 3º ao 6º mais recente (índice 2 a 5)
            const pedidosRecentes = pedidosValidos.slice(0, 2);
            const pedidosBase = pedidosValidos.slice(2, 6);

            let ticketMedioBase = null, ticketMedioRecente = null, variacaoTicketPct = null;
            let itensMediosBase = null, itensMediosRecentes = null, variacaoItensPct = null;

            if (pedidosBase.length > 0 && pedidosRecentes.length > 0) {
                // Cálculo de Ticket
                const somaTotalRecente = pedidosRecentes.reduce((acc, p) => acc + (Number(p.flexTotal) || 0) + p.itens.reduce((sum, item) => sum + (Number(item.quantidade) * Number(item.valor)), 0), 0);
                const somaTotalBase = pedidosBase.reduce((acc, p) => acc + (Number(p.flexTotal) || 0) + p.itens.reduce((sum, item) => sum + (Number(item.quantidade) * Number(item.valor)), 0), 0);

                ticketMedioRecente = somaTotalRecente / pedidosRecentes.length;
                ticketMedioBase = somaTotalBase / pedidosBase.length;

                if (ticketMedioBase > 0) {
                    variacaoTicketPct = ((ticketMedioRecente - ticketMedioBase) / ticketMedioBase) * 100;
                }

                // Cálculo de Itens Distintos (SKUs)
                const somaItensRecente = pedidosRecentes.reduce((acc, p) => acc + p.itens.length, 0);
                const somaItensBase = pedidosBase.reduce((acc, p) => acc + p.itens.length, 0);

                itensMediosRecentes = somaItensRecente / pedidosRecentes.length;
                itensMediosBase = somaItensBase / pedidosBase.length;

                if (itensMediosBase > 0) {
                    variacaoItensPct = ((itensMediosRecentes - itensMediosBase) / itensMediosBase) * 100;
                }
            } else if (pedidosRecentes.length > 0) {
                // Sem base, mas tem recente
                const somaTotalRecente = pedidosRecentes.reduce((acc, p) => acc + (Number(p.flexTotal) || 0) + p.itens.reduce((sum, item) => sum + (Number(item.quantidade) * Number(item.valor)), 0), 0);
                ticketMedioRecente = somaTotalRecente / pedidosRecentes.length;
                const somaItensRecente = pedidosRecentes.reduce((acc, p) => acc + p.itens.length, 0);
                itensMediosRecentes = somaItensRecente / pedidosRecentes.length;
            }

            // 2.7 Produto Ausente
            // Produto que apareceu >= 2 vezes na base, e 0 vezes nos recentes
            let produtoAusenteId = null;
            let produtoAusenteFrequencia = 0;
            let produtoAusenteDesdePedidos = 0; // Quantos pedidos pularam sem comprar ele

            if (pedidosBase.length > 0 && pedidosRecentes.length > 0) {
                const frequenciaBase = {};
                for (const pb of pedidosBase) {
                    for (const item of pb.itens) {
                        frequenciaBase[item.produtoId] = (frequenciaBase[item.produtoId] || 0) + 1;
                    }
                }

                const produtosRecentesIds = new Set();
                for (const pr of pedidosRecentes) {
                    for (const item of pr.itens) {
                        produtosRecentesIds.add(item.produtoId);
                    }
                }

                let maxFrequencia = 1; // tem que ser >= 2
                for (const [prodId, freq] of Object.entries(frequenciaBase)) {
                    if (freq >= 2 && !produtosRecentesIds.has(prodId)) {
                        if (freq > maxFrequencia) {
                            maxFrequencia = freq;
                            produtoAusenteId = prodId;
                            produtoAusenteFrequencia = freq;
                            produtoAusenteDesdePedidos = pedidosRecentes.length;
                        }
                    }
                }
            }

            // 2.8 Categoria em Queda
            // Simplificado para essa etapa: apenas flag se existir queda drástica (analisaremos melhor na Etapa 3 ou se houver join pre-fetch)
            // TODO: Se base e recente tiverem categorias, calcular a variação
            let categoriaEmQuedaId = null;
            let categoriaQuedaPct = null;

            // 2.9 Devolução Recente (Últimos 30 dias)
            const trintaDiasAtras = hoje.clone().subtract(30, 'days').toDate();

            // Buscar todas as devoluções nos últimos 30 dias no pedido ou itens
            const devolucoesRecentes = await prisma.pedido.findMany({
                where: {
                    clienteId: clienteId,
                    statusEntrega: 'DEVOLVIDO',
                    dataEntrega: { gte: trintaDiasAtras }
                },
                orderBy: { dataEntrega: 'desc' }
            });

            // E buscar itens devolvidos parciais
            const itensDevolvidos = await prisma.entregaItemDevolvido.findMany({
                where: {
                    pedido: { clienteId: clienteId },
                    createdAt: { gte: trintaDiasAtras }
                },
                orderBy: { createdAt: 'desc' }
            });

            let teveDevolucaoRecente = devolucoesRecentes.length > 0 || itensDevolvidos.length > 0;
            let dataUltimaDevolucao = null;
            let motivoUltimaDevolucao = null;

            if (devolucoesRecentes.length > 0 && itensDevolvidos.length > 0) {
                const devData = moment(devolucoesRecentes[0].dataEntrega);
                const itemData = moment(itensDevolvidos[0].createdAt);
                if (devData.isAfter(itemData)) {
                    dataUltimaDevolucao = devolucoesRecentes[0].dataEntrega;
                    motivoUltimaDevolucao = devolucoesRecentes[0].motivoDevolucao || 'Devolução total s/ motivo detalhado';
                } else {
                    dataUltimaDevolucao = itensDevolvidos[0].createdAt;
                    motivoUltimaDevolucao = `Item parcial devolvido`;
                }
            } else if (devolucoesRecentes.length > 0) {
                dataUltimaDevolucao = devolucoesRecentes[0].dataEntrega;
                motivoUltimaDevolucao = devolucoesRecentes[0].motivoDevolucao || 'Devolução total s/ motivo detalhado';
            } else if (itensDevolvidos.length > 0) {
                dataUltimaDevolucao = itensDevolvidos[0].createdAt;
                motivoUltimaDevolucao = `Item parcial devolvido`;
            }

            // 2.10 Atendimentos sem Pedido
            // - contar atendimentos dos últimos 30 dias sem pedido no mesmo dia
            // - FINANCEIRO excluído: não é interação comercial
            const atendimentos30d = await prisma.atendimento.findMany({
                where: {
                    clienteId: clienteId,
                    criadoEm: { gte: trintaDiasAtras },
                    tipo: { notIn: ['FINANCEIRO'] }
                },
                orderBy: { criadoEm: 'desc' }
            });

            let qtdAtendimentosSemPedido30d = 0;
            let dataUltimoAtendimento = atendimentos30d.length > 0 ? atendimentos30d[0].criadoEm : null;
            let canalUltimoAtendimento = atendimentos30d.length > 0 ? atendimentos30d[0].tipo : null;

            // Mapeia dias de pedidos válidos
            const diasComPedido = new Set(pedidosValidos.map(p => moment(p.createdAt).format('YYYY-MM-DD')));

            for (const atd of atendimentos30d) {
                const diaAtd = moment(atd.criadoEm).format('YYYY-MM-DD');
                if (!diasComPedido.has(diaAtd) && !atd.pedidoId) {
                    qtdAtendimentosSemPedido30d++;
                }
            }

            // Cálculo dos Scores (Base simples para evoluirmos na Etapa 3)
            let scoreRisco = 0;
            let scoreOportunidade = 0;

            if (statusRecompra === 'ATRASADO') scoreRisco += 30;
            if (statusRecompra === 'CRITICO') scoreRisco += 60;
            if (teveDevolucaoRecente) scoreRisco += 20;
            if (variacaoTicketPct !== null && variacaoTicketPct < -20) scoreRisco += 10;
            if (qtdAtendimentosSemPedido30d >= 2) scoreRisco += 10;

            if (statusRecompra === 'NO_PRAZO') scoreOportunidade += 20;
            if (produtoAusenteId) scoreOportunidade += 30; // Upsell / Recuperação
            if (variacaoTicketPct !== null && variacaoTicketPct > 10) scoreOportunidade += 20;

            const finalScoreRisco = Math.min(100, scoreRisco);
            const finalScoreOportunidade = Math.min(100, scoreOportunidade);

            // Monta objeto parcial para classificar o cenário antes de salvar
            const insightParcial = {
                statusRecompra,
                variacaoTicketPct,
                qtdAtendimentosSemPedido30d,
                teveDevolucaoRecente,
                ticketMedioBase,
                diasSemComprar,
                cicloReferenciaDias,
            };
            const { insightPrincipalTipo, insightPrincipalResumo, proximaAcaoSugerida } =
                orientacaoService.gerarOrientacao(insightParcial);

            const insight = {
                dataUltimoPedido,
                diasSemComprar,
                cicloReferenciaDias,
                origemCiclo,
                statusRecompra,
                qtdPedidosUltimos30d,
                ticketMedioBase,
                ticketMedioRecente,
                variacaoTicketPct,
                itensMediosBase,
                itensMediosRecentes,
                variacaoItensPct,
                produtoAusenteId,
                produtoAusenteFrequencia,
                produtoAusenteDesdePedidos,
                categoriaEmQuedaId,
                categoriaQuedaPct,
                teveDevolucaoRecente,
                dataUltimaDevolucao,
                motivoUltimaDevolucao,
                qtdAtendimentosSemPedido30d,
                dataUltimoAtendimento,
                canalUltimoAtendimento,
                scoreRisco: finalScoreRisco,
                scoreOportunidade: finalScoreOportunidade,
                insightPrincipalTipo,
                insightPrincipalResumo,
                proximaAcaoSugerida,
                recalculadoEm: moment().toDate()
            };

            // Salva ou Atualiza
            await prisma.clienteInsight.upsert({
                where: { clienteId },
                update: insight,
                create: { clienteId, ...insight }
            });

            return insight;

        } catch (error) {
            console.error(`❌ [InsightService] Erro ao recalcular cliente ${clienteId}:`, error);
            // Não estouramos o erro para não quebrar fluxos em background
            return null;
        }
    },

    async obterInsightCliente(clienteId) {
        return prisma.clienteInsight.findUnique({
            where: { clienteId }
        });
    },

    async recalcularTodosClientes() {
        console.log('🔄 [InsightService] Iniciando recálculo massivo de insights...');
        try {
            const clientesAtivos = await prisma.cliente.findMany({
                where: { insightAtivo: true }, // regra 5
                select: { UUID: true }
            });

            console.log(`[InsightService] Encontrados ${clientesAtivos.length} clientes para recálculo.`);

            let sucesso = 0;
            for (const cl of clientesAtivos) {
                const res = await this.recalcularCliente(cl.UUID);
                if (res) sucesso++;
            }

            console.log(`✅ [InsightService] Recálculo concluído. ${sucesso}/${clientesAtivos.length} processados.`);
        } catch (error) {
            console.error('❌ [InsightService] Erro no recálculo em lote:', error);
        }
    }
};

module.exports = clienteInsightService;
