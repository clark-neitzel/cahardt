// Leituras da API dos agentes. Reusa a Carteira, a régua de venda
// (WHERE_PEDIDO_RECEITA + cancelado=false + devolução ativa) e a classificação
// de inadimplência. Não grava nada e não envia WhatsApp.
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const carteiraService = require('./carteiraService');
const { WHERE_PEDIDO_RECEITA } = require('./projecaoVendasService');
const inadimplenciaService = require('./inadimplenciaService');
const produtoMargemService = require('./produtoMargemService');
const atendimentoService = require('./atendimentoService');
const leadService = require('./leadService');
const {
    erro, num, dec, pagina, lista, periodoObrigatorio, idOpcional,
    isoNowTZ, inicioDiaSP, fimDiaSP, somaDiasISO,
} = require('./analyticsComum');

const REGRA_VENDA = 'Pedido não cancelado, sem bonificação, faturado (situacaoCA FATURADO) ou especial. O resumo desconta a devolução ATIVA pela data da devolução, e só se o pedido de origem segue a mesma regra. É a régua da Carteira; o filtro cancelado=false é o da Carteira (o objeto WHERE_PEDIDO_RECEITA sozinho não traz esse campo). Frete não entra: a soma é valor × quantidade dos itens.';

function wherePedidoValido({ inicio, fim, vendedorId, clienteId }) {
    return {
        ...WHERE_PEDIDO_RECEITA,
        cancelado: false,
        ...(inicio && fim ? { dataVenda: { gte: inicio, lte: fim } } : {}),
        ...(vendedorId ? { vendedorId } : {}),
        ...(clienteId ? { clienteId } : {}),
    };
}

function sqlPedidoValido({ vendedorId, clienteId }) {
    const partes = [
        Prisma.sql`p.bonificacao = false`,
        Prisma.sql`p.cancelado = false`,
        Prisma.sql`(p.situacao_ca = 'FATURADO' OR p.especial = true)`,
    ];
    if (vendedorId) partes.push(Prisma.sql`p.vendedor_id = ${vendedorId}`);
    if (clienteId) partes.push(Prisma.sql`p.cliente_id = ${clienteId}`);
    return Prisma.join(partes, ' AND ');
}

async function resumoVendas({ inicio, fim, vendedorId, clienteId }) {
    const venda = sqlPedidoValido({ vendedorId, clienteId });
    const [brutoRows, devRows] = await Promise.all([
        prisma.$queryRaw`
            SELECT COALESCE(SUM(i.valor * i.quantidade), 0)::float AS valor,
                   COUNT(DISTINCT p.id)::int AS pedidos
            FROM pedidos p
            LEFT JOIN pedido_itens i ON i.pedido_id = p.id
            WHERE ${venda}
              AND p.data_venda >= ${inicio}
              AND p.data_venda <= ${fim}`,
        prisma.$queryRaw`
            SELECT COALESCE(SUM(d.valor_total), 0)::float AS valor,
                   COUNT(*)::int AS qtd
            FROM devolucoes d
            JOIN pedidos p ON p.id = d.pedido_original_id
            WHERE d.status = 'ATIVA'
              AND d.data_devolucao >= ${inicio}
              AND d.data_devolucao <= ${fim}
              AND ${venda}`,
    ]);
    const bruto = Number(brutoRows[0]?.valor || 0);
    const devolvido = Number(devRows[0]?.valor || 0);
    return {
        valorBruto: dec(bruto),
        valorDevolvido: dec(devolvido),
        valorLiquido: dec(bruto - devolvido),
        pedidos: Number(brutoRows[0]?.pedidos || 0),
        devolucoes: Number(devRows[0]?.qtd || 0),
        regra: REGRA_VENDA,
    };
}

function valorItens(itens) {
    return dec((itens || []).reduce((s, i) => s + num(i.valor) * num(i.quantidade), 0));
}

function publicoItem(i) {
    return {
        id: i.id,
        produtoId: i.produtoId,
        codigo: i.produto?.codigo || null,
        nome: i.produto?.nome || i.descricao || null,
        unidade: i.produto?.unidade || null,
        quantidade: num(i.quantidade),
        valorUnitario: dec(i.valor),
        valorTotal: dec(num(i.valor) * num(i.quantidade)),
        emPromocao: !!i.emPromocao,
        promocaoId: i.promocaoId || null,
        nomePromocao: i.nomePromocao || null,
        custoUnitarioNaVenda: i.custoUnitarioSnapshot == null ? null : Number(i.custoUnitarioSnapshot),
    };
}

async function painel(query) {
    const periodo = query.periodo === 'mes' ? 'mes' : 'semana';
    const vendedorId = query.vendedorId ? String(query.vendedorId) : 'todos';
    if (vendedorId !== 'todos' && vendedorId !== 'sem-vendedor') idOpcional(vendedorId, 'vendedorId');
    try {
        return await carteiraService.obterPainel({
            periodo,
            vendedorId,
            fresh: query.fresh === '1' || query.fresh === 'true',
        });
    } catch (e) {
        if (e?.status) throw erro(e.status, e.message, 'CARTEIRA');
        throw e;
    }
}

async function clientes(query) {
    const pg = pagina(query);
    try {
        return await carteiraService.listarClientes({
            vendedorId: query.vendedorId ? String(query.vendedorId) : null,
            estado: query.estado || null,
            cidade: query.cidade || null,
            q: query.q || null,
            somenteCarteira: query.carteira === '1',
            page: pg.page,
            limit: pg.limit,
            fresh: query.fresh === '1' || query.fresh === 'true',
            ordenar: ['nome', 'dias', 'risco'].includes(query.ordenar) ? query.ordenar : 'risco',
        });
    } catch (e) {
        if (e?.status) throw erro(e.status, e.message, 'CARTEIRA');
        throw e;
    }
}

async function financeiroCliente(clienteId) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const cli = await prisma.cliente.findUnique({
        where: { UUID: id },
        select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, idVendedor: true },
    });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    const detalhe = await inadimplenciaService.detalheCliente(id);
    return {
        cliente: { id: cli.UUID, nome: cli.NomeFantasia || cli.Nome, cidade: cli.End_Cidade || null, vendedorId: cli.idVendedor },
        situacao: inadimplenciaService.resumir(detalhe),
        contas: (detalhe.classificadas || []).map(({ conta, r }) => ({
            id: conta.id,
            status: conta.status,
            pedidoId: conta.pedidoId,
            pedidoNumero: conta.pedido?.numero ?? null,
            destino: r.destino,
            saldoAberto: r.saldoAberto,
            vencidas: (r.vencidas || []).map((v) => ({
                parcelaId: v.parcelaId,
                numeroParcela: v.numeroParcela,
                saldo: v.saldo,
                diasAtraso: v.diasAtraso,
                dataVencimento: v.dataVencimento,
            })),
            aConfirmar: r.aConfirmar || null,
        })),
        leitura: 'destino DEVE é atraso de verdade. EM_ESPERA e A_CONFIRMAR são dinheiro/Pix/cartão apontado que o Caixa ou a Conciliação ainda vão confirmar — não tratar como inadimplente. situacao.inadimplente segue essa regra.',
    };
}

async function vendas(query) {
    const per = periodoObrigatorio(query, { maxDias: 366 });
    const pg = pagina(query, { padrao: 25 });
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const clienteId = idOpcional(query.clienteId, 'clienteId');
    const comItens = query.itens !== '0';
    const where = wherePedidoValido({ inicio: per.inicio, fim: per.fim, vendedorId, clienteId });
    const [total, rows, resumo] = await Promise.all([
        prisma.pedido.count({ where }),
        prisma.pedido.findMany({
            where,
            orderBy: [{ dataVenda: 'desc' }, { numero: 'desc' }],
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, numero: true, dataVenda: true, especial: true, situacaoCA: true,
                nomeCondicaoPagamento: true, vendedorId: true, clienteId: true, latLng: true,
                vendedor: { select: { id: true, nome: true } },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, End_Estado: true } },
                ...(comItens ? {
                    itens: {
                        select: {
                            id: true, produtoId: true, quantidade: true, valor: true, descricao: true,
                            emPromocao: true, promocaoId: true, nomePromocao: true, custoUnitarioSnapshot: true,
                            produto: { select: { nome: true, codigo: true, unidade: true } },
                        },
                    },
                } : {}),
            },
        }),
        resumoVendas({ inicio: per.inicio, fim: per.fim, vendedorId, clienteId }),
    ]);
    const ids = rows.map((p) => p.id);
    const devs = ids.length
        ? await prisma.devolucao.findMany({
            where: { status: 'ATIVA', pedidoOriginalId: { in: ids } },
            select: { pedidoOriginalId: true, valorTotal: true, numero: true, dataDevolucao: true },
        })
        : [];
    const devPorPedido = new Map();
    for (const d of devs) {
        if (!devPorPedido.has(d.pedidoOriginalId)) devPorPedido.set(d.pedidoOriginalId, []);
        devPorPedido.get(d.pedidoOriginalId).push(d);
    }
    const data = rows.map((p) => {
        const bruto = comItens ? valorItens(p.itens) : null;
        const listaDev = devPorPedido.get(p.id) || [];
        const devolvido = dec(listaDev.reduce((s, d) => s + num(d.valorTotal), 0));
        return {
            id: p.id,
            numero: p.numero,
            dataVenda: p.dataVenda,
            especial: !!p.especial,
            situacao: p.situacaoCA,
            condicaoPagamento: p.nomeCondicaoPagamento || null,
            gps: p.latLng || null,
            vendedor: p.vendedor ? { id: p.vendedor.id, nome: p.vendedor.nome } : (p.vendedorId ? { id: p.vendedorId, nome: null } : null),
            cliente: p.cliente ? {
                id: p.cliente.UUID,
                nome: p.cliente.NomeFantasia || p.cliente.Nome,
                cidade: p.cliente.End_Cidade || null,
                estado: p.cliente.End_Estado || null,
            } : { id: p.clienteId },
            valorBruto: bruto,
            valorDevolvido: devolvido,
            valorLiquido: bruto == null ? null : dec(bruto - devolvido),
            devolucoes: listaDev.map((d) => ({ numero: d.numero, valor: dec(d.valorTotal), data: d.dataDevolucao })),
            ...(comItens ? { itens: p.itens.map(publicoItem) } : {}),
        };
    });
    return lista({
        page: pg.page, limit: pg.limit, total, data,
        extra: { de: per.de, ate: per.ate, resumo },
    });
}

async function vendasItens(query) {
    const per = periodoObrigatorio(query, { maxDias: 366 });
    const pg = pagina(query);
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const clienteId = idOpcional(query.clienteId, 'clienteId');
    const produtoId = idOpcional(query.produtoId, 'produtoId');
    const where = {
        ...(produtoId ? { produtoId } : {}),
        pedido: wherePedidoValido({ inicio: per.inicio, fim: per.fim, vendedorId, clienteId }),
    };
    const [total, rows, resumo] = await Promise.all([
        prisma.pedidoItem.count({ where }),
        prisma.pedidoItem.findMany({
            where,
            orderBy: { pedido: { dataVenda: 'desc' } },
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, produtoId: true, quantidade: true, valor: true, descricao: true,
                emPromocao: true, promocaoId: true, nomePromocao: true, custoUnitarioSnapshot: true,
                produto: { select: { nome: true, codigo: true, unidade: true } },
                pedido: {
                    select: {
                        id: true, numero: true, dataVenda: true, especial: true, vendedorId: true, clienteId: true,
                        vendedor: { select: { nome: true } },
                        cliente: { select: { Nome: true, NomeFantasia: true, End_Cidade: true } },
                    },
                },
            },
        }),
        resumoVendas({ inicio: per.inicio, fim: per.fim, vendedorId, clienteId }),
    ]);
    const data = rows.map((i) => ({
        ...publicoItem(i),
        pedidoId: i.pedido.id,
        numeroPedido: i.pedido.numero,
        dataVenda: i.pedido.dataVenda,
        especial: !!i.pedido.especial,
        vendedorId: i.pedido.vendedorId,
        vendedor: i.pedido.vendedor?.nome || null,
        clienteId: i.pedido.clienteId,
        cliente: i.pedido.cliente?.NomeFantasia || i.pedido.cliente?.Nome || null,
        cidade: i.pedido.cliente?.End_Cidade || null,
    }));
    return lista({
        page: pg.page, limit: pg.limit, total, data,
        extra: {
            de: per.de, ate: per.ate, resumo,
            aviso: 'Cada linha é a venda bruta do item. O líquido do período está em resumo (devolução pela data da devolução, não rateada nesta linha).',
        },
    });
}

function precoNaTabela(valorVenda, acrescimoPct) {
    return dec(num(valorVenda) * (1 + num(acrescimoPct) / 100));
}

async function produtos(query) {
    const pg = pagina(query);
    const where = {};
    if (query.ativo === '0') where.ativo = false;
    else if (query.ativo !== 'todos') where.ativo = true;
    const categoriaId = idOpcional(query.categoriaId, 'categoriaId');
    if (categoriaId) where.categoriaProdutoId = categoriaId;
    if (query.q) {
        const q = String(query.q).trim().slice(0, 80);
        where.OR = [
            { nome: { contains: q, mode: 'insensitive' } },
            { codigo: { contains: q, mode: 'insensitive' } },
        ];
    }
    const agora = new Date();
    const [total, rows, tabelas] = await Promise.all([
        prisma.produto.count({ where }),
        prisma.produto.findMany({
            where,
            orderBy: { nome: 'asc' },
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, codigo: true, nome: true, unidade: true, ativo: true,
                valorVenda: true, custoMedio: true, custoManual: true,
                estoqueDisponivel: true, quantidadePorCaixa: true,
                categoria: true,
                categoriaProduto: { select: { id: true, nome: true } },
            },
        }),
        prisma.tabelaPreco.findMany({
            where: { ativo: true },
            select: { id: true, nomeCondicao: true, acrescimoPreco: true },
            orderBy: { nomeCondicao: 'asc' },
        }),
    ]);
    const ids = rows.map((p) => p.id);
    let custos = new Map();
    // O custo de ficha técnica é o mesmo cálculo da tela de margem (pode ser pesado).
    // comCusto=0 devolve só preço e tabelas, para uma varredura que não precisa de custo.
    if (ids.length && query.comCusto !== '0') {
        try { custos = await produtoMargemService.custoAtualDeProdutos(ids); }
        catch (e) { console.error('[Analytics] custo dos produtos falhou:', e.message); }
    }
    const promos = ids.length
        ? await prisma.promocao.findMany({
            where: { produtoId: { in: ids }, status: 'ATIVA', dataInicio: { lte: agora }, dataFim: { gte: agora } },
            select: { id: true, produtoId: true, nome: true, tipo: true, precoPromocional: true, dataInicio: true, dataFim: true },
        })
        : [];
    const promoPorProduto = new Map();
    for (const pr of promos) if (!promoPorProduto.has(pr.produtoId)) promoPorProduto.set(pr.produtoId, pr);

    const data = rows.map((p) => {
        const c = custos.get(p.id);
        const promo = promoPorProduto.get(p.id);
        return {
            id: p.id,
            codigo: p.codigo,
            nome: p.nome,
            unidade: p.unidade,
            ativo: !!p.ativo,
            categoria: p.categoriaProduto?.nome || p.categoria || null,
            categoriaId: p.categoriaProduto?.id || null,
            valorVenda: dec(p.valorVenda),
            custoMedio: p.custoMedio == null ? null : dec(p.custoMedio),
            custoManual: p.custoManual == null ? null : dec(p.custoManual),
            custoAtual: c ? c.custoUnitario : null,
            fonteCusto: c ? c.fonteCusto : null,
            estoqueDisponivel: num(p.estoqueDisponivel),
            quantidadePorCaixa: p.quantidadePorCaixa,
            precos: tabelas.map((t) => ({
                tabelaId: t.id,
                nome: t.nomeCondicao,
                acrescimoPct: num(t.acrescimoPreco),
                preco: precoNaTabela(p.valorVenda, t.acrescimoPreco),
            })),
            promocaoVigente: promo ? {
                id: promo.id,
                nome: promo.nome,
                tipo: promo.tipo,
                precoPromocional: dec(promo.precoPromocional),
                dataInicio: promo.dataInicio,
                dataFim: promo.dataFim,
            } : null,
        };
    });
    return lista({
        page: pg.page, limit: pg.limit, total, data,
        extra: {
            formulaPreco: 'preco = valorVenda × (1 + acrescimoPct/100), a mesma conta do catálogo.',
        },
    });
}

async function tabelasPreco(query) {
    const where = {};
    if (query.ativo !== 'todos') where.ativo = query.ativo === '0' ? false : true;
    const rows = await prisma.tabelaPreco.findMany({
        where,
        orderBy: { nomeCondicao: 'asc' },
        select: {
            id: true, nomeCondicao: true, tipoPagamento: true, acrescimoPreco: true,
            qtdParcelas: true, parcelasDias: true, valorMinimo: true, ativo: true,
            permitePedido: true, permiteEspecial: true, permiteBonificacao: true,
        },
    });
    return {
        formulaPreco: 'preco = valorVenda do produto × (1 + acrescimoPct/100).',
        data: rows.map((t) => ({
            id: t.id,
            nome: t.nomeCondicao,
            tipoPagamento: t.tipoPagamento,
            acrescimoPct: num(t.acrescimoPreco),
            qtdParcelas: t.qtdParcelas,
            parcelasDias: t.parcelasDias,
            valorMinimo: t.valorMinimo == null ? null : dec(t.valorMinimo),
            ativo: !!t.ativo,
            permitePedido: !!t.permitePedido,
            permiteEspecial: !!t.permiteEspecial,
            permiteBonificacao: !!t.permiteBonificacao,
        })),
    };
}

async function promocoes(query) {
    const pg = pagina(query);
    const where = {};
    if (query.status) where.status = String(query.status).trim().toUpperCase();
    const produtoId = idOpcional(query.produtoId, 'produtoId');
    if (produtoId) where.produtoId = produtoId;
    if (query.vigente === '1') {
        const agora = new Date();
        where.status = 'ATIVA';
        where.dataInicio = { lte: agora };
        where.dataFim = { gte: agora };
    }
    const [total, rows] = await Promise.all([
        prisma.promocao.count({ where }),
        prisma.promocao.findMany({
            where,
            orderBy: { dataInicio: 'desc' },
            skip: pg.skip,
            take: pg.limit,
            include: {
                produto: { select: { id: true, nome: true, codigo: true, valorVenda: true } },
                grupos: { include: { condicoes: true } },
            },
        }),
    ]);
    const data = rows.map((p) => ({
        id: p.id,
        nome: p.nome,
        tipo: p.tipo,
        status: p.status,
        precoPromocional: dec(p.precoPromocional),
        dataInicio: p.dataInicio,
        dataFim: p.dataFim,
        produto: p.produto ? {
            id: p.produto.id, nome: p.produto.nome, codigo: p.produto.codigo, valorVenda: dec(p.produto.valorVenda),
        } : null,
        grupos: (p.grupos || []).map((g) => ({
            id: g.id,
            condicoes: (g.condicoes || []).map((c) => ({
                id: c.id,
                tipo: c.tipo,
                produtoId: c.produtoId,
                quantidadeMinima: c.quantidadeMinima == null ? null : num(c.quantidadeMinima),
                valorMinimo: c.valorMinimo == null ? null : dec(c.valorMinimo),
            })),
        })),
    }));
    return lista({ page: pg.page, limit: pg.limit, total, data });
}

function comoLista(v) {
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v || '[]'); } catch { return []; }
}

async function vendedores(query) {
    const pg = pagina(query, { padrao: 100 });
    const mes = /^\d{4}-\d{2}$/.test(String(query.mes || '')) ? String(query.mes) : isoNowTZ().slice(0, 7);
    const where = {};
    if (query.ativo === '0') where.ativo = false;
    else if (query.ativo !== 'todos') where.ativo = true;
    if (query.incluirExternos !== '1') where.acessoExterno = false;
    const [total, rows] = await Promise.all([
        prisma.vendedor.count({ where }),
        prisma.vendedor.findMany({
            where,
            orderBy: { nome: 'asc' },
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, nome: true, telefone: true, email: true, ativo: true, acessoExterno: true,
                flexDisponivel: true, flexMensal: true, maxDescontoFlex: true, percentualFlex: true,
                metasMensais: {
                    where: { mesReferencia: mes },
                    include: {
                        metasProdutos: { include: { produto: { select: { id: true, nome: true, codigo: true } } } },
                        metasCidades: true,
                        metasPromocoes: { include: { promocao: { select: { id: true, nome: true } } } },
                    },
                },
            },
        }),
    ]);
    const data = rows.map((v) => {
        const meta = v.metasMensais[0] || null;
        return {
            id: v.id,
            nome: v.nome,
            telefone: v.telefone || null,
            email: v.email || null,
            ativo: !!v.ativo,
            acessoExterno: !!v.acessoExterno,
            flex: {
                disponivel: dec(v.flexDisponivel),
                mensal: dec(v.flexMensal),
                maxDescontoPct: num(v.maxDescontoFlex),
                percentual: num(v.percentualFlex),
            },
            meta: meta ? {
                mes,
                valorMensal: dec(meta.valorMensal),
                flexMensal: dec(meta.flexMensal),
                diasTrabalho: comoLista(meta.diasTrabalho),
                produtos: (meta.metasProdutos || []).map((m) => ({
                    produtoId: m.produtoId,
                    nome: m.produto?.nome || null,
                    codigo: m.produto?.codigo || null,
                    quantidade: num(m.quantidade),
                })),
                cidades: (meta.metasCidades || []).map((m) => ({
                    cidade: m.cidade, valor: dec(m.valor), diasSemana: m.diasSemana || null,
                })),
                promocoes: (meta.metasPromocoes || []).map((m) => ({
                    promocaoId: m.promocaoId, nome: m.promocao?.nome || null, quantidadePedidos: m.quantidadePedidos,
                })),
            } : null,
        };
    });
    return lista({ page: pg.page, limit: pg.limit, total, data, extra: { mes } });
}

async function atendimentos(query) {
    const per = periodoObrigatorio(query, { maxDias: 120 });
    const pg = pagina(query);
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const clienteId = idOpcional(query.clienteId, 'clienteId');
    const leadId = idOpcional(query.leadId, 'leadId');
    const tipo = query.tipo ? String(query.tipo).trim().toUpperCase() : null;
    if (tipo && !/^[A-Z0-9_]{2,40}$/.test(tipo)) throw erro(400, 'tipo inválido.', 'TIPO_INVALIDO');

    if (query.visao === 'painel') {
        const r = await atendimentoService.listarComFiltros({
            vendedorId: vendedorId || undefined,
            clienteId: clienteId || undefined,
            leadId: leadId || undefined,
            tipo: tipo || undefined,
            dataInicio: per.de,
            dataFim: per.ate,
            page: pg.page,
            limit: pg.limit,
        });
        return {
            visao: 'painel',
            de: per.de,
            ate: per.ate,
            aviso: 'Mesma lista da tela de Atendimentos: mistura a nota registrada e o pedido do período, com teto de 3000 linhas de cada fonte. Para varrer sem esse teto, omita visao=painel e use /vendas para os pedidos.',
            ...r,
        };
    }

    const where = {};
    if (vendedorId) where.idVendedor = vendedorId;
    if (clienteId) where.clienteId = clienteId;
    if (leadId) where.leadId = leadId;
    where.tipo = tipo ? tipo : { notIn: ['FINANCEIRO'] };
    where.criadoEm = { gte: per.inicio, lte: per.fim };
    const [total, rows] = await Promise.all([
        prisma.atendimento.count({ where }),
        prisma.atendimento.findMany({
            where,
            orderBy: { criadoEm: 'desc' },
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, tipo: true, observacao: true, acaoKey: true, acaoLabel: true,
                criadoEm: true, gpsVendedor: true, proximaVisita: true, clienteId: true, leadId: true,
                vendedor: { select: { id: true, nome: true } },
                cliente: { select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, Telefone_Celular: true } },
                lead: { select: { id: true, numero: true, nomeEstabelecimento: true, cidade: true } },
            },
        }),
    ]);
    const data = rows.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        acaoKey: a.acaoKey,
        acaoLabel: a.acaoLabel,
        observacao: a.observacao,
        criadoEm: a.criadoEm,
        gps: a.gpsVendedor || null,
        proximaVisita: a.proximaVisita,
        vendedor: a.vendedor ? { id: a.vendedor.id, nome: a.vendedor.nome } : null,
        cliente: a.cliente ? {
            id: a.cliente.UUID,
            nome: a.cliente.NomeFantasia || a.cliente.Nome,
            cidade: a.cliente.End_Cidade || null,
            whatsapp: a.cliente.Telefone_Celular || null,
        } : null,
        lead: a.lead ? { id: a.lead.id, numero: a.lead.numero, nome: a.lead.nomeEstabelecimento, cidade: a.lead.cidade } : null,
    }));
    return lista({
        page: pg.page, limit: pg.limit, total, data,
        extra: {
            visao: 'registros', de: per.de, ate: per.ate,
            aviso: 'Notas e visitas gravadas. Pedido feito direto no app não vira linha aqui — está em /vendas. O padrão esconde tipo FINANCEIRO, igual à tela.',
        },
    });
}

async function diarios(query) {
    const per = periodoObrigatorio(query, { maxDias: 366 });
    const pg = pagina(query);
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const where = {
        dataReferencia: { gte: per.de, lte: per.ate },
        ...(vendedorId ? { vendedorId } : {}),
    };
    const [total, rows] = await Promise.all([
        prisma.diarioVendedor.count({ where }),
        prisma.diarioVendedor.findMany({
            where,
            orderBy: [{ dataReferencia: 'desc' }, { inicioHora: 'desc' }],
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, modo: true, dataReferencia: true, kmInicial: true, kmFinal: true,
                obs: true, inicioHora: true, fimHora: true,
                vendedor: { select: { id: true, nome: true } },
                veiculo: { select: { id: true, placa: true, modelo: true } },
            },
        }),
    ]);
    const data = rows.map((d) => ({
        id: d.id,
        data: d.dataReferencia,
        modo: d.modo,
        inicio: d.inicioHora,
        fim: d.fimHora,
        kmInicial: d.kmInicial,
        kmFinal: d.kmFinal,
        obs: d.obs || null,
        vendedor: d.vendedor ? { id: d.vendedor.id, nome: d.vendedor.nome } : null,
        veiculo: d.veiculo ? { id: d.veiculo.id, placa: d.veiculo.placa, modelo: d.veiculo.modelo } : null,
    }));
    return lista({ page: pg.page, limit: pg.limit, total, data, extra: { de: per.de, ate: per.ate } });
}

const ABERTAS = ['PENDENTE', 'PARCIAL', 'VENCIDO'];
const LEITURA_RECEBER = 'situacao.inadimplente é a regra do app (inadimplenciaService): Pix/cartão/dinheiro apontado e ainda não conciliado NÃO é inadimplência. diasAtraso e aguardandoConciliacao são informação; não use só eles para cobrar.';
const dataVenc = (d) => new Date(d).toISOString().slice(0, 10);

function diasAtrasoDe(parcela, hoje) {
    if (!ABERTAS.includes(parcela.status)) return null;
    const venc = dataVenc(parcela.dataVencimento);
    if (venc >= hoje) return null;
    return Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${venc}T00:00:00Z`)) / 86400000);
}

async function receber(query) {
    const pg = pagina(query);
    const where = {};
    const status = String(query.status || 'ABERTAS').toUpperCase();
    if (status === 'ABERTAS') where.status = { in: ABERTAS };
    else if (status === 'PAGO' || status === 'PAGAS') where.status = 'PAGO';
    else if (status === 'CANCELADO' || status === 'CANCELADAS') where.status = 'CANCELADO';
    else if (status !== 'TODAS' && status !== 'TODOS') {
        if (!['PENDENTE', 'PARCIAL', 'VENCIDO', 'PAGO', 'CANCELADO'].includes(status)) {
            throw erro(400, 'status inválido.', 'STATUS_INVALIDO');
        }
        where.status = status;
    }
    const clienteId = idOpcional(query.clienteId, 'clienteId');
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const conta = {};
    if (query.somenteInadimplentes === '1') {
        const ids = await inadimplenciaService.clienteIdsEmAtraso({ somenteBloqueio: query.bloqueiaVenda === '1' });
        if (clienteId && !ids.includes(clienteId)) {
            return lista({ page: pg.page, limit: pg.limit, total: 0, data: [], extra: { leitura: LEITURA_RECEBER } });
        }
        conta.clienteId = clienteId || { in: ids.length ? ids : ['__nenhum__'] };
    } else if (clienteId) {
        conta.clienteId = clienteId;
    }
    if (vendedorId) conta.cliente = { idVendedor: vendedorId };
    if (Object.keys(conta).length) where.contaReceber = conta;

    let de = null; let ate = null;
    if (query.de || query.ate) {
        const per = periodoObrigatorio(query, { maxDias: 366 });
        de = per.de; ate = per.ate;
        where.dataVencimento = { gte: per.inicio, lte: per.fim };
    } else if (!clienteId && query.somenteInadimplentes !== '1') {
        const hoje = isoNowTZ();
        de = somaDiasISO(hoje, -365);
        ate = hoje;
        where.dataVencimento = { gte: inicioDiaSP(de), lte: fimDiaSP(ate) };
    }

    const [total, rows] = await Promise.all([
        prisma.parcela.count({ where }),
        prisma.parcela.findMany({
            where,
            orderBy: { dataVencimento: 'asc' },
            skip: pg.skip,
            take: pg.limit,
            select: {
                id: true, numeroParcela: true, valor: true, valorPago: true, valorDescontoTotal: true,
                status: true, dataVencimento: true, dataPagamento: true, formaPagamento: true,
                contaReceber: {
                    select: {
                        id: true, status: true, origem: true, valorTotal: true, aguardandoConciliacao: true, pedidoId: true,
                        cliente: {
                            select: {
                                UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, idVendedor: true,
                                vendedor: { select: { nome: true } },
                            },
                        },
                    },
                },
            },
        }),
    ]);
    const idsCli = [...new Set(rows.map((r) => r.contaReceber?.cliente?.UUID).filter(Boolean))];
    const sits = await inadimplenciaService.situacaoPorClientes(idsCli);
    const hoje = isoNowTZ();
    const data = rows.map((p) => {
        const cli = p.contaReceber?.cliente;
        const saldo = dec(num(p.valor) - num(p.valorPago) - num(p.valorDescontoTotal));
        return {
            id: p.id,
            numeroParcela: p.numeroParcela,
            valor: dec(p.valor),
            valorPago: dec(p.valorPago),
            valorDesconto: dec(p.valorDescontoTotal),
            saldo,
            status: p.status,
            dataVencimento: p.dataVencimento,
            dataPagamento: p.dataPagamento,
            formaPagamento: p.formaPagamento || null,
            diasAtraso: diasAtrasoDe(p, hoje),
            conta: p.contaReceber ? {
                id: p.contaReceber.id,
                status: p.contaReceber.status,
                origem: p.contaReceber.origem,
                valorTotal: dec(p.contaReceber.valorTotal),
                aguardandoConciliacao: !!p.contaReceber.aguardandoConciliacao,
                pedidoId: p.contaReceber.pedidoId,
            } : null,
            cliente: cli ? {
                id: cli.UUID,
                nome: cli.NomeFantasia || cli.Nome,
                cidade: cli.End_Cidade || null,
                vendedorId: cli.idVendedor,
                vendedor: cli.vendedor?.nome || null,
            } : null,
            situacao: inadimplenciaService.resumir(sits.get(cli?.UUID)),
        };
    });
    return lista({
        page: pg.page, limit: pg.limit, total, data,
        extra: { de, ate, leitura: LEITURA_RECEBER },
    });
}

async function leads(query) {
    const pg = pagina(query);
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    if (query.parados === '1') {
        const r = await leadService.listarParados({ vendedorId: vendedorId || undefined });
        return {
            ...r,
            aviso: 'Leads parados, a mesma consulta da gestão (teto de 1000, o mais antigo primeiro).',
            data: (r.data || []).map((l) => ({
                id: l.id,
                numero: l.numero,
                nomeEstabelecimento: l.nomeEstabelecimento,
                cidade: l.cidade || null,
                etapa: l.etapa,
                criadoEm: l.criadoEm || l.createdAt,
                proximaVisita: l.proximaVisita,
                vendedor: l.vendedor ? { id: l.vendedor.id, nome: l.vendedor.nome } : null,
                ultimoAtendimento: l.ultimoAtendimento || null,
            })),
        };
    }
    const r = await leadService.listar({
        vendedorId: vendedorId || undefined,
        search: query.q ? String(query.q).trim().slice(0, 80) : undefined,
        etapa: query.etapa ? String(query.etapa).trim().toUpperCase() : undefined,
        page: pg.page,
        limit: pg.limit,
    });
    return {
        page: r.page,
        total: r.total,
        totalPages: r.totalPages,
        limit: pg.limit,
        data: (r.data || []).map((l) => ({
            id: l.id,
            numero: l.numero,
            nomeEstabelecimento: l.nomeEstabelecimento,
            contato: l.contato || null,
            whatsapp: l.whatsapp || null,
            cidade: l.cidade || null,
            diasVisita: l.diasVisita || null,
            horarioAtendimento: l.horarioAtendimento || null,
            horarioEntrega: l.horarioEntrega || null,
            formasAtendimento: l.formasAtendimento || [],
            pontoGps: l.pontoGps || null,
            etapa: l.etapa,
            origemLead: l.origemLead || null,
            proximaVisita: l.proximaVisita,
            observacoes: l.observacoes || null,
            vendedor: l.vendedor ? { id: l.vendedor.id, nome: l.vendedor.nome } : null,
            clienteId: l.clienteId || null,
            categoria: l.categoriaCliente ? { id: l.categoriaCliente.id, nome: l.categoriaCliente.nome } : null,
            ultimoAtendimento: l.atendimentos?.[0] ? {
                em: l.atendimentos[0].criadoEm,
                tipo: l.atendimentos[0].tipo,
                acao: l.atendimentos[0].acaoLabel || null,
            } : null,
            criadoEm: l.createdAt,
        })),
    };
}

module.exports = {
    painel, clientes, financeiroCliente, vendas, vendasItens, produtos, tabelasPreco,
    promocoes, vendedores, atendimentos, diarios, receber, leads, REGRA_VENDA,
};
