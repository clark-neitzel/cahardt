/**
 * Mapa de Clientes — dados para a tela Clientes → Mapa (/clientes/mapa).
 *
 * Só leitura (sem $transaction). Devolve o conjunto INTEIRO de clientes visíveis
 * ao usuário num payload único (~20 campos por cliente); filtros/cores/contagens
 * rodam no navegador. Também calcula os "vizinhos em dias diferentes": pares de
 * clientes a menos de R metros que NÃO têm nenhum dia de entrega em comum.
 *
 * Contrato da API: docs/mapa-clientes/PLANO.md, seção 3 (fechado — o frontend
 * codifica contra ele; só adicionar campo, nunca remover/renomear).
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { parseLatLng, haversineMetros } = require('./pontoService');
const whatsCliente = require('./whatsappClienteService');
const dayjs = require('dayjs');
const { WHERE_PEDIDO_RECEITA } = require('./projecaoVendasService');
const gpsClientesService = require('./gpsClientesService');

const CONFIG_KEY = 'mapa_clientes_config';
const RAIO_PADRAO_M = 1000;
const RAIO_MIN_M = 100;
const RAIO_MAX_M = 20000;

// ── Configuração (raio padrão dos vizinhos) — padrão gpsClientesService ──────

const getConfig = async () => {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } });
    const v = (cfg && typeof cfg.value === 'object' && cfg.value) || {};
    const raio = Number(v.raioMetros);
    return { raioMetros: raioValido(raio) ? Math.floor(raio) : RAIO_PADRAO_M };
};

const raioValido = (n) => Number.isInteger(n) && n >= RAIO_MIN_M && n <= RAIO_MAX_M;

const setConfig = async (patch) => {
    const atual = await getConfig();
    const value = { ...atual, ...patch };
    await prisma.appConfig.upsert({
        where: { key: CONFIG_KEY },
        update: { value },
        create: { key: CONFIG_KEY, value }
    });
    return value;
};

// ── Visibilidade — MESMA expressão de clienteController.listar ──────────────
// Vendedor de campo (permissoes.pedidos.clientes !== 'todos') só vê os seus.
const whereVisibilidade = (reqUser) => {
    if (!reqUser) return {};
    const permissaoPedidos = reqUser.permissoes?.pedidos || {};
    if (permissaoPedidos.clientes !== 'todos') return { idVendedor: reqUser.id };
    return {};
};

const whereAtivo = (ativo) => {
    if (ativo === 'todos') return {};
    if (ativo === 'false') return { Ativo: false };
    return { Ativo: true };
};

// Dia_de_entrega no banco: "SEG, QUI" (vírgula + espaço, DayPicker faz join(', ')).
// "N/D" é devolvido como valor (o frontend decide o que fazer com ele).
const parseDias = (s) => String(s ?? '').split(',').map(x => x.trim()).filter(Boolean);
const diasReais = (dias) => dias.filter(d => d !== 'N/D');

// Perfis no banco (coluna texto com JSON) vem em DOIS formatos, ambos reais:
//   '["Cliente","Fornecedor"]'  (string por item — cadastro antigo/importado do CA)
//   '[{"perfil":"FORNECEDOR"}]' (objeto por item — cadastro feito no app)
// Normaliza para MAIÚSCULAS sem repetição; vazio/inválido → ["CLIENTE"].
const PERFIL_PADRAO = 'CLIENTE';
const parsePerfis = (raw) => {
    let lista = [];
    try { lista = JSON.parse(raw || '[]'); } catch { lista = []; }
    if (!Array.isArray(lista)) lista = [];
    const out = [];
    for (const item of lista) {
        const v = String((item && typeof item === 'object' ? item.perfil : item) ?? '').trim().toUpperCase();
        if (v && !out.includes(v)) out.push(v);
    }
    return out.length ? out : [PERFIL_PADRAO];
};

const vazioParaNull = (v) => {
    const t = v == null ? '' : String(v).trim();
    return t ? t : null;
};

// `select` enxuto — TODOS os nomes conferidos contra prisma/schema.prisma
// (model Cliente, ClienteWhatsappStatus, ClienteGps, ClienteInsight).
const SELECT_CLIENTE = {
    UUID: true, Nome: true, NomeFantasia: true, Ativo: true, Perfis: true,
    End_Cidade: true, End_Bairro: true,
    Dia_de_entrega: true, Dia_de_venda: true, Ponto_GPS: true,
    Telefone: true, Telefone_Celular: true,
    idVendedor: true, categoriaClienteId: true,
    vendedor: { select: { id: true, nome: true, ativo: true } },
    categoriaCliente: { select: { id: true, nome: true } },
    whatsappStatus: { select: { selo: true, dispensaMotivo: true, dispensaEm: true } },
    gps: { select: { balcao: true } },
    clienteInsights: { select: { dataUltimoPedido: true, diasSemComprar: true, cicloReferenciaDias: true }, take: 1 },
};

// Versão enxuta para os vizinhos: só o que o cálculo e o resumo do par usam.
const SELECT_VIZINHOS = {
    UUID: true, Nome: true, NomeFantasia: true, Ponto_GPS: true, Dia_de_entrega: true,
    End_Cidade: true, idVendedor: true,
    vendedor: { select: { nome: true } },
    gps: { select: { balcao: true } },
};

const buscarClientes = async ({ reqUser, ativo, select = SELECT_CLIENTE }) => {
    const where = { ...whereAtivo(ativo), ...whereVisibilidade(reqUser) };
    return prisma.cliente.findMany({ where, select, orderBy: { Nome: 'asc' } });
};

const montarCliente = (c, cfgWhats, ultimaMudanca = null) => {
    const insight = c.clienteInsights?.[0] || null;
    const gps = parseLatLng(c.Ponto_GPS);
    return {
        uuid: c.UUID,
        nome: c.Nome,
        fantasia: vazioParaNull(c.NomeFantasia),
        ativo: c.Ativo === true,
        perfis: parsePerfis(c.Perfis),
        cidade: vazioParaNull(c.End_Cidade),
        bairro: vazioParaNull(c.End_Bairro),
        categoriaId: c.categoriaCliente?.id || c.categoriaClienteId || null,
        categoriaNome: c.categoriaCliente?.nome || null,
        vendedorId: c.vendedor?.id || c.idVendedor || null,
        vendedorNome: c.vendedor?.nome || null,
        vendedorAtivo: c.vendedor ? c.vendedor.ativo === true : null,
        diasEntrega: parseDias(c.Dia_de_entrega),
        diasVenda: parseDias(c.Dia_de_venda),
        diaEntregaRaw: c.Dia_de_entrega ?? '',
        diaVendaRaw: c.Dia_de_venda ?? '',
        gps,
        balcao: c.gps?.balcao === true,
        // Quem atualizou o ponto GPS atual e quando (docs/preview-gps-quem-atualizou.html)
        ultimaMudanca,
        telefone: vazioParaNull(c.Telefone),
        telefoneCelular: vazioParaNull(c.Telefone_Celular),
        whatsapp: whatsCliente.situacaoWhatsapp(c, cfgWhats),
        ultimoPedidoEm: insight?.dataUltimoPedido ? new Date(insight.dataUltimoPedido).toISOString() : null,
        diasSemComprar: insight?.diasSemComprar ?? null,
        cicloDias: insight?.cicloReferenciaDias ?? null,
    };
};

const ordenarPt = (a, b) => String(a).localeCompare(String(b), 'pt-BR');

// Opções de filtro montadas do CONJUNTO INTEIRO devolvido (regra do projeto: a
// opção não some do menu por causa do resultado filtrado).
const montarOpcoes = (clientes, ufPorCidade = new Map()) => {
    const cidades = new Map();
    const bairros = new Map();
    const categorias = new Map();
    const diasEntrega = new Map();
    const diasVenda = new Map();
    const perfis = new Map();
    const inc = (map, chave, extra) => {
        const e = map.get(chave) || { ...extra, qtd: 0 };
        e.qtd++;
        map.set(chave, e);
    };
    for (const c of clientes) {
        // (09/2026) `uf` vem do cadastro oficial de cidades — campo ADICIONADO à faceta ("Cidade · UF").
        if (c.cidade) inc(cidades, c.cidade, { valor: c.cidade, uf: ufPorCidade.get(c.cidade) || null });
        if (c.bairro) inc(bairros, `${c.cidade || ''}|${c.bairro}`, { valor: c.bairro, cidade: c.cidade });
        if (c.categoriaId) inc(categorias, c.categoriaId, { id: c.categoriaId, nome: c.categoriaNome });
        for (const d of c.diasEntrega) inc(diasEntrega, d, { valor: d });
        for (const d of c.diasVenda) inc(diasVenda, d, { valor: d });
        for (const p of c.perfis) inc(perfis, p, { valor: p });
    }
    const ORDEM_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM', 'N/D'];
    const porDia = (a, b) => {
        const ia = ORDEM_DIAS.indexOf(a.valor), ib = ORDEM_DIAS.indexOf(b.valor);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || ordenarPt(a.valor, b.valor);
    };
    return {
        cidades: [...cidades.values()].sort((a, b) => ordenarPt(a.valor, b.valor)),
        bairros: [...bairros.values()].sort((a, b) => ordenarPt(a.cidade || '', b.cidade || '') || ordenarPt(a.valor, b.valor)),
        categorias: [...categorias.values()].sort((a, b) => ordenarPt(a.nome || '', b.nome || '')),
        diasEntrega: [...diasEntrega.values()].sort(porDia),
        diasVenda: [...diasVenda.values()].sort(porDia),
        // { valor, total } — CLIENTE primeiro, depois alfabético (cliente com 2 perfis conta nos 2)
        perfis: [...perfis.values()].map(e => ({ valor: e.valor, total: e.qtd }))
            .sort((a, b) => (a.valor === PERFIL_PADRAO ? -1 : b.valor === PERFIL_PADRAO ? 1 : ordenarPt(a.valor, b.valor))),
    };
};

// ── 3.1 Carga completa ──────────────────────────────────────────────────────
const carregar = async ({ reqUser, ativo = 'true' }) => {
    const [linhas, config, cfgWhats, ufPorCidade] = await Promise.all([
        buscarClientes({ reqUser, ativo }),
        getConfig(),
        whatsCliente.getConfig(),
        // UF por nome de cidade (cadastro oficial). Falha aqui não pode derrubar o mapa.
        require('./cidadeService').listar({ comUso: false })
            .then(({ cidades }) => new Map(cidades.map(c => [c.nome, c.uf])))
            .catch((e) => { console.error('[mapa-clientes] cidades indisponíveis:', e.message); return new Map(); }),
    ]);
    // Uma query em lote só para "quem atualizou o ponto e quando" (nada de N+1) —
    // só vale a pena buscar para quem já tem ponto gravado. `linhas` já tem o
    // Ponto_GPS de todo mundo em mãos: passa como `pontosAtuais` para o service
    // não repetir o findMany de cliente (~1150 de uma vez).
    const comPonto = linhas.filter(c => c.Ponto_GPS);
    const pontosAtuais = new Map(comPonto.map(c => [c.UUID, c.Ponto_GPS]));
    const ultimasMudancas = await gpsClientesService.ultimaMudancaPonto(
        comPonto.map(c => c.UUID),
        pontosAtuais
    );
    const clientes = linhas.map(c => montarCliente(c, cfgWhats, ultimasMudancas[c.UUID] || null));
    const comGps = clientes.filter(c => c.gps).length;
    return {
        geradoEm: new Date().toISOString(),
        config,
        totais: { clientes: clientes.length, comGps, semGps: clientes.length - comGps },
        clientes,
        opcoes: montarOpcoes(clientes, ufPorCidade),
    };
};

// ── 3.5 Compras no período ──────────────────────────────────────────────────
// UUIDs dos clientes visíveis (mesma visibilidade e mesmo `ativo` do GET /) que
// têm pedido que CONTA COMO VENDA no período — WHERE_PEDIDO_RECEITA, a mesma
// régua da comissão, das metas e do Dashboard Geral (faturado ou especial, sem
// bonificação), pela `dataVenda`. Devolução NÃO tira o cliente da lista: ele
// comprou; a devolução só abate o valor (aqui interessa o ato de comprar).
// `de`/`ate` = 'YYYY-MM-DD' ou '' (sem limite). Validação de formato é da rota.
const compras = async ({ reqUser, ativo = 'true', de = '', ate = '' }) => {
    const dataVenda = {};
    if (de) dataVenda.gte = dayjs(de).startOf('day').toDate();
    if (ate) dataVenda.lte = dayjs(ate).endOf('day').toDate();
    const where = {
        ...WHERE_PEDIDO_RECEITA,
        ...(Object.keys(dataVenda).length ? { dataVenda } : {}),
        cliente: { ...whereAtivo(ativo), ...whereVisibilidade(reqUser) },
    };
    const linhas = await prisma.pedido.findMany({ where, select: { clienteId: true }, distinct: ['clienteId'] });
    const uuids = linhas.map(l => l.clienteId).sort();
    return { de: de || null, ate: ate || null, uuids, total: uuids.length };
};

// ── 3.2 Vizinhos atendidos em dias diferentes ───────────────────────────────
//
// Algoritmo — grade espacial:
//   • célula = `raio` em graus: dLat = raio/111320; dLng = raio/(111320·cos(latMédia));
//   • cada ponto vai para Map("i,j" → [pontos]);
//   • para cada ponto, comparo só com os pontos das 9 células vizinhas (a própria
//     + 8 ao redor) e só com índice MAIOR que o meu — assim nenhum par sai duas vezes
//     (A-B e B-A) e o custo é ~O(n·k) em vez de n²/2;
//   • distância real pelo Haversine de pontoService (arredonda para metros);
//   • par vale se distância ≤ raio E não há dia de entrega em comum (ignorando N/D).
// Universo: clientes visíveis com GPS válido, com pelo menos um dia REAL de
// entrega e que NÃO são balcão (quem retira na empresa não gera parada).
const vizinhos = async ({ reqUser, ativo = 'true', raio, limite = 200 }) => {
    const config = await getConfig();
    const raioMetros = raioValido(raio) ? raio : config.raioMetros;
    const linhas = await buscarClientes({ reqUser, ativo, select: SELECT_VIZINHOS });

    const pontos = [];
    for (const c of linhas) {
        const gps = parseLatLng(c.Ponto_GPS);
        if (!gps || c.gps?.balcao === true) continue;
        const diasEntrega = parseDias(c.Dia_de_entrega);
        const dias = diasReais(diasEntrega);
        if (!dias.length) continue;
        pontos.push({
            uuid: c.UUID, nome: vazioParaNull(c.NomeFantasia) || c.Nome, diasEntrega, diasReais: dias,
            gps, vendedorNome: c.vendedor?.nome || null, cidade: vazioParaNull(c.End_Cidade),
        });
    }

    const pares = [];
    if (pontos.length >= 2) {
        const latMedia = pontos.reduce((s, p) => s + p.gps.lat, 0) / pontos.length;
        const dLat = raioMetros / 111320;
        const dLng = raioMetros / (111320 * Math.max(Math.cos(latMedia * Math.PI / 180), 0.01));
        const celula = (p) => [Math.floor(p.gps.lat / dLat), Math.floor(p.gps.lng / dLng)];
        const grade = new Map();
        pontos.forEach((p, idx) => {
            const [i, j] = celula(p);
            p._idx = idx;
            const k = `${i},${j}`;
            if (!grade.has(k)) grade.set(k, []);
            grade.get(k).push(p);
        });
        const temDiaComum = (a, b) => a.diasReais.some(d => b.diasReais.includes(d));
        for (const p of pontos) {
            const [i, j] = celula(p);
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const lista = grade.get(`${i + di},${j + dj}`);
                    if (!lista) continue;
                    for (const q of lista) {
                        if (q._idx <= p._idx) continue;
                        if (temDiaComum(p, q)) continue;
                        const dist = haversineMetros(p.gps.lat, p.gps.lng, q.gps.lat, q.gps.lng);
                        if (dist > raioMetros) continue;
                        const [a, b] = p.uuid < q.uuid ? [p, q] : [q, p];
                        pares.push({ distanciaMetros: dist, a: resumo(a), b: resumo(b) });
                    }
                }
            }
        }
        pares.sort((x, y) => x.distanciaMetros - y.distanciaMetros || ordenarPt(x.a.uuid, y.a.uuid));
    }

    const total = pares.length;
    return {
        raioMetros,
        universo: pontos.length,
        total,
        truncado: total > limite,
        pares: pares.slice(0, limite),
    };
};

const resumo = (p) => ({
    uuid: p.uuid, nome: p.nome, diasEntrega: p.diasEntrega, gps: p.gps,
    vendedorNome: p.vendedorNome, cidade: p.cidade,
});

module.exports = {
    CONFIG_KEY,
    RAIO_PADRAO_M,
    RAIO_MIN_M,
    RAIO_MAX_M,
    raioValido,
    getConfig,
    setConfig,
    whereVisibilidade,
    parseDias,
    parsePerfis,
    carregar,
    compras,
    vizinhos,
};
