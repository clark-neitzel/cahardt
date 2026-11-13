// Cadastro completo, ficha do agente, cadastros pendentes e fila de inativação.
// Prisma mockado — nunca toca banco real.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
process.env.ANALYTICS_API_KEY = process.env.ANALYTICS_API_KEY || 'chave-teste-analytics-agentes';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const CHAVE = process.env.ANALYTICS_API_KEY;
const LEITURA = { 'x-analytics-key': CHAVE };
const AGENTE = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'ana' };
const DATABASE = path.join(__dirname, '../config/database.js');
const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const ROUTER_APP = path.join(__dirname, '../routes/cadastroPendenciasRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js', 'routes/cadastroPendenciasRoutes.js',
    'services/clienteContatoService.js', 'services/clienteHistoricoService.js',
    'services/analyticsConsultaService.js', 'services/analyticsRegistroService.js',
    'services/analyticsComum.js', 'services/analyticsClienteFichaService.js',
    'services/clienteCadastroCompletoService.js', 'services/clienteInativacaoService.js',
    'middlewares/analyticsAuth.js',
];

function carregar(mock, arquivo) {
    const restaurar = stubModule(DATABASE, makeMockPrisma(mock));
    limparCacheContendo(...CACHE);
    const svc = require(arquivo);
    restaurar();
    return svc;
}

const TABELA = { id: '1000', idCondicao: 'AVISTA_DIN', nomeCondicao: 'À vista', ativo: true, acrescimoPreco: 0, qtdParcelas: 1, parcelasDias: 0 };
const VENDEDOR = { id: 'v1', nome: 'Carla', ativo: true };
const CLIENTE_OK = { Dia_de_venda: 'TER', Dia_de_entrega: 'QUA', Condicao_de_pagamento: '1000', idVendedor: 'v1' };

// ── 1. função de completude ──────────────────────────────────────────────
test('cadastro completo: tudo preenchido → completo, sem faltando', () => {
    const { avaliarCadastro } = carregar({}, '../services/clienteCadastroCompletoService');
    const r = avaliarCadastro(CLIENTE_OK, { tabela: TABELA, vendedor: VENDEDOR });
    assert.deepEqual(r, { completo: true, faltando: [] });
});

test('cadastro completo: cada campo faltando aparece com rótulo em português', () => {
    const { avaliarCadastro } = carregar({}, '../services/clienteCadastroCompletoService');
    const ref = { tabela: TABELA, vendedor: VENDEDOR };
    const casos = [
        [{ ...CLIENTE_OK, Dia_de_venda: null }, ref, 'diaVenda', 'Dia de venda (visita)'],
        [{ ...CLIENTE_OK, Dia_de_venda: '  ' }, ref, 'diaVenda', 'Dia de venda (visita)'],
        [{ ...CLIENTE_OK, Dia_de_entrega: '' }, ref, 'diaEntrega', 'Dia de entrega'],
        [{ ...CLIENTE_OK, Condicao_de_pagamento: null }, ref, 'tabelaPreco', 'Tabela de preço'],
        [CLIENTE_OK, { ...ref, tabela: null }, 'tabelaPreco', 'Tabela de preço'],                       // id que não existe
        [CLIENTE_OK, { ...ref, tabela: { ...TABELA, ativo: false } }, 'tabelaPreco', 'Tabela de preço'], // tabela inativa
        [{ ...CLIENTE_OK, idVendedor: null }, ref, 'vendedor', 'Vendedor responsável'],
        [CLIENTE_OK, { ...ref, vendedor: null }, 'vendedor', 'Vendedor responsável'],                    // vendedor inexistente
    ];
    for (const [cli, refs, campo, rotulo] of casos) {
        const r = avaliarCadastro(cli, refs);
        assert.equal(r.completo, false, campo);
        assert.deepEqual(r.faltando, [{ campo, rotulo }]);
    }
    const tudo = avaliarCadastro({}, {});
    assert.deepEqual(tudo.faltando.map((f) => f.campo), ['diaVenda', 'diaEntrega', 'tabelaPreco', 'vendedor']);
});

test('resolverTabela aceita id e, na falta, idCondicao', () => {
    const { resolverTabela } = carregar({}, '../services/clienteCadastroCompletoService');
    assert.equal(resolverTabela('1000', [TABELA]), TABELA);
    assert.equal(resolverTabela('AVISTA_DIN', [TABELA]), TABELA);
    assert.equal(resolverTabela('x', [TABELA]), null);
    assert.equal(resolverTabela('', [TABELA]), null);
});

// ── 2. ficha ──────────────────────────────────────────────────────────────
function mockFicha(clienteExtra = {}) {
    const cliente = {
        UUID: 'cli-1', Nome: 'Padaria LTDA', NomeFantasia: 'Padaria do Zé', Documento: '123', Tipo_Pessoa: 'JURIDICA', Ativo: true,
        Email: null, Telefone: null, Telefone_Celular: '47999998888', End_Logradouro: 'Rua A', End_Numero: '10', End_Bairro: 'Centro',
        End_Cidade: 'Joinville', End_Estado: 'SC', End_CEP: '89200000', ...CLIENTE_OK,
        condicoes_pagamento_permitidas: ['1000', '2000'], vendedor: VENDEDOR, ...clienteExtra,
    };
    let consultasPedido = 0;
    return {
        cliente: { findUnique: async () => ({ ...cliente }) },
        tabelaPreco: { findMany: async () => [TABELA, { id: '2000', idCondicao: 'BOLETO', nomeCondicao: 'Boleto 14d', ativo: true, acrescimoPreco: 5, qtdParcelas: 1, parcelasDias: 14 }] },
        pedido: {
            findMany: async () => { consultasPedido++; return [{ id: 'p1', numero: 77, dataVenda: new Date('2026-11-10'), especial: false, statusEntrega: 'ENTREGUE', itens: [{ quantidade: 2, valor: 10 }, { quantidade: 1, valor: 5.5 }] }]; },
        },
        pedidoItem: {
            findMany: async () => [
                { pedidoId: 'p1', produtoId: 'a', quantidade: 2, produto: { nome: 'Coxinha', codigo: 'C1', unidade: 'CX' } },
                { pedidoId: 'p2', produtoId: 'a', quantidade: 3, produto: { nome: 'Coxinha', codigo: 'C1', unidade: 'CX' } },
                { pedidoId: 'p1', produtoId: 'b', quantidade: 9, produto: { nome: 'Kibe', codigo: 'K1', unidade: 'CX' } },
            ],
        },
        clienteContato: { findMany: async () => [] },
        get consultasPedido() { return consultasPedido; },
    };
}

test('ficha: formato, pedidos, top produtos, tabela, vendedor e cadastro', async () => {
    const mock = mockFicha();
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mock), CACHE));
    try {
        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/ficha', { headers: LEITURA });
        assert.equal(r.status, 200);
        const b = r.body;
        assert.equal(b.cliente.id, 'cli-1');
        assert.equal(b.cliente.nome, 'Padaria do Zé');
        assert.equal(b.cliente.endereco, 'Rua A, 10, Centro, Joinville/SC');
        assert.deepEqual(b.diaVenda, ['TER']);
        assert.deepEqual(b.diaEntrega, ['QUA']);
        assert.deepEqual(b.tabelaPreco, { id: '1000', nome: 'À vista', acrescimoPct: 0, ativo: true });
        assert.deepEqual(b.vendedor, { id: 'v1', nome: 'Carla', ativo: true });
        assert.equal(b.condicaoPagamento.padrao.id, '1000');
        assert.deepEqual(b.condicaoPagamento.permitidas.map((x) => x.nome), ['À vista', 'Boleto 14d']);
        assert.equal(b.ultimosPedidos.length, 1);
        assert.deepEqual(b.ultimosPedidos[0], { id: 'p1', numero: 77, data: '2026-11-10T00:00:00.000Z', total: 25.5, status: 'ENTREGUE', itens: 2, especial: false });
        // Coxinha: 2 pedidos (vezes), 5 unidades; Kibe: 1 pedido.
        assert.deepEqual(b.topProdutos90d.map((p) => [p.produto, p.quantidade, p.vezes]), [['Coxinha', 5, 2], ['Kibe', 9, 1]]);
        assert.ok(b.contatos && typeof b.contatos === 'object');
        assert.deepEqual(b.cadastro, { completo: true, faltando: [] });
        assert.equal(mock.consultasPedido, 1, 'uma consulta de pedidos só');
    } finally { await close(); }
});

test('ficha: cadastro incompleto lista o que falta; 404 para cliente inexistente', async () => {
    const mock = mockFicha({ Dia_de_entrega: null, idVendedor: null, vendedor: null });
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mock), CACHE));
    try {
        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/ficha', { headers: LEITURA });
        assert.equal(r.body.cadastro.completo, false);
        assert.deepEqual(r.body.cadastro.faltando.map((f) => f.campo), ['diaEntrega', 'vendedor']);
        assert.equal(r.body.vendedor, null);
    } finally { await close(); }
    const vazio = { cliente: { findUnique: async () => null } };
    const s2 = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(vazio), CACHE));
    try {
        const r = await s2.request('GET', '/api/analytics/v1/clientes/nao-existe/ficha', { headers: LEITURA });
        assert.equal(r.status, 404);
        assert.equal(r.body.codigo, 'NAO_ENCONTRADO');
    } finally { await s2.close(); }
});

// ── 3. cadastros pendentes ────────────────────────────────────────────────
test('cadastros-pendentes: só ativos, filtra por vendedor, pagina e traz faltando', async () => {
    let whereUsado = null; let paginaUsada = null;
    const mock = {
        tabelaPreco: { findMany: async () => [TABELA] },
        vendedor: { findMany: async () => [{ id: 'v1' }] },
        cliente: {
            count: async ({ where }) => { whereUsado = where; return 41; },
            findMany: async (args) => {
                paginaUsada = { skip: args.skip, take: args.take };
                return [
                    { UUID: 'c1', Nome: 'A', NomeFantasia: null, End_Cidade: 'X', Dia_de_venda: 'TER', Dia_de_entrega: null, Condicao_de_pagamento: '999', idVendedor: 'v1', vendedor: VENDEDOR },
                    { UUID: 'c2', Nome: 'B', NomeFantasia: 'Bê', End_Cidade: null, Dia_de_venda: null, Dia_de_entrega: 'QUA', Condicao_de_pagamento: '1000', idVendedor: null, vendedor: null },
                ];
            },
        },
    };
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mock), CACHE));
    try {
        const r = await request('GET', '/api/analytics/v1/cadastros-pendentes?vendedorId=v1&page=2&limit=20', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.equal(whereUsado.Ativo, true);
        assert.equal(whereUsado.idVendedor, 'v1');
        assert.deepEqual(paginaUsada, { skip: 20, take: 20 });
        assert.deepEqual(whereUsado.OR.at(-1), { Condicao_de_pagamento: { notIn: ['1000', 'AVISTA_DIN'] } });
        assert.equal(r.body.total, 41);
        assert.equal(r.body.totalPages, 3);
        assert.deepEqual(r.body.data[0].faltando.map((f) => f.campo), ['diaEntrega', 'tabelaPreco']);
        assert.equal(r.body.data[0].nome, 'A');
        assert.equal(r.body.data[0].vendedor, 'Carla');
        assert.deepEqual(r.body.data[1].faltando.map((f) => f.campo), ['diaVenda', 'vendedor']);
        assert.equal(r.body.data[1].nome, 'Bê');
    } finally { await close(); }
});

test('cadastros-pendentes: vendedor apontando para cadastro inexistente entra na lista como faltando', async () => {
    let whereUsado = null;
    const mock = {
        tabelaPreco: { findMany: async () => [TABELA] },
        vendedor: { findMany: async () => [{ id: 'v1' }] },
        cliente: {
            count: async ({ where }) => { whereUsado = where; return 1; },
            findMany: async () => [
                // idVendedor 'v-sumiu' não existe na tabela de vendedores: relação volta null.
                { UUID: 'c9', Nome: 'Órfã', NomeFantasia: null, End_Cidade: 'Y', Dia_de_venda: 'TER', Dia_de_entrega: 'QUA', Condicao_de_pagamento: '1000', idVendedor: 'v-sumiu', vendedor: null },
            ],
        },
    };
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mock), CACHE));
    try {
        const r = await request('GET', '/api/analytics/v1/cadastros-pendentes', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.deepEqual(whereUsado.OR.find((c) => c.idVendedor && c.idVendedor.notIn), { idVendedor: { notIn: ['v1'] } });
        assert.equal(r.body.total, 1);
        assert.deepEqual(r.body.data[0].faltando.map((f) => f.campo), ['vendedor']);
        assert.equal(r.body.data[0].vendedorId, 'v-sumiu');
        assert.equal(r.body.data[0].vendedor, null);
    } finally { await close(); }
});

// ── 4. pedido de inativação (agentes) ─────────────────────────────────────
function memInativacao({ ativo = true, cliente = true } = {}) {
    const linhas = [];
    const cli = { UUID: 'cli-1', Nome: 'Padaria', NomeFantasia: 'Padaria do Zé', Ativo: ativo, End_Cidade: 'Joinville' };
    const casa = (r, where = {}) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'in' in v ? v.in.includes(r[k]) : r[k] === v));
    const mem = {
        linhas, cli, historico: [],
        cliente: {
            findUnique: async () => (cliente ? { ...cli } : null),
            findMany: async () => (cliente ? [{ ...cli }] : []),
        },
        clienteInativacaoSolicitacao: {
            findFirst: async ({ where }) => linhas.find((r) => casa(r, where)) || null,
            findUnique: async ({ where }) => { const r = linhas.find((x) => x.id === where.id); return r ? { ...r } : null; },
            findMany: async ({ where }) => linhas.filter((r) => casa(r, where)).map((r) => ({ ...r })),
            count: async ({ where }) => linhas.filter((r) => casa(r, where)).length,
            create: async ({ data }) => {
                const row = { id: `s${linhas.length + 1}`, detalhe: null, status: 'pendente', decididoPorId: null, decididoPorNome: null, decididoEm: null, observacaoDecisao: null, createdAt: new Date(), ...data };
                linhas.push(row); return { ...row };
            },
            updateMany: async ({ where, data }) => {
                const alvo = linhas.filter((r) => casa(r, where)); alvo.forEach((r) => Object.assign(r, data)); return { count: alvo.length };
            },
        },
        clienteAlteracao: { createMany: async ({ data }) => { mem.historico.push(...data); return { count: data.length }; } },
    };
    return mem;
}

test('inativação: exige agente, valida motivo/detalhe, 404, 409 e duplicado', async () => {
    const mem = memInativacao();
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    const url = '/api/analytics/v1/clientes/cli-1/inativacao';
    try {
        let r = await request('POST', url, { headers: LEITURA, body: { motivo: 'fechou' } });
        assert.equal(r.status, 400); assert.equal(r.body.codigo, 'AGENTE_OBRIGATORIO');
        r = await request('POST', url, { headers: AGENTE, body: { motivo: 'sei lá' } });
        assert.equal(r.status, 400); assert.equal(r.body.codigo, 'MOTIVO_INVALIDO');
        r = await request('POST', url, { headers: AGENTE, body: { motivo: 'outro' } });
        assert.equal(r.status, 400); assert.equal(r.body.codigo, 'CAMPO_OBRIGATORIO');
        r = await request('POST', url, { headers: AGENTE, body: { motivo: 'outro', detalhe: 'x'.repeat(501) } });
        assert.equal(r.status, 400); assert.equal(r.body.codigo, 'CAMPO_LONGO');
        assert.equal(mem.linhas.length, 0);

        r = await request('POST', url, { headers: AGENTE, body: { motivo: 'fechou' } });
        assert.equal(r.status, 201);
        assert.equal(r.body.duplicado, false);
        assert.equal(r.body.solicitacao.status, 'pendente');
        assert.equal(r.body.solicitacao.solicitadoPor, 'ana');
        assert.equal(r.body.solicitacao.origem, 'api_agente');
        const id = r.body.solicitacao.id;

        r = await request('POST', url, { headers: AGENTE, body: { motivo: 'parou_de_comprar' } });
        assert.equal(r.status, 200);
        assert.equal(r.body.duplicado, true);
        assert.equal(r.body.solicitacao.id, id);
        assert.equal(mem.linhas.length, 1);

        const lista = await request('GET', '/api/analytics/v1/inativacoes?status=pendente', { headers: LEITURA });
        assert.equal(lista.status, 200);
        assert.equal(lista.body.total, 1);
        assert.equal(lista.body.data[0].cliente, 'Padaria do Zé');
        const ruim = await request('GET', '/api/analytics/v1/inativacoes?status=xyz', { headers: LEITURA });
        assert.equal(ruim.status, 400); assert.equal(ruim.body.codigo, 'STATUS_INVALIDO');
    } finally { await close(); }

    const inativo = memInativacao({ ativo: false });
    const s2 = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(inativo), CACHE));
    try {
        const r = await s2.request('POST', url, { headers: AGENTE, body: { motivo: 'fechou' } });
        assert.equal(r.status, 409); assert.equal(r.body.codigo, 'CLIENTE_JA_INATIVO');
        assert.equal(inativo.linhas.length, 0);
    } finally { await s2.close(); }

    const sem = memInativacao({ cliente: false });
    const s3 = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(sem), CACHE));
    try {
        const r = await s3.request('POST', url, { headers: AGENTE, body: { motivo: 'fechou' } });
        assert.equal(r.status, 404);
    } finally { await s3.close(); }
});

// ── 5. aprovar / recusar (serviço) ────────────────────────────────────────
const USER = { id: 'u1', nome: 'Maria' };

async function comPedido(mem) {
    const svc = carregar(mem, '../services/clienteInativacaoService');
    await svc.solicitar('cli-1', { motivo: 'fechou', detalhe: 'fechou as portas' }, { agente: 'ana' });
    return svc;
}

test('aprovar: inativa pelo caminho do app e grava o histórico (Ativo é do app; inativacao é daqui)', async () => {
    const mem = memInativacao();
    const svc = await comPedido(mem);
    const chamadas = [];
    const aplicar = async (clienteId, user) => { chamadas.push([clienteId, user.id]); mem.cli.Ativo = false; };
    const r = await svc.aprovar('s1', USER, { observacao: 'ok' }, { aplicar });
    assert.deepEqual(chamadas, [['cli-1', 'u1']]);
    assert.equal(mem.cli.Ativo, false);
    assert.equal(r.status, 'aprovada');
    assert.equal(r.decididoPor.nome, 'Maria');
    assert.equal(r.observacaoDecisao, 'ok');
    const h = mem.historico.find((x) => x.campo === 'inativacao');
    assert.ok(h);
    assert.equal(h.autorNome, 'Maria'); assert.equal(h.autorId, 'u1'); assert.equal(h.origem, 'app');
    assert.equal(h.valorNovo, 'motivo: Fechou o negócio | detalhe: fechou as portas | solicitado por: ana');

    // idempotente: aprovar de novo não inativa de novo
    await assert.rejects(() => svc.aprovar('s1', USER, {}, { aplicar }), (e) => e.status === 409 && e.codigo === 'JA_DECIDIDO');
    assert.equal(chamadas.length, 1);
});

test('aprovar: se o caminho do app falhar (ou não inativar), o pedido volta para a fila', async () => {
    const mem = memInativacao();
    const svc = await comPedido(mem);
    await assert.rejects(() => svc.aprovar('s1', USER, {}, { aplicar: async () => { throw Object.assign(new Error('falhou'), { status: 400 }); } }), /falhou/);
    assert.equal(mem.linhas[0].status, 'pendente');
    // chamou, mas o cliente seguiu ativo (sem permissão para alterar) → também reabre
    await assert.rejects(() => svc.aprovar('s1', USER, {}, { aplicar: async () => {} }), (e) => e.status === 403);
    assert.equal(mem.linhas[0].status, 'pendente');
    assert.equal(mem.historico.length, 0);
});

test('recusar: cliente continua ativo, decisão fica registrada', async () => {
    const mem = memInativacao();
    const svc = await comPedido(mem);
    const r = await svc.recusar('s1', USER, { observacao: 'ainda compra' });
    assert.equal(r.status, 'recusada');
    assert.equal(r.observacaoDecisao, 'ainda compra');
    assert.equal(mem.cli.Ativo, true);
    assert.equal(mem.linhas[0].decididoPorNome, 'Maria');
    assert.ok(mem.historico.find((x) => x.campo === 'inativacao' && /recusada/.test(x.valorNovo)));
    await assert.rejects(() => svc.recusar('s1', USER, {}), (e) => e.codigo === 'JA_DECIDIDO');
    // depois de decidido, a Ana pode pedir de novo
    const novo = await svc.solicitar('cli-1', { motivo: 'fechou' }, { agente: 'ana' });
    assert.equal(novo.duplicado, false);
});

// ── 6. permissão nas rotas do app ─────────────────────────────────────────
function appComUsuario(mem, user) {
    const restaurar = stubModule(DATABASE, makeMockPrisma(mem));
    limparCacheContendo(...CACHE);
    const router = require(ROUTER_APP);
    restaurar();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { if (user) req.user = user; next(); });
    app.use('/api/cadastro-pendencias', router);
    return app;
}

test('rotas do app: sem permissão de editar clientes → 403; com permissão (ou admin) → lista e recusa', async () => {
    const mem = memInativacao();
    mem.linhas.push({ id: 's9', clienteId: 'cli-1', motivo: 'fechou', detalhe: null, solicitadoPor: 'ana', origem: 'api_agente', status: 'pendente', createdAt: new Date() });
    const base = '/api/cadastro-pendencias';
    for (const perms of [{ clientes: { view: true } }, {}, { pedidos: { edit: true } }]) {
        const s = await startTestServer(appComUsuario(mem, { id: 'u2', nome: 'Zé', permissoes: JSON.stringify(perms) }));
        try {
            for (const [m, u] of [['GET', `${base}/inativacoes`], ['GET', `${base}/pendentes`], ['POST', `${base}/inativacoes/s9/aprovar`], ['POST', `${base}/inativacoes/s9/recusar`]]) {
                const r = await s.request(m, u, m === 'GET' ? {} : { body: {} });
                assert.equal(r.status, 403, `${m} ${u}`);
                assert.equal(r.body.codigo, 'SEM_PERMISSAO');
            }
        } finally { await s.close(); }
    }
    assert.equal(mem.linhas[0].status, 'pendente');

    const sem = await startTestServer(appComUsuario(mem, null));
    try { assert.equal((await sem.request('GET', `${base}/inativacoes`)).status, 403); } finally { await sem.close(); }

    const ok = await startTestServer(appComUsuario(mem, { id: 'u3', nome: 'Edu', permissoes: { clientes: { edit: true } } }));
    try {
        const l = await ok.request('GET', `${base}/inativacoes`);
        assert.equal(l.status, 200); assert.equal(l.body.total, 1);
        const c = await ok.request('GET', `${base}/inativacoes/contagem`);
        assert.deepEqual(c.body, { pendentes: 1 });
        const r = await ok.request('POST', `${base}/inativacoes/s9/recusar`, { body: { observacao: 'não' } });
        assert.equal(r.status, 200);
        assert.equal(r.body.solicitacao.status, 'recusada');
        assert.equal(mem.cli.Ativo, true);
    } finally { await ok.close(); }

    const adm = await startTestServer(appComUsuario(mem, { id: 'u4', nome: 'Chefe', permissoes: { admin: true } }));
    try { assert.equal((await adm.request('GET', `${base}/inativacoes?status=todas`)).status, 200); } finally { await adm.close(); }
});
