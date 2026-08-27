const prisma = require('../config/database');
const clienteInsightService = require('./clienteInsightService');

// Teto de segurança do painel: período muito largo não pode varrer a tabela inteira
// (a mesclagem atendimento + pedido é feita em memória para ordenar pela hora).
const TETO_LINHAS = 3000;

// Campos do cliente na linha do painel de atendimentos.
// UMA constante para as DUAS consultas (atendimento e pedido) de propósito: o painel
// mistura as duas em uma lista só, e se os selects divergirem a linha vinda do pedido
// aparece sem o selo enquanto a de atendimento aparece com ele — o vendedor acharia
// que metade da carteira perdeu o WhatsApp.
//   Telefone_Celular → é o campo que o sistema usa para mandar WhatsApp; sem ele a
//                      tela não consegue distinguir "sem número" de "número sem selo".
//   whatsappStatus   → selo por uso real: EM_USO ("saiu mensagem nossa nos últimos
//                      180 dias") | COM_PROBLEMA ("o WhatsApp recusou o número") | null.
//                      NÃO é conferência: o sistema nunca verifica se o número é do
//                      cliente. Não chamar de "validado"/"verificado" em código nem em
//                      manual — vira promessa falsa para quem está em campo.
//                      Só `selo`: a lista não desenha estado "dispensado".
//
// Esta rota carrega o celular de TODA a base para quem abre o painel — por isso
// `GET /atendimentos/filtros` é gateado por `Pode_Ver_Atendimentos` em
// routes/atendimentoRoutes.js. Ao acrescentar campo pessoal aqui, confira o gate.
const CLIENTE_LINHA_SELECT = {
    UUID: true, NomeFantasia: true, Nome: true, End_Cidade: true,
    Telefone_Celular: true,
    whatsappStatus: { select: { selo: true } },
};

// Canal informado no pedido (campo "Tipo de Atendimento" do NovoPedido) → tipo do painel.
// VISITA vira PRESENCIAL só se a configuração de tipos_atendimento usar esse nome
// (a lista de tipos é editável em Configurações) — quem decide é criarResolvedorDeTipo.
const CANAL_PEDIDO_TIPO = {
    VISITA: ['PRESENCIAL', 'VISITA'],
    PRESENCIAL: ['PRESENCIAL', 'VISITA'],
    WHATSAPP: ['WHATSAPP'],
    LIGACAO: ['LIGACAO', 'TELEFONE'],
    KIT_FESTA: ['SITE'],
    SITE_CONGELADOS: ['SITE'],
};

/**
 * Devolve uma função canal → tipo, casando com o vocabulário configurado em
 * `tipos_atendimento` (o dono edita essa lista; hoje usa PRESENCIAL, não VISITA).
 * Sem config, fica o primeiro nome de cada lista acima.
 */
function criarResolvedorDeTipo(tiposConfig) {
    const configurados = new Set(
        (Array.isArray(tiposConfig) ? tiposConfig : [])
            .map(t => String(t?.value || t || '').toUpperCase())
            .filter(Boolean)
    );
    return (canal) => {
        const candidatos = CANAL_PEDIDO_TIPO[String(canal || '').toUpperCase()];
        if (!candidatos) return 'PEDIDO';                       // canal em branco ou desconhecido
        return candidatos.find(c => configurados.has(c)) || candidatos[0];
    };
}

/** Pedido → linha de atendimento (mesmo formato que a tela já sabe desenhar). */
function montarLinhaPedido(p, resolverTipo) {
    const valor = (p.itens || []).reduce(
        (soma, i) => soma + Number(i.valor || 0) * Number(i.quantidade || 0), 0
    );
    const prefixo = p.especial ? 'ZZ#' : p.bonificacao ? 'BN#' : '#';
    const numero = p.numero != null ? `${prefixo}${p.numero}` : '(sem número)';
    return {
        id: `pedido:${p.id}`,
        origemPedido: true,
        pedidoId: p.id,
        numeroPedido: p.numero,
        rotuloPedido: numero,
        valorPedido: Math.round(valor * 100) / 100,
        canalOrigem: p.canalOrigem || null,
        condicaoPagamento: p.nomeCondicaoPagamento || null,
        statusEnvio: p.statusEnvio || null,
        cancelado: !!p.cancelado,
        especial: !!p.especial,
        bonificacao: !!p.bonificacao,
        criadoEm: p.createdAt,
        tipo: resolverTipo(p.canalOrigem),
        acaoKey: 'PEDIDO',
        acaoLabel: `Pedido ${numero}`,
        observacao: p.observacoes || null,
        gpsVendedor: p.latLng || null,
        vendedor: p.vendedor || null,
        cliente: p.cliente || null,
        clienteId: p.clienteId,
        lead: null,
        leadId: null,
        // Campos que a tela lê mas não existem num pedido
        transferidoParaId: null, transferidoPara: null,
        dataRetorno: null, assuntoRetorno: null,
        alertaVisualAtivo: false, etapaNova: null, amostra: null,
    };
}

const atendimentoService = {

    // Registra um atendimento (para Lead ou Cliente)
    registrar: async (data) => {
        const { tipo, observacao, etapaAnterior, etapaNova, proximaVisita,
            gpsVendedor, pedidoId, leadId, clienteId, idVendedor,
            acaoKey, acaoLabel, transferidoParaId,
            assuntoRetorno, dataRetorno,
            alertaVisualAtivo, alertaVisualCor,
            amostraId, usuarioRegistroId } = data;

        // Se for lead, atualizar a etapa e próxima visita
        if (leadId && etapaNova) {
            await prisma.lead.update({
                where: { id: leadId },
                data: {
                    etapa: etapaNova,
                    ...(proximaVisita && { proximaVisita: new Date(proximaVisita) })
                }
            });
        } else if (leadId && proximaVisita) {
            await prisma.lead.update({
                where: { id: leadId },
                data: { proximaVisita: new Date(proximaVisita) }
            });
        }

        const novoAtendimento = await prisma.atendimento.create({
            data: {
                tipo,
                observacao,
                etapaAnterior: etapaAnterior || null,
                etapaNova: etapaNova || null,
                proximaVisita: proximaVisita ? new Date(proximaVisita) : null,
                gpsVendedor: gpsVendedor || null,
                pedidoId: pedidoId || null,
                leadId: leadId || null,
                clienteId: clienteId || null,
                idVendedor,
                usuarioRegistroId: usuarioRegistroId || null,
                acaoKey: acaoKey || null,
                acaoLabel: acaoLabel || null,
                transferidoParaId: transferidoParaId || null,
                assuntoRetorno: assuntoRetorno || null,
                dataRetorno: dataRetorno ? new Date(dataRetorno) : null,
                alertaVisualAtivo: alertaVisualAtivo || false,
                alertaVisualCor: alertaVisualCor || null,
                alertaVisualVisto: false,
                amostraId: amostraId || null,
            }
        });

        // Async: recalcular insights e orientação IA do cliente
        if (clienteId) {
            setTimeout(() => {
                clienteInsightService.recalcularCliente(clienteId)
                    .then(() => {
                        // 2s de delay para garantir que o insight já foi salvo
                        setTimeout(() => {
                            const orientacaoService = require('./orientacaoService');
                            orientacaoService.gerarOrientacaoIA(clienteId, {
                                disparadoPor: 'ATENDIMENTO',
                                usuarioId: usuarioRegistroId || null,
                                atendimentoId: novoAtendimento.id || null,
                            }).catch(err => {
                                console.error('[IA] Erro ao atualizar orientação após atendimento:', err.message);
                            });
                        }, 2000);
                    })
                    .catch(console.error);
            }, 0);
        }

        return novoAtendimento;
    },

    // Histórico de atendimentos de um Lead
    listarPorLead: async (leadId) => {
        return await prisma.atendimento.findMany({
            where: { leadId },
            include: {
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
                amostra: { select: { id: true, numero: true, status: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Histórico de atendimentos de um Cliente
    listarPorCliente: async (clienteId) => {
        return await prisma.atendimento.findMany({
            where: { clienteId },
            include: {
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
                amostra: { select: { id: true, numero: true, status: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Transferências ativas (não finalizadas) para o vendedor
    listarTransferidos: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                transferidoParaId: vendedorId,
                transferenciaFinalizada: false,
            },
            include: {
                vendedor: { select: { id: true, nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            },
            orderBy: [
                { dataRetorno: 'asc' },
                { criadoEm: 'desc' }
            ]
        });
    },

    // Finalizar transferência (receptor marca como resolvida)
    finalizarTransferencia: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: {
                transferenciaFinalizada: true,
                transferenciaFinalizadaEm: new Date(),
            }
        });
    },

    // Marcar transferência finalizada como vista pelo vendedor original
    marcarTransferenciaVista: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: { transferenciaVistaOrigem: true }
        });
    },

    // Transferências finalizadas não vistas pelo vendedor original
    listarTransferenciasResolvidas: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                idVendedor: vendedorId,
                transferidoParaId: { not: null },
                transferenciaFinalizada: true,
                transferenciaVistaOrigem: false,
            },
            include: {
                transferidoPara: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true, numero: true } },
            },
            orderBy: { transferenciaFinalizadaEm: 'desc' }
        });
    },

    // Marcar alerta visual como visto
    marcarAlertaVisto: async (atendimentoId) => {
        return await prisma.atendimento.update({
            where: { id: atendimentoId },
            data: { alertaVisualVisto: true }
        });
    },

    // Alertas visuais ativos (não vistos) + transferências ativas para um vendedor
    listarAlertasAtivos: async (vendedorId) => {
        return await prisma.atendimento.findMany({
            where: {
                OR: [
                    // Alertas visuais não vistos
                    {
                        alertaVisualAtivo: true,
                        alertaVisualVisto: false,
                        OR: [
                            { idVendedor: vendedorId },
                            { transferidoParaId: vendedorId },
                        ]
                    },
                    // Transferências ativas (não finalizadas) para este vendedor
                    {
                        transferidoParaId: vendedorId,
                        transferenciaFinalizada: false,
                    },
                    // Transferências finalizadas pendentes de vista pelo remetente
                    {
                        idVendedor: vendedorId,
                        transferidoParaId: { not: null },
                        transferenciaFinalizada: true,
                        transferenciaVistaOrigem: false,
                    },
                ]
            },
            select: {
                id: true,
                leadId: true,
                clienteId: true,
                alertaVisualAtivo: true,
                alertaVisualCor: true,
                alertaVisualVisto: true,
                dataRetorno: true,
                assuntoRetorno: true,
                acaoLabel: true,
                observacao: true,
                transferidoParaId: true,
                transferenciaFinalizada: true,
                transferenciaFinalizadaEm: true,
                transferenciaVistaOrigem: true,
                idVendedor: true,
                criadoEm: true,
                vendedor: { select: { nome: true } },
                transferidoPara: { select: { nome: true } },
            }
        });
    },

    // Retorna todos os atendimentos registrados HOJE para um vendedor (ou todos se null)
    listarHojeVendedor: async (vendedorId) => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const whereCondition = { criadoEm: { gte: hoje, lt: amanha } };
        if (vendedorId) {
            whereCondition.idVendedor = vendedorId;
        }

        return await prisma.atendimento.findMany({
            where: whereCondition,
            include: { vendedor: { select: { nome: true } } },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Retorna TODOS os atendimentos de hoje, de todos os vendedores (para saber se outro vendedor já atendeu)
    listarHojeTodos: async () => {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        return await prisma.atendimento.findMany({
            where: { criadoEm: { gte: hoje, lt: amanha } },
            select: {
                id: true,
                clienteId: true,
                leadId: true,
                idVendedor: true,
                tipo: true,
                criadoEm: true,
                observacao: true,
                gpsVendedor: true,
                vendedor: { select: { nome: true } },
            },
            orderBy: { criadoEm: 'desc' }
        });
    },

    // Retorna clientes sem atendimento/pedido do dia útil anterior (somente ontem, ou sexta se segunda)
    // Regra ativa a partir de 2026-04-16
    buscarPendenciasRota: async (vendedorId) => {
        const SIGLAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const DATA_INICIO_REGRA = new Date('2026-04-15T00:00:00');

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Se hoje é antes da data de início da regra, sem pendências
        if (hoje < DATA_INICIO_REGRA) return { pendente: false };

        // Determina o dia útil anterior: ontem, ou sexta se hoje é segunda
        // Se hoje é domingo ou sábado, não cobra (não deveria estar trabalhando)
        const dow = hoje.getDay(); // 0=dom, 6=sáb
        if (dow === 0 || dow === 6) return { pendente: false };

        const diaAnterior = new Date(hoje);
        if (dow === 1) {
            // Segunda → verifica sexta (3 dias atrás)
            diaAnterior.setDate(diaAnterior.getDate() - 3);
        } else {
            // Ter-Sex → verifica ontem
            diaAnterior.setDate(diaAnterior.getDate() - 1);
        }

        // Se o dia anterior é antes da regra, sem pendências
        if (diaAnterior < DATA_INICIO_REGRA) return { pendente: false };

        const sigla = SIGLAS[diaAnterior.getDay()];

        // Busca clientes do vendedor que têm esse dia na rota
        const clientes = await prisma.cliente.findMany({
            where: {
                idVendedor: vendedorId,
                Ativo: true,
                Dia_de_venda: { not: null },
            },
            select: {
                UUID: true,
                Nome: true,
                NomeFantasia: true,
                Dia_de_venda: true,
                Dia_de_entrega: true,
                Formas_Atendimento: true,
                End_Cidade: true,
                Ponto_GPS: true,
            }
        });

        // Filtra clientes que têm o dia anterior na rota
        const clientesDoDia = clientes.filter(c => {
            const dias = (c.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim());
            return dias.includes(sigla);
        });

        if (clientesDoDia.length === 0) return { pendente: false };

        // Verifica quais tiveram atendimento ou pedido nesse dia OU hoje (atendimento de compensação)
        const inicioDia = new Date(diaAnterior);
        inicioDia.setHours(0, 0, 0, 0);
        const fimHoje = new Date(hoje);
        fimHoje.setHours(23, 59, 59, 999);

        const uuids = clientesDoDia.map(c => c.UUID);

        const [atendimentos, pedidos] = await Promise.all([
            prisma.atendimento.findMany({
                where: {
                    clienteId: { in: uuids },
                    criadoEm: { gte: inicioDia, lte: fimHoje },
                    tipo: { not: 'FINANCEIRO' },
                },
                select: { clienteId: true }
            }),
            prisma.pedido.findMany({
                where: {
                    clienteId: { in: uuids },
                    createdAt: { gte: inicioDia, lte: fimHoje }, // usa data de criação, não dataVenda (que é entrega)
                },
                select: { clienteId: true }
            })
        ]);

        const clientesAtendidos = new Set([
            ...atendimentos.map(a => a.clienteId),
            ...pedidos.map(p => p.clienteId)
        ]);

        const clientesPendentes = clientesDoDia.filter(c => !clientesAtendidos.has(c.UUID));

        if (clientesPendentes.length === 0) return { pendente: false };

        return {
            pendente: true,
            diasPendentes: 1,
            diaPendente: {
                data: diaAnterior.toISOString().split('T')[0],
                diaSigla: sigla,
                clientes: clientesPendentes,
                totalClientes: clientesDoDia.length,
                pendentes: clientesPendentes.length,
            },
        };
    },

    excluir: async (id) => {
        return await prisma.atendimento.delete({ where: { id } });
    },

    // Lista atendimentos com filtros completos (para página admin)
    //
    // O painel mistura DUAS fontes na mesma linha do tempo:
    //   1) atendimentos registrados à mão (Rota / lead);
    //   2) os PEDIDOS do período, como linha virtual — o vendedor já informa no pedido
    //      o "Tipo de Atendimento" que gerou a venda (canalOrigem), então a venda é o
    //      atendimento. Sem isso, quem vende direto pelo app não aparecia no painel.
    // Linha de pedido tem id `pedido:<uuid>` e `origemPedido: true` (não é editável/excluível).
    listarComFiltros: async ({ vendedorId, clienteId, leadId, tipo, dataInicio, dataFim, page = 1, limit = 50 }) => {
        const where = {};
        if (vendedorId) where.idVendedor = vendedorId;
        if (clienteId) where.clienteId = clienteId;
        if (leadId) where.leadId = leadId;
        if (tipo) {
            where.tipo = tipo;
        } else {
            // Por padrão exclui FINANCEIRO (não é atendimento comercial)
            where.tipo = { notIn: ['FINANCEIRO'] };
        }
        if (dataInicio || dataFim) {
            where.criadoEm = {};
            // Usa horário de São Paulo (UTC-3) para garantir que o dia correto é filtrado
            if (dataInicio) where.criadoEm.gte = new Date(dataInicio + 'T00:00:00-03:00');
            if (dataFim) where.criadoEm.lte = new Date(dataFim + 'T23:59:59.999-03:00');
        }

        // Busca pedidos no mesmo período/vendedor (viram linha e cruzam o "com pedido")
        // Usa createdAt (quando o pedido foi criado), não dataVenda (data de entrega futura)
        const wherePedido = {};
        if (vendedorId) wherePedido.vendedorId = vendedorId;
        if (clienteId) wherePedido.clienteId = clienteId;
        if (dataInicio || dataFim) {
            wherePedido.createdAt = {};
            if (dataInicio) wherePedido.createdAt.gte = new Date(dataInicio + 'T00:00:00-03:00');
            if (dataFim) wherePedido.createdAt.lte = new Date(dataFim + 'T23:59:59.999-03:00');
        }

        // Filtro de lead nunca casa com pedido (pedido é sempre de cliente)
        const trazPedidos = !leadId;

        const [atendimentos, pedidosDoPeriodo, tiposConfig] = await Promise.all([
            prisma.atendimento.findMany({
                where,
                include: {
                    vendedor: { select: { id: true, nome: true } },
                    transferidoPara: { select: { id: true, nome: true } },
                    cliente: { select: CLIENTE_LINHA_SELECT },
                    lead: { select: { id: true, nomeEstabelecimento: true, numero: true } },
                    amostra: { select: { id: true, numero: true, status: true } },
                },
                orderBy: { criadoEm: 'desc' },
                take: TETO_LINHAS,
            }),
            trazPedidos ? prisma.pedido.findMany({
                where: wherePedido,
                select: {
                    id: true, numero: true, createdAt: true, canalOrigem: true,
                    especial: true, bonificacao: true, cancelado: true,
                    statusEnvio: true, nomeCondicaoPagamento: true, observacoes: true,
                    clienteId: true, latLng: true,
                    vendedor: { select: { id: true, nome: true } },
                    cliente: { select: CLIENTE_LINHA_SELECT },
                    itens: { select: { quantidade: true, valor: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: TETO_LINHAS,
            }) : Promise.resolve([]),
            prisma.appConfig.findUnique({ where: { key: 'tipos_atendimento' } }).catch(() => null),
        ]);

        // Set de clienteIds que fizeram pedido no período
        const clientesComPedidoSet = new Set(pedidosDoPeriodo.map(p => p.clienteId).filter(Boolean));
        const clientesComPedido = [...clientesComPedidoSet];

        // Converte cada pedido numa linha de atendimento
        const resolverTipo = criarResolvedorDeTipo(tiposConfig?.value);
        let linhasPedido = pedidosDoPeriodo.map(p => montarLinhaPedido(p, resolverTipo));

        // O filtro de tipo do painel também vale para as linhas de pedido:
        // 'PEDIDO' = só as vendas; canal (WHATSAPP, PRESENCIAL...) = vendas daquele canal.
        if (tipo) {
            linhasPedido = tipo === 'PEDIDO'
                ? linhasPedido
                : linhasPedido.filter(l => l.tipo === tipo);
        }

        // Linha do tempo única (atendimento e pedido lado a lado), mais recente primeiro
        const todas = [...atendimentos, ...linhasPedido]
            .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

        const total = todas.length;
        const data = todas.slice((page - 1) * limit, page * limit);

        // Resumo agregado sobre TODOS os registros (não só a página atual)
        const porTipo = {};
        const porVendedor = {};
        let comPedido = 0, semPedido = 0, lead = 0, pedidos = 0;

        todas.forEach(a => {
            porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
            const vn = a.vendedor?.nome || 'Sem vendedor';
            porVendedor[vn] = (porVendedor[vn] || 0) + 1;
            if (a.origemPedido) { pedidos++; comPedido++; }
            else if (a.leadId) lead++;
            else if (a.clienteId && clientesComPedidoSet.has(a.clienteId)) comPedido++;
            else if (a.clienteId) semPedido++;
        });

        const resumo = { total, porTipo, porVendedor, comPedido, semPedido, lead, pedidos };

        return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1, clientesComPedido, resumo };
    }
};

module.exports = atendimentoService;
