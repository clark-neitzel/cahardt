// Objeto ÚNICO de pedido para a API de consulta da IA (`/api/ia-consulta/v1`, v1.6.0) e as
// consultas de pedido reutilizadas pelos dois reconhecimentos (geral e congelados):
//   • `pedidoParaIA(fonte, registro)` — mesmo formato para um Pedido real (`fonte: "PEDIDO"`) e
//     para um pedido ainda na fila do site/da Ana (`fonte: "FILA"`, tabela congelados_pedidos);
//   • `listarPedidosDoCliente` — histórico com a fila NO TOPO (fora do limite);
//   • `ultimoPedidoDetalhe`, `pedidosEmAberto`, `pedidoPorNumero`.
//
// Regras de contrato (backend/docs/ia-consulta-api.md): os campos que o histórico já devolvia
// (`numero, data, dataEntrega, statusEntrega, tipo, total, itens[{produtoId,nome,quantidade,
// unidade,precoUnit}]`) mantêm nome, tipo e semântica. ATENÇÃO à semântica antiga: `dataEntrega`
// é a HORA REAL da entrega (gravada pelo motorista em entregas.js) — a data prevista está em
// `dataPrevista`.
//
// Este módulo NÃO importa congeladosService nem iaClienteService (os dois importam ele).
const prisma = require('../config/database');
const { normalizarDoc } = require('../utils/documento');
const {
    PRODUTO_INCLUDE_IA, carregarExtrasProdutos, produtoParaIA, preparoLabelDeEtiqueta, round2, dataSP,
} = require('./iaProdutoSerializer');

const dec = (v) => (v == null ? 0 : Number(v));
const STATUS_FILA_ABERTA = ['AGUARDANDO', 'PENDENTE_CADASTRO'];
const ENTREGUE = ['ENTREGUE', 'ENTREGUE_PARCIAL', 'DEVOLVIDO'];
const PREFIXO_IA = /^\s*\[WhatsApp IA\]\s*/;

const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// ── selects/includes (validados contra o schema.prisma — campo inexistente derruba a rota) ──
const PEDIDO_SELECT = (comItens) => ({
    id: true, numero: true, dataVenda: true, dataEntrega: true, statusEntrega: true,
    especial: true, bonificacao: true, cancelado: true, canalOrigem: true, nfeNumero: true,
    createdAt: true, observacoes: true,
    congeladosPedido: { select: { numero: true, origem: true, observacaoInterna: true } },
    embarque: { select: { responsavel: { select: { nome: true } } } },
    itens: {
        select: comItens
            ? { produtoId: true, valor: true, quantidade: true, promocaoId: true, produto: { include: PRODUTO_INCLUDE_IA } }
            : { valor: true, quantidade: true },
    },
});
const FILA_INCLUDE = {
    itens: { include: { congeladosProduto: { include: { produto: { include: PRODUTO_INCLUDE_IA } } } } },
};

// Fila do cliente: pela conta do site vinculada OU pelo documento (cobre conta ainda sem clienteUuid).
function whereFilaDoCliente(cliente, statusIn = STATUS_FILA_ABERTA) {
    const doc = normalizarDoc(cliente.Documento);
    return {
        status: { in: statusIn },
        OR: [
            { congeladosCliente: { clienteUuid: cliente.UUID } },
            ...(doc ? [{ documentoCliente: doc }] : []),
        ],
    };
}

// Acréscimo % da condição do cliente (ou da tabela "Site" se ele não tem condição) — mesma
// regra do site (congeladosService.contextoPreco), copiada aqui em 12 linhas para não criar
// ciclo de import. Só o acréscimo: o resto do contexto não é usado neste módulo.
async function acrescimoDoCliente(cliente) {
    if (cliente?.Condicao_de_pagamento) {
        const t = await prisma.tabelaPreco.findUnique({ where: { id: cliente.Condicao_de_pagamento }, select: { acrescimoPreco: true } }).catch(() => null);
        if (t) return dec(t.acrescimoPreco);
    }
    const s = await prisma.tabelaPreco.findFirst({
        where: { ativo: true, OR: [{ id: 'SITE' }, { idCondicao: { equals: 'SITE', mode: 'insensitive' } }, { nomeCondicao: { equals: 'Site', mode: 'insensitive' } }] },
        select: { acrescimoPreco: true },
    }).catch(() => null);
    return s ? dec(s.acrescimoPreco) : 0;
}

// Rótulo de preparo por categoria (config do site `categoriasNomes[cat].preparo`).
async function preparoPorCategoria() {
    const row = await prisma.congeladosConfig.findUnique({ where: { chave: 'categoriasNomes' } }).catch(() => null);
    const overrides = (row && row.valor) || {};
    const map = {};
    for (const [cat, ov] of Object.entries(overrides)) {
        if (ov && typeof ov === 'object' && ov.preparo) map[cat] = String(ov.preparo).trim();
    }
    return map;
}

// ── serialização ───────────────────────────────────────────────────────────────────────────
// Preparo: etiqueta manda (mesma prioridade do catálogo, congeladosService.catalogoPublico —
// decisão do dono 16/09/2026), categoria é reserva.
function itemProduto(prod, ctx) {
    if (!prod) return null;
    const etiqueta = ctx.extras.etiquetas.get(prod.id) || null;
    const preparoCategoria = ctx.preparos[prod.categoriaProduto?.id] || '';
    const preparoEtiqueta = etiqueta ? preparoLabelDeEtiqueta(etiqueta.modoPreparo) : null;
    return produtoParaIA({
        produto: prod,
        cp: prod.congeladosProduto || null,
        etiqueta,
        promo: ctx.extras.promos.get(prod.id) || null,
        preparoLabel: preparoEtiqueta || preparoCategoria,
        preparoOrigem: preparoEtiqueta ? 'ETIQUETA' : (preparoCategoria ? 'CATEGORIA' : null),
        acrescimoPct: ctx.acrescimoPct,
        precoCliente: ctx.precoClientePorProduto ? (ctx.precoClientePorProduto[prod.id] ?? null) : null,
        nomePorProdutoId: ctx.extras.nomes,
    });
}

function pedidoParaIA(fonte, reg, ctx) {
    const comItens = ctx.comItens !== false;
    if (fonte === 'FILA') {
        const obs = reg.observacoes ? String(reg.observacoes).replace(PREFIXO_IA, '').trim() : '';
        const itens = (reg.itens || []).map(it => {
            const cp = it.congeladosProduto || null;
            const prod = cp?.produto || null;
            const qtd = dec(it.quantidade);
            const precoUnit = dec(it.precoUnitario);
            return {
                produtoId: cp?.produtoId || null,
                nome: it.nomeProduto,
                quantidade: qtd,
                unidade: prod?.unidade || null,
                precoUnit,
                id: it.congeladosProdutoId || null,
                precoTotal: round2(precoUnit * qtd),
                promocaoId: it.promocaoId || null,
                nomePromocao: it.nomePromocao || null,
                produto: itemProduto(prod, ctx),
            };
        });
        return {
            fonte: 'FILA',
            id: reg.id,
            numero: reg.numero,
            numeroFila: reg.numero,
            data: reg.createdAt,
            criadoEm: reg.createdAt,
            dataPrevista: reg.dataEntrega || null,   // data escolhida na fila (pode ser null)
            dataEntrega: null,                        // ainda não foi entregue
            entregueEm: null,
            entregador: null,
            status: reg.status,                       // AGUARDANDO | PENDENTE_CADASTRO
            statusEntrega: 'PENDENTE',
            emAberto: true,
            tipo: null,                               // o faturamento decide na aprovação
            total: round2(reg.total),
            modo: reg.modo || null,
            origem: reg.origem || 'SITE',
            canalOrigem: null,
            observacoes: obs || null,                 // só a observação do cliente (sem o prefixo [WhatsApp IA])
            observacaoInterna: reg.observacaoInterna || null,
            nfeNumero: null,
            ...(comItens ? { itens } : {}),
        };
    }

    // fonte PEDIDO
    const total = round2((reg.itens || []).reduce((s, i) => s + dec(i.valor) * dec(i.quantidade), 0));
    const entregue = ENTREGUE.includes(reg.statusEntrega);
    const cpRel = reg.congeladosPedido || null;
    let origem = 'APP';
    if (reg.canalOrigem === 'SITE_CONGELADOS') origem = cpRel?.origem || 'SITE';
    else if (reg.canalOrigem === 'KIT_FESTA') origem = 'KIT_FESTA';
    const dataVendaStr = dataSP(reg.dataVenda);
    const itens = comItens
        ? (reg.itens || []).map(i => {
            const prod = i.produto || null;
            const qtd = dec(i.quantidade);
            const precoUnit = dec(i.valor);
            return {
                produtoId: i.produtoId,
                nome: prod?.nome || null,
                quantidade: qtd,
                unidade: prod?.unidade || null,
                precoUnit,
                id: prod?.congeladosProduto?.id || null,
                precoTotal: round2(precoUnit * qtd),
                promocaoId: i.promocaoId || null,
                produto: itemProduto(prod, ctx),
            };
        })
        : undefined;
    return {
        fonte: 'PEDIDO',
        id: reg.id,
        numero: reg.numero,
        numeroFila: cpRel?.numero ?? null,
        data: reg.dataVenda,                          // existente (data de venda/entrega prevista)
        criadoEm: reg.createdAt,
        dataPrevista: reg.dataVenda,
        dataEntrega: reg.dataEntrega,                 // existente — hora REAL da entrega
        entregueEm: entregue ? reg.dataEntrega : null,
        entregador: reg.embarque?.responsavel?.nome || null,
        status: reg.cancelado ? 'CANCELADO' : 'APROVADO',
        statusEntrega: reg.statusEntrega,
        emAberto: !reg.cancelado && reg.statusEntrega === 'PENDENTE' && !!dataVendaStr && dataVendaStr >= ctx.hoje,
        tipo: reg.bonificacao ? 'BONIFICACAO' : (reg.especial ? 'ESPECIAL' : 'NORMAL'),
        total,
        modo: null,
        origem,
        canalOrigem: reg.canalOrigem || null,
        observacoes: reg.observacoes || null,
        observacaoInterna: cpRel?.observacaoInterna || null,
        nfeNumero: reg.nfeNumero ?? null,
        ...(comItens ? { itens } : {}),
    };
}

// Produtos crus referenciados pelos itens de um lote [{ fonte, reg }] — usado tanto por
// serializarLote (pra saber o que carregar) quanto pelo chamador (pra montar o UNION de
// produtos do catálogo + dos pedidos ANTES de carregar etiquetas/promoções uma única vez).
function produtosDeEntradas(entradas) {
    const produtos = [];
    for (const { fonte, reg } of entradas) {
        for (const it of reg.itens || []) {
            const prod = fonte === 'FILA' ? it.congeladosProduto?.produto : it.produto;
            if (prod) produtos.push(prod);
        }
    }
    return produtos;
}

// Serializa um lote de entradas [{ fonte, reg }] carregando os extras UMA vez (sem N+1).
// `extras`/`preparos` (revisor 09/2026): se o CHAMADOR já carregou (ex.: reconhecimento, que
// precisa dos mesmos extras pro catálogo + pros dois pedidos), passa pronto aqui e a função
// não refaz a consulta — é isso que elimina as ~3 cargas redundantes por mensagem no caminho
// quente (reconhecer-telefone). Sem eles, comportamento idêntico ao de antes (carrega sozinho).
async function serializarLote(entradas, { cliente = null, comItens = true, acrescimoPct = null, precoClientePorProduto = null, extras = null, preparos = null } = {}) {
    const precisaCarregar = comItens && (!extras || !preparos);
    const produtos = precisaCarregar ? produtosDeEntradas(entradas) : [];
    const [extrasFinal, preparosFinal, acr] = await Promise.all([
        extras || (comItens ? carregarExtrasProdutos(produtos) : Promise.resolve({ etiquetas: new Map(), promos: new Map(), nomes: new Map() })),
        preparos || (comItens ? preparoPorCategoria() : Promise.resolve({})),
        acrescimoPct != null ? Promise.resolve(dec(acrescimoPct)) : acrescimoDoCliente(cliente),
    ]);
    const ctx = { comItens, extras: extrasFinal, preparos: preparosFinal, acrescimoPct: acr, precoClientePorProduto, hoje: hojeSP() };
    return entradas.map(({ fonte, reg }) => pedidoParaIA(fonte, reg, ctx));
}

const iaPedidoService = {
    hojeSP,
    whereFilaDoCliente,
    acrescimoDoCliente,
    preparoPorCategoria,
    produtosDeEntradas,

    // Fila aberta do cliente (AGUARDANDO/PENDENTE_CADASTRO), crua, mais recente primeiro.
    async filaDoCliente(cliente) {
        return prisma.congeladosPedido.findMany({
            where: whereFilaDoCliente(cliente),
            include: FILA_INCLUDE,
            orderBy: { createdAt: 'desc' },
        });
    },

    // ── Buscas CRUAS (sem serializar) — v1.6.0 (revisor 09/2026) ──────────────────────────────
    // Usadas pelo reconhecimento (congeladosService.catalogoPorTelefone e
    // iaClienteService.reconhecerPorTelefone) para buscar os registros ANTES de montar o union
    // de produtos e carregar etiquetas/promoções/preparo UMA vez só — depois passadas de volta
    // via ctx (`regUltimoPedido`/`regsAberto`) pra ultimoPedidoDetalhe/pedidosEmAberto não
    // repetirem a mesma query.
    async buscarUltimoPedidoRegistro(cliente) {
        return prisma.pedido.findFirst({
            where: { clienteId: cliente.UUID, bonificacao: false, cancelado: false, statusEnvio: { not: 'EXCLUIDO' } },
            orderBy: { createdAt: 'desc' },
            select: PEDIDO_SELECT(true),
        });
    },
    async buscarPedidosEmAbertoRegistros(cliente) {
        const hoje = new Date(hojeSP() + 'T00:00:00.000Z');
        const [fila, pedidos] = await Promise.all([
            this.filaDoCliente(cliente),
            prisma.pedido.findMany({
                where: { clienteId: cliente.UUID, cancelado: false, statusEntrega: 'PENDENTE', statusEnvio: { not: 'EXCLUIDO' }, dataVenda: { gte: hoje } },
                orderBy: { dataVenda: 'asc' },
                take: 5,
                select: PEDIDO_SELECT(true),
            }),
        ]);
        return { fila, pedidos };
    },

    // Histórico: fila no topo (SEMPRE, fora do `limite`) + Pedidos por dataVenda desc.
    // Pedido da fila já CONVERTIDO não entra (o Pedido real correspondente entra com numeroFila).
    async listarPedidosDoCliente({ cliente, limite = 10, comItens = false, ...ctx }) {
        const take = Math.min(Math.max(parseInt(limite) || 10, 1), 30);
        const [fila, pedidos] = await Promise.all([
            this.filaDoCliente(cliente),
            prisma.pedido.findMany({
                where: { clienteId: cliente.UUID, statusEnvio: { not: 'EXCLUIDO' } },
                orderBy: { dataVenda: 'desc' },
                take,
                select: PEDIDO_SELECT(comItens),
            }),
        ]);
        return serializarLote(
            [...fila.map(reg => ({ fonte: 'FILA', reg })), ...pedidos.map(reg => ({ fonte: 'PEDIDO', reg }))],
            { cliente, comItens, ...ctx },
        );
    },

    // Último pedido REAL (não bonificação, não cancelado, não excluído; o feito por último) —
    // mesma regra do `ultimoPedido[]` do reconhecimento congelados, agora como objeto com itens.
    // `ctx.regUltimoPedido` (v1.6.0): se o chamador já buscou o registro cru (via
    // buscarUltimoPedidoRegistro, pra montar o union de produtos), reaproveita em vez de buscar
    // de novo — `undefined` (chave ausente) continua buscando sozinho, como sempre.
    async ultimoPedidoDetalhe(cliente, ctx = {}) {
        const { regUltimoPedido, ...ctxLote } = ctx;
        const reg = regUltimoPedido !== undefined ? regUltimoPedido : await this.buscarUltimoPedidoRegistro(cliente);
        if (!reg) return null;
        const [obj] = await serializarLote([{ fonte: 'PEDIDO', reg }], { cliente, comItens: true, ...ctxLote });
        return obj;
    },

    // "Já tem pedido esta semana": fila aberta + Pedidos ainda não entregues com data prevista
    // de hoje em diante (máx. 5), com itens. `ctx.regsAberto` — mesma ideia acima.
    async pedidosEmAberto(cliente, ctx = {}) {
        const { regsAberto, ...ctxLote } = ctx;
        const { fila, pedidos } = regsAberto !== undefined ? regsAberto : await this.buscarPedidosEmAbertoRegistros(cliente);
        return serializarLote(
            [...fila.map(reg => ({ fonte: 'FILA', reg })), ...pedidos.map(reg => ({ fonte: 'PEDIDO', reg }))],
            { cliente, comItens: true, ...ctxLote },
        );
    },

    // Pedido por número, SÓ do cliente reconhecido. `Pedido.numero` NÃO é único no banco
    // (números repetidos entre clientes) — por isso filtra por cliente e pega o mais recente,
    // nunca findUnique. `fonte`: 'FILA' consulta pelo número da fila; 'PEDIDO' pelo número do
    // Pedido; sem fonte tenta PEDIDO e depois FILA.
    async pedidoPorNumero({ cliente, numero, fonte = null }, ctx = {}) {
        const n = parseInt(numero, 10);
        if (!Number.isInteger(n) || n <= 0) throw new Error('Informe o número do pedido.');
        const f = String(fonte || '').toUpperCase();
        let reg = null;
        let fonteAchada = null;
        if (f !== 'FILA') {
            reg = await prisma.pedido.findFirst({
                where: { numero: n, clienteId: cliente.UUID, statusEnvio: { not: 'EXCLUIDO' } },
                orderBy: { createdAt: 'desc' },
                select: PEDIDO_SELECT(true),
            });
            if (reg) fonteAchada = 'PEDIDO';
        }
        if (!reg && f !== 'PEDIDO') {
            // Na consulta por número vale QUALQUER status da fila (o cliente pode perguntar de
            // um pedido recusado/convertido) — só o histórico limita a AGUARDANDO/PENDENTE.
            reg = await prisma.congeladosPedido.findFirst({
                where: { ...whereFilaDoCliente(cliente, ['AGUARDANDO', 'PENDENTE_CADASTRO', 'RECUSADO', 'CONVERTIDO', 'CANCELADO']), numero: n },
                include: FILA_INCLUDE,
                orderBy: { createdAt: 'desc' },
            });
            if (reg) fonteAchada = 'FILA';
        }
        if (!reg) return { encontrado: false, pedido: null };
        const [obj] = await serializarLote([{ fonte: fonteAchada, reg }], { cliente, comItens: true, ...ctx });
        return { encontrado: true, pedido: obj };
    },

    // Próximas N datas (YYYY-MM-DD) a partir de AMANHÃ cujo dia da semana está nos dias de
    // entrega do cadastro (0=Dom..6=Sáb). Sem dias cadastrados → [].
    proximasEntregas(diasNums, n = 2) {
        const dias = Array.isArray(diasNums) ? diasNums.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
        if (!dias.length) return [];
        const [y, m, d] = hojeSP().split('-').map(Number);
        const out = [];
        for (let i = 1; i <= 14 && out.length < n; i++) {
            const dt = new Date(Date.UTC(y, m - 1, d + i));
            if (dias.includes(dt.getUTCDay())) out.push(dt.toISOString().slice(0, 10));
        }
        return out;
    },
};

module.exports = iaPedidoService;
