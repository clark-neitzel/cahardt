const pedidoService = require('../services/pedidoService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const contaAzulService = require('../services/contaAzulService');
const estoqueService = require('../services/estoqueService');

const pedidoController = {
    resumoPendencias: async (req, res) => {
        try {
            const filtros = {};
            if (req.query.dataVendaDe) filtros.dataVendaDe = req.query.dataVendaDe;
            if (req.query.dataVendaAte) filtros.dataVendaAte = req.query.dataVendaAte;

            if (req.user) {
                const permissoes = req.user.permissoes || {};
                const podeVerTodos = permissoes.admin || permissoes.pedidos?.clientes === 'todos';
                if (!podeVerTodos) filtros.vendedorId = req.user.id;
            }

            const resumo = await pedidoService.resumoPendencias(filtros);
            res.json(resumo);
        } catch (error) {
            console.error('Erro ao buscar resumo de pendências:', error);
            res.status(500).json({ error: 'Erro ao buscar resumo de pendências' });
        }
    },

    listar: async (req, res) => {
        try {
            const filtros = req.query;

            if (req.user) {
                const permissoes = req.user.permissoes || {};
                const permissaoPedidos = permissoes.pedidos || {};
                const podeVerTodos = permissoes.admin || permissaoPedidos.clientes === 'todos';
                
                // Se não puder ver todos, filtra os pedidos apenas do vendedor logado
                if (!podeVerTodos) {
                    filtros.vendedorId = req.user.id;
                }
            }

            const pedidos = await pedidoService.listar(filtros);
            res.json(pedidos);
        } catch (error) {
            console.error('Erro ao listar pedidos:', error);
            res.status(500).json({ error: 'Erro ao listar pedidos' });
        }
    },

    criar: async (req, res) => {
        try {
            const dadosPedido = req.body;
            if (req.user && req.user.id) {
                dadosPedido.usuarioLancamentoId = req.user.id;
            }

            // Validação de permissão para pedidos especiais
            if (dadosPedido.especial) {
                const permissoes = req.user?.permissoes || {};
                if (!permissoes.Pode_Criar_Especial && !permissoes.admin) {
                    return res.status(403).json({ error: 'Você não tem permissão para criar pedidos especiais.' });
                }
            }

            // Validação de permissão para pedidos bonificação
            if (dadosPedido.bonificacao) {
                const permissoes = req.user?.permissoes || {};
                if (!permissoes.Pode_Criar_Bonificacao && !permissoes.admin) {
                    return res.status(403).json({ error: 'Você não tem permissão para criar pedidos de bonificação.' });
                }
            }

            // Validação de horário e fim de semana para criação de pedidos
            {
                const permissoes = req.user?.permissoes || {};
                if (!permissoes.admin && dadosPedido.dataVenda) {
                    const agora = new Date();
                    const horaAtual = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false, hour: '2-digit', minute: '2-digit' });
                    const diaSemanaAtual = agora.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' });
                    const hojeStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

                    const dataEntrega = new Date(dadosPedido.dataVenda);
                    const dataEntregaStr = dataEntrega.toISOString().split('T')[0];
                    const diaSemanaEntrega = dataEntrega.getUTCDay(); // 0=dom, 6=sab

                    // Bloquear entrega no fim de semana sem permissão
                    if ((diaSemanaEntrega === 0 || diaSemanaEntrega === 6) && !permissoes.Pode_Entregar_Fim_Semana) {
                        return res.status(403).json({ error: 'Você não tem permissão para criar pedidos com entrega no sábado ou domingo.' });
                    }

                    // Regras de horário só se aplicam quando o pedido é criado em dia útil (seg-sex)
                    const criadoNoFimDeSemana = diaSemanaAtual === 'Sat' || diaSemanaAtual === 'Sun';
                    if (!criadoNoFimDeSemana) {
                        const amanha = new Date(agora.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                        amanha.setDate(amanha.getDate() + 1);
                        const amanhaStr = amanha.toLocaleDateString('en-CA');

                        if (dataEntregaStr === hojeStr) {
                            const limite = permissoes.horarioLimiteHoje || '12:00';
                            if (horaAtual >= limite) {
                                return res.status(403).json({ error: `Horário limite para pedidos com entrega hoje já passou (${limite}). Atual: ${horaAtual}.` });
                            }
                        } else if (dataEntregaStr === amanhaStr) {
                            const limite = permissoes.horarioLimiteAmanha || '18:00';
                            if (horaAtual >= limite) {
                                return res.status(403).json({ error: `Horário limite para pedidos com entrega amanhã já passou (${limite}). Atual: ${horaAtual}.` });
                            }
                        }
                    }
                }
            }

            const novoPedido = await pedidoService.criar(dadosPedido);

            // Enviar notificação WhatsApp via BotConversa (não bloqueia resposta)
            if (novoPedido.statusEnvio === 'ENVIAR') {
                const webhookService = require('../services/webhookService');
                webhookService.notificarPedido(novoPedido.id).catch(err =>
                    console.error('[Webhook] Erro async:', err.message)
                );
            }

            res.status(201).json(novoPedido);
        } catch (error) {
            console.error('Erro ao criar pedido:', error);
            res.status(400).json({ error: error.message });
        }
    },

    atualizar: async (req, res) => {
        try {
            const id = req.params.id;

            // 🔒 Bloqueio: pedidos recebidos pelo CA não podem ser editados aqui
            const pedidoAtual = await prisma.pedido.findUnique({
                where: { id },
                select: { statusEnvio: true, situacaoCA: true }
            });
            if (!pedidoAtual) return res.status(404).json({ error: 'Pedido não encontrado.' });

            const situacoesCABloqueadas = ['APROVADO', 'FATURADO', 'EM_ABERTO'];
            if (pedidoAtual.statusEnvio === 'RECEBIDO' || situacoesCABloqueadas.includes(pedidoAtual.situacaoCA)) {
                return res.status(403).json({
                    error: 'Este pedido já foi recebido pelo Conta Azul e não pode ser editado por aqui. Faça as alterações diretamente no ERP.'
                });
            }

            const dadosPedido = req.body;
            const pedidoAtualizado = await pedidoService.editar(id, dadosPedido);
            res.json(pedidoAtualizado);
        } catch (error) {
            console.error('Erro ao atualizar pedido:', error);
            res.status(400).json({ error: error.message });
        }
    },

    detalhar: async (req, res) => {
        try {
            const id = req.params.id;
            const pedido = await pedidoService.detalhar(id);
            if (!pedido) {
                return res.status(404).json({ error: 'Pedido não encontrado' });
            }
            res.json(pedido);
        } catch (error) {
            console.error('Erro ao detalhar pedido:', error);
            res.status(500).json({ error: 'Erro ao detalhar pedido' });
        }
    },

    enviarWhatsapp: async (req, res) => {
        try {
            const webhookService = require('../services/webhookService');
            const result = await webhookService.notificarPedido(req.params.id, { forceManual: true });
            if (result.ok) {
                res.json({ ok: true });
            } else {
                res.status(400).json({ ok: false, motivo: result.motivo });
            }
        } catch (error) {
            console.error('Erro ao enviar WhatsApp:', error);
            res.status(500).json({ ok: false, motivo: error.message });
        }
    },

    marcarRevisado: async (req, res) => {
        try {
            const id = req.params.id;
            const pedidoAtualizado = await pedidoService.editar(id, { revisaoPendente: false });
            res.json({ message: 'Revisão concluída', revisaoPendente: pedidoAtualizado.revisaoPendente });
        } catch (error) {
            console.error('Erro ao marcar pedido como revisado:', error);
            res.status(500).json({ error: 'Erro ao marcar revisão' });
        }
    },

    obterUltimoPreco: async (req, res) => {
        try {
            const { clienteId, produtoId } = req.query;
            if (!clienteId || !produtoId) {
                return res.status(400).json({ error: 'clienteId e produtoId são obrigatórios' });
            }

            const ultimoPreco = await pedidoService.obterUltimoPreco(clienteId, produtoId);
            res.json(ultimoPreco || { msg: 'Nenhum histórico encontrado' });
        } catch (error) {
            console.error('Erro ao buscar último preço:', error);
            res.status(500).json({ error: 'Erro buscar histórico de preço' });
        }
    },

    historicoComprasCliente: async (req, res) => {
        try {
            const { clienteId } = req.query;
            if (!clienteId) {
                return res.status(400).json({ error: 'clienteId é obrigatório' });
            }
            const historico = await pedidoService.historicoComprasCliente(clienteId);
            res.json(historico);
        } catch (error) {
            console.error('Erro ao buscar histórico de compras:', error);
            res.status(500).json({ error: 'Erro ao buscar histórico de compras' });
        }
    },

    aprovarEspecial: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            if (!permissoes.Pode_Aprovar_Especial && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para aprovar pedidos especiais.' });
            }

            const pedido = await prisma.pedido.findUnique({
                where: { id },
                include: { itens: true, contaReceber: true }
            });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (!pedido.especial) return res.status(400).json({ error: 'Este pedido não é especial.' });
            if (pedido.statusEnvio === 'RECEBIDO') return res.status(400).json({ error: 'Este pedido já foi aprovado.' });

            const pedidoAprovado = await prisma.$transaction(async (tx) => {
                const updated = await tx.pedido.update({
                    where: { id },
                    data: {
                        statusEnvio: 'RECEBIDO',
                        situacaoCA: 'FATURADO',
                        enviadoEm: new Date()
                    }
                });

                // Criar ContaReceber local se ainda não existe
                if (!pedido.contaReceber) {
                    const valorTotal = pedido.itens.reduce((s, i) => s + (i.valor * i.quantidade), 0);
                    const { gerarParcelasData } = require('../services/pedidoCalculos');
                    const parcelasData = gerarParcelasData({
                        valorTotal,
                        qtdParcelas: pedido.qtdParcelas,
                        intervaloDias: pedido.intervaloDias,
                        primeiroVencimento: pedido.primeiroVencimento,
                        dataVenda: pedido.dataVenda
                    });

                    await tx.contaReceber.create({
                        data: {
                            pedidoId: id,
                            clienteId: pedido.clienteId,
                            origem: 'ESPECIAL',
                            valorTotal: Math.round(valorTotal * 100) / 100,
                            status: 'ABERTO',
                            parcelas: { create: parcelasData }
                        }
                    });
                }

                return updated;
            });

            res.json({ message: 'Pedido especial aprovado com sucesso.', pedido: pedidoAprovado });
        } catch (error) {
            console.error('Erro ao aprovar pedido especial:', error);
            res.status(500).json({ error: 'Erro ao aprovar pedido especial.' });
        }
    },

    reverterEspecial: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            if (!permissoes.Pode_Reverter_Especial && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para reverter pedidos especiais.' });
            }

            const pedido = await prisma.pedido.findUnique({
                where: { id },
                select: { especial: true, statusEnvio: true, situacaoCA: true },
            });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (!pedido.especial) return res.status(400).json({ error: 'Este pedido não é especial.' });
            if (pedido.statusEnvio !== 'RECEBIDO') return res.status(400).json({ error: 'Pedido não está aprovado/faturado.' });

            // Verificar se tem conta a receber QUITADA
            const conta = await prisma.contaReceber.findFirst({
                where: { pedidoId: id }
            });
            if (conta && conta.status === 'QUITADO') {
                return res.status(400).json({ error: 'Não é possível reverter: conta já está quitada. Estorne a quitação primeiro.' });
            }

            // Reverter pedido para ABERTO
            const pedidoRevertido = await prisma.pedido.update({
                where: { id },
                data: {
                    statusEnvio: 'ABERTO',
                    situacaoCA: null,
                    enviadoEm: null
                }
            });

            // Se tinha conta a receber, cancelar parcelas pendentes e atualizar status
            if (conta) {
                await prisma.$transaction([
                    prisma.parcela.updateMany({
                        where: { contaReceberId: conta.id, status: { not: 'PAGO' } },
                        data: { status: 'CANCELADO' }
                    }),
                    prisma.contaReceber.update({
                        where: { id: conta.id },
                        data: { status: 'CANCELADO' }
                    })
                ]);
            }

            // Registrar auditoria
            await prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_ESPECIAL',
                    entidade: 'Pedido',
                    entidadeId: id,
                    detalhes: `Pedido especial revertido para ABERTO por ${req.user.nome || req.user.login}`,
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || req.user.login || '-'
                }
            });

            res.json({ message: 'Pedido revertido para ABERTO com sucesso.', pedido: pedidoRevertido });
        } catch (error) {
            console.error('Erro ao reverter pedido especial:', error);
            res.status(500).json({ error: 'Erro ao reverter pedido especial.' });
        }
    },

    aprovarBonificacao: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            if (!permissoes.Pode_Aprovar_Bonificacao && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para aprovar pedidos de bonificação.' });
            }

            const pedido = await prisma.pedido.findUnique({ where: { id }, select: { bonificacao: true, statusEnvio: true } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (!pedido.bonificacao) return res.status(400).json({ error: 'Este pedido não é uma bonificação.' });
            if (pedido.statusEnvio === 'RECEBIDO') return res.status(400).json({ error: 'Este pedido já foi aprovado.' });

            const pedidoAprovado = await prisma.pedido.update({
                where: { id },
                data: {
                    statusEnvio: 'RECEBIDO',
                    situacaoCA: 'FATURADO',
                    enviadoEm: new Date()
                }
            });

            res.json({ message: 'Bonificação aprovada com sucesso.', pedido: pedidoAprovado });
        } catch (error) {
            console.error('Erro ao aprovar bonificação:', error);
            res.status(500).json({ error: 'Erro ao aprovar bonificação.' });
        }
    },

    reverterBonificacao: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            if (!permissoes.Pode_Reverter_Bonificacao && !permissoes.admin) {
                return res.status(403).json({ error: 'Você não tem permissão para reverter bonificações.' });
            }

            const pedido = await prisma.pedido.findUnique({
                where: { id },
                select: { bonificacao: true, statusEnvio: true, embarqueId: true },
            });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (!pedido.bonificacao) return res.status(400).json({ error: 'Este pedido não é uma bonificação.' });
            if (pedido.statusEnvio !== 'RECEBIDO') return res.status(400).json({ error: 'Bonificação não está aprovada/faturada.' });

            const pedidoRevertido = await prisma.pedido.update({
                where: { id },
                data: {
                    statusEnvio: 'ABERTO',
                    situacaoCA: null,
                    enviadoEm: null
                }
            });

            await prisma.auditLog.create({
                data: {
                    acao: 'REVERTER_BONIFICACAO',
                    entidade: 'Pedido',
                    entidadeId: id,
                    detalhes: `Bonificação revertida para ABERTO por ${req.user.nome || req.user.login}`,
                    usuarioId: req.user.id,
                    usuarioNome: req.user.nome || req.user.login || '-'
                }
            });

            res.json({ message: 'Bonificação revertida para ABERTO com sucesso.', pedido: pedidoRevertido });
        } catch (error) {
            console.error('Erro ao reverter bonificação:', error);
            res.status(500).json({ error: 'Erro ao reverter bonificação.' });
        }
    },

    relatorio: async (req, res) => {
        try {
            const { dataVendaDe, dataVendaAte, dataCriacaoDe, dataCriacaoAte, vendedorId, clienteId, statusEnvio, especial, situacaoCA, statusEntrega } = req.query;

            // Permissão: só admin ou quem pode ver todos os pedidos
            const permissoes = req.user?.permissoes || {};
            const podeVerTodos = permissoes.admin || permissoes.pedidos?.clientes === 'todos';

            const where = {};

            // Se não pode ver todos, restringe ao próprio vendedor
            if (!podeVerTodos) {
                where.vendedorId = req.user.id;
            } else if (vendedorId) {
                where.vendedorId = vendedorId;
            }

            if (clienteId) where.clienteId = clienteId;
            if (statusEnvio) where.statusEnvio = statusEnvio;
            if (situacaoCA) where.situacaoCA = situacaoCA;
            if (statusEntrega) where.statusEntrega = statusEntrega;

            if (especial === 'true') where.especial = true;
            else if (especial === 'false') where.especial = false;

            // Filtro de data de criação
            if (dataCriacaoDe || dataCriacaoAte) {
                where.createdAt = {};
                if (dataCriacaoDe) where.createdAt.gte = new Date(dataCriacaoDe + 'T00:00:00.000Z');
                if (dataCriacaoAte) where.createdAt.lte = new Date(dataCriacaoAte + 'T23:59:59.999Z');
            }

            // Filtro de data de venda/entrega
            if (dataVendaDe || dataVendaAte) {
                where.dataVenda = {};
                if (dataVendaDe) where.dataVenda.gte = new Date(dataVendaDe + 'T00:00:00.000Z');
                if (dataVendaAte) where.dataVenda.lte = new Date(dataVendaAte + 'T23:59:59.999Z');
            }

            // Excluir excluídos por padrão
            if (!statusEnvio) {
                where.statusEnvio = { not: 'EXCLUIDO' };
            }

            const pedidos = await prisma.pedido.findMany({
                where,
                include: {
                    cliente: { select: { Nome: true, NomeFantasia: true, Documento: true } },
                    vendedor: { select: { nome: true } },
                    itens: {
                        include: { produto: { select: { nome: true, codigo: true, categoria: true } } }
                    },
                    contaReceber: { select: { status: true, valorTotal: true } }
                },
                orderBy: { dataVenda: 'desc' }
            });

            // Calcular totais
            const totalPedidos = pedidos.length;
            let valorTotalGeral = 0;
            let totalItens = 0;

            const pedidosFormatados = pedidos.map(p => {
                const valorTotal = p.itens.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
                const qtdItens = p.itens.reduce((sum, item) => sum + Number(item.quantidade || 0), 0);
                valorTotalGeral += valorTotal;
                totalItens += qtdItens;

                return {
                    id: p.id,
                    numero: p.numero,
                    createdAt: p.createdAt,
                    dataVenda: p.dataVenda,
                    clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || '-',
                    clienteDocumento: p.cliente?.Documento || '-',
                    vendedorNome: p.vendedor?.nome || '-',
                    especial: p.especial,
                    statusEnvio: p.statusEnvio,
                    situacaoCA: p.situacaoCA,
                    statusEntrega: p.statusEntrega,
                    condicaoPagamento: p.nomeCondicaoPagamento || '-',
                    valorTotal,
                    qtdItens,
                    flexTotal: Number(p.flexTotal || 0),
                    contaReceberStatus: p.contaReceber?.status || null,
                    canalOrigem: p.canalOrigem || '-',
                    observacoes: p.observacoes || ''
                };
            });

            res.json({
                pedidos: pedidosFormatados,
                resumo: {
                    totalPedidos,
                    valorTotalGeral,
                    totalItens,
                    ticketMedio: totalPedidos > 0 ? valorTotalGeral / totalPedidos : 0
                }
            });
        } catch (error) {
            console.error('Erro ao gerar relatório:', error);
            res.status(500).json({ error: 'Erro ao gerar relatório' });
        }
    },

    excluir: async (req, res) => {
        try {
            const id = req.params.id;
            const permissoes = req.user?.permissoes || {};

            // Buscar pedido para verificar se é especial
            const pedido = await pedidoService.detalhar(id);
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

            // Verificar permissão específica
            if (pedido.especial) {
                if (!permissoes.Pode_Excluir_Especial && !permissoes.admin) {
                    return res.status(403).json({ error: 'Você não tem permissão para excluir pedidos especiais.' });
                }
            } else {
                if (!permissoes.Pode_Excluir_Pedido && !permissoes.admin) {
                    return res.status(403).json({ error: 'Você não tem permissão para excluir pedidos.' });
                }
            }

            const deletado = await pedidoService.excluir(id);
            res.json({ message: 'Pedido excluído com sucesso', id: deletado.id });
        } catch (error) {
            console.error('Erro ao excluir pedido:', error);
            res.status(400).json({ error: error.message });
        }
    },

    reatribuirVendedor: async (req, res) => {
        try {
            const id = req.params.id;
            const { vendedorId } = req.body;

            const permissoes = req.user?.permissoes || {};
            if (!permissoes.admin && !permissoes.Pode_Reatribuir_Vendedor) {
                return res.status(403).json({ error: 'Você não tem permissão para reatribuir vendedor de pedidos.' });
            }

            if (!vendedorId || typeof vendedorId !== 'string') {
                return res.status(400).json({ error: 'vendedorId é obrigatório.' });
            }

            const pedido = await prisma.pedido.findUnique({ where: { id }, select: { id: true, vendedorId: true } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

            const novoVendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId }, select: { id: true, nome: true } });
            if (!novoVendedor) return res.status(400).json({ error: 'Vendedor destino inválido.' });

            const atualizado = await prisma.pedido.update({
                where: { id },
                data: { vendedorId },
                include: { vendedor: { select: { id: true, nome: true } } }
            });

            console.log(`[Pedido ${id}] Vendedor reatribuído de ${pedido.vendedorId || 'NULL'} → ${vendedorId} por ${req.user?.id} (${req.user?.nome || ''})`);

            res.json({ message: 'Vendedor reatribuído com sucesso.', pedido: atualizado });
        } catch (error) {
            console.error('Erro ao reatribuir vendedor:', error);
            res.status(500).json({ error: 'Erro ao reatribuir vendedor.' });
        }
    },

    consultarCA: async (req, res) => {
        try {
            const id = req.params.id;
            const pedido = await prisma.pedido.findUnique({ where: { id } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
            if (!pedido.idVendaContaAzul) {
                return res.status(400).json({ error: 'Pedido ainda não foi enviado ao CA (sem ID de venda).' });
            }

            const token = await contaAzulService.getAccessToken();
            const url = `https://api-v2.contaazul.com/v1/venda/${pedido.idVendaContaAzul}`;
            const resCA = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
            const vendaObj = resCA.data?.venda || resCA.data;
            const situacaoRaw = vendaObj?.situacao;
            let situacaoNome = (typeof situacaoRaw === 'object' ? situacaoRaw?.nome : situacaoRaw) || vendaObj?.status || null;
            const temParcelas = Array.isArray(vendaObj?.parcelas) && vendaObj.parcelas.length > 0;
            if (situacaoNome === 'APROVADO' && temParcelas) situacaoNome = 'FATURADO';
            // CA sinaliza exclusão via venda.status (top-level) = "CANCELADO", mesmo que venda.situacao.nome continue "APROVADO"
            if (vendaObj?.status === 'CANCELADO') situacaoNome = 'CANCELADO';

            const data = { contaAzulUpdatedAt: new Date() };
            let statusEnvioFinal = pedido.statusEnvio;
            if (!situacaoNome || situacaoNome === 'CANCELADO') {
                data.statusEnvio = 'EXCLUIDO';
                data.situacaoCA = situacaoNome || 'EXCLUIDO';
                data.revisaoPendente = true;
                data.embarqueId = null;
                data.statusEntrega = 'PENDENTE';
                data.dataEntrega = null;
                statusEnvioFinal = 'EXCLUIDO';
            } else if (situacaoNome !== pedido.situacaoCA) {
                data.situacaoCA = situacaoNome;
            }

            const atualizado = await prisma.pedido.update({ where: { id }, data });

            if (situacaoNome === 'FATURADO' && pedido.situacaoCA !== 'FATURADO') {
                try { await estoqueService.faturarPedido(id); } catch (e) {
                    console.error(`[consultarCA] Erro ao faturar estoque pedido ${id}:`, e.message);
                }
            }
            if (statusEnvioFinal === 'EXCLUIDO' && pedido.statusEnvio === 'RECEBIDO') {
                try { await estoqueService.cancelarPedido(id); } catch (e) {
                    console.error(`[consultarCA] Erro ao estornar estoque pedido ${id}:`, e.message);
                }
            }

            res.json({
                message: `Situação atualizada: ${situacaoNome || 'EXCLUIDO'}`,
                situacaoCA: atualizado.situacaoCA,
                statusEnvio: atualizado.statusEnvio,
            });
        } catch (error) {
            const status = error.response?.status;
            // 404 = excluído definitivamente | 400 = ID V1 legado rejeitado pelo CA (tratamos como excluído, igual garbage collector)
            if (status === 404 || status === 400) {
                try {
                    const pedidoAtual = await prisma.pedido.findUnique({
                        where: { id: req.params.id },
                        select: { statusEnvio: true, embarqueId: true }
                    });
                    await prisma.pedido.update({
                        where: { id: req.params.id },
                        data: {
                            statusEnvio: 'EXCLUIDO',
                            situacaoCA: 'EXCLUIDO',
                            revisaoPendente: true,
                            embarqueId: null,
                            statusEntrega: 'PENDENTE',
                            dataEntrega: null,
                            contaAzulUpdatedAt: new Date()
                        }
                    });
                    if (pedidoAtual?.statusEnvio === 'RECEBIDO') {
                        try { await estoqueService.cancelarPedido(req.params.id); } catch (e) {
                            console.error(`[consultarCA ${status}] Erro estorno:`, e.message);
                        }
                    }
                } catch (_) { }
                return res.json({ message: 'Pedido não existe mais no CA — marcado como EXCLUIDO.', situacaoCA: 'EXCLUIDO', statusEnvio: 'EXCLUIDO' });
            }
            console.error('Erro ao consultar CA:', error.message);
            res.status(500).json({ error: error.message || 'Erro ao consultar CA' });
        }
    },

    registrarImpressao: async (req, res) => {
        try {
            const id = req.params.id;
            const pedido = await prisma.pedido.update({
                where: { id },
                data: { impressoEm: new Date() }
            });
            res.json({ message: 'Impressão registrada com sucesso', impressoEm: pedido.impressoEm });
        } catch (error) {
            console.error('Erro ao registrar impressão:', error);
            res.status(500).json({ error: 'Erro ao registrar impressão' });
        }
    }
};

module.exports = pedidoController;
