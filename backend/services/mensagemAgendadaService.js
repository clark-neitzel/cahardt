const prisma = require('../config/database');
const webhookService = require('./webhookService');
const metaService = require('./metaService');
const dayjs = require('dayjs');
const timezone = require('dayjs/plugin/timezone');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
dayjs.extend(timezone);

const SP_TZ = 'America/Sao_Paulo';
const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gerarBarra = (pct) => {
    const total = 10;
    const cheios = Math.min(Math.round((pct / 100) * total), total);
    return '▓'.repeat(cheios) + '░'.repeat(total - cheios) + ` ${pct}%`;
};

const gerarMensagemMeta = async (vendedor, dataAtual) => {
    const hoje = dataAtual || dayjs().tz(SP_TZ).format('YYYY-MM-DD');
    const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const diaHoje = dayjs.tz(hoje, SP_TZ).day();
    const siglaDia = DIAS_SIGLA[diaHoje];

    const dashboard = await metaService.calcularDashboardVendedor(vendedor.id, hoje);

    if (!dashboard.temMeta) {
        return [
            `📊 *RELATÓRIO DE META*`,
            `*${vendedor.nome}*`,
            `_${dayjs.tz(hoje, SP_TZ).format('DD/MM/YYYY')}_`,
            '',
            '⚠️ Nenhuma meta cadastrada para este mês.',
        ].join('\n');
    }

    const { metasAlvo, realizado, projecoes, resumoCalendario, progressoCidades, cidadesDeHoje } = dashboard;

    const saldoRestante = Math.max(metasAlvo.mensal - realizado.totalVendidoMes, 0);
    const diasRestantes = Math.max(resumoCalendario.totalDiasMes - resumoCalendario.diasTrabalhadosMesAteHoje, 1);
    const metaDoDia = saldoRestante / diasRestantes;

    const inicioDia = dayjs.tz(hoje, SP_TZ).startOf('day').toDate();
    const fimDia = dayjs.tz(hoje, SP_TZ).endOf('day').toDate();
    const pedidosHoje = await prisma.pedido.findMany({
        where: {
            vendedorId: vendedor.id,
            dataVenda: { gte: inicioDia, lte: fimDia },
            bonificacao: false,
            OR: [{ situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } }, { situacaoCA: null }]
        },
        include: { itens: true, cliente: { select: { End_Cidade: true } } }
    });
    const vendidoHoje = pedidosHoje.reduce((s, p) =>
        s + p.itens.reduce((si, i) => si + Number(i.valor || 0) * Number(i.quantidade || 0), 0), 0);

    const [clientesAgendadosHoje, clientesAgendadosPorCidade] = await Promise.all([
        prisma.cliente.count({
            where: { idVendedor: vendedor.id, Ativo: true, Dia_de_venda: { contains: siglaDia } }
        }),
        prisma.cliente.findMany({
            where: { idVendedor: vendedor.id, Ativo: true, Dia_de_venda: { contains: siglaDia }, End_Cidade: { not: null } },
            select: { End_Cidade: true }
        })
    ]);

    const agendadosPorCidade = {};
    clientesAgendadosPorCidade.forEach(c => {
        agendadosPorCidade[c.End_Cidade] = (agendadosPorCidade[c.End_Cidade] || 0) + 1;
    });

    const cidadesDeHojeSet = new Set(cidadesDeHoje || []);
    const realizadoHojePorCidade = {};
    const clientesComPedidoHojePorCidade = {};
    pedidosHoje.forEach(p => {
        const cidade = p.cliente?.End_Cidade || 'Sem cidade';
        const valor = p.itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade || 0), 0);
        realizadoHojePorCidade[cidade] = (realizadoHojePorCidade[cidade] || 0) + valor;
        if (p.clienteId) {
            if (!clientesComPedidoHojePorCidade[cidade]) clientesComPedidoHojePorCidade[cidade] = new Set();
            clientesComPedidoHojePorCidade[cidade].add(p.clienteId);
        }
    });

    const clientesComPedido = [...new Set(pedidosHoje.map(p => p.clienteId).filter(Boolean))].length;

    const pct = metasAlvo.mensal > 0
        ? Math.round((realizado.totalVendidoMes / metasAlvo.mensal) * 100)
        : 0;

    const barMes = gerarBarra(pct);
    const metaOk = vendidoHoje >= metaDoDia;

    const linhas = [
        `📊 *RELATÓRIO DE META*`,
        `*${vendedor.nome}*`,
        `_${dayjs.tz(hoje, SP_TZ).locale('pt-br').format('dddd, DD/MM/YYYY').replace(/^\w/, c => c.toUpperCase())}_`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '🎯 *META DO MÊS*',
        `Meta: R$ ${fmt(metasAlvo.mensal)}`,
        `Vendido: R$ ${fmt(realizado.totalVendidoMes)} *(${pct}%)*`,
        barMes,
        `Projeção: R$ ${fmt(projecoes.mensal)}`,
        '',
        '📌 *META DE HOJE*',
        `Compromisso: R$ ${fmt(metaDoDia)}`,
        `Vendido: R$ ${fmt(vendidoHoje)} ${metaOk ? '✅' : '⏳'}`,
        '',
        '👥 *CLIENTES DE HOJE*',
        `Agendados: ${clientesAgendadosHoje} | Com pedido: ${clientesComPedido}`,
    ];

    if (cidadesDeHoje && cidadesDeHoje.length > 0) {
        const cidadesComMeta = progressoCidades.filter(pc => cidadesDeHojeSet.has(pc.cidade));
        const cidadesSemMeta = cidadesDeHoje.filter(c => !progressoCidades.find(pc => pc.cidade === c));

        if (cidadesComMeta.length > 0 || cidadesSemMeta.length > 0) {
            linhas.push('', '🏙️ *CIDADES DE HOJE*');
            for (const pc of cidadesComMeta) {
                const realHoje = realizadoHojePorCidade[pc.cidade] || 0;
                const totalVisitasMes = Math.max(pc.diasSemana?.length > 0
                    ? pc.diasSemana.length * Math.ceil(resumoCalendario.totalDiasMes / 7)
                    : resumoCalendario.totalDiasMes, 1);
                const metaCidadeHoje = pc.meta / totalVisitasMes;
                const pctMes = pc.meta > 0 ? Math.round((pc.realizado / pc.meta) * 100) : 0;
                const agendados = agendadosPorCidade[pc.cidade] || 0;
                const comPedidoHoje = clientesComPedidoHojePorCidade[pc.cidade]?.size || 0;
                const cidadeOk = realHoje >= metaCidadeHoje;
                linhas.push(
                    '',
                    `📍 *${pc.cidade}*`,
                    `Hoje: R$ ${fmt(realHoje)} de R$ ${fmt(metaCidadeHoje)} ${cidadeOk ? '✅' : '⏳'}`,
                    `Mês: R$ ${fmt(pc.realizado)} de R$ ${fmt(pc.meta)} *(${pctMes}%)*`,
                    `Clientes: ${comPedidoHoje} de ${agendados} fizeram pedido`
                );
            }
            for (const cidade of cidadesSemMeta) {
                const realHoje = realizadoHojePorCidade[cidade] || 0;
                const agendados = agendadosPorCidade[cidade] || 0;
                const comPedidoHoje = clientesComPedidoHojePorCidade[cidade]?.size || 0;
                linhas.push(
                    '',
                    `📍 *${cidade}*`,
                    `Hoje: R$ ${fmt(realHoje)}`,
                    `Clientes: ${comPedidoHoje} de ${agendados} fizeram pedido`
                );
            }
        }
    }

    linhas.push('', '━━━━━━━━━━━━━━━━━━━━');
    return linhas.join('\n');
};

const gerarMensagemAtendimento = async (vendedor, dataAtual) => {
    const hoje = dataAtual || dayjs().tz(SP_TZ).format('YYYY-MM-DD');
    const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const diaHoje = dayjs.tz(hoje, SP_TZ).day();
    const siglaDia = DIAS_SIGLA[diaHoje];

    const dashboard = await metaService.calcularDashboardVendedor(vendedor.id, hoje);

    if (!dashboard.temMeta) {
        return [
            `📋 *ATENDIMENTO DE HOJE*`,
            `*${vendedor.nome}*`,
            `_${dayjs.tz(hoje, SP_TZ).format('DD/MM/YYYY')}_`,
            '',
            '⚠️ Nenhuma meta cadastrada para este mês.',
        ].join('\n');
    }

    const { cidadesDeHoje, progressoCidades } = dashboard;

    const [clientesHojeRaw, leadsHojeRaw] = await Promise.all([
        prisma.cliente.findMany({
            where: { idVendedor: vendedor.id, Ativo: true, Dia_de_venda: { contains: siglaDia }, End_Cidade: { not: null } },
            select: { End_Cidade: true }
        }),
        prisma.lead.findMany({
            where: {
                idVendedor: vendedor.id,
                etapa: { notIn: ['CONVERTIDO', 'PERDIDO'] },
                diasVisita: { contains: siglaDia }
            },
            select: { cidade: true }
        })
    ]);

    const agendadosHojePorCidade = {};
    clientesHojeRaw.forEach(c => {
        agendadosHojePorCidade[c.End_Cidade] = (agendadosHojePorCidade[c.End_Cidade] || 0) + 1;
    });

    const totalLeadsHoje = leadsHojeRaw.length;
    const leadsPorCidade = {};
    leadsHojeRaw.forEach(l => {
        const cidade = l.cidade || 'Sem cidade';
        leadsPorCidade[cidade] = (leadsPorCidade[cidade] || 0) + 1;
    });

    const inicioSemanaPast = dayjs.tz(hoje, SP_TZ).subtract(1, 'week').startOf('week').toDate();
    const fimSemanaPast    = dayjs.tz(hoje, SP_TZ).subtract(1, 'week').endOf('week').toDate();
    const pedidosSemanaPast = await prisma.pedido.findMany({
        where: {
            vendedorId: vendedor.id,
            dataVenda: { gte: inicioSemanaPast, lte: fimSemanaPast },
            bonificacao: false,
            OR: [{ situacaoCA: { notIn: ['CANCELADO', 'DEVOLVIDO'] } }, { situacaoCA: null }]
        },
        include: { cliente: { select: { End_Cidade: true } } }
    });
    const pedidoSemanaPastPorCidade = {};
    pedidosSemanaPast.forEach(p => {
        const cidade = p.cliente?.End_Cidade || 'Sem cidade';
        if (!pedidoSemanaPastPorCidade[cidade]) pedidoSemanaPastPorCidade[cidade] = new Set();
        if (p.clienteId) pedidoSemanaPastPorCidade[cidade].add(p.clienteId);
    });

    const cidadesSet = new Set(cidadesDeHoje || []);
    const cidadesComMeta = progressoCidades.filter(pc => cidadesSet.has(pc.cidade));
    const cidadesSemMeta = (cidadesDeHoje || []).filter(c => !progressoCidades.find(pc => pc.cidade === c));

    const linhas = [
        `📋 *ATENDIMENTO DE HOJE*`,
        `*${vendedor.nome}*`,
        `_${dayjs.tz(hoje, SP_TZ).locale('pt-br').format('dddd, DD/MM/YYYY').replace(/^\w/, c => c.toUpperCase())}_`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
    ];

    if (totalLeadsHoje > 0) {
        linhas.push(`🎯 Leads para visitar hoje: ${totalLeadsHoje}`);
    }

    if (cidadesComMeta.length === 0 && cidadesSemMeta.length === 0) {
        linhas.push('Nenhuma cidade agendada para hoje.');
    }

    for (const pc of cidadesComMeta) {
        const agendadosHoje = agendadosHojePorCidade[pc.cidade] || 0;
        const leadsHoje = leadsPorCidade[pc.cidade] || 0;
        const pedidoPastSize = pedidoSemanaPastPorCidade[pc.cidade]?.size || 0;
        const pctSemana = pc.metaSemana > 0 ? Math.round((pc.realizadoSemana / pc.metaSemana) * 100) : 0;
        const barSemana = gerarBarra(pctSemana);
        const saldoSemana = Math.max(pc.metaSemana - pc.realizadoSemana, 0);
        const metaAtingida = pc.metaSemana > 0 && pc.realizadoSemana >= pc.metaSemana;
        const clientesLinha = leadsHoje > 0
            ? `Clientes: ${agendadosHoje} | Leads: ${leadsHoje}`
            : `Clientes: ${agendadosHoje}`;
        linhas.push(
            '',
            `📍 *${pc.cidade}*`,
            clientesLinha,
            `Vendido semana: R$ ${fmt(pc.realizadoSemana)} de R$ ${fmt(pc.metaSemana)}`,
            barSemana,
            metaAtingida ? `*Meta da semana atingida ✅*` : `*Falta: R$ ${fmt(saldoSemana)}*`,
            `Sem. passada: ${pc.totalClientes} agendados | ${pedidoPastSize} pediram`
        );
    }

    for (const cidade of cidadesSemMeta) {
        const agendadosHoje = agendadosHojePorCidade[cidade] || 0;
        const leadsHoje = leadsPorCidade[cidade] || 0;
        const pedidoPastSize = pedidoSemanaPastPorCidade[cidade]?.size || 0;
        const clientesLinha = leadsHoje > 0
            ? `Clientes: ${agendadosHoje} | Leads: ${leadsHoje}`
            : `Clientes: ${agendadosHoje}`;
        linhas.push(
            '',
            `📍 *${cidade}*`,
            clientesLinha,
            `Sem. passada: ${pedidoPastSize} pediram`
        );
    }

    linhas.push('', '━━━━━━━━━━━━━━━━━━━━');
    return linhas.join('\n');
};

const mensagemAgendadaService = {
    enviarMeta: async (vendedor) => {
        if (!vendedor.telefone) {
            console.warn(`[MensagemAgendada] Vendedor ${vendedor.nome} sem telefone — pulando.`);
            return { ok: false, motivo: 'Sem telefone' };
        }
        try {
            const mensagem = await gerarMensagemMeta(vendedor);
            return await webhookService.enviarMensagemCustom(vendedor.telefone, vendedor.nome, mensagem);
        } catch (err) {
            console.error(`[MensagemAgendada] Erro ao enviar meta para ${vendedor.nome}:`, err.message);
            return { ok: false, motivo: err.message };
        }
    },

    enviarAtendimento: async (vendedor) => {
        if (!vendedor.telefone) {
            console.warn(`[MensagemAgendada] Vendedor ${vendedor.nome} sem telefone — pulando.`);
            return { ok: false, motivo: 'Sem telefone' };
        }
        try {
            const mensagem = await gerarMensagemAtendimento(vendedor);
            return await webhookService.enviarMensagemCustom(vendedor.telefone, vendedor.nome, mensagem);
        } catch (err) {
            console.error(`[MensagemAgendada] Erro ao enviar atendimento para ${vendedor.nome}:`, err.message);
            return { ok: false, motivo: err.message };
        }
    },

    gerarPreview: async (vendedorId, tipo = 'meta') => {
        const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
        if (!vendedor) throw new Error('Vendedor não encontrado');
        if (tipo === 'atendimento') return gerarMensagemAtendimento(vendedor);
        return gerarMensagemMeta(vendedor);
    }
};

module.exports = mensagemAgendadaService;
