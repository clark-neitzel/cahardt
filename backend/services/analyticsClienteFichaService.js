// Ficha do cliente para os agentes (GET /v1/clientes/:id/ficha) e lista de "cadastros pra acertar"
// (GET /v1/cadastros-pendentes). Só leitura. Poucas queries, nenhuma por item.
const prisma = require('../config/database');
const { erro, idOpcional, pagina, lista, num, dec, somaDiasISO, isoNowTZ, inicioDiaSP } = require('./analyticsComum');
const completo = require('./clienteCadastroCompletoService');
const contatos = require('./clienteContatoService');
const classif = require('./clienteClassificacaoService');
const { WHERE_PEDIDO_RECEITA } = require('./projecaoVendasService');

const DIAS_TOP = 90;
const ULTIMOS = 5;
const TOP = 8;

const nomeDe = (c) => c.NomeFantasia || c.Nome || null;
const endereco = (c) => [c.End_Logradouro, c.End_Numero, c.End_Bairro, c.End_Cidade && (c.End_Estado ? `${c.End_Cidade}/${c.End_Estado}` : c.End_Cidade)]
    .filter(Boolean).join(', ') || null;
const dias = (s) => String(s || '').split(',').map((d) => d.trim()).filter(Boolean);

async function ficha(clienteId) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const cli = await prisma.cliente.findUnique({
        where: { UUID: id },
        select: {
            UUID: true, Nome: true, NomeFantasia: true, Documento: true, Tipo_Pessoa: true, Ativo: true, Perfis: true,
            Email: true, Telefone: true, Telefone_Celular: true,
            End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, End_Estado: true, End_CEP: true,
            Dia_de_venda: true, Dia_de_entrega: true, Condicao_de_pagamento: true, condicoes_pagamento_permitidas: true,
            idVendedor: true, vendedor: { select: { id: true, nome: true, ativo: true } },
        },
    });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');

    const idsTabelas = [...new Set([cli.Condicao_de_pagamento, ...(cli.condicoes_pagamento_permitidas || [])].filter(Boolean))];
    const desde = inicioDiaSP(somaDiasISO(isoNowTZ().slice(0, 10), -DIAS_TOP));
    const filtroPedido = { clienteId: id, ...WHERE_PEDIDO_RECEITA, cancelado: false };

    const [tabelas, pedidos, itens, bloco, mapaClassif] = await Promise.all([
        idsTabelas.length
            ? prisma.tabelaPreco.findMany({
                where: { OR: [{ id: { in: idsTabelas } }, { idCondicao: { in: idsTabelas } }] },
                select: { id: true, idCondicao: true, nomeCondicao: true, ativo: true, acrescimoPreco: true, qtdParcelas: true, parcelasDias: true },
            })
            : [],
        prisma.pedido.findMany({
            where: filtroPedido,
            orderBy: { dataVenda: 'desc' },
            take: ULTIMOS,
            select: { id: true, numero: true, dataVenda: true, especial: true, statusEntrega: true, itens: { select: { quantidade: true, valor: true } } },
        }),
        prisma.pedidoItem.findMany({
            where: { pedido: { ...filtroPedido, dataVenda: { gte: desde } } },
            select: { pedidoId: true, produtoId: true, quantidade: true, produto: { select: { nome: true, codigo: true, unidade: true } } },
            take: 5000,
        }),
        contatos.listar(id),
        classif.classificacaoDeClientes([cli]),
    ]);
    const classificacao = mapaClassif.get(id);

    const tabela = completo.resolverTabela(cli.Condicao_de_pagamento, tabelas);
    const permitidas = (cli.condicoes_pagamento_permitidas || []).map((x) => {
        const t = completo.resolverTabela(x, tabelas);
        return { id: t ? t.id : x, nome: t ? t.nomeCondicao : null, ativo: t ? !!t.ativo : null };
    });

    const porProduto = new Map();
    for (const i of itens) {
        const p = porProduto.get(i.produtoId) || { produtoId: i.produtoId, produto: i.produto?.nome || null, codigo: i.produto?.codigo || null, unidade: i.produto?.unidade || null, quantidade: 0, pedidos: new Set() };
        p.quantidade += num(i.quantidade);
        p.pedidos.add(i.pedidoId);
        porProduto.set(i.produtoId, p);
    }
    const topProdutos = [...porProduto.values()]
        .map((p) => ({ produtoId: p.produtoId, produto: p.produto, codigo: p.codigo, unidade: p.unidade, quantidade: Math.round(p.quantidade * 1000) / 1000, vezes: p.pedidos.size }))
        .sort((a, b) => b.vezes - a.vezes || b.quantidade - a.quantidade)
        .slice(0, TOP);

    return {
        cliente: {
            id: cli.UUID,
            nome: nomeDe(cli),
            razaoSocial: cli.Nome || null,
            documento: cli.Documento || null,
            tipoPessoa: cli.Tipo_Pessoa || null,
            ativo: !!cli.Ativo,
            email: cli.Email || null,
            telefone: cli.Telefone || null,
            celular: cli.Telefone_Celular || null,
            endereco: endereco(cli),
            cidade: cli.End_Cidade || null,
            estado: cli.End_Estado || null,
            cep: cli.End_CEP || null,
        },
        diaVenda: dias(cli.Dia_de_venda),
        diaEntrega: dias(cli.Dia_de_entrega),
        tabelaPreco: tabela ? { id: tabela.id, nome: tabela.nomeCondicao, acrescimoPct: num(tabela.acrescimoPreco), ativo: !!tabela.ativo } : null,
        vendedor: cli.vendedor ? { id: cli.vendedor.id, nome: cli.vendedor.nome, ativo: !!cli.vendedor.ativo } : null,
        condicaoPagamento: {
            padrao: tabela ? { id: tabela.id, nome: tabela.nomeCondicao, qtdParcelas: tabela.qtdParcelas, parcelasDias: tabela.parcelasDias } : null,
            permitidas,
        },
        ultimosPedidos: pedidos.map((p) => ({
            id: p.id,
            numero: p.numero,
            data: p.dataVenda,
            total: dec(p.itens.reduce((s, i) => s + num(i.valor) * num(i.quantidade), 0)),
            status: p.statusEntrega,
            itens: p.itens.length,
            especial: !!p.especial,
        })),
        topProdutos90d: topProdutos,
        contatos: bloco,
        cadastro: completo.avaliarCadastro(cli, { tabela, vendedor: cli.vendedor }),
        classificacao,
        somenteFornecedor: classificacao.somenteFornecedor,
    };
}

const GRUPOS = ['acertar', 'classificar'];

/**
 * Cadastros ATIVOS por grupo (filtro opcional: vendedorId):
 *  - acertar (padrão): campo obrigatório faltando E classificação efetiva CLIENTE ou CLIENTE_FORNECEDOR.
 *    Fornecedor-só e "a classificar" NÃO são clientes incompletos.
 *  - classificar: classificação efetiva A_CLASSIFICAR (com ou sem os 4 campos preenchidos).
 * Carrega os ativos em memória (centenas/poucos milhares), classifica em lote e SÓ DEPOIS pagina —
 * paginar no SQL ficaria errado ao excluir linhas. `contagens` vem do mesmo passeio.
 */
async function cadastrosPendentes(query = {}) {
    const grupo = String(query.grupo ?? 'acertar').trim().toLowerCase() || 'acertar';
    if (!GRUPOS.includes(grupo)) {
        throw erro(400, `grupo inválido. Use: ${GRUPOS.join(', ')}.`, 'GRUPO_INVALIDO');
    }
    const pg = pagina(query);
    const vendedorId = idOpcional(query.vendedorId, 'vendedorId');
    const tabelas = await completo.tabelasAtivas();
    const rows = await prisma.cliente.findMany({
        where: { Ativo: true, ...(vendedorId ? { idVendedor: vendedorId } : {}) },
        orderBy: [{ NomeFantasia: 'asc' }, { Nome: 'asc' }],
        select: {
            UUID: true, Nome: true, NomeFantasia: true, Documento: true, Perfis: true, End_Cidade: true,
            Dia_de_venda: true, Dia_de_entrega: true, Condicao_de_pagamento: true, idVendedor: true,
            vendedor: { select: { id: true, nome: true, ativo: true } },
        },
    });
    const mapa = await classif.classificacaoDeClientes(rows, { todos: true });
    const contagens = { acertar: 0, classificar: 0 };
    const doGrupo = [];
    for (const c of rows) {
        const k = mapa.get(c.UUID);
        const cadastro = completo.avaliarLinha(c, tabelas);
        const ehCliente = k.valor === 'CLIENTE' || k.valor === 'CLIENTE_FORNECEDOR';
        if (ehCliente && !cadastro.completo) {
            contagens.acertar += 1;
            if (grupo === 'acertar') doGrupo.push({ c, k, cadastro });
        } else if (k.valor === classif.A_CLASSIFICAR) {
            contagens.classificar += 1;
            if (grupo === 'classificar') doGrupo.push({ c, k, cadastro });
        }
    }
    const data = doGrupo.slice(pg.skip, pg.skip + pg.limit).map(({ c, k, cadastro }) => ({
        id: c.UUID,
        nome: nomeDe(c),
        cidade: c.End_Cidade || null,
        documento: c.Documento || null,
        vendedorId: c.idVendedor || null,
        vendedor: c.vendedor?.nome || null,
        perfis: k.perfis,
        classificacao: k,
        somenteFornecedor: k.somenteFornecedor,
        ...cadastro,
    }));
    return lista({ page: pg.page, limit: pg.limit, total: doGrupo.length, data, extra: { grupo, contagens } });
}

module.exports = { ficha, cadastrosPendentes };
