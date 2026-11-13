// Ficha do cliente para os agentes (GET /v1/clientes/:id/ficha) e lista de "cadastros pra acertar"
// (GET /v1/cadastros-pendentes). Só leitura. Poucas queries, nenhuma por item.
const prisma = require('../config/database');
const { erro, idOpcional, pagina, lista, num, dec, somaDiasISO, isoNowTZ, inicioDiaSP } = require('./analyticsComum');
const completo = require('./clienteCadastroCompletoService');
const contatos = require('./clienteContatoService');
const classif = require('./clienteClassificacaoService');
const telefonesSvc = require('./clienteTelefonesService');
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
            Email: true, Telefone: true, Telefone_Celular: true, Telefone_Comercial: true,
            whatsapp: { select: { numeros: true } },
            End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, End_Estado: true, End_CEP: true,
            Dia_de_venda: true, Dia_de_entrega: true, Condicao_de_pagamento: true, condicoes_pagamento_permitidas: true,
            idVendedor: true, vendedor: { select: { id: true, nome: true, ativo: true } },
        },
    });
    if (!cli) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');

    const idsTabelas = [...new Set([cli.Condicao_de_pagamento, ...(cli.condicoes_pagamento_permitidas || [])].filter(Boolean))];
    const desde = inicioDiaSP(somaDiasISO(isoNowTZ().slice(0, 10), -DIAS_TOP));
    const filtroPedido = { clienteId: id, ...WHERE_PEDIDO_RECEITA, cancelado: false };

    const [tabelas, pedidos, itens, bloco, mapaClassif, prefTel] = await Promise.all([
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
        telefonesSvc.lerPreferencia(id),
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
            comercial: cli.Telefone_Comercial || null,
            whatsapps: cli.whatsapp?.numeros || [],
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
        // Telefones para WhatsApp na ORDEM PREFERIDA (o 1º válido é o preferido), com o número já no
        // formato da Z-API (55 + DDD + número) e a pendência "Telefone incompleto" (nov/2026).
        telefonesWhatsapp: telefonesSvc.montarTelefones(cli, bloco?.data || [], prefTel),
        classificacao,
        somenteFornecedor: classificacao.somenteFornecedor,
    };
}

const GRUPOS = ['acertar', 'classificar', 'telefone'];

/**
 * Cadastros ATIVOS por grupo (filtro opcional: vendedorId):
 *  - acertar (padrão): campo obrigatório faltando E classificação efetiva CLIENTE ou CLIENTE_FORNECEDOR.
 *    Fornecedor-só e "a classificar" NÃO são clientes incompletos.
 *  - classificar: classificação efetiva A_CLASSIFICAR (com ou sem os 4 campos preenchidos).
 *  - telefone: CLIENTE / CLIENTE_FORNECEDOR com telefone incompleto (sem DDD, DDD inexistente, dígitos
 *    errados, "55 no lugar do DDD") — também entram em `acertar`, com a pendência "Telefone incompleto".
 *    Número com DDD + número NÃO é pendência: o 55 é colocado na hora do envio.
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
            End_Estado: true, Telefone: true, Telefone_Celular: true, Telefone_Comercial: true,
            whatsapp: { select: { numeros: true } },
        },
    });
    const [mapa, telContatos] = await Promise.all([
        classif.classificacaoDeClientes(rows, { todos: true }),
        telefonesDosContatos(),
    ]);
    const contagens = { acertar: 0, classificar: 0, telefone: 0 };
    const doGrupo = [];
    for (const c of rows) {
        const k = mapa.get(c.UUID);
        const cadastro = completo.avaliarLinha(c, tabelas);
        const ehCliente = k.valor === 'CLIENTE' || k.valor === 'CLIENTE_FORNECEDOR';
        const telefone = ehCliente ? telefonesSvc.montarTelefones(c, telContatos.get(c.UUID) || []).pendencia : null;
        if (ehCliente && (!cadastro.completo || telefone)) {
            contagens.acertar += 1;
            if (telefone) contagens.telefone += 1;
            if (grupo === 'acertar' || (grupo === 'telefone' && telefone)) doGrupo.push({ c, k, cadastro, telefone });
        } else if (k.valor === classif.A_CLASSIFICAR) {
            contagens.classificar += 1;
            if (grupo === 'classificar') doGrupo.push({ c, k, cadastro, telefone: null });
        }
    }
    const data = doGrupo.slice(pg.skip, pg.skip + pg.limit).map(({ c, k, cadastro, telefone }) => ({
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
        // `faltando` continua sendo só os 4 campos da regra da Ana; o telefone vem à parte
        telefoneIncompleto: telefone || null,
        pendencias: [...cadastro.faltando, ...(telefone ? [{ campo: telefone.campo, rotulo: telefone.rotulo }] : [])],
    }));
    return lista({ page: pg.page, limit: pg.limit, total: doGrupo.length, data, extra: { grupo, contagens } });
}

// Telefones das pessoas do WhatsApp (cliente_contatos) de todos os clientes, numa query só.
// Se a leitura falhar, a lista sai só com os telefones do cadastro (não derruba a tela).
async function telefonesDosContatos() {
    const mapa = new Map();
    try {
        const rows = await prisma.clienteContato.findMany({ select: { clienteUuid: true, telefone: true } });
        for (const r of rows || []) {
            if (!mapa.has(r.clienteUuid)) mapa.set(r.clienteUuid, []);
            mapa.get(r.clienteUuid).push({ telefone: r.telefone });
        }
    } catch (e) {
        console.error('[CadastrosPendentes] telefones dos contatos indisponíveis:', e?.message || e);
    }
    return mapa;
}

module.exports = { ficha, cadastrosPendentes };
