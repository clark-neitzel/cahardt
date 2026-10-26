const prisma = require('../config/database');
const clienteInsightService = require('./clienteInsightService');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');
const { fromStr, toStr, diaSemana } = require('../utils/diasUteisCaixa');

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

// Dia útil anterior cobrado pela trava de Pendências de Rota (fonte única da regra).
// Retorna { hojeISO, diaAnteriorISO, sigla } ou null quando não há o que cobrar.
const DATA_INICIO_REGRA_PENDENCIA = '2026-04-15';
const SIGLAS_DIA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
function diaUtilAnteriorPendencia() {
    const hojeISO = getDataReferencia();
    if (hojeISO < DATA_INICIO_REGRA_PENDENCIA) return null;
    const dow = diaSemana(hojeISO);
    if (dow === 0 || dow === 6) return null;
    const d = fromStr(hojeISO);
    d.setDate(d.getDate() - (dow === 1 ? 3 : 1));
    const diaAnteriorISO = toStr(d);
    if (diaAnteriorISO < DATA_INICIO_REGRA_PENDENCIA) return null;
    return { hojeISO, diaAnteriorISO, sigla: SIGLAS_DIA[diaSemana(diaAnteriorISO)] };
}

// ISO 'YYYY-MM-DD' deslocado em N dias de calendário (aritmética de calendário, sem fuso).
function isoMaisDias(iso, n) {
    const d = fromStr(iso);
    d.setDate(d.getDate() + n);
    return toStr(d);
}
// Pedido dos últimos 2 dias de calendário conta como atendido (regra de 10/2026):
// a janela de PEDIDOS começa 2 dias ANTES do dia pendente.
const DIAS_PEDIDO_CONTA_ATENDIDO = 2;
// Cliente "pausado" = existe linha em clientes_pausa com pausadoAte no futuro.
// Pedido que conta como atendimento: não cancelado, não excluído (mesma regra da Rota no front).
// situacaoCA é opcional e `notIn` do Prisma exclui linhas null → OR explícito.
const PEDIDO_VALIDO = () => ({
    cancelado: false,
    AND: [
        { statusEnvio: { not: 'EXCLUIDO' } }, // statusEnvio é obrigatório (default ABERTO): sem risco de null
        { OR: [{ situacaoCA: null }, { situacaoCA: { notIn: ['CANCELADO', 'EXCLUIDO'] } }] },
    ],
});
const FILTRO_NAO_PAUSADO = () => ({ OR: [{ pausa: { is: null } }, { pausa: { is: { pausadoAte: { lte: new Date() } } } }] });

const atendimentoService = {

    // Registra um atendimento (para Lead ou Cliente)
    registrar: async (data) => {
        const { tipo, observacao, etapaAnterior, etapaNova, proximaVisita,
            gpsVendedor, pedidoId, leadId, clienteId, idVendedor,
            acaoKey, acaoLabel, transferidoParaId,
            assuntoRetorno, dataRetorno,
            alertaVisualAtivo, alertaVisualCor,
            amostraId, usuarioRegistroId, pendenciaRota, permissoesUsuario } = data;

        // Ação escolhida: o front manda `acaoKey` (value da ação); aceita também `acaoAtendimento`.
        const acao = acaoKey || data.acaoAtendimento || null;

        // PAUSAR_VISITAS (cliente): exige `pausadoAte` 'YYYY-MM-DD' futura. Valida ANTES de gravar qualquer coisa.
        let pausadoAteData = null;
        if (acao === 'PAUSAR_VISITAS' && clienteId) {
            const iso = String(data.pausadoAte || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(`${iso}T12:00:00-03:00`).getTime())) {
                const err = new Error('Informe até que dia as visitas ficam pausadas.');
                err.status = 400; err.codigo = 'PAUSADO_ATE_OBRIGATORIO';
                throw err;
            }
            if (iso <= getDataReferencia()) {
                const err = new Error('A data de retomada precisa ser depois de hoje.');
                err.status = 400; err.codigo = 'PAUSADO_ATE_PASSADO';
                throw err;
            }
            pausadoAteData = new Date(`${iso}T23:59:59.999-03:00`);
        }

        // Lead marcado "sem potencial" sai da rota: etapa FINALIZADO (etapa explícita do front prevalece).
        const etapaNovaFinal = (leadId && acao === 'SEM_POTENCIAL' && !etapaNova) ? 'FINALIZADO' : etapaNova;

        // Justificativa obrigatória em atendimento de pendência de rota (09/10/2026).
        // Vale pela flag do front OU, sem depender dela, se o cliente está na pendência de ontem.
        if (((observacao || '').trim().length) < 10) {
            let exige = pendenciaRota === true;
            // Reforço sem flag: só para o próprio vendedor logado (escritório registrando em nome
            // de outro não está no fluxo de pendência) e nunca para admin/Isento_Ponto.
            const pn = typeof permissoesUsuario === 'string'
                ? (() => { try { return JSON.parse(permissoesUsuario); } catch { return {}; } })()
                : (permissoesUsuario || {});
            const isento = !!(pn.admin || pn.Isento_Ponto);
            if (!exige && !isento && clienteId && idVendedor && usuarioRegistroId === idVendedor) {
                try {
                    exige = await atendimentoService.clienteEstaPendenteRota(idVendedor, clienteId);
                } catch (e) {
                    console.error('[atendimentoService.registrar] checagem de pendência falhou:', e.message);
                }
            }
            if (exige) {
                const err = new Error('Justifique este atendimento: explique por que o cliente não foi atendido no dia.');
                err.status = 400;
                err.codigo = 'JUSTIFICATIVA_OBRIGATORIA';
                throw err;
            }
        }

        // Tudo que é banco e precisa dar certo junto: etapa do lead + atendimento + pausa do cliente.
        const novoAtendimento = await prisma.$transaction(async (tx) => {
            if (leadId && etapaNovaFinal) {
                await tx.lead.update({
                    where: { id: leadId },
                    data: {
                        etapa: etapaNovaFinal,
                        ...(proximaVisita && { proximaVisita: new Date(proximaVisita) })
                    }
                });
            } else if (leadId && proximaVisita) {
                await tx.lead.update({
                    where: { id: leadId },
                    data: { proximaVisita: new Date(proximaVisita) }
                });
            }

            const criado = await tx.atendimento.create({
                data: {
                    tipo,
                    observacao,
                    etapaAnterior: etapaAnterior || null,
                    etapaNova: etapaNovaFinal || null,
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

            if (pausadoAteData) {
                await tx.clientePausa.upsert({
                    where: { clienteUuid: clienteId },
                    update: { pausadoAte: pausadoAteData, pausadoPorId: usuarioRegistroId || null },
                    create: { clienteUuid: clienteId, pausadoAte: pausadoAteData, pausadoPorId: usuarioRegistroId || null },
                });
            }
            return criado;
        }, { timeout: 20000, maxWait: 10000 });

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
        // Datas em 'YYYY-MM-DD' no fuso de Brasília (regra única em diaUtilAnteriorPendencia).
        const ref = diaUtilAnteriorPendencia();
        if (!ref) return { pendente: false };
        const { hojeISO, diaAnteriorISO, sigla } = ref;

        // Busca clientes do vendedor que têm esse dia na rota
        const clientes = await prisma.cliente.findMany({
            where: {
                idVendedor: vendedorId,
                Ativo: true,
                Dia_de_venda: { not: null },
                ...FILTRO_NAO_PAUSADO(), // cliente com visitas pausadas não é cobrado
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

        // Verifica quais tiveram atendimento ou pedido nesse dia OU hoje (atendimento de
        // compensação). Janela em -03:00 explícito (Brasil não tem mais horário de verão) —
        // não em UTC puro, senão perde ~3h de cada ponta da janela de Brasília.
        const inicioDia = new Date(`${diaAnteriorISO}T00:00:00.000-03:00`);
        // Pedido dos 2 dias de calendário ANTES do dia pendente também conta como atendido.
        const inicioPedidos = new Date(`${isoMaisDias(diaAnteriorISO, -DIAS_PEDIDO_CONTA_ATENDIDO)}T00:00:00.000-03:00`);
        const fimHoje = new Date(`${hojeISO}T23:59:59.999-03:00`);

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
                    ...PEDIDO_VALIDO(), // cancelado/excluído não conta como atendimento
                    createdAt: { gte: inicioPedidos, lte: fimHoje }, // usa data de criação, não dataVenda (que é entrega)
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
                data: diaAnteriorISO,
                diaSigla: sigla,
                clientes: clientesPendentes,
                totalClientes: clientesDoDia.length,
                pendentes: clientesPendentes.length,
            },
        };
    },

    // Checagem barata: este cliente específico está na pendência de ontem do vendedor?
    clienteEstaPendenteRota: async (vendedorId, clienteId) => {
        const ref = diaUtilAnteriorPendencia();
        if (!ref) return false;
        const cli = await prisma.cliente.findFirst({
            where: { UUID: clienteId, idVendedor: vendedorId, Ativo: true, Dia_de_venda: { not: null }, ...FILTRO_NAO_PAUSADO() },
            select: { Dia_de_venda: true },
        });
        if (!cli) return false;
        const dias = (cli.Dia_de_venda || '').toUpperCase().split(',').map(d => d.trim());
        if (!dias.includes(ref.sigla)) return false;
        const inicioDia = new Date(`${ref.diaAnteriorISO}T00:00:00.000-03:00`);
        const inicioPedidos = new Date(`${isoMaisDias(ref.diaAnteriorISO, -DIAS_PEDIDO_CONTA_ATENDIDO)}T00:00:00.000-03:00`);
        const fimHoje = new Date(`${ref.hojeISO}T23:59:59.999-03:00`);
        const [nAt, nPed] = await Promise.all([
            prisma.atendimento.count({ where: { clienteId, criadoEm: { gte: inicioDia, lte: fimHoje }, tipo: { not: 'FINANCEIRO' } } }),
            prisma.pedido.count({ where: { clienteId, ...PEDIDO_VALIDO(), createdAt: { gte: inicioPedidos, lte: fimHoje } } }),
        ]);
        return nAt === 0 && nPed === 0;
    },

    // Retoma as visitas de um cliente pausado (apaga a pausa). Idempotente.
    retomarVisitas: async (clienteId) => {
        await prisma.clientePausa.deleteMany({ where: { clienteUuid: clienteId } });
        return { ok: true, clienteId, pausadoAte: null };
    },

    // Clientes com visitas pausadas (pausadoAte > agora) — painel da gestão.
    listarPausados: async ({ vendedorId } = {}) => {
        const pausas = await prisma.clientePausa.findMany({
            where: {
                pausadoAte: { gt: new Date() },
                ...(vendedorId ? { cliente: { idVendedor: vendedorId } } : {}),
            },
            select: {
                clienteUuid: true, pausadoAte: true,
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, idVendedor: true, vendedor: { select: { id: true, nome: true } } } },
            },
            orderBy: { pausadoAte: 'asc' },
            take: TETO_LINHAS,
        });
        const ids = pausas.map(p => p.clienteUuid);
        const obsMap = new Map();
        if (ids.length) {
            const ats = await prisma.atendimento.findMany({
                where: { clienteId: { in: ids }, acaoKey: 'PAUSAR_VISITAS' },
                select: { clienteId: true, observacao: true, criadoEm: true },
                orderBy: { criadoEm: 'desc' },
            });
            for (const a of ats) if (!obsMap.has(a.clienteId)) obsMap.set(a.clienteId, a);
        }
        const data = pausas.map(p => ({
            UUID: p.cliente.UUID,
            Nome: p.cliente.Nome,
            NomeFantasia: p.cliente.NomeFantasia,
            End_Cidade: p.cliente.End_Cidade,
            idVendedor: p.cliente.idVendedor,
            vendedor: p.cliente.vendedor,
            pausadoAte: p.pausadoAte,
            observacao: obsMap.get(p.clienteUuid)?.observacao || null,
            pausadoEm: obsMap.get(p.clienteUuid)?.criadoEm || null,
        }));
        return { data, total: data.length, page: 1, limit: data.length, totalPages: 1, pausados: true };
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
