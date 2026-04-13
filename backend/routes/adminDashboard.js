const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');

const num = (v) => Number(v || 0);

async function carregarPermissoesUsuario(userId) {
    const user = await prisma.vendedor.findUnique({ where: { id: userId } });
    const permissoesObj = user?.permissoes
        ? (typeof user.permissoes === 'string' ? JSON.parse(user.permissoes) : user.permissoes)
        : {};
    const isClark =
        user?.email === 'clarksonneitzel@gmail.com' ||
        (user?.login && user.login.toLowerCase().includes('clark'));
    return {
        user,
        permissoes: permissoesObj,
        isAdminMaster: !!permissoesObj?.admin || !!permissoesObj?.Pode_Ver_Dashboard_Admin || isClark,
        podeVerVendas: !!permissoesObj?.admin || !!permissoesObj?.Pode_Ver_Dashboard_Admin || !!permissoesObj?.Pode_Ver_Dashboard_Vendas || isClark,
    };
}

function valorPedido(p) {
    return p.itens.reduce((s, it) => s + num(it.valor) * num(it.quantidade), 0);
}

router.get('/', verificarAuth, async (req, res) => {
    try {
        const { isAdminMaster } = await carregarPermissoesUsuario(req.user.id);
        if (!isAdminMaster) return res.status(403).json({ error: 'Acesso negado.' });

        const agora = new Date();
        const startOfDay = new Date(agora); startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(agora); endOfDay.setHours(23, 59, 59, 999);

        // Início da semana = segunda-feira
        const startOfWeek = new Date(startOfDay);
        const dow = startOfWeek.getDay(); // 0=dom..6=sab
        const diffSeg = (dow === 0 ? -6 : 1 - dow);
        startOfWeek.setDate(startOfWeek.getDate() + diffSeg);

        const startOfMonth = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);
        const endOfMonth = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);
        const diaAtualMes = agora.getDate();
        const diasNoMes = endOfMonth.getDate();

        // Mesmo período mês anterior (dia 1 até diaAtualMes)
        const startOfPrevMonth = new Date(agora.getFullYear(), agora.getMonth() - 1, 1, 0, 0, 0, 0);
        const endPrevMonthSamePeriod = new Date(agora.getFullYear(), agora.getMonth() - 1, diaAtualMes, 23, 59, 59, 999);

        // Janela 30 dias
        const start30d = new Date(agora); start30d.setDate(start30d.getDate() - 30); start30d.setHours(0, 0, 0, 0);
        const start60d = new Date(agora); start60d.setDate(start60d.getDate() - 60); start60d.setHours(0, 0, 0, 0);

        // ============ OPERACIONAIS (mantidos) ============
        const [caixasAConferir, pedidosComErro, pedidosEspeciais] = await Promise.all([
            prisma.caixaDiario.count({ where: { status: 'CONFERIDO' } }),
            prisma.pedido.count({ where: { statusEnvio: 'ERRO' } }),
            prisma.pedido.count({ where: { especial: true, statusEnvio: { in: ['ABERTO', 'ENVIAR'] } } }),
        ]);

        // ============ VENDAS POR PERÍODO ============
        // Carrega pedidos do mês corrente e mês anterior (mesmo período) - exclui cancelados/bonificação
        const baseWherePedido = {
            statusEnvio: { notIn: ['CANCELADO'] },
            situacaoCA: { not: 'CANCELADO' },
            bonificacao: false,
        };

        const pedidosMesAtual = await prisma.pedido.findMany({
            where: { ...baseWherePedido, dataVenda: { gte: startOfMonth, lte: endOfMonth } },
            include: { itens: { select: { valor: true, quantidade: true } } },
        });
        const pedidosMesAnteriorMesmoPeriodo = await prisma.pedido.findMany({
            where: { ...baseWherePedido, dataVenda: { gte: startOfPrevMonth, lte: endPrevMonthSamePeriod } },
            include: { itens: { select: { valor: true, quantidade: true } } },
        });

        // Devoluções no mês corrente / mês anterior (mesmo período)
        const [devsMesAtual, devsMesAnterior] = await Promise.all([
            prisma.devolucao.aggregate({
                _sum: { valorTotal: true },
                where: { status: 'ATIVA', dataDevolucao: { gte: startOfMonth, lte: endOfMonth } },
            }),
            prisma.devolucao.aggregate({
                _sum: { valorTotal: true },
                where: { status: 'ATIVA', dataDevolucao: { gte: startOfPrevMonth, lte: endPrevMonthSamePeriod } },
            }),
        ]);

        let vendasBrutasHoje = 0, vendasBrutasSemana = 0, vendasBrutasMes = 0, qtdPedidosMes = 0;
        for (const p of pedidosMesAtual) {
            const v = valorPedido(p);
            vendasBrutasMes += v;
            qtdPedidosMes += 1;
            if (p.dataVenda >= startOfWeek) vendasBrutasSemana += v;
            if (p.dataVenda >= startOfDay) vendasBrutasHoje += v;
        }
        const vendasBrutasMesAnt = pedidosMesAnteriorMesmoPeriodo.reduce((s, p) => s + valorPedido(p), 0);

        const devolucaoMes = num(devsMesAtual._sum.valorTotal);
        const devolucaoMesAnt = num(devsMesAnterior._sum.valorTotal);

        const vendasLiquidasMes = vendasBrutasMes - devolucaoMes;
        const vendasLiquidasMesAnt = vendasBrutasMesAnt - devolucaoMesAnt;
        const variacaoMesPct = vendasLiquidasMesAnt > 0
            ? ((vendasLiquidasMes - vendasLiquidasMesAnt) / vendasLiquidasMesAnt) * 100
            : null;

        // Projeção linear simples: realizado / dia atual * dias do mês
        const projecaoMes = diaAtualMes > 0 ? (vendasLiquidasMes / diaAtualMes) * diasNoMes : 0;
        const ticketMedio = qtdPedidosMes > 0 ? vendasLiquidasMes / qtdPedidosMes : 0;

        // ============ OPERAÇÃO DO DIA ============
        const atendimentosHoje = await prisma.atendimento.findMany({
            where: { criadoEm: { gte: startOfDay, lte: endOfDay } },
            select: { clienteId: true, leadId: true, pedidoId: true, transferidoParaId: true, transferenciaFinalizada: true },
        });
        const totalAtendimentos = atendimentosHoje.length;

        // Pedidos lançados hoje (createdAt) - usado p/ cross-check com atendimentos
        const pedidosCriadosHoje = await prisma.pedido.findMany({
            where: { ...baseWherePedido, createdAt: { gte: startOfDay, lte: endOfDay } },
            select: { clienteId: true },
        });
        const clientesComPedidoHoje = new Set(pedidosCriadosHoje.map(p => p.clienteId));
        const pedidosHojeCount = pedidosCriadosHoje.length;

        // Atendimentos com / sem venda - cruza por clienteId (atendimento.pedidoId raramente é setado)
        let atendimentosComPedido = 0, atendimentosSemPedido = 0;
        for (const a of atendimentosHoje) {
            if (a.pedidoId || (a.clienteId && clientesComPedidoHoje.has(a.clienteId))) atendimentosComPedido++;
            else atendimentosSemPedido++;
        }
        const transferenciasPendentes = atendimentosHoje.filter(a => a.transferidoParaId && !a.transferenciaFinalizada).length;

        // Clientes ativos com Dia_de_venda hoje que NÃO foram atendidos (atend, pedido ou entrega)
        const DIAS_SIGLA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
        const siglaDoDia = DIAS_SIGLA[agora.getDay()];
        const clientesDoDia = await prisma.cliente.findMany({
            where: {
                Ativo: true,
                Dia_de_venda: { contains: siglaDoDia, mode: 'insensitive' },
            },
            select: { UUID: true, Dia_de_venda: true },
        });
        const entregasHojeClienteIds = await prisma.pedido.findMany({
            where: { dataEntrega: { gte: startOfDay, lte: endOfDay }, statusEntrega: { not: 'PENDENTE' } },
            select: { clienteId: true },
        });
        const atendidosHojeIds = new Set([
            ...atendimentosHoje.map(a => a.clienteId).filter(Boolean),
            ...pedidosCriadosHoje.map(p => p.clienteId),
            ...entregasHojeClienteIds.map(p => p.clienteId).filter(Boolean),
        ]);
        const clientesNaoAtendidos = clientesDoDia
            .filter(c => (c.Dia_de_venda || '').toUpperCase().split(',').map(s => s.trim()).includes(siglaDoDia))
            .filter(c => !atendidosHojeIds.has(c.UUID))
            .length;

        // Distinct clientes atendidos hoje (apenas via Atendimento)
        const clientesAtendidos = new Set(atendimentosHoje.map(a => a.clienteId).filter(Boolean)).size;

        // ============ LEADS ============
        const [leadsNovosHoje, leadsAtivos] = await Promise.all([
            prisma.lead.count({ where: { createdAt: { gte: startOfDay, lte: endOfDay } } }),
            prisma.lead.findMany({
                where: { etapa: { notIn: ['CONVERTIDO', 'PERDIDO'] } },
                select: { id: true, proximaVisita: true },
            }),
        ]);
        const leadsAtendidosIds = new Set(atendimentosHoje.map(a => a.leadId).filter(Boolean));
        const leadsAtendidosHoje = leadsAtendidosIds.size;
        const leadsNaoAtendidos = leadsAtivos.filter(l =>
            l.proximaVisita && l.proximaVisita <= endOfDay && !leadsAtendidosIds.has(l.id)
        ).length;

        // ============ DINHEIRO RECEBIDO NO CAIXA HOJE ============
        const pagamentosHoje = await prisma.pedidoPagamentoReal.findMany({
            where: { createdAt: { gte: startOfDay, lte: endOfDay } },
            select: { valor: true, formaPagamentoNome: true },
        });
        const dinheiroRecebidoHoje = pagamentosHoje
            .filter(p => (p.formaPagamentoNome || '').toLowerCase().includes('dinheiro'))
            .reduce((s, p) => s + num(p.valor), 0);

        // ============ TOP 10 PRODUTOS (30d, líquido) ============
        const itensUltimos30 = await prisma.pedidoItem.findMany({
            where: { pedido: { ...baseWherePedido, dataVenda: { gte: start30d } } },
            select: {
                produtoId: true, quantidade: true, valor: true,
                produto: { select: { nome: true, codigo: true, custoMedio: true, estoqueDisponivel: true, estoqueMinimo: true } },
            },
        });
        const devItens30 = await prisma.devolucaoItem.findMany({
            where: { devolucao: { status: 'ATIVA', dataDevolucao: { gte: start30d } } },
            select: { produtoId: true, valorTotal: true, quantidade: true },
        });
        const prodMap = new Map();
        for (const it of itensUltimos30) {
            const k = it.produtoId;
            const cur = prodMap.get(k) || { produtoId: k, nome: it.produto?.nome, codigo: it.produto?.codigo, qtd: 0, valorBruto: 0, custoTotal: 0, estoqueDisponivel: num(it.produto?.estoqueDisponivel), estoqueMinimo: num(it.produto?.estoqueMinimo) };
            const q = num(it.quantidade);
            cur.qtd += q;
            cur.valorBruto += num(it.valor) * q;
            cur.custoTotal += num(it.produto?.custoMedio) * q;
            prodMap.set(k, cur);
        }
        for (const d of devItens30) {
            const cur = prodMap.get(d.produtoId);
            if (cur) { cur.valorBruto -= num(d.valorTotal); cur.qtd -= num(d.quantidade); }
        }
        const topProdutos = [...prodMap.values()]
            .map(p => ({
                produtoId: p.produtoId,
                nome: p.nome, codigo: p.codigo,
                quantidade: p.qtd,
                valorLiquido: p.valorBruto,
                margemValor: p.valorBruto - p.custoTotal,
                margemPct: p.valorBruto > 0 ? ((p.valorBruto - p.custoTotal) / p.valorBruto) * 100 : null,
                rupturaRisco: p.estoqueDisponivel < p.estoqueMinimo,
                estoqueDisponivel: p.estoqueDisponivel,
                estoqueMinimo: p.estoqueMinimo,
            }))
            .sort((a, b) => b.valorLiquido - a.valorLiquido)
            .slice(0, 10);

        // ============ TOP 10 CLIENTES (30d, líquido) ============
        const pedidos30d = await prisma.pedido.findMany({
            where: { ...baseWherePedido, dataVenda: { gte: start30d } },
            select: { clienteId: true, cliente: { select: { Nome: true, NomeFantasia: true, Codigo: true } }, itens: { select: { valor: true, quantidade: true } } },
        });
        const cliMap = new Map();
        for (const p of pedidos30d) {
            const v = valorPedido(p);
            const k = p.clienteId;
            const cur = cliMap.get(k) || { clienteId: k, nome: p.cliente?.NomeFantasia || p.cliente?.Nome, codigo: p.cliente?.Codigo, valor: 0, pedidos: 0 };
            cur.valor += v; cur.pedidos += 1;
            cliMap.set(k, cur);
        }
        const devsPorCliente30 = await prisma.devolucao.groupBy({
            by: ['clienteId'],
            _sum: { valorTotal: true },
            where: { status: 'ATIVA', dataDevolucao: { gte: start30d } },
        });
        for (const d of devsPorCliente30) {
            const cur = cliMap.get(d.clienteId);
            if (cur) cur.valor -= num(d._sum.valorTotal);
        }
        const topClientes = [...cliMap.values()]
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10);

        // ============ CLIENTES INATIVOS (ativo + sem pedido >45d) ============
        const limiteInatividade = new Date(agora); limiteInatividade.setDate(limiteInatividade.getDate() - 45);
        const ultimosPedidosPorCliente = await prisma.pedido.groupBy({
            by: ['clienteId'],
            _max: { dataVenda: true },
            where: baseWherePedido,
        });
        const mapaUltimo = new Map(ultimosPedidosPorCliente.map(r => [r.clienteId, r._max.dataVenda]));
        const clientesAtivos = await prisma.cliente.findMany({
            where: { Ativo: true },
            select: { UUID: true, Nome: true, NomeFantasia: true, Codigo: true },
        });
        const inativos = [];
        for (const c of clientesAtivos) {
            const ultimo = mapaUltimo.get(c.UUID);
            if (ultimo && ultimo < limiteInatividade) {
                inativos.push({ clienteId: c.UUID, nome: c.NomeFantasia || c.Nome, codigo: c.Codigo, ultimoPedido: ultimo });
            }
        }
        inativos.sort((a, b) => a.ultimoPedido - b.ultimoPedido); // mais antigos primeiro
        const clientesInativosCount = inativos.length;
        const clientesInativosTop = inativos.slice(0, 10);

        // ============ INADIMPLÊNCIA (parcelas vencidas em aberto) ============
        const inadimplencia = await prisma.parcela.aggregate({
            _sum: { valor: true },
            _count: { _all: true },
            where: { status: 'PENDENTE', dataVencimento: { lt: startOfDay } },
        });

        // ============ PRODUTOS EM QUEDA (top 5: 30d vs 30-60d) ============
        const itens30a60 = await prisma.pedidoItem.findMany({
            where: { pedido: { ...baseWherePedido, dataVenda: { gte: start60d, lt: start30d } } },
            select: { produtoId: true, quantidade: true, valor: true, produto: { select: { nome: true } } },
        });
        const prodPrev = new Map();
        for (const it of itens30a60) {
            const k = it.produtoId;
            const cur = prodPrev.get(k) || { produtoId: k, nome: it.produto?.nome, valor: 0 };
            cur.valor += num(it.valor) * num(it.quantidade);
            prodPrev.set(k, cur);
        }
        const emQueda = [];
        for (const [k, prev] of prodPrev.entries()) {
            const atual = prodMap.get(k)?.valorBruto || 0;
            if (prev.valor < 50) continue; // ignora produtos sem relevância
            const drop = (atual - prev.valor) / prev.valor;
            if (drop < -0.30) {
                emQueda.push({ produtoId: k, nome: prev.nome, vendas30dAnterior: prev.valor, vendas30dAtual: atual, variacaoPct: drop * 100 });
            }
        }
        emQueda.sort((a, b) => a.variacaoPct - b.variacaoPct);
        const produtosEmQueda = emQueda.slice(0, 5);

        // ============ ENTREGAS HOJE (mantido) ============
        const entregasHoje = await prisma.pedido.findMany({
            where: { dataEntrega: { gte: startOfDay, lte: endOfDay }, statusEntrega: { not: 'PENDENTE' } },
            include: { pagamentosReais: { select: { valor: true } } },
        });
        const valorEntregueHoje = entregasHoje.reduce((s, p) => s + p.pagamentosReais.reduce((a, x) => a + num(x.valor), 0), 0);

        res.json({
            // operacional
            caixasAConferir, pedidosComErro, pedidosEspeciais, valorEntregueHoje,
            // vendas
            vendas: {
                hoje: vendasBrutasHoje,
                semana: vendasBrutasSemana,
                mes: vendasLiquidasMes,
                mesBruto: vendasBrutasMes,
                devolucaoMes,
                projecaoMes,
                ticketMedio,
                qtdPedidosMes,
                mesAnteriorMesmoPeriodo: vendasLiquidasMesAnt,
                variacaoMesPct,
                diaAtualMes, diasNoMes,
            },
            // operação dia (mantém vendasHojeNum p/ compat com componente atual)
            vendasHojeNum: vendasBrutasHoje,
            operacaoDia: {
                totalAtendimentos,
                clientesAtendidos,
                atendimentosComPedido,
                atendimentosSemPedido,
                transferenciasPendentes,
                pedidosHoje: pedidosHojeCount,
                clientesNaoAtendidos,
                leadsNovosHoje,
                leadsAtendidosHoje,
                leadsNaoAtendidos,
                dinheiroRecebidoHoje,
            },
            topProdutos,
            topClientes,
            clientesInativos: { total: clientesInativosCount, top: clientesInativosTop },
            inadimplencia: { total: num(inadimplencia._sum.valor), parcelas: inadimplencia._count._all },
            produtosEmQueda,
        });
    } catch (error) {
        console.error('Erro no admin dashboard:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard.' });
    }
});

module.exports = router;
