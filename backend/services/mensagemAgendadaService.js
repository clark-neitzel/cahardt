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

const gerarMensagemMeta = async (vendedor, dataAtual) => {
    const hoje = dataAtual || dayjs().tz(SP_TZ).format('YYYY-MM-DD');
    const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
    const diaHoje = dayjs.tz(hoje, SP_TZ).day();
    const siglaDia = DIAS_SIGLA[diaHoje];

    const dashboard = await metaService.calcularDashboardVendedor(vendedor.id, hoje);

    // Sem meta cadastrada — mensagem simplificada
    if (!dashboard.temMeta) {
        const partes = [
            `📊 *RELATÓRIO DE META — ${vendedor.nome}*`,
            `_${dayjs.tz(hoje, SP_TZ).format('DD/MM/YYYY')}_`,
            '',
            '⚠️ Nenhuma meta cadastrada para este mês.',
        ];
        return partes.join('\n');
    }

    const { metasAlvo, realizado, projecoes, resumoCalendario, progressoCidades, cidadesDeHoje } = dashboard;

    // Meta do dia = saldo restante ÷ dias úteis restantes
    const saldoRestante = Math.max(metasAlvo.mensal - realizado.totalVendidoMes, 0);
    const diasRestantes = Math.max(resumoCalendario.totalDiasMes - resumoCalendario.diasTrabalhadosMesAteHoje, 1);
    const metaDoDia = saldoRestante / diasRestantes;

    // Vendido hoje
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

    // Clientes agendados hoje (por Dia_de_venda)
    const [clientesAgendados, clientesComPedido] = await Promise.all([
        prisma.cliente.count({
            where: { idVendedor: vendedor.id, Ativo: true, Dia_de_venda: { contains: siglaDia } }
        }),
        (async () => {
            const ids = [...new Set(pedidosHoje.map(p => p.clienteId).filter(Boolean))];
            return ids.length;
        })()
    ]);

    // Cidades de hoje: meta vs realizado hoje
    const cidadesDeHojeSet = new Set(cidadesDeHoje || []);
    const realizadoHojePorCidade = {};
    pedidosHoje.forEach(p => {
        const cidade = p.cliente?.End_Cidade || 'Sem cidade';
        const valor = p.itens.reduce((s, i) => s + Number(i.valor || 0) * Number(i.quantidade || 0), 0);
        realizadoHojePorCidade[cidade] = (realizadoHojePorCidade[cidade] || 0) + valor;
    });

    const pct = metasAlvo.mensal > 0
        ? Math.round((realizado.totalVendidoMes / metasAlvo.mensal) * 100)
        : 0;

    const linhas = [
        `📊 *RELATÓRIO DE META — ${vendedor.nome}*`,
        `_${dayjs.tz(hoje, SP_TZ).locale('pt-br').format('dddd, DD/MM/YYYY').replace(/^\w/, c => c.toUpperCase())}_`,
        '',
        '━━━━━━━━━━━━━━━━━━━━',
        '🎯 *META DO MÊS*',
        `Meta: R$ ${fmt(metasAlvo.mensal)}`,
        `Vendido: R$ ${fmt(realizado.totalVendidoMes)} (${pct}%)`,
        `Projeção: R$ ${fmt(projecoes.mensal)}`,
        '',
        '📌 *HOJE VOCÊ PRECISA VENDER*',
        `Meta do dia: R$ ${fmt(metaDoDia)}`,
        `Vendido hoje: R$ ${fmt(vendidoHoje)}`,
        '',
        '👥 *CLIENTES DE HOJE*',
        `Agendados: ${clientesAgendados} clientes`,
        `Com pedido: ${clientesComPedido} clientes`,
    ];

    // Cidades de hoje
    const cidadesLinhas = [];
    if (cidadesDeHoje && cidadesDeHoje.length > 0) {
        const cidadesComMeta = progressoCidades.filter(pc => cidadesDeHojeSet.has(pc.cidade));
        const cidadesSemMeta = cidadesDeHoje.filter(c => !progressoCidades.find(pc => pc.cidade === c));

        if (cidadesComMeta.length > 0 || cidadesSemMeta.length > 0) {
            cidadesLinhas.push('', '🏙️ *CIDADES DE HOJE*');
            for (const pc of cidadesComMeta) {
                const realHoje = realizadoHojePorCidade[pc.cidade] || 0;
                // Meta da cidade para hoje = meta total ÷ total visitas no mês × 1
                const totalVisitasMes = Math.max(pc.diasSemana?.length > 0
                    ? pc.diasSemana.length * Math.ceil(resumoCalendario.totalDiasMes / 7)
                    : resumoCalendario.totalDiasMes, 1);
                const metaCidadeHoje = pc.meta / totalVisitasMes;
                cidadesLinhas.push(`• ${pc.cidade}: meta R$ ${fmt(metaCidadeHoje)} — vendido R$ ${fmt(realHoje)}`);
            }
            for (const cidade of cidadesSemMeta) {
                const realHoje = realizadoHojePorCidade[cidade] || 0;
                cidadesLinhas.push(`• ${cidade}: vendido R$ ${fmt(realHoje)}`);
            }
        }
    }

    linhas.push(...cidadesLinhas);
    linhas.push('━━━━━━━━━━━━━━━━━━━━');

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

    // Usado pelo disparo manual no controller
    gerarPreview: async (vendedorId) => {
        const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
        if (!vendedor) throw new Error('Vendedor não encontrado');
        return gerarMensagemMeta(vendedor);
    }
};

module.exports = mensagemAgendadaService;
