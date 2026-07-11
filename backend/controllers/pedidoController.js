const pedidoService = require('../services/pedidoService');
const prisma = require('../config/database'); // singleton compartilhado (pool único)
const axios = require('axios');
const contaAzulService = require('../services/contaAzulService');
const estoqueService = require('../services/estoqueService');
const pcpReceitaService = require('../services/pcpReceitaService');

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

            // Situação Asaas por pedido (check ✓ nos botões de boleto/PIX da lista)
            try {
                const lista = Array.isArray(pedidos) ? pedidos : (pedidos?.items || pedidos?.pedidos || []);
                const ids = lista.map(p => p.id).filter(Boolean);
                if (ids.length > 0) {
                    const cobrancas = await prisma.cobrancaAsaas.findMany({
                        where: { pedidoId: { in: ids }, status: { in: ['PENDENTE', 'RECEBIDO'] } },
                        select: { pedidoId: true, tipo: true, status: true },
                        orderBy: { createdAt: 'asc' }
                    });
                    const mapa = {};
                    for (const c of cobrancas) {
                        const m = mapa[c.pedidoId] || (mapa[c.pedidoId] = {});
                        const chave = c.tipo === 'BOLETO' ? 'asaasBoleto' : 'asaasPix';
                        // RECEBIDO tem prioridade sobre PENDENTE
                        if (m[chave] !== 'RECEBIDO') m[chave] = c.status;
                    }
                    // caBoletoStatus já vem do pedido (cache) — o front usa nos dois checks
                    lista.forEach(p => Object.assign(p, mapa[p.id] || {}));
                }
            } catch (e) {
                console.error('Falha ao anexar situação Asaas na listagem (segue sem):', e.message);
            }

            res.json(pedidos);
        } catch (error) {
            console.error('Erro ao listar pedidos:', error);
            res.status(500).json({ error: 'Erro ao listar pedidos' });
        }
    },

    // ── Impressão em lote (DANFEs 2 vias + boletos / recibo do especial) ──
    imprimirLoteChecar: async (req, res) => {
        try {
            const { pedidoIds } = req.body || {};
            if (!Array.isArray(pedidoIds) || !pedidoIds.length) {
                return res.status(400).json({ error: 'Selecione ao menos um pedido.' });
            }
            const impressaoLoteService = require('../services/impressaoLoteService');
            const itens = await impressaoLoteService.checar(pedidoIds.slice(0, 100));
            res.json({ itens });
        } catch (e) {
            console.error('Erro ao checar lote de impressão:', e);
            res.status(500).json({ error: 'Erro ao checar os pedidos.' });
        }
    },

    imprimirLote: async (req, res) => {
        try {
            const { pedidoIds, duasVias, incluirBoletos } = req.body || {};
            if (!Array.isArray(pedidoIds) || !pedidoIds.length) {
                return res.status(400).json({ error: 'Selecione ao menos um pedido.' });
            }
            const impressaoLoteService = require('../services/impressaoLoteService');
            const { pdf, erros, paginas } = await impressaoLoteService.gerar({
                pedidoIds: pedidoIds.slice(0, 100),
                duasVias: duasVias !== false,
                incluirBoletos: incluirBoletos !== false
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="impressao-lote-${paginas}p.pdf"`);
            res.setHeader('X-Lote-Erros', encodeURIComponent(JSON.stringify(erros)));
            res.send(pdf);
        } catch (e) {
            console.error('Erro ao gerar lote de impressão:', e);
            res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao gerar o PDF do lote.' });
        }
    },

    // ── Avisos de pedido especial convertido (popup do faturamento) ──
    avisosConvertidos: async (req, res) => {
        try {
            const vendedor = await prisma.vendedor.findUnique({
                where: { id: req.user.id },
                select: { alertaPedidoConvertido: true }
            });
            if (!vendedor?.alertaPedidoConvertido) return res.json({ avisos: [] });

            const avisos = await prisma.pedidoConvertidoAviso.findMany({
                where: { cienteEm: null },
                orderBy: { createdAt: 'asc' },
                take: 10,
                include: {
                    pedido: {
                        select: {
                            id: true, numero: true, situacaoCA: true,
                            cliente: { select: { Nome: true, NomeFantasia: true } }
                        }
                    }
                }
            });
            res.json({
                avisos: avisos.map(a => ({
                    id: a.id,
                    pedidoId: a.pedidoId,
                    numeroAntigo: a.numeroAntigo,
                    numeroNovo: a.numeroNovo ?? a.pedido?.numero,
                    valorPago: a.valorPago != null ? Number(a.valorPago) : null,
                    cliente: a.pedido?.cliente?.NomeFantasia || a.pedido?.cliente?.Nome || '—',
                    situacaoCA: a.pedido?.situacaoCA || null,
                    criadoEm: a.createdAt
                }))
            });
        } catch (e) {
            console.error('Erro ao listar avisos de conversão:', e);
            res.status(500).json({ error: 'Erro ao listar avisos.' });
        }
    },

    avisoConvertidoCiente: async (req, res) => {
        try {
            await prisma.pedidoConvertidoAviso.update({
                where: { id: req.params.avisoId },
                data: { cienteEm: new Date(), cientePorId: req.user.id }
            });
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: 'Erro ao registrar ciência.' });
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

            // Verificar inadimplência do cliente (apenas pedidos normais)
            if (dadosPedido.clienteId && !dadosPedido.especial && !dadosPedido.bonificacao) {
                const permissoes = req.user?.permissoes || {};
                const hojeStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const hoje = new Date(hojeStr + 'T00:00:00.000Z');

                const buscarParcelasVencidas = () => prisma.parcela.findMany({
                    where: {
                        status: 'PENDENTE',
                        dataVencimento: { lt: hoje },
                        contaReceber: {
                            clienteId: dadosPedido.clienteId,
                            status: { in: ['ABERTO', 'PARCIAL'] },
                            NOT: [
                                { pedido: { statusEnvio: 'EXCLUIDO' } },
                                { pedido: { situacaoCA: 'CANCELADO' } }
                            ]
                        }
                    },
                    select: { valor: true }
                });

                let parcelasVencidas = await buscarParcelasVencidas();

                // Se encontrou parcelas vencidas, sincroniza com CA antes de bloquear
                // — pode ser que o pagamento já foi registrado no CA mas não baixado aqui
                if (parcelasVencidas.length > 0) {
                    try {
                        const { sincronizarContasCliente } = require('../services/contasReceberSyncService');
                        await sincronizarContasCliente(dadosPedido.clienteId);
                        parcelasVencidas = await buscarParcelasVencidas();
                    } catch (syncErr) {
                        console.warn('[Inadimplência] Sync CA falhou, usando dados locais:', syncErr.message);
                    }
                }

                if (parcelasVencidas.length > 0) {
                    const totalVencido = parcelasVencidas.reduce((acc, p) => acc + Number(p.valor), 0);
                    const nomeVendedor = req.user?.nome || 'Vendedor';
                    if (!permissoes.admin && !permissoes.Pode_Vender_Inadimplente) {
                        const isAVista = (dadosPedido.nomeCondicaoPagamento || '').toLowerCase().includes('vista');
                        if (!isAVista) {
                            return res.status(403).json({ error: 'Este cliente possui contas em aberto. Você não tem permissão para realizar esta venda.' });
                        }
                        // À vista: permite com responsabilidade do lançador
                        const obsInadimplencia = `\n[${nomeVendedor} responsável — venda à vista para cliente com R$ ${totalVencido.toFixed(2).replace('.', ',')} em atraso]`;
                        dadosPedido.observacoes = (dadosPedido.observacoes || '') + obsInadimplencia;
                    } else {
                        const obsInadimplencia = `\n[${nomeVendedor} se responsabiliza pela venda — cliente com R$ ${totalVencido.toFixed(2).replace('.', ',')} em atraso]`;
                        dadosPedido.observacoes = (dadosPedido.observacoes || '') + obsInadimplencia;
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

            // Recalcular insight do cliente em background (sem criar atendimento duplicado)
            if (novoPedido.clienteId) {
                const clienteInsightService = require('../services/clienteInsightService');
                clienteInsightService.recalcularCliente(novoPedido.clienteId)
                    .catch(err => console.error('[Insight] Erro ao recalcular após pedido:', err.message));
            }
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
            }, { timeout: 20000, maxWait: 10000 });

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
                    contaReceber: { select: { status: true, valorTotal: true } },
                    pagamentosReais: { select: { formaPagamentoNome: true, valor: true } }
                },
                orderBy: { dataVenda: 'desc' }
            });

            // Calcular totais
            const totalPedidos = pedidos.length;
            let valorTotalGeral = 0;
            let totalItens = 0;

            const pedidosFormatados = pedidos.map(p => {
                const valorTotal = p.itens.reduce((sum, item) => sum + Number(item.valor || 0) * Number(item.quantidade || 0), 0);
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
                    dataEntrega: p.dataEntrega || null,
                    observacaoEntrega: p.observacaoEntrega || null,
                    condicaoPagamento: p.nomeCondicaoPagamento || '-',
                    valorTotal,
                    qtdItens,
                    flexTotal: Number(p.flexTotal || 0),
                    contaReceberStatus: p.contaReceber?.status || null,
                    canalOrigem: p.canalOrigem || '-',
                    observacoes: p.observacoes || '',
                    pagamentosReais: (p.pagamentosReais || []).map(pg => ({
                        forma: pg.formaPagamentoNome,
                        valor: Number(pg.valor)
                    })),
                    itens: p.itens.map(item => ({
                        produtoNome: item.produto?.nome || item.descricao || '-',
                        produtoCodigo: item.produto?.codigo || '-',
                        quantidade: Number(item.quantidade),
                        valor: Number(item.valor),
                        valorBase: Number(item.valorBase),
                        flexGerado: Number(item.flexGerado || 0),
                        emPromocao: item.emPromocao,
                        nomePromocao: item.nomePromocao || null
                    }))
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

    relatorioFlex: async (req, res) => {
        try {
            const { dataDe, dataAte, vendedorId } = req.query;
            const permissoes = req.user?.permissoes || {};
            const podeVerTodos = permissoes.admin || permissoes.pedidos?.clientes === 'todos';

            const where = { statusEnvio: { not: 'EXCLUIDO' } };

            if (!podeVerTodos) {
                where.vendedorId = req.user.id;
            } else if (vendedorId) {
                where.vendedorId = vendedorId;
            }

            if (dataDe || dataAte) {
                where.createdAt = {};
                if (dataDe) where.createdAt.gte = new Date(dataDe + 'T00:00:00.000Z');
                if (dataAte) where.createdAt.lte = new Date(dataAte + 'T23:59:59.999Z');
            }

            // Só pedidos que usaram flex (flexTotal != 0)
            where.flexTotal = { not: 0 };

            const pedidos = await prisma.pedido.findMany({
                where,
                include: {
                    cliente: { select: { Nome: true, NomeFantasia: true } },
                    vendedor: { select: { id: true, nome: true, flexMensal: true, flexDisponivel: true } },
                    itens: { select: { valor: true, valorBase: true, flexGerado: true, quantidade: true, produto: { select: { nome: true, codigo: true } } } }
                },
                orderBy: { createdAt: 'desc' }
            });

            // Agrupar por vendedor
            const vendedoresMap = new Map();
            for (const p of pedidos) {
                const vid = p.vendedorId || 'SEM_VENDEDOR';
                if (!vendedoresMap.has(vid)) {
                    vendedoresMap.set(vid, {
                        vendedorId: vid,
                        vendedorNome: p.vendedor?.nome || 'Sem Vendedor',
                        flexMensal: Number(p.vendedor?.flexMensal || 0),
                        flexDisponivel: Number(p.vendedor?.flexDisponivel || 0),
                        flexNegativo: 0,
                        flexPositivo: 0,
                        qtdPedidosNegativo: 0,
                        qtdPedidosPositivo: 0,
                        pedidos: []
                    });
                }
                const v = vendedoresMap.get(vid);
                const ft = Number(p.flexTotal);
                if (ft < 0) { v.flexNegativo += ft; v.qtdPedidosNegativo++; }
                else { v.flexPositivo += ft; v.qtdPedidosPositivo++; }

                v.pedidos.push({
                    id: p.id,
                    numero: p.numero,
                    especial: p.especial,
                    createdAt: p.createdAt,
                    clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || '-',
                    flexTotal: ft,
                    valorTotal: p.itens.reduce((s, i) => s + Number(i.valor) * Number(i.quantidade), 0),
                    itens: p.itens.map(i => ({
                        produtoNome: i.produto?.nome || '-',
                        produtoCodigo: i.produto?.codigo || '-',
                        quantidade: Number(i.quantidade),
                        valor: Number(i.valor),
                        valorBase: Number(i.valorBase),
                        flexGerado: Number(i.flexGerado || 0)
                    }))
                });
            }

            // Buscar todos os vendedores para mostrar quem tem orçamento mesmo sem uso
            let vendedoresCompleto = Array.from(vendedoresMap.values());
            if (podeVerTodos && !vendedorId) {
                const todosVendedores = await prisma.vendedor.findMany({
                    where: { ativo: true },
                    select: { id: true, nome: true, flexMensal: true, flexDisponivel: true }
                });
                for (const v of todosVendedores) {
                    if (!vendedoresMap.has(v.id) && Number(v.flexMensal) > 0) {
                        vendedoresCompleto.push({
                            vendedorId: v.id,
                            vendedorNome: v.nome,
                            flexMensal: Number(v.flexMensal),
                            flexDisponivel: Number(v.flexDisponivel),
                            flexNegativo: 0,
                            flexPositivo: 0,
                            qtdPedidosNegativo: 0,
                            qtdPedidosPositivo: 0,
                            pedidos: []
                        });
                    }
                }
            }

            vendedoresCompleto.sort((a, b) => a.flexNegativo - b.flexNegativo);

            res.json({ vendedores: vendedoresCompleto });
        } catch (error) {
            console.error('Erro ao gerar relatório flex:', error);
            res.status(500).json({ error: 'Erro ao gerar relatório flex' });
        }
    },

    relatorioVendas: async (req, res) => {
        try {
            const { dataVendaDe, dataVendaAte, dataCriacaoDe, dataCriacaoAte, vendedorId, situacaoCA, excluirBonificacao } = req.query;

            const permissoes = req.user?.permissoes || {};
            const podeVerTodos = permissoes.admin || permissoes.pedidos?.clientes === 'todos';

            const where = { statusEnvio: { not: 'EXCLUIDO' } };

            if (!podeVerTodos) {
                where.vendedorId = req.user.id;
            } else if (vendedorId) {
                where.vendedorId = vendedorId;
            }

            if (situacaoCA) where.situacaoCA = situacaoCA;
            if (excluirBonificacao === 'true') where.bonificacao = false;

            if (dataCriacaoDe || dataCriacaoAte) {
                where.createdAt = {};
                if (dataCriacaoDe) where.createdAt.gte = new Date(dataCriacaoDe + 'T00:00:00.000Z');
                if (dataCriacaoAte) where.createdAt.lte = new Date(dataCriacaoAte + 'T23:59:59.999Z');
            }

            if (dataVendaDe || dataVendaAte) {
                where.dataVenda = {};
                if (dataVendaDe) where.dataVenda.gte = new Date(dataVendaDe + 'T00:00:00.000Z');
                if (dataVendaAte) where.dataVenda.lte = new Date(dataVendaAte + 'T23:59:59.999Z');
            }

            const pedidos = await prisma.pedido.findMany({
                where,
                select: {
                    id: true,
                    numero: true,
                    dataVenda: true,
                    createdAt: true,
                    clienteId: true,
                    vendedorId: true,
                    nomeCondicaoPagamento: true,
                    bonificacao: true,
                    especial: true,
                    cliente: {
                        select: {
                            Nome: true, NomeFantasia: true, End_Cidade: true, End_Bairro: true,
                            indicacao: { select: { Nome: true, NomeFantasia: true } }
                        }
                    },
                    vendedor: { select: { nome: true, telefone: true } },
                    itens: {
                        select: {
                            id: true,
                            valor: true,
                            quantidade: true,
                            produto: { select: { id: true, nome: true, categoriaProduto: { select: { nome: true } } } }
                        }
                    }
                },
                orderBy: { dataVenda: 'desc' }
            });

            // Custo de produção por produto — usa a MESMA função oficial do PCP
            // (pcpReceitaService.calcularCusto), garantindo que o relatório bate com a tela
            // da receita. Ela resolve SUB recursivamente, pega o custo da MP em
            // Produto.custoMedio → custoManual → ItemPcp.custoUnitario, e aplica a perda
            // (custoPorUnidade = custoTotal / (rendimentoBase × (1 - perda%))).
            const produtoIds = [...new Set(
                pedidos.flatMap(p => p.itens.map(i => i.produto?.id).filter(Boolean))
            )];
            const custoPorProduto = {};
            if (produtoIds.length > 0) {
                const itensPcp = await prisma.itemPcp.findMany({
                    where: { produtoId: { in: produtoIds } },
                    select: { id: true, produtoId: true }
                });
                const agora = new Date();
                const receitas = await prisma.receita.findMany({
                    where: {
                        itemPcpId: { in: itensPcp.map(i => i.id) },
                        status: 'ativa',
                        dataInicioVigencia: { lte: agora },
                        OR: [{ dataFimVigencia: null }, { dataFimVigencia: { gte: agora } }]
                    },
                    orderBy: { versao: 'desc' },
                    select: { id: true, itemPcpId: true }
                });
                const receitaPorItem = {}; // itemPcpId -> receitaId (ativa mais recente)
                receitas.forEach(r => { if (!receitaPorItem[r.itemPcpId]) receitaPorItem[r.itemPcpId] = r.id; });

                // calcula o custo por unidade de cada receita (em lotes p/ não esgotar conexões)
                const recipeIds = [...new Set(Object.values(receitaPorItem))];
                const custoPorReceita = {};
                const LOTE = 8;
                for (let i = 0; i < recipeIds.length; i += LOTE) {
                    const lote = recipeIds.slice(i, i + LOTE);
                    await Promise.all(lote.map(async (rid) => {
                        try {
                            const c = await pcpReceitaService.calcularCusto(rid);
                            custoPorReceita[rid] = (c && c.custoPorUnidade != null) ? Number(c.custoPorUnidade) : null;
                        } catch {
                            custoPorReceita[rid] = null;
                        }
                    }));
                }

                itensPcp.forEach(ip => {
                    const rid = receitaPorItem[ip.id];
                    if (!rid) return;
                    const c = custoPorReceita[rid];
                    if (c != null && c > 0) custoPorProduto[ip.produtoId] = c;
                });
            }

            let totalGeral = 0;
            const registros = [];
            const pedidosIds = new Set();
            pedidos.forEach(p => {
                pedidosIds.add(p.id);
                const tipo = p.bonificacao ? 'Bonificação' : p.especial ? 'Especial' : 'Normal';
                const base = {
                    pedidoId: p.id,
                    numero: p.numero,
                    dataVenda: p.dataVenda ? p.dataVenda.toISOString().split('T')[0] : null,
                    dataCriacao: p.createdAt ? p.createdAt.toISOString().split('T')[0] : null,
                    clienteNome: p.cliente?.NomeFantasia || p.cliente?.Nome || '-',
                    nomeCondicaoPagamento: p.nomeCondicaoPagamento || 'Não informada',
                    tipo,
                    cidade: p.cliente?.End_Cidade || 'Não informada',
                    bairro: p.cliente?.End_Bairro || 'Não informado',
                    indicacao: p.cliente?.indicacao?.NomeFantasia || p.cliente?.indicacao?.Nome || '',
                    vendedorNome: p.vendedor?.nome || '-',
                    vendedorTelefone: p.vendedor?.telefone || ''
                };
                if (p.itens.length === 0) {
                    registros.push({ ...base, id: p.id, produto: '-', categoriaComercial: 'Sem categoria', quantidade: 0, valorUnit: 0, valorTotal: 0, precoCusto: null, custoTotal: null });
                } else {
                    p.itens.forEach(item => {
                        const valorUnit = Number(item.valor || 0);
                        const quantidade = Number(item.quantidade || 0);
                        const valorTotal = valorUnit * quantidade;
                        totalGeral += valorTotal;
                        const precoCusto = custoPorProduto[item.produto?.id] ?? null;
                        registros.push({
                            ...base,
                            id: `${p.id}-${item.id}`,
                            produto: item.produto?.nome || '-',
                            categoriaComercial: item.produto?.categoriaProduto?.nome || 'Sem categoria',
                            quantidade,
                            valorUnit,
                            valorTotal,
                            precoCusto,
                            custoTotal: precoCusto != null ? precoCusto * quantidade : null
                        });
                    });
                }
            });

            res.json({
                resumo: {
                    totalPedidos: pedidosIds.size,
                    valorTotalGeral: totalGeral,
                    ticketMedio: pedidosIds.size > 0 ? totalGeral / pedidosIds.size : 0
                },
                pedidos: registros
            });
        } catch (error) {
            console.error('Erro ao gerar relatório de vendas:', error);
            res.status(500).json({ error: 'Erro ao gerar relatório de vendas.' });
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

            // Atualiza o check da pílula CA (tem boleto no Conta Azul?) — melhor esforço
            let caBoletoStatus = atualizado.caBoletoStatus;
            if (situacaoNome === 'FATURADO' && !pedido.especial && !pedido.bonificacao) {
                try {
                    const cliente = await prisma.cliente.findUnique({
                        where: { UUID: pedido.clienteId }, select: { UUID: true }
                    });
                    const dataVendaStr = new Date(pedido.dataVenda).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                    const boletos = await contaAzulService.buscarBoletosDaVenda(cliente.UUID, pedido.idVendaContaAzul, dataVendaStr);
                    caBoletoStatus = boletos.length === 0 ? 'SEM' : (boletos.every(b => b.pago) ? 'PAGO' : 'PENDENTE');
                    await prisma.pedido.update({
                        where: { id },
                        data: { caBoletoStatus, caBoletoVerificado: new Date() }
                    });
                } catch (e) {
                    console.warn(`[consultarCA] Falha ao checar boleto do CA (pedido ${id}):`, e.message);
                }
            }

            res.json({
                message: `Situação atualizada: ${situacaoNome || 'EXCLUIDO'}`,
                situacaoCA: atualizado.situacaoCA,
                statusEnvio: atualizado.statusEnvio,
                caBoletoStatus,
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
    },

    // Pedidos criados ontem com entrega para hoje que ainda não foram faturados
    pendenteFaturamento: async (req, res) => {
        try {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);

            const hojeFim = new Date(hoje);
            hojeFim.setHours(23, 59, 59, 999);

            const pedidos = await prisma.pedido.findMany({
                where: {
                    dataVenda: { gte: hoje, lte: hojeFim },
                    bonificacao: false,
                    AND: [
                        // situacaoCA != FATURADO incluindo nulls (NULL != 'FATURADO' é NULL/falsy em SQL)
                        { OR: [{ situacaoCA: null }, { situacaoCA: { not: 'FATURADO' } }] },
                        {
                            OR: [
                                // Pedidos normais: no pipeline de envio ao CA
                                { especial: false, statusEnvio: { in: ['RECEBIDO', 'ENVIAR', 'SINCRONIZANDO'] } },
                                // Pedidos especiais: ABERTO ou ENVIAR, não entregues
                                { especial: true, statusEntrega: { not: 'ENTREGUE' } }
                            ]
                        }
                    ]
                },
                select: {
                    id: true,
                    numero: true,
                    situacaoCA: true,
                    especial: true,
                    cliente: { select: { Nome: true } },
                    vendedor: { select: { nome: true } }
                },
                orderBy: { createdAt: 'asc' }
            });

            res.json({ total: pedidos.length, pedidos });
        } catch (error) {
            console.error('Erro ao buscar pedidos pendentes de faturamento:', error);
            res.status(500).json({ error: 'Erro ao buscar pedidos pendentes de faturamento' });
        }
    },

    // ── NF-e / DANFE ──────────────────────────────────────────────
    // Localiza a NF-e da venda no CA varrendo janelas de 7 dias (a API exige
    // range curto de datas; ranges longos devolvem 500). Cacheia a chave no
    // pedido para as próximas consultas serem instantâneas.
    _localizarNotaFiscal: async (pedido) => {
        if (pedido.nfeChave) {
            return { chave_acesso: pedido.nfeChave, numero_nota: pedido.nfeNumero, status: 'EMITIDA', cache: true };
        }
        if (!pedido.idVendaContaAzul) {
            const e = new Error('Pedido sem venda no Conta Azul.');
            e.statusCode = 400;
            throw e;
        }

        const fmt = (d) => d.toISOString().split('T')[0];
        const base = pedido.enviadoEm || pedido.dataVenda || pedido.createdAt || new Date();
        let ini = new Date(base);
        ini.setDate(ini.getDate() - 1);
        // data_final da API se comporta como EXCLUSIVA (nota de hoje só aparece com
        // data_final = amanhã) — por isso o limite vai um dia além de hoje.
        const limite = new Date(Date.now() + 24 * 3600 * 1000);
        let nota = null;
        for (let i = 0; i < 12 && ini <= limite && !nota; i++) {
            const fim = new Date(Math.min(ini.getTime() + 6 * 24 * 3600 * 1000, limite.getTime()));
            const itens = await contaAzulService.listarNotasFiscais({
                dataInicial: fmt(ini),
                dataFinal: fmt(fim),
                idVenda: pedido.idVendaContaAzul
            });
            nota = itens.find(n => ['EMITIDA', 'CORRIGIDA COM SUCESSO'].includes(n.status)) || itens[0] || null;
            ini = new Date(fim.getTime() + 24 * 3600 * 1000);
        }
        if (!nota) {
            const e = new Error('NF-e não encontrada no Conta Azul — a nota pode ainda não ter sido emitida.');
            e.statusCode = 404;
            throw e;
        }
        await prisma.pedido.update({
            where: { id: pedido.id },
            data: { nfeChave: nota.chave_acesso, nfeNumero: nota.numero_nota, nfeConsultadoEm: new Date() }
        }).catch(() => { /* cache é melhor esforço */ });
        return nota;
    },

    // GET /:id/nota-fiscal — número/chave da NF-e emitida no CA
    buscarNotaFiscal: async (req, res) => {
        try {
            const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
            const nota = await pedidoController._localizarNotaFiscal(pedido);
            res.json({
                numero: nota.numero_nota,
                chave: nota.chave_acesso,
                status: nota.status || 'EMITIDA',
                dataEmissao: nota.data_emissao || null
            });
        } catch (e) {
            res.status(e.statusCode || 500).json({ error: e.message });
        }
    },

    // GET /:id/danfe — PDF da DANFE gerado no app a partir do XML autorizado (API do CA)
    baixarDanfe: async (req, res) => {
        try {
            const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id } });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
            const nota = await pedidoController._localizarNotaFiscal(pedido);
            const xml = await contaAzulService.buscarXmlNotaFiscal(nota.chave_acesso);
            const { gerarPDF } = require('@alexssmusica/node-pdf-nfe');
            // Logo da Hardt no quadro do emitente (permitido pelo MOC, item 3.1.3)
            const path = require('path');
            const fs = require('fs');
            const pathLogo = path.join(__dirname, '../assets/logo-danfe.png');
            const doc = await gerarPDF(xml, fs.existsSync(pathLogo) ? { pathLogo } : {});
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="danfe-nf-${nota.numero_nota || pedido.numero || 'pedido'}.pdf"`);
            doc.pipe(res);
        } catch (e) {
            console.error('Erro ao gerar DANFE:', e.message);
            res.status(e.statusCode || 500).json({ error: e.message || 'Erro ao gerar a DANFE.' });
        }
    },

    buscarCobrancasCA: async (req, res) => {
        try {
            const id = req.params.id;
            const pedido = await prisma.pedido.findUnique({
                where: { id },
                include: { cliente: { select: { UUID: true } } }
            });
            if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
            if (!pedido.idVendaContaAzul) return res.status(400).json({ error: 'Pedido sem ID de venda no CA' });

            const clienteCAId = pedido.cliente?.UUID;
            if (!clienteCAId) return res.status(400).json({ error: 'Cliente sem ID no CA' });

            const dataVendaStr = new Date(pedido.dataVenda).toISOString().split('T')[0];
            const parcelas = await contaAzulService.encontrarParcelasDeVenda(
                clienteCAId, pedido.idVendaContaAzul, dataVendaStr
            );

            if (!parcelas.length) return res.json({ cobrancas: [] });

            const cobrancas = [];
            let idx = 1;

            for (const parcela of parcelas) {
                const solicitacoes = parcela.solicitacoes_cobrancas || [];
                for (const cob of solicitacoes) {
                    if (!cob?.id) continue;
                    cobrancas.push({
                        label: `Cob-${idx}`,
                        url: cob.url || null,
                        tipo: cob.tipo_solicitacao_cobranca || cob.tipo || null
                    });
                    idx++;
                }
            }

            res.json({ cobrancas });
        } catch (error) {
            console.error('Erro ao buscar cobranças CA:', error.message);
            res.status(500).json({ error: error.message || 'Erro ao buscar cobranças' });
        }
    },

    verificarDuplicata: async (req, res) => {
        try {
            const { clienteId, dataVenda } = req.query;
            if (!clienteId || !dataVenda) {
                return res.status(400).json({ error: 'clienteId e dataVenda são obrigatórios' });
            }

            const dataStr = dataVenda.split('T')[0];
            const inicioDia = new Date(dataStr + 'T00:00:00Z');
            const fimDia = new Date(dataStr + 'T23:59:59Z');

            const pedidos = await prisma.pedido.findMany({
                where: {
                    clienteId,
                    dataVenda: { gte: inicioDia, lte: fimDia },
                    statusEnvio: { not: 'EXCLUIDO' }
                },
                include: {
                    itens: {
                        include: { produto: { select: { nome: true } } }
                    },
                    vendedor: { select: { nome: true } }
                },
                orderBy: { createdAt: 'asc' }
            });

            const resultado = pedidos.map(p => ({
                id: p.id,
                numero: p.numero,
                statusEnvio: p.statusEnvio,
                situacaoCA: p.situacaoCA,
                especial: p.especial,
                bonificacao: p.bonificacao,
                vendedorNome: p.vendedor?.nome || null,
                nomeCondicaoPagamento: p.nomeCondicaoPagamento,
                total: p.itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0),
                itens: p.itens.map(i => ({
                    nome: i.produto?.nome || i.produtoId,
                    quantidade: Number(i.quantidade),
                    valor: Number(i.valor)
                }))
            }));

            res.json(resultado);
        } catch (error) {
            console.error('Erro ao verificar duplicata:', error);
            res.status(500).json({ error: 'Erro ao verificar pedidos duplicados' });
        }
    }
};

module.exports = pedidoController;
