const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');

const num = (v) => Number(v || 0);
const TZ = 'America/Sao_Paulo';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isoNowTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const dateFromISOStart = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const dateFromISOEnd = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
};
const toISODate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const addDays = (d, n) => {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
};
const startOfWeekMonday = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=dom..6=sab
    const diffSeg = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diffSeg);
    return d;
};
const listIsoDays = (startDate, endDate) => {
    const dias = [];
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    while (cur <= endDate) {
        dias.push(toISODate(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dias;
};
const parseJsonArray = (val) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};
const normalizeCidade = (cidade) => {
    if (typeof cidade !== 'string') return 'Sem cidade';
    const limpa = cidade.trim();
    return limpa || 'Sem cidade';
};
const parseConfigArray = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

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

router.get('/weekly-brief', verificarAuth, async (req, res) => {
    try {
        const { user, podeVerVendas } = await carregarPermissoesUsuario(req.user.id);
        if (!podeVerVendas) return res.status(403).json({ error: 'Acesso negado.' });

        const dataBaseISO = isISODate(req.query.dataBase) ? req.query.dataBase : isoNowTZ();
        const vendedorIdFiltro = typeof req.query.vendedorId === 'string' && req.query.vendedorId.trim()
            ? req.query.vendedorId.trim()
            : null;

        const dataBaseStart = dateFromISOStart(dataBaseISO);
        const dataBaseEnd = dateFromISOEnd(dataBaseISO);

        const semanaAtualInicio = startOfWeekMonday(dataBaseStart);
        const semanaAtualFim = dateFromISOEnd(toISODate(addDays(semanaAtualInicio, 6)));
        const janelaAtualFim = dataBaseEnd < semanaAtualFim ? dataBaseEnd : semanaAtualFim;
        const diasJanela = Math.max(1, Math.floor((janelaAtualFim - semanaAtualInicio) / ONE_DAY_MS) + 1);

        const semanaAnteriorInicio = addDays(semanaAtualInicio, -7);
        semanaAnteriorInicio.setHours(0, 0, 0, 0);
        const semanaAnteriorFim = dateFromISOEnd(toISODate(addDays(semanaAnteriorInicio, 6)));
        const janelaAnteriorFim = dateFromISOEnd(toISODate(addDays(semanaAnteriorInicio, diasJanela - 1)));

        const baseWherePedido = {
            situacaoCA: 'FATURADO',
            bonificacao: false,
            ...(vendedorIdFiltro ? { vendedorId: vendedorIdFiltro } : {}),
        };
        const wherePedidoAtual = { ...baseWherePedido, dataVenda: { gte: semanaAtualInicio, lte: janelaAtualFim } };
        const wherePedidoAnterior = { ...baseWherePedido, dataVenda: { gte: semanaAnteriorInicio, lte: janelaAnteriorFim } };

        const whereDevolucaoAtual = {
            status: 'ATIVA',
            dataDevolucao: { gte: semanaAtualInicio, lte: janelaAtualFim },
            ...(vendedorIdFiltro ? { pedidoOriginal: { vendedorId: vendedorIdFiltro } } : {}),
        };
        const whereDevolucaoAnterior = {
            status: 'ATIVA',
            dataDevolucao: { gte: semanaAnteriorInicio, lte: janelaAnteriorFim },
            ...(vendedorIdFiltro ? { pedidoOriginal: { vendedorId: vendedorIdFiltro } } : {}),
        };

        const [pedidosAtual, pedidosAnterior, devolucaoAtualAgg, devolucaoAnteriorAgg, devolucoesAtualPorVendedor, devolucoesAnteriorPorVendedor, itensDevolucaoAtual, itensDevolucaoAnterior, devolucaoClienteAtual, devolucaoClienteAnterior, metasSemana, categoriasVendasConfig, inadimplencia, pedidosComErro, pedidosEspeciais, transferenciasPendentes, pendenciasAbertas, caixasAConferir] = await Promise.all([
            prisma.pedido.findMany({
                where: wherePedidoAtual,
                select: {
                    id: true,
                    vendedorId: true,
                    clienteId: true,
                    vendedor: { select: { nome: true } },
                    cliente: { select: { Nome: true, NomeFantasia: true, Codigo: true, End_Cidade: true } },
                    itens: { select: { produtoId: true, valor: true, quantidade: true, produto: { select: { nome: true, codigo: true, categoria: true, ativo: true } } } },
                },
            }),
            prisma.pedido.findMany({
                where: wherePedidoAnterior,
                select: {
                    id: true,
                    vendedorId: true,
                    clienteId: true,
                    vendedor: { select: { nome: true } },
                    cliente: { select: { Nome: true, NomeFantasia: true, Codigo: true, End_Cidade: true } },
                    itens: { select: { produtoId: true, valor: true, quantidade: true, produto: { select: { nome: true, codigo: true, categoria: true, ativo: true } } } },
                },
            }),
            prisma.devolucao.aggregate({ _sum: { valorTotal: true }, where: whereDevolucaoAtual }),
            prisma.devolucao.aggregate({ _sum: { valorTotal: true }, where: whereDevolucaoAnterior }),
            prisma.devolucao.findMany({
                where: whereDevolucaoAtual,
                select: {
                    valorTotal: true,
                    pedidoOriginal: {
                        select: {
                            vendedorId: true,
                            cliente: { select: { End_Cidade: true } },
                        },
                    },
                },
            }),
            prisma.devolucao.findMany({
                where: whereDevolucaoAnterior,
                select: {
                    valorTotal: true,
                    pedidoOriginal: {
                        select: {
                            vendedorId: true,
                            cliente: { select: { End_Cidade: true } },
                        },
                    },
                },
            }),
            prisma.devolucaoItem.findMany({
                where: { devolucao: whereDevolucaoAtual },
                select: { produtoId: true, valorTotal: true },
            }),
            prisma.devolucaoItem.findMany({
                where: { devolucao: whereDevolucaoAnterior },
                select: { produtoId: true, valorTotal: true },
            }),
            prisma.devolucao.groupBy({
                by: ['clienteId'],
                _sum: { valorTotal: true },
                where: whereDevolucaoAtual,
            }),
            prisma.devolucao.groupBy({
                by: ['clienteId'],
                _sum: { valorTotal: true },
                where: whereDevolucaoAnterior,
            }),
            prisma.metaMensalVendedor.findMany({
                where: {
                    mesReferencia: {
                        in: [...new Set(listIsoDays(semanaAtualInicio, semanaAtualFim).map((d) => d.slice(0, 7)))],
                    },
                    ...(vendedorIdFiltro ? { vendedorId: vendedorIdFiltro } : {}),
                },
                include: { vendedor: { select: { id: true, nome: true } } },
            }),
            prisma.appConfig.findUnique({
                where: { key: 'categorias_vendas' },
                select: { value: true },
            }),
            prisma.parcela.aggregate({
                _sum: { valor: true },
                _count: { _all: true },
                where: {
                    status: 'PENDENTE',
                    dataVencimento: { lt: dateFromISOStart(isoNowTZ()) },
                    ...(vendedorIdFiltro ? { contaReceber: { pedido: { vendedorId: vendedorIdFiltro } } } : {}),
                },
            }),
            prisma.pedido.count({ where: { statusEnvio: 'ERRO', ...(vendedorIdFiltro ? { vendedorId: vendedorIdFiltro } : {}) } }),
            prisma.pedido.count({ where: { especial: true, statusEnvio: { in: ['ABERTO', 'ENVIAR'] }, ...(vendedorIdFiltro ? { vendedorId: vendedorIdFiltro } : {}) } }),
            prisma.atendimento.count({
                where: {
                    transferidoParaId: { not: null },
                    transferenciaFinalizada: false,
                    ...(vendedorIdFiltro ? { OR: [{ idVendedor: vendedorIdFiltro }, { transferidoParaId: vendedorIdFiltro }] } : {}),
                },
            }),
            prisma.atendimento.count({
                where: {
                    OR: [{ alertaVisualAtivo: true }, { dataRetorno: { lte: semanaAtualFim } }],
                    ...(vendedorIdFiltro ? { idVendedor: vendedorIdFiltro } : {}),
                },
            }),
            prisma.caixaDiario.count({ where: { status: 'CONFERIDO', ...(vendedorIdFiltro ? { vendedorId: vendedorIdFiltro } : {}) } }),
        ]);

        const aggAtual = {
            bruto: 0,
            pedidos: pedidosAtual.length,
            vendedores: new Map(),
            produtos: new Map(),
            clientes: new Map(),
            cidades: new Map(),
        };
        for (const p of pedidosAtual) {
            const valorPed = valorPedido(p);
            aggAtual.bruto += valorPed;
            const cidade = normalizeCidade(p.cliente?.End_Cidade);

            if (p.vendedorId) {
                const vend = aggAtual.vendedores.get(p.vendedorId) || {
                    vendedorId: p.vendedorId,
                    nome: p.vendedor?.nome || 'Sem vendedor',
                    bruto: 0,
                    pedidos: 0,
                };
                vend.bruto += valorPed;
                vend.pedidos += 1;
                aggAtual.vendedores.set(p.vendedorId, vend);
            }

            if (p.clienteId) {
                const cli = aggAtual.clientes.get(p.clienteId) || {
                    clienteId: p.clienteId,
                    nome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'Cliente sem nome',
                    codigo: p.cliente?.Codigo || null,
                    valor: 0,
                    pedidos: 0,
                };
                cli.valor += valorPed;
                cli.pedidos += 1;
                aggAtual.clientes.set(p.clienteId, cli);
            }

            const cidadeAtual = aggAtual.cidades.get(cidade) || {
                cidade,
                valor: 0,
                pedidos: 0,
                clientes: new Set(),
                vendedores: new Map(),
            };
            cidadeAtual.valor += valorPed;
            cidadeAtual.pedidos += 1;
            if (p.clienteId) cidadeAtual.clientes.add(p.clienteId);
            if (p.vendedorId) {
                const vendCidade = cidadeAtual.vendedores.get(p.vendedorId) || {
                    vendedorId: p.vendedorId,
                    nome: p.vendedor?.nome || 'Sem vendedor',
                    valor: 0,
                    pedidos: 0,
                    clientes: new Set(),
                };
                vendCidade.valor += valorPed;
                vendCidade.pedidos += 1;
                if (p.clienteId) vendCidade.clientes.add(p.clienteId);
                cidadeAtual.vendedores.set(p.vendedorId, vendCidade);
            }
            aggAtual.cidades.set(cidade, cidadeAtual);

            for (const it of p.itens) {
                const valorItem = num(it.valor) * num(it.quantidade);
                const prod = aggAtual.produtos.get(it.produtoId) || {
                    produtoId: it.produtoId,
                    nome: it.produto?.nome || 'Produto sem nome',
                    codigo: it.produto?.codigo || null,
                    categoria: it.produto?.categoria || null,
                    ativo: it.produto?.ativo !== false,
                    valorLiquido: 0,
                    quantidade: 0,
                };
                prod.valorLiquido += valorItem;
                prod.quantidade += num(it.quantidade);
                aggAtual.produtos.set(it.produtoId, prod);
            }
        }

        const aggAnterior = {
            bruto: 0,
            pedidos: pedidosAnterior.length,
            vendedores: new Map(),
            produtos: new Map(),
            clientes: new Map(),
            cidades: new Map(),
        };
        for (const p of pedidosAnterior) {
            const valorPed = valorPedido(p);
            aggAnterior.bruto += valorPed;
            const cidade = normalizeCidade(p.cliente?.End_Cidade);

            if (p.vendedorId) {
                const vend = aggAnterior.vendedores.get(p.vendedorId) || {
                    vendedorId: p.vendedorId,
                    nome: p.vendedor?.nome || 'Sem vendedor',
                    bruto: 0,
                    pedidos: 0,
                };
                vend.bruto += valorPed;
                vend.pedidos += 1;
                aggAnterior.vendedores.set(p.vendedorId, vend);
            }

            if (p.clienteId) {
                const cli = aggAnterior.clientes.get(p.clienteId) || {
                    clienteId: p.clienteId,
                    nome: p.cliente?.NomeFantasia || p.cliente?.Nome || 'Cliente sem nome',
                    codigo: p.cliente?.Codigo || null,
                    valor: 0,
                    pedidos: 0,
                };
                cli.valor += valorPed;
                cli.pedidos += 1;
                aggAnterior.clientes.set(p.clienteId, cli);
            }

            const cidadeAnterior = aggAnterior.cidades.get(cidade) || {
                cidade,
                valor: 0,
                pedidos: 0,
                clientes: new Set(),
            };
            cidadeAnterior.valor += valorPed;
            cidadeAnterior.pedidos += 1;
            if (p.clienteId) cidadeAnterior.clientes.add(p.clienteId);
            aggAnterior.cidades.set(cidade, cidadeAnterior);

            for (const it of p.itens) {
                const valorItem = num(it.valor) * num(it.quantidade);
                const prod = aggAnterior.produtos.get(it.produtoId) || {
                    produtoId: it.produtoId,
                    nome: it.produto?.nome || 'Produto sem nome',
                    codigo: it.produto?.codigo || null,
                    categoria: it.produto?.categoria || null,
                    ativo: it.produto?.ativo !== false,
                    valorLiquido: 0,
                    quantidade: 0,
                };
                prod.valorLiquido += valorItem;
                prod.quantidade += num(it.quantidade);
                aggAnterior.produtos.set(it.produtoId, prod);
            }
        }

        const devolucaoVendAtualMap = new Map();
        const devolucaoCidadeAtualMap = new Map();
        for (const dev of devolucoesAtualPorVendedor) {
            const vendId = dev.pedidoOriginal?.vendedorId;
            if (!vendId) continue;
            devolucaoVendAtualMap.set(vendId, (devolucaoVendAtualMap.get(vendId) || 0) + num(dev.valorTotal));
            const cidade = normalizeCidade(dev.pedidoOriginal?.cliente?.End_Cidade);
            devolucaoCidadeAtualMap.set(cidade, (devolucaoCidadeAtualMap.get(cidade) || 0) + num(dev.valorTotal));
        }
        const devolucaoVendAnteriorMap = new Map();
        const devolucaoCidadeAnteriorMap = new Map();
        for (const dev of devolucoesAnteriorPorVendedor) {
            const vendId = dev.pedidoOriginal?.vendedorId;
            if (!vendId) continue;
            devolucaoVendAnteriorMap.set(vendId, (devolucaoVendAnteriorMap.get(vendId) || 0) + num(dev.valorTotal));
            const cidade = normalizeCidade(dev.pedidoOriginal?.cliente?.End_Cidade);
            devolucaoCidadeAnteriorMap.set(cidade, (devolucaoCidadeAnteriorMap.get(cidade) || 0) + num(dev.valorTotal));
        }

        for (const item of itensDevolucaoAtual) {
            const prod = aggAtual.produtos.get(item.produtoId);
            if (prod) prod.valorLiquido -= num(item.valorTotal);
        }
        for (const item of itensDevolucaoAnterior) {
            const prod = aggAnterior.produtos.get(item.produtoId);
            if (prod) prod.valorLiquido -= num(item.valorTotal);
        }

        for (const dev of devolucaoClienteAtual) {
            const cli = aggAtual.clientes.get(dev.clienteId);
            if (cli) cli.valor -= num(dev._sum.valorTotal);
        }
        for (const dev of devolucaoClienteAnterior) {
            const cli = aggAnterior.clientes.get(dev.clienteId);
            if (cli) cli.valor -= num(dev._sum.valorTotal);
        }

        for (const [cidade, valorDevolvido] of devolucaoCidadeAtualMap.entries()) {
            const cidadeAtual = aggAtual.cidades.get(cidade);
            if (cidadeAtual) cidadeAtual.valor -= valorDevolvido;
        }
        for (const [cidade, valorDevolvido] of devolucaoCidadeAnteriorMap.entries()) {
            const cidadeAnterior = aggAnterior.cidades.get(cidade);
            if (cidadeAnterior) cidadeAnterior.valor -= valorDevolvido;
        }

        const devolucaoAtual = num(devolucaoAtualAgg._sum.valorTotal);
        const devolucaoAnterior = num(devolucaoAnteriorAgg._sum.valorTotal);
        const vendasLiquidasAtual = aggAtual.bruto - devolucaoAtual;
        const vendasLiquidasAnterior = aggAnterior.bruto - devolucaoAnterior;

        const diasSemanaDecorridos = Math.max(1, Math.floor((janelaAtualFim - semanaAtualInicio) / ONE_DAY_MS) + 1);
        const diasSemanaTotal = 7;

        const diasSemanaAtualISO = listIsoDays(semanaAtualInicio, semanaAtualFim);
        const metasSemanaMap = new Map();
        for (const meta of metasSemana) {
            const diasTrabalho = parseJsonArray(meta.diasTrabalho).map(String);
            if (!Array.isArray(diasTrabalho) || diasTrabalho.length === 0) continue;
            const diasTrabalhoSet = new Set(diasTrabalho);
            const diasSemanaAtivos = diasSemanaAtualISO.filter((dia) => diasTrabalhoSet.has(dia)).length;
            const valorDia = num(meta.valorMensal) / diasTrabalho.length;
            const metaSemana = valorDia * diasSemanaAtivos;

            const current = metasSemanaMap.get(meta.vendedorId) || {
                vendedorId: meta.vendedorId,
                nome: meta.vendedor?.nome || 'Sem nome',
                metaSemanal: 0,
            };
            current.metaSemanal += metaSemana;
            metasSemanaMap.set(meta.vendedorId, current);
        }

        const allVendedoresIds = new Set([
            ...aggAtual.vendedores.keys(),
            ...aggAnterior.vendedores.keys(),
            ...metasSemanaMap.keys(),
        ]);

        const rankingVendedores = [...allVendedoresIds].map((vendId) => {
            const atual = aggAtual.vendedores.get(vendId);
            const anterior = aggAnterior.vendedores.get(vendId);
            const metaSemanal = metasSemanaMap.get(vendId)?.metaSemanal || 0;

            const brutoAtual = atual?.bruto || 0;
            const brutoAnterior = anterior?.bruto || 0;
            const devAtualVend = devolucaoVendAtualMap.get(vendId) || 0;
            const devAnteriorVend = devolucaoVendAnteriorMap.get(vendId) || 0;
            const realizadoAtual = brutoAtual - devAtualVend;
            const realizadoAnterior = brutoAnterior - devAnteriorVend;
            const pedidosAtualVend = atual?.pedidos || 0;
            const ticketAtualVend = pedidosAtualVend > 0 ? realizadoAtual / pedidosAtualVend : 0;

            return {
                vendedorId: vendId,
                nome: atual?.nome || anterior?.nome || metasSemanaMap.get(vendId)?.nome || 'Sem nome',
                metaSemanal,
                realizado: realizadoAtual,
                pctAtingimento: metaSemanal > 0 ? (realizadoAtual / metaSemanal) * 100 : null,
                projecaoSemanal: diasSemanaDecorridos > 0 ? (realizadoAtual / diasSemanaDecorridos) * diasSemanaTotal : 0,
                deltaSemanaAnteriorPct: realizadoAnterior > 0
                    ? ((realizadoAtual - realizadoAnterior) / realizadoAnterior) * 100
                    : null,
                pedidos: pedidosAtualVend,
                ticketMedio: ticketAtualVend,
            };
        }).sort((a, b) => b.realizado - a.realizado);

        const categoriasCatalogo = parseConfigArray(categoriasVendasConfig?.value)
            .map((categoria) => (typeof categoria === 'string' ? categoria.trim() : ''))
            .filter(Boolean);
        const categoriasCatalogoSet = new Set(categoriasCatalogo);
        const produtoElegivelCatalogo = (produto) => {
            if (!produto || produto.ativo === false) return false;
            if (categoriasCatalogoSet.size === 0) return true;
            return categoriasCatalogoSet.has(produto.categoria || '');
        };

        const topProdutos = [...aggAtual.produtos.values()]
            .filter(produtoElegivelCatalogo)
            .map((prod) => {
                const prev = aggAnterior.produtos.get(prod.produtoId);
                const valorAnterior = prev?.valorLiquido || 0;
                const quantidadeAnterior = prev?.quantidade || 0;
                return {
                    ...prod,
                    vendasSemanaAtual: prod.valorLiquido,
                    vendasSemanaAnterior: valorAnterior,
                    quantidadeSemanaAtual: prod.quantidade,
                    quantidadeSemanaAnterior: quantidadeAnterior,
                    variacaoPct: valorAnterior > 0 ? ((prod.valorLiquido - valorAnterior) / valorAnterior) * 100 : null,
                };
            })
            .sort((a, b) => b.valorLiquido - a.valorLiquido)
            .slice(0, 10);

        const produtosEmQueda = [...new Set([...aggAnterior.produtos.keys(), ...aggAtual.produtos.keys()])]
            .map((produtoId) => {
                const prev = aggAnterior.produtos.get(produtoId);
                const atual = aggAtual.produtos.get(produtoId);
                const valorAnterior = prev?.valorLiquido || 0;
                const valorAtual = atual?.valorLiquido || 0;
                const variacaoPct = valorAnterior > 0 ? ((valorAtual - valorAnterior) / valorAnterior) * 100 : null;
                return {
                    produtoId,
                    nome: atual?.nome || prev?.nome || 'Produto sem nome',
                    codigo: atual?.codigo || prev?.codigo || null,
                    vendasSemanaAnterior: valorAnterior,
                    vendasSemanaAtual: valorAtual,
                    quantidadeSemanaAnterior: prev?.quantidade || 0,
                    quantidadeSemanaAtual: atual?.quantidade || 0,
                    variacaoPct,
                };
            })
            .filter((produto) => produtoElegivelCatalogo(aggAtual.produtos.get(produto.produtoId) || aggAnterior.produtos.get(produto.produtoId)))
            .filter((p) => p.variacaoPct != null && p.variacaoPct < 0)
            .sort((a, b) => a.variacaoPct - b.variacaoPct)
            .slice(0, 10);

        const topClientes = [...new Set([...aggAtual.clientes.keys(), ...aggAnterior.clientes.keys()])]
            .map((clienteId) => {
                const atual = aggAtual.clientes.get(clienteId);
                const anterior = aggAnterior.clientes.get(clienteId);
                const valorAtual = atual?.valor || 0;
                const valorAnterior = anterior?.valor || 0;
                return {
                    clienteId,
                    nome: atual?.nome || anterior?.nome || 'Cliente sem nome',
                    codigo: atual?.codigo || anterior?.codigo || null,
                    valor: valorAtual,
                    valorAnterior,
                    pedidos: atual?.pedidos || 0,
                    pedidosAnterior: anterior?.pedidos || 0,
                    variacaoPct: valorAnterior > 0 ? ((valorAtual - valorAnterior) / valorAnterior) * 100 : null,
                };
            })
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10);

        const cidades = [...new Set([
            ...aggAtual.cidades.keys(),
            ...aggAnterior.cidades.keys(),
        ])]
            .map((cidade) => {
                const atual = aggAtual.cidades.get(cidade);
                const anterior = aggAnterior.cidades.get(cidade);
                const vendasAtual = atual?.valor || 0;
                const vendasAnterior = anterior?.valor || 0;
                const clientesComPedidoAtual = atual?.clientes?.size || 0;
                const clientesComPedidoAnterior = anterior?.clientes?.size || 0;
                return {
                    cidade,
                    clientesComPedidoAtual,
                    clientesComPedidoAnterior,
                    pedidosAtual: atual?.pedidos || 0,
                    pedidosAnterior: anterior?.pedidos || 0,
                    vendasAtual,
                    vendasAnterior,
                    ticketAtual: (atual?.pedidos || 0) > 0 ? vendasAtual / atual.pedidos : 0,
                    ticketAnterior: (anterior?.pedidos || 0) > 0 ? vendasAnterior / anterior.pedidos : 0,
                    variacaoPct: vendasAnterior > 0 ? ((vendasAtual - vendasAnterior) / vendasAnterior) * 100 : null,
                    vendedores: [...(atual?.vendedores?.values() || [])]
                        .map((vend) => ({
                            vendedorId: vend.vendedorId,
                            nome: vend.nome,
                            vendasAtual: vend.valor,
                            pedidosAtual: vend.pedidos,
                            clientesComPedidoAtual: vend.clientes.size,
                        }))
                        .sort((a, b) => b.vendasAtual - a.vendasAtual),
                };
            })
            .sort((a, b) => {
                if (b.vendasAtual !== a.vendasAtual) return b.vendasAtual - a.vendasAtual;
                if (b.totalClientes !== a.totalClientes) return b.totalClientes - a.totalClientes;
                return a.cidade.localeCompare(b.cidade, 'pt-BR');
            });

        const metaSemanalTotal = [...metasSemanaMap.values()].reduce((sum, item) => sum + num(item.metaSemanal), 0);

        const periodoAtual = {
            inicio: toISODate(semanaAtualInicio),
            fim: toISODate(semanaAtualFim),
            janelaFim: toISODate(janelaAtualFim),
            diasJanela,
        };
        const periodoAnterior = {
            inicio: toISODate(semanaAnteriorInicio),
            fim: toISODate(semanaAnteriorFim),
            janelaFim: toISODate(janelaAnteriorFim),
            diasJanela,
        };

        res.json({
            dataBase: dataBaseISO,
            filtroVendedorId: vendedorIdFiltro,
            periodoAtual,
            periodoAnterior,
            resumoEquipe: {
                vendasLiquidas: vendasLiquidasAtual,
                devolucoes: devolucaoAtual,
                pedidos: aggAtual.pedidos,
                ticketMedio: aggAtual.pedidos > 0 ? vendasLiquidasAtual / aggAtual.pedidos : 0,
                variacaoPct: vendasLiquidasAnterior > 0
                    ? ((vendasLiquidasAtual - vendasLiquidasAnterior) / vendasLiquidasAnterior) * 100
                    : null,
                metaSemanal: metaSemanalTotal,
                atingimentoPct: metaSemanalTotal > 0 ? (vendasLiquidasAtual / metaSemanalTotal) * 100 : null,
                projecaoSemanal: diasSemanaDecorridos > 0 ? (vendasLiquidasAtual / diasSemanaDecorridos) * diasSemanaTotal : 0,
                semanaAnteriorLiquida: vendasLiquidasAnterior,
            },
            rankingVendedores,
            insights: {
                cidades,
                topProdutos,
                produtosEmQueda,
                topClientes,
                alertas: {
                    inadimplencia: {
                        total: num(inadimplencia._sum.valor),
                        parcelas: inadimplencia._count._all,
                    },
                    errosErp: { total: pedidosComErro },
                    pedidosEspeciais: { total: pedidosEspeciais },
                    transferenciasPendentes: { total: transferenciasPendentes },
                    pendenciasAbertas: { total: pendenciasAbertas },
                    caixasAConferir: { total: caixasAConferir },
                },
            },
            responsavel: {
                id: user?.id || null,
                nome: user?.nome || user?.login || 'Usuário',
            },
            geradoEm: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Erro no weekly-brief:', error);
        res.status(500).json({ error: 'Erro ao gerar resumo semanal.' });
    }
});

router.get('/', verificarAuth, async (req, res) => {
    try {
        const { isAdminMaster } = await carregarPermissoesUsuario(req.user.id);
        if (!isAdminMaster) return res.status(403).json({ error: 'Acesso negado.' });

        // Data de referência: aceita ?data=YYYY-MM-DD para "reviver" o dashboard de um dia passado.
        // Se a data for hoje ou futura, usa agora real; senão usa fim do dia da data escolhida.
        const hojeReal = new Date();
        let agora = hojeReal;
        let isHistorico = false;
        if (req.query.data && /^\d{4}-\d{2}-\d{2}$/.test(req.query.data)) {
            const [y, m, dd] = req.query.data.split('-').map(Number);
            const ref = new Date(y, m - 1, dd, 23, 59, 59, 999);
            const hojeStart = new Date(hojeReal); hojeStart.setHours(0, 0, 0, 0);
            if (ref < hojeStart) {
                agora = ref;
                isHistorico = true;
            }
        }
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
            situacaoCA: 'FATURADO',
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
            where: {
                criadoEm: { gte: startOfDay, lte: endOfDay },
                tipo: { not: 'FINANCEIRO' },
            },
            select: { clienteId: true, leadId: true, pedidoId: true, transferidoParaId: true, transferenciaFinalizada: true },
        });
        // Pedidos lançados hoje (createdAt) - cada pedido conta como 1 atendimento com venda
        const pedidosCriadosHoje = await prisma.pedido.findMany({
            where: { ...baseWherePedido, createdAt: { gte: startOfDay, lte: endOfDay } },
            select: { clienteId: true },
        });
        const clientesComPedidoHoje = new Set(pedidosCriadosHoje.map(p => p.clienteId));
        const pedidosHojeCount = pedidosCriadosHoje.length;

        // Atend. com venda = total de pedidos criados hoje (cada pedido = 1 atendimento com venda)
        // Atend. sem venda = atendimentos cujo cliente NÃO tem pedido hoje (e sem pedidoId)
        const atendimentosComPedido = pedidosHojeCount;
        const atendimentosSemPedido = atendimentosHoje.filter(a =>
            !a.pedidoId && !(a.clienteId && clientesComPedidoHoje.has(a.clienteId))
        ).length;
        const totalAtendimentos = atendimentosComPedido + atendimentosSemPedido;
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
        ]);
        const clientesNaoAtendidos = clientesDoDia
            .filter(c => (c.Dia_de_venda || '').toUpperCase().split(',').map(s => s.trim()).includes(siglaDoDia))
            .filter(c => !atendidosHojeIds.has(c.UUID))
            .length;

        // Distinct clientes atendidos hoje = atendimento real (da rota) OU pedido lançado.
        // Entregas NÃO contam como atendimento.
        const clientesAtendidos = new Set([
            ...atendimentosHoje.map(a => a.clienteId).filter(Boolean),
            ...pedidosCriadosHoje.map(p => p.clienteId).filter(Boolean),
        ]).size;

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

        // ============ FECHAMENTO DO DIA + PRIORIDADES + QUALIDADE ============
        const [
            atendimentosOntem,
            pedidosCriadosOntem,
            clientesProgramadosOntem,
            amostrasAbertas,
            reagendadosHoje,
            transferenciasParaConcluir,
            todasComprasPorCliente,
        ] = await Promise.all([
            prisma.atendimento.findMany({
                where: { criadoEm: { gte: startOfDay, lte: endOfDay }, tipo: { not: 'FINANCEIRO' } },
                select: {
                    clienteId: true, pedidoId: true, transferidoParaId: true,
                    dataRetorno: true, alertaVisualAtivo: true,
                    acaoLabel: true, tipo: true,
                    cliente: { select: { Formas_Atendimento: true } },
                },
            }),
            prisma.pedido.findMany({
                where: { ...baseWherePedido, createdAt: { gte: startOfDay, lte: endOfDay } },
                select: { clienteId: true },
            }),
            prisma.cliente.count({ where: { Ativo: true, Dia_de_venda: { contains: siglaDoDia, mode: 'insensitive' } } }),
            prisma.amostra.count({ where: { status: { notIn: ['ENTREGUE', 'CANCELADA'] } } }),
            prisma.atendimento.count({ where: { proximaVisita: { gte: startOfDay, lte: endOfDay } } }),
            prisma.atendimento.count({ where: { transferidoParaId: { not: null }, transferenciaFinalizada: false } }),
            prisma.pedido.groupBy({ by: ['clienteId'], _count: { id: true }, where: baseWherePedido }),
        ]);

        const pedidosGeradosOntem = pedidosCriadosOntem.length;
        const clientesComPedidoOntem = new Set(pedidosCriadosOntem.map(p => p.clienteId));
        const clientesAtendidosOntemCount = new Set(atendimentosOntem.map(a => a.clienteId).filter(Boolean)).size;
        const transferenciasAbertasOntem = atendimentosOntem.filter(a => a.transferidoParaId).length;
        const pendenciasAbertasOntem = atendimentosOntem.filter(a => a.dataRetorno || a.alertaVisualAtivo).length;
        const clientesUmaCompra = todasComprasPorCliente.filter(c => c._count.id === 1).length;

        // Qualidade do atendimento (de ontem) — agrupamento por acaoLabel em atend. sem venda
        const semVendaOntem = atendimentosOntem.filter(a =>
            !a.pedidoId && !(a.clienteId && clientesComPedidoOntem.has(a.clienteId))
        );
        const _labelCount = {};
        for (const a of semVendaOntem) {
            const k = a.acaoLabel || 'Sem motivo registrado';
            _labelCount[k] = (_labelCount[k] || 0) + 1;
        }
        const objecoesOntem = Object.entries(_labelCount)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .map(([label, count]) => ({ label, count }));

        const clientesPresencialNoWhatsApp = atendimentosOntem.filter(a => {
            if (a.tipo !== 'WHATSAPP') return false;
            const formas = a.cliente?.Formas_Atendimento;
            const arr = Array.isArray(formas) ? formas
                : (typeof formas === 'string' ? (() => { try { return JSON.parse(formas); } catch { return []; } })() : []);
            return arr.some(f => typeof f === 'string' && f.toUpperCase().includes('PRESENCIAL'));
        }).length;

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

        // Clientes em risco: último pedido entre 30 e 44 dias (antes de virar inativo)
        const risco44 = new Date(agora); risco44.setDate(risco44.getDate() - 44);
        const risco30 = new Date(agora); risco30.setDate(risco30.getDate() - 30);
        const clientesEmRisco = [...mapaUltimo.values()]
            .filter(data => data >= risco44 && data < risco30).length;

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

        // ============ METAS POR VENDEDOR ============
        const mesRefStr = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        const metasMes = await prisma.metaMensalVendedor.findMany({
            where: { mesReferencia: mesRefStr },
            include: { vendedor: { select: { id: true, nome: true } } },
        });

        // Realizado por vendedor (soma itens dos pedidos do mês corrente, exclui cancelados/bonificação)
        const realizadoPorVendedor = new Map();
        for (const p of pedidosMesAtual) {
            if (!p.vendedorId) continue;
            realizadoPorVendedor.set(p.vendedorId, (realizadoPorVendedor.get(p.vendedorId) || 0) + valorPedido(p));
        }

        // Vendedores que venderam mas não têm meta no mês
        const vendedoresComMetaIds = new Set(metasMes.map(m => m.vendedorId));
        const vendedoresSemMetaIds = [...realizadoPorVendedor.keys()].filter(id => !vendedoresComMetaIds.has(id));
        const vendedoresSemMeta = vendedoresSemMetaIds.length > 0
            ? await prisma.vendedor.findMany({
                where: { id: { in: vendedoresSemMetaIds } },
                select: { id: true, nome: true },
            })
            : [];

        const buildLinha = (vendId, vendNome, valorMeta, diasTrab) => {
            const realizado = realizadoPorVendedor.get(vendId) || 0;
            const totalDias = Array.isArray(diasTrab) ? diasTrab.length : null;
            // Conta dias úteis decorridos (incluindo hoje)
            let diasDecorridos = null, projecao = null;
            if (totalDias && totalDias > 0) {
                const hojeStr = agora.toISOString().slice(0, 10);
                diasDecorridos = diasTrab.filter(d => d <= hojeStr).length;
                if (diasDecorridos > 0) projecao = (realizado / diasDecorridos) * totalDias;
            }
            const pctMeta = valorMeta > 0 ? (realizado / valorMeta) * 100 : null;
            const pctProjecao = valorMeta > 0 && projecao != null ? (projecao / valorMeta) * 100 : null;
            return {
                vendedorId: vendId,
                nome: vendNome,
                meta: valorMeta,
                realizado,
                pctMeta,
                projecao,
                pctProjecao,
                diasDecorridos,
                totalDias,
            };
        };

        const linhasMeta = [];
        for (const m of metasMes) {
            let dias = m.diasTrabalho;
            if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = []; } }
            linhasMeta.push(buildLinha(m.vendedorId, m.vendedor?.nome, num(m.valorMensal), dias));
        }
        for (const v of vendedoresSemMeta) {
            linhasMeta.push(buildLinha(v.id, v.nome, 0, null));
        }
        linhasMeta.sort((a, b) => (b.pctMeta ?? -1) - (a.pctMeta ?? -1) || b.realizado - a.realizado);

        const metaTotalMes = linhasMeta.reduce((s, l) => s + l.meta, 0);
        const realizadoTotalVendedores = linhasMeta.reduce((s, l) => s + l.realizado, 0);
        const projecaoTotalVendedores = linhasMeta.reduce((s, l) => s + (l.projecao || l.realizado), 0);

        // ============ ENTREGAS HOJE (mantido) ============
        const entregasHoje = await prisma.pedido.findMany({
            where: { dataEntrega: { gte: startOfDay, lte: endOfDay }, statusEntrega: { not: 'PENDENTE' } },
            include: { pagamentosReais: { select: { valor: true } } },
        });
        const valorEntregueHoje = entregasHoje.reduce((s, p) => s + p.pagamentosReais.reduce((a, x) => a + num(x.valor), 0), 0);

        res.json({
            dataReferencia: startOfDay.toISOString().slice(0, 10),
            isHistorico,
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
            fechamentoOntem: {
                data: startOfDay.toISOString().slice(0, 10),
                clientesProgramados: clientesProgramadosOntem,
                clientesAtendidos: clientesAtendidosOntemCount,
                clientesNaoAtendidos: Math.max(0, clientesProgramadosOntem - clientesAtendidosOntemCount),
                pedidosGerados: pedidosGeradosOntem,
                transferenciasAbertas: transferenciasAbertasOntem,
                amostrasAbertas,
                pendenciasAbertas: pendenciasAbertasOntem,
            },
            prioridadesHoje: {
                reagendadosHoje,
                transferenciasParaConcluir,
                amostrasParaEntregar: amostrasAbertas,
                clientesUmaCompra,
                clientesEmRisco,
            },
            qualidadeAtendimento: {
                objecoesOntem,
                clientesPresencialNoWhatsApp,
            },
            metas: {
                metaTotalMes,
                realizadoTotal: realizadoTotalVendedores,
                projecaoTotal: projecaoTotalVendedores,
                pctTotal: metaTotalMes > 0 ? (realizadoTotalVendedores / metaTotalMes) * 100 : null,
                pctProjecao: metaTotalMes > 0 ? (projecaoTotalVendedores / metaTotalMes) * 100 : null,
                vendedores: linhasMeta,
            },
        });
    } catch (error) {
        console.error('Erro no admin dashboard:', error);
        res.status(500).json({ error: 'Erro ao buscar dados do dashboard.' });
    }
});

// ─── Aba Visitas ─────────────────────────────────────────────────────────────

// Comparações em uppercase para ser case-insensitive (banco pode ter 'Presencial', 'PRESENCIAL', etc.)
const TIPOS_PRESENCIAL = ['VISITA', 'AMOSTRA', 'PRESENCIAL'];
const TIPOS_WHATSAPP = ['WHATSAPP'];
const TIPOS_IGNORAR = ['FINANCEIRO'];

function haversineMetros(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpsStr(str) {
    if (!str || typeof str !== 'string') return null;
    const parts = str.split(',');
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
}

router.get('/visitas', verificarAuth, async (req, res) => {
    try {
        const { podeVerVendas } = await carregarPermissoesUsuario(req.user.id);
        if (!podeVerVendas) return res.status(403).json({ error: 'Acesso negado.' });

        const dataISO = isISODate(req.query.data) ? req.query.data : isoNowTZ();
        const vendedorIdFiltro = req.query.vendedorId?.trim() || null;

        const start = dateFromISOStart(dataISO);
        const end = dateFromISOEnd(dataISO);

        const atendimentos = await prisma.atendimento.findMany({
            where: {
                criadoEm: { gte: start, lte: end },
                ...(vendedorIdFiltro ? { idVendedor: vendedorIdFiltro } : {}),
            },
            include: {
                vendedor: { select: { id: true, nome: true } },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true } },
                lead: { select: { id: true, nomeEstabelecimento: true, pontoGps: true } },
            },
            orderBy: { criadoEm: 'asc' },
        });

        const vendedoresMap = new Map();

        const novoVendedorEntry = (id, nome) => ({
            vendedorId: id,
            vendedorNome: nome,
            presencialTotal: 0,
            presencialConfirmado: 0,
            presencialNaoConfirmado: 0,
            presencialSemGpsCliente: 0,
            whatsappTotal: 0,
            outrosTotal: 0,
            entregasTotal: 0,
            entregasConfirmadas: 0,
            entregasNaoConfirmadas: 0,
            entregasSemGpsCliente: 0,
            detalhes: {
                presencialConfirmado: [],
                presencialNaoConfirmado: [],
                presencialSemGpsCliente: [],
                whatsapp: [],
                outros: [],
                entregasConfirmadas: [],
                entregasNaoConfirmadas: [],
                entregasSemGpsCliente: [],
            },
        });

        for (const at of atendimentos) {
            const vid = at.idVendedor;
            if (!vendedoresMap.has(vid)) {
                vendedoresMap.set(vid, {
                    vendedorId: vid,
                    vendedorNome: at.vendedor?.nome || 'Desconhecido',
                    presencialTotal: 0,
                    presencialConfirmado: 0,
                    presencialNaoConfirmado: 0,
                    presencialSemGpsCliente: 0,
                    whatsappTotal: 0,
                    outrosTotal: 0,
                    entregasTotal: 0,
                    entregasConfirmadas: 0,
                    entregasNaoConfirmadas: 0,
                    entregasSemGpsCliente: 0,
                    detalhes: {
                        presencialConfirmado: [],
                        presencialNaoConfirmado: [],
                        presencialSemGpsCliente: [],
                        whatsapp: [],
                        outros: [],
                        entregasConfirmadas: [],
                        entregasNaoConfirmadas: [],
                        entregasSemGpsCliente: [],
                    },
                });
            }

            const tipoUp = (at.tipo || '').toUpperCase();
            if (TIPOS_IGNORAR.includes(tipoUp)) continue;

            const v = vendedoresMap.get(vid);
            const nomeCliente = at.cliente
                ? (at.cliente.NomeFantasia || at.cliente.Nome)
                : (at.lead?.nomeEstabelecimento || 'Desconhecido');
            const hora = at.criadoEm.toLocaleTimeString('pt-BR', {
                hour: '2-digit', minute: '2-digit', timeZone: TZ,
            });
            const temPedido = !!at.pedidoId;

            if (TIPOS_PRESENCIAL.includes(tipoUp) || temPedido) {
                v.presencialTotal++;
                const gpsVend = parseGpsStr(at.gpsVendedor);
                const gpsCli = parseGpsStr(at.cliente?.Ponto_GPS || at.lead?.pontoGps);

                if (!gpsCli) {
                    v.presencialSemGpsCliente++;
                    v.detalhes.presencialSemGpsCliente.push({ nomeCliente, tipo: at.tipo, hora });
                } else if (!gpsVend) {
                    v.presencialNaoConfirmado++;
                    v.detalhes.presencialNaoConfirmado.push({ nomeCliente, tipo: at.tipo, hora, distancia: null, semGpsVendedor: true });
                } else {
                    const dist = Math.round(haversineMetros(gpsVend.lat, gpsVend.lng, gpsCli.lat, gpsCli.lng));
                    if (dist <= 50) {
                        v.presencialConfirmado++;
                        v.detalhes.presencialConfirmado.push({ nomeCliente, tipo: at.tipo, hora, distancia: dist });
                    } else {
                        v.presencialNaoConfirmado++;
                        v.detalhes.presencialNaoConfirmado.push({ nomeCliente, tipo: at.tipo, hora, distancia: dist });
                    }
                }
            } else if (TIPOS_WHATSAPP.includes(tipoUp)) {
                v.whatsappTotal++;
                v.detalhes.whatsapp.push({ nomeCliente, hora });
            } else {
                v.outrosTotal++;
                v.detalhes.outros.push({ nomeCliente, tipo: at.tipo, hora });
            }
        }

        // ── Entregas do dia — mescladas no card do vendedor/motorista ──────────
        const pedidosEntregues = await prisma.pedido.findMany({
            where: {
                dataEntrega: { gte: start, lte: end },
                statusEntrega: { in: ['ENTREGUE', 'ENTREGUE_PARCIAL'] },
            },
            select: {
                id: true, numero: true, gpsEntrega: true, dataEntrega: true, statusEntrega: true,
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true } },
                embarque: { select: { id: true, responsavelId: true } },
            },
            orderBy: { dataEntrega: 'asc' },
        });

        // Nomes dos motoristas que ainda não estão no vendedoresMap
        const motoristaIdsNovos = [...new Set(
            pedidosEntregues.map(p => p.embarque?.responsavelId).filter(id => id && !vendedoresMap.has(id))
        )];
        if (motoristaIdsNovos.length > 0) {
            const novosMot = await prisma.vendedor.findMany({
                where: { id: { in: motoristaIdsNovos } },
                select: { id: true, nome: true },
            });
            for (const m of novosMot) vendedoresMap.set(m.id, novoVendedorEntry(m.id, m.nome));
        }

        for (const ped of pedidosEntregues) {
            const mid = ped.embarque?.responsavelId;
            if (!mid) continue;
            if (vendedorIdFiltro && mid !== vendedorIdFiltro) continue;
            if (!vendedoresMap.has(mid)) continue;

            const v = vendedoresMap.get(mid);
            const nomeCliente = ped.cliente ? (ped.cliente.NomeFantasia || ped.cliente.Nome) : 'Desconhecido';
            const hora = ped.dataEntrega
                ? new Date(ped.dataEntrega).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
                : '--:--';

            v.entregasTotal++;
            const gpsEnt = parseGpsStr(ped.gpsEntrega);
            const gpsCli = parseGpsStr(ped.cliente?.Ponto_GPS);

            if (!gpsCli) {
                v.entregasSemGpsCliente++;
                v.detalhes.entregasSemGpsCliente.push({ nomeCliente, hora });
            } else if (!gpsEnt) {
                v.entregasNaoConfirmadas++;
                v.detalhes.entregasNaoConfirmadas.push({ nomeCliente, hora, distancia: null, semGpsEntrega: true });
            } else {
                const dist = Math.round(haversineMetros(gpsEnt.lat, gpsEnt.lng, gpsCli.lat, gpsCli.lng));
                if (dist <= 50) {
                    v.entregasConfirmadas++;
                    v.detalhes.entregasConfirmadas.push({ nomeCliente, hora, distancia: dist });
                } else {
                    v.entregasNaoConfirmadas++;
                    v.detalhes.entregasNaoConfirmadas.push({ nomeCliente, hora, distancia: dist });
                }
            }
        }

        res.json({
            data: dataISO,
            vendedores: Array.from(vendedoresMap.values()).sort((a, b) =>
                a.vendedorNome.localeCompare(b.vendedorNome)
            ),
        });
    } catch (error) {
        console.error('Erro em /visitas:', error);
        res.status(500).json({ error: 'Erro ao buscar dados de visitas.' });
    }
});

// ─── Cidades distintas de clientes ativos (para filtro de Recompra) ──────────
router.get('/clientes-cidades', verificarAuth, async (req, res) => {
    try {
        const { podeVerVendas } = await carregarPermissoesUsuario(req.user.id);
        if (!podeVerVendas) return res.status(403).json({ error: 'Acesso negado.' });

        const linhas = await prisma.cliente.findMany({
            where: { Ativo: true, End_Cidade: { not: null } },
            select: { End_Cidade: true },
            distinct: ['End_Cidade'],
            orderBy: { End_Cidade: 'asc' },
        });
        const cidades = linhas
            .map((l) => (l.End_Cidade || '').trim())
            .filter(Boolean);
        res.json(cidades);
    } catch (error) {
        console.error('Erro em /clientes-cidades:', error);
        res.status(500).json({ error: 'Erro ao buscar cidades.' });
    }
});

// ─── Clientes que pararam de comprar há X dias (Recompra) ────────────────────
// Considera "compra" os pedidos com statusEnvio em ENVIAR/RECEBIDO (mesma regra
// do motor de insights), usando createdAt como data de referência.
router.get('/clientes-sem-comprar', verificarAuth, async (req, res) => {
    try {
        const { podeVerVendas } = await carregarPermissoesUsuario(req.user.id);
        if (!podeVerVendas) return res.status(403).json({ error: 'Acesso negado.' });

        const STATUS_VALIDO = ['ENVIAR', 'RECEBIDO'];

        const dias = Math.max(1, parseInt(req.query.dias, 10) || 30);
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;

        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const vendedorId = typeof req.query.vendedorId === 'string' && req.query.vendedorId.trim()
            ? req.query.vendedorId.trim() : null;
        const cidade = typeof req.query.cidade === 'string' && req.query.cidade.trim()
            ? req.query.cidade.trim() : null;
        const categorias = typeof req.query.categorias === 'string' && req.query.categorias.trim()
            ? req.query.categorias.split(',').map((c) => c.trim()).filter(Boolean) : [];

        const agora = Date.now();
        const corte = new Date(agora - dias * ONE_DAY_MS);

        // Where base do cliente
        const whereCliente = { Ativo: true };
        if (search) {
            whereCliente.OR = [
                { Nome: { contains: search, mode: 'insensitive' } },
                { NomeFantasia: { contains: search, mode: 'insensitive' } },
                { Documento: { contains: search, mode: 'insensitive' } },
                { End_Cidade: { contains: search, mode: 'insensitive' } },
            ];
        }
        if (vendedorId) whereCliente.idVendedor = vendedorId;
        if (cidade) whereCliente.End_Cidade = cidade;

        // Filtro por categoria comercial de produto: clientes que JÁ compraram
        // produtos das categorias selecionadas (em algum pedido válido).
        if (categorias.length > 0) {
            const comprasCategoria = await prisma.pedido.findMany({
                where: {
                    statusEnvio: { in: STATUS_VALIDO },
                    itens: { some: { produto: { categoriaProdutoId: { in: categorias } } } },
                },
                select: { clienteId: true },
                distinct: ['clienteId'],
            });
            const idsCategoria = comprasCategoria.map((p) => p.clienteId);
            if (idsCategoria.length === 0) {
                return res.json({ data: [], meta: { total: 0, page, limit, totalPages: 0, dias } });
            }
            whereCliente.UUID = { in: idsCategoria };
        }

        // Candidatos (apenas UUIDs) + último pedido válido por cliente
        const [candidatos, grupos] = await Promise.all([
            prisma.cliente.findMany({ where: whereCliente, select: { UUID: true } }),
            prisma.pedido.groupBy({
                by: ['clienteId'],
                where: { statusEnvio: { in: STATUS_VALIDO } },
                _max: { createdAt: true },
            }),
        ]);

        const ultimoPorCliente = new Map(grupos.map((g) => [g.clienteId, g._max.createdAt]));

        // Qualificados: têm histórico de compra e o último pedido é anterior ao corte
        const qualificados = [];
        for (const c of candidatos) {
            const ultimo = ultimoPorCliente.get(c.UUID);
            if (ultimo && new Date(ultimo) < corte) {
                qualificados.push({
                    UUID: c.UUID,
                    ultimoPedido: ultimo,
                    diasSemComprar: Math.floor((agora - new Date(ultimo).getTime()) / ONE_DAY_MS),
                });
            }
        }
        // Mais atrasados primeiro
        qualificados.sort((a, b) => new Date(a.ultimoPedido) - new Date(b.ultimoPedido));

        const total = qualificados.length;
        const pagina = qualificados.slice(skip, skip + limit);
        const idsPagina = pagina.map((q) => q.UUID);

        let clientes = [];
        if (idsPagina.length > 0) {
            const registros = await prisma.cliente.findMany({
                where: { UUID: { in: idsPagina } },
                select: {
                    UUID: true,
                    Nome: true,
                    NomeFantasia: true,
                    Documento: true,
                    End_Cidade: true,
                    End_Estado: true,
                    Telefone: true,
                    Telefone_Celular: true,
                    Dia_de_venda: true,
                    vendedor: { select: { id: true, nome: true } },
                },
            });
            const porId = new Map(registros.map((r) => [r.UUID, r]));
            clientes = pagina
                .map((q) => {
                    const r = porId.get(q.UUID);
                    if (!r) return null;
                    return { ...r, ultimoPedido: q.ultimoPedido, diasSemComprar: q.diasSemComprar };
                })
                .filter(Boolean);
        }

        res.json({
            data: clientes,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit), dias },
        });
    } catch (error) {
        console.error('Erro em /clientes-sem-comprar:', error);
        res.status(500).json({ error: 'Erro ao buscar clientes sem comprar.' });
    }
});

module.exports = router;
