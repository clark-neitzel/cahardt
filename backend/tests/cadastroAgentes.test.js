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
    'services/clienteClassificacaoService.js',
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
        // Evidência de CLIENTE (classificação): conta a receber. Pedido "distinct" é a consulta da classificação.
        contaReceber: { findMany: async () => [{ clienteId: 'cli-1' }] },
        contaPagar: { findMany: async () => [] },
        clienteClassificacao: { findMany: async () => [] },
        pedido: {
            findMany: async (args) => { if (args?.distinct) return []; consultasPedido++; return [{ id: 'p1', numero: 77, dataVenda: new Date('2026-11-10'), especial: false, statusEntrega: 'ENTREGUE', itens: [{ quantidade: 2, valor: 10 }, { quantidade: 1, valor: 5.5 }] }]; },
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
        assert.equal(b.classificacao.valor, 'CLIENTE');
        assert.equal(b.classificacao.origem, 'automatica');
        assert.deepEqual(b.classificacao.evidencias, { temContasReceber: true, temPedido: false, temContasPagar: false });
        assert.equal(b.somenteFornecedor, false);
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

// ── 3. cadastros pendentes (agora por classificação) ─────────────────────
// Monta o mock de um banco pequeno: clientes + evidências. `receber`/`pedidos`: ids de cliente;
// `fornecedores`: [{ id, cnpjCpf }]; `pagar`: ids de fornecedor com conta a pagar; `manuais`: [{clienteId, classificacao}].
function mockBanco({ clientes, receber = [], pedidos = [], fornecedores = [], pagar = [], manuais = [] }) {
    const mem = {
        manuais: manuais.map((m) => ({ ...m })), historico: [], chamadasPedido: [],
        tabelaPreco: { findMany: async () => [TABELA] },
        vendedor: { findMany: async () => [{ id: 'v1' }] },
        cliente: {
            findMany: async ({ where } = {}) => clientes
                .filter((c) => (where?.Ativo ? c.Ativo !== false : true) && (!where?.idVendedor || c.idVendedor === where.idVendedor)
                    && (!where?.UUID?.in || where.UUID.in.includes(c.UUID)))
                .map((c) => ({ ...c })),
            findUnique: async ({ where }) => { const c = clientes.find((x) => x.UUID === where.UUID); return c ? { ...c } : null; },
        },
        contaReceber: { findMany: async () => receber.map((clienteId) => ({ clienteId })) },
        pedido: { findMany: async (args) => { mem.chamadasPedido.push(args.where); return pedidos.map((clienteId) => ({ clienteId })); } },
        contaPagar: { findMany: async () => pagar.map((fornecedorId) => ({ fornecedorId })) },
        fornecedor: { findMany: async ({ where }) => fornecedores.filter((f) => where.id.in.includes(f.id)).map((f) => ({ cnpjCpf: f.cnpjCpf })) },
        clienteClassificacao: {
            findMany: async () => mem.manuais.map((m) => ({ ...m })),
            findUnique: async ({ where }) => { const m = mem.manuais.find((x) => x.clienteId === where.clienteId); return m ? { ...m } : null; },
            upsert: async ({ where, create, update }) => {
                const m = mem.manuais.find((x) => x.clienteId === where.clienteId);
                if (m) { Object.assign(m, update); return { ...m }; }
                mem.manuais.push({ ...create }); return { ...create };
            },
            delete: async ({ where }) => { mem.manuais = mem.manuais.filter((m) => m.clienteId !== where.clienteId); return {}; },
        },
        clienteAlteracao: { createMany: async ({ data }) => { mem.historico.push(...data); return { count: data.length }; } },
        clienteContato: { findMany: async () => [] },
    };
    return mem;
}

const cli = (UUID, extra = {}) => ({
    UUID, Nome: `Razão ${UUID}`, NomeFantasia: `Nome ${UUID}`, Documento: null, Perfis: null, Ativo: true, End_Cidade: 'Joinville',
    Dia_de_venda: 'TER', Dia_de_entrega: 'QUA', Condicao_de_pagamento: '1000', idVendedor: 'v1', vendedor: VENDEDOR, ...extra,
});
const incompleto = { Dia_de_entrega: null };

async function comApp(mem, fn) {
    const s = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try { await fn(s.request); } finally { await s.close(); }
}

test('classificação pura: os quatro casos automáticos, override manual e volta ao automático', () => {
    const { montar, automaticaDe } = carregar({}, '../services/clienteClassificacaoService');
    const nada = { temContasReceber: false, temPedido: false, temContasPagar: false };
    assert.equal(automaticaDe({ ...nada, temContasPagar: true }), 'FORNECEDOR');
    assert.equal(automaticaDe({ ...nada, temContasReceber: true, temContasPagar: true }), 'CLIENTE_FORNECEDOR');
    assert.equal(automaticaDe({ ...nada, temPedido: true, temContasPagar: true }), 'CLIENTE_FORNECEDOR');
    assert.equal(automaticaDe({ ...nada, temContasReceber: true }), 'CLIENTE');
    assert.equal(automaticaDe({ ...nada, temPedido: true }), 'CLIENTE');
    assert.equal(automaticaDe(nada), 'A_CLASSIFICAR');

    const forn = montar({ evidencias: { temContasPagar: true }, perfis: '["Cliente","Fornecedor"]' });
    assert.deepEqual(
        { v: forn.valor, o: forn.origem, a: forn.automatica, m: forn.manual, s: forn.somenteFornecedor, p: forn.perfis },
        { v: 'FORNECEDOR', o: 'automatica', a: 'FORNECEDOR', m: null, s: true, p: ['CLIENTE', 'FORNECEDOR'] },
    );
    // manual vence; limpar (manual null) volta ao automático
    const man = montar({ evidencias: { temContasPagar: true }, manual: 'CLIENTE' });
    assert.deepEqual([man.valor, man.origem, man.automatica, man.manual, man.somenteFornecedor], ['CLIENTE', 'manual', 'FORNECEDOR', 'CLIENTE', false]);
    const volta = montar({ evidencias: { temContasPagar: true }, manual: null });
    assert.deepEqual([volta.valor, volta.origem], ['FORNECEDOR', 'automatica']);
    // A_CLASSIFICAR nunca é override válido
    assert.equal(montar({ manual: 'A_CLASSIFICAR' }).origem, 'automatica');
    // perfis vazio/ inválido => [] (não força CLIENTE)
    assert.deepEqual(montar({ perfis: '' }).perfis, []);
    assert.deepEqual(montar({ perfis: 'lixo{' }).perfis, []);
    assert.deepEqual(montar({ perfis: '[{"perfil":"fornecedor"}]' }).perfis, ['FORNECEDOR']);
});

test('classificação em lote: documento vazio não casa, CNPJ alfanumérico casa, pedido bonificação não conta, AR cancelada conta', async () => {
    const mem = mockBanco({
        clientes: [
            cli('forn-alfa', { Documento: '12.ABC.345/0001-95' }),
            cli('sem-doc', { Documento: '' }),
            cli('so-bonus', { Documento: '111' }),
            cli('ar-cancelada', { Documento: '222' }),
            cli('doc-sem-pagar', { Documento: '999' }),
        ],
        fornecedores: [
            { id: 'f1', cnpjCpf: '12abc345000195' },     // mesmo CNPJ, escrito diferente
            { id: 'f2', cnpjCpf: '' },                    // vazio: não pode casar com cliente sem doc
            { id: 'f3', cnpjCpf: null },
            { id: 'f4', cnpjCpf: '12ABC345000195' },     // duplicado: qualquer um com conta conta
        ],
        pagar: ['f1', 'f2', 'f3'],
        receber: ['ar-cancelada'],   // a consulta não filtra status: QUITADO/CANCELADO também contam
        pedidos: [],                 // a consulta de pedidos tem que excluir bonificação/cancelado (verificado abaixo)
    });
    const svc = carregar(mem, '../services/clienteClassificacaoService');
    const mapa = await svc.classificacaoDeClientes(await mem.cliente.findMany());
    assert.equal(mapa.get('forn-alfa').valor, 'FORNECEDOR');
    assert.equal(mapa.get('sem-doc').valor, 'A_CLASSIFICAR', 'documento vazio nunca casa com fornecedor de documento vazio');
    assert.equal(mapa.get('so-bonus').valor, 'A_CLASSIFICAR');
    assert.equal(mapa.get('ar-cancelada').valor, 'CLIENTE');
    assert.equal(mapa.get('doc-sem-pagar').valor, 'A_CLASSIFICAR');
    assert.deepEqual(mem.chamadasPedido[0].cancelado, false);
    assert.deepEqual(mem.chamadasPedido[0].bonificacao, false);
});

test('cadastros-pendentes: padrão exclui FORNECEDOR e A_CLASSIFICAR; inclui CLIENTE e CLIENTE_FORNECEDOR incompletos; contagens', async () => {
    const mem = mockBanco({
        clientes: [
            cli('c-cliente', { ...incompleto }),
            cli('c-cf', { ...incompleto, Documento: '555', NomeFantasia: 'Zeta' }),
            cli('c-forn', { ...incompleto, Documento: '777' }),
            cli('c-nada', { ...incompleto }),
            cli('c-nada-completo'),                       // A_CLASSIFICAR com cadastro completo (conta só em classificar)
            cli('c-completo-cliente'),                    // cliente completo: não é pendente
            cli('c-manual', { ...incompleto }),           // sem evidência, mas manual CLIENTE
            cli('c-inativo', { ...incompleto, Ativo: false }),
        ],
        receber: ['c-cliente', 'c-cf', 'c-completo-cliente'],
        fornecedores: [{ id: 'f1', cnpjCpf: '555' }, { id: 'f2', cnpjCpf: '777' }], pagar: ['f1', 'f2'],
        manuais: [{ clienteId: 'c-manual', classificacao: 'CLIENTE' }],
    });
    await comApp(mem, async (request) => {
        const r = await request('GET', '/api/analytics/v1/cadastros-pendentes', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.equal(r.body.grupo, 'acertar');
        assert.equal(r.body.total, 3);
        assert.deepEqual(r.body.contagens, { acertar: 3, classificar: 2, telefone: 0 });
        assert.deepEqual(r.body.data.map((d) => d.id).sort(), ['c-cf', 'c-cliente', 'c-manual']);
        const cf = r.body.data.find((d) => d.id === 'c-cf');
        assert.equal(cf.classificacao.valor, 'CLIENTE_FORNECEDOR');
        assert.equal(cf.somenteFornecedor, false);
        assert.deepEqual(cf.faltando.map((f) => f.campo), ['diaEntrega']);
        assert.equal(r.body.data.find((d) => d.id === 'c-manual').classificacao.origem, 'manual');

        const c = await request('GET', '/api/analytics/v1/cadastros-pendentes?grupo=classificar', { headers: LEITURA });
        assert.equal(c.status, 200);
        assert.equal(c.body.grupo, 'classificar');
        assert.equal(c.body.total, 2);
        assert.deepEqual(c.body.contagens, { acertar: 3, classificar: 2, telefone: 0 });
        assert.deepEqual(c.body.data.map((d) => d.id).sort(), ['c-nada', 'c-nada-completo']);
        const n = c.body.data.find((d) => d.id === 'c-nada');
        assert.equal(n.classificacao.valor, 'A_CLASSIFICAR');
        assert.ok('documento' in n && 'perfis' in n && 'faltando' in n && 'cidade' in n && 'vendedor' in n);

        const ruim = await request('GET', '/api/analytics/v1/cadastros-pendentes?grupo=xyz', { headers: LEITURA });
        assert.equal(ruim.status, 400);
        assert.equal(ruim.body.codigo, 'GRUPO_INVALIDO');
    });
});

test('cadastros-pendentes: filtra por vendedor e a paginação vem DEPOIS do filtro de classificação', async () => {
    const clientes = [];
    for (let i = 1; i <= 5; i++) clientes.push(cli(`a${i}`, { ...incompleto, NomeFantasia: `A${i}` }));
    for (let i = 1; i <= 4; i++) clientes.push(cli(`f${i}`, { ...incompleto, NomeFantasia: `A0${i}`, Documento: `9${i}` })); // fornecedores ordenam ANTES
    clientes.push(cli('outro-vend', { ...incompleto, idVendedor: 'v2', vendedor: null, NomeFantasia: 'A9' }));
    const mem = mockBanco({
        clientes,
        receber: ['a1', 'a2', 'a3', 'a4', 'a5', 'outro-vend'],
        fornecedores: [1, 2, 3, 4].map((i) => ({ id: `fo${i}`, cnpjCpf: `9${i}` })), pagar: ['fo1', 'fo2', 'fo3', 'fo4'],
    });
    await comApp(mem, async (request) => {
        const p1 = await request('GET', '/api/analytics/v1/cadastros-pendentes?vendedorId=v1&limit=2&page=1', { headers: LEITURA });
        const p3 = await request('GET', '/api/analytics/v1/cadastros-pendentes?vendedorId=v1&limit=2&page=3', { headers: LEITURA });
        assert.equal(p1.body.total, 5, 'total é o do grupo acertar, sem os 4 fornecedores');
        assert.equal(p1.body.totalPages, 3);
        assert.deepEqual(p1.body.data.map((d) => d.nome), ['A1', 'A2']);
        assert.deepEqual(p3.body.data.map((d) => d.nome), ['A5']);
        assert.deepEqual(p1.body.contagens, { acertar: 5, classificar: 0, telefone: 0 });
    });
});

test('cadastros-pendentes: vendedor apontando para cadastro inexistente continua entrando como faltando', async () => {
    const mem = mockBanco({ clientes: [cli('c9', { idVendedor: 'v-sumiu', vendedor: null })], receber: ['c9'] });
    await comApp(mem, async (request) => {
        const r = await request('GET', '/api/analytics/v1/cadastros-pendentes', { headers: LEITURA });
        assert.equal(r.body.total, 1);
        assert.deepEqual(r.body.data[0].faltando.map((f) => f.campo), ['vendedor']);
        assert.equal(r.body.data[0].vendedorId, 'v-sumiu');
        assert.equal(r.body.data[0].vendedor, null);
    });
});

test('POST classificacao: exige agente, valida, 404, grava histórico, sobrescreve e reverte ao automático', async () => {
    const mem = mockBanco({ clientes: [cli('c1', { Documento: '555' })], fornecedores: [{ id: 'f1', cnpjCpf: '555' }], pagar: ['f1'] });
    await comApp(mem, async (request) => {
        const url = '/api/analytics/v1/clientes/c1/classificacao';
        assert.equal((await request('POST', url, { headers: LEITURA, body: { classificacao: 'CLIENTE' } })).status, 400); // sem x-analytics-agent
        const inv = await request('POST', url, { headers: AGENTE, body: { classificacao: 'A_CLASSIFICAR' } });
        assert.equal(inv.status, 400); assert.equal(inv.body.codigo, 'CLASSIFICACAO_INVALIDA');
        assert.equal((await request('POST', url, { headers: AGENTE, body: {} })).status, 400);
        assert.equal((await request('POST', '/api/analytics/v1/clientes/nao-existe/classificacao', { headers: AGENTE, body: { classificacao: 'CLIENTE' } })).status, 404);
        assert.equal(mem.manuais.length, 0);
        assert.equal(mem.historico.length, 0);

        const ok = await request('POST', url, { headers: AGENTE, body: { classificacao: 'cliente' } });
        assert.equal(ok.status, 200);
        assert.deepEqual([ok.body.classificacao.valor, ok.body.classificacao.origem, ok.body.classificacao.automatica, ok.body.classificacao.manual], ['CLIENTE', 'manual', 'FORNECEDOR', 'CLIENTE']);
        assert.equal(mem.manuais[0].origem, 'api_agente');
        assert.equal(mem.manuais[0].atualizadoPorTipo, 'agente');
        assert.equal(mem.historico.length, 1);
        assert.deepEqual([mem.historico[0].campo, mem.historico[0].valorAntigo, mem.historico[0].valorNovo, mem.historico[0].autorTipo, mem.historico[0].tela],
            ['classificacao', 'automatica:FORNECEDOR', 'manual:CLIENTE', 'agente', 'Cadastros pra acertar']);

        // idempotente: repetir o mesmo valor não duplica linha nem histórico; trocar sobrescreve
        await request('POST', url, { headers: AGENTE, body: { classificacao: 'CLIENTE' } });
        assert.equal(mem.manuais.length, 1); assert.equal(mem.historico.length, 1);
        await request('POST', url, { headers: AGENTE, body: { classificacao: 'CLIENTE_FORNECEDOR' } });
        assert.equal(mem.manuais.length, 1); assert.equal(mem.manuais[0].classificacao, 'CLIENTE_FORNECEDOR');
        assert.deepEqual([mem.historico[1].valorAntigo, mem.historico[1].valorNovo], ['manual:CLIENTE', 'manual:CLIENTE_FORNECEDOR']);

        const volta = await request('POST', url, { headers: AGENTE, body: { classificacao: 'automatica' } });
        assert.equal(volta.status, 200);
        assert.deepEqual([volta.body.classificacao.valor, volta.body.classificacao.origem, volta.body.classificacao.manual], ['FORNECEDOR', 'automatica', null]);
        assert.equal(mem.manuais.length, 0);
        assert.deepEqual([mem.historico[2].valorAntigo, mem.historico[2].valorNovo], ['manual:CLIENTE_FORNECEDOR', 'automatica:FORNECEDOR']);
        const nula = await request('POST', url, { headers: AGENTE, body: { classificacao: null } });
        assert.equal(nula.status, 200); assert.equal(mem.historico.length, 3, 'limpar sem override não grava histórico');

        const st = await request('GET', '/api/analytics/v1/status', { headers: LEITURA });
        assert.ok(st.body.escreve.includes('classificacoes'));
    });
});

test('ficha/clientes/por-telefone trazem classificacao e somenteFornecedor', async () => {
    const mem = mockBanco({ clientes: [cli('c1', { Documento: '555' })], fornecedores: [{ id: 'f1', cnpjCpf: '555' }], pagar: ['f1'] });
    mem.clienteContato = { findMany: async () => [] };
    // GET /v1/clientes: a carteira é trocada por um stub (só a página) — o que se testa é o enriquecimento.
    const restaurar = stubModule(path.join(__dirname, '../services/carteiraService.js'), {
        listarClientes: async () => ({ page: 1, limit: 50, total: 1, data: [{ clienteId: 'c1', nome: 'Nome c1' }] }),
    });
    try {
        await comApp(mem, async (request) => {
            const l = await request('GET', '/api/analytics/v1/clientes', { headers: LEITURA });
            assert.equal(l.status, 200);
            assert.equal(l.body.data[0].nome, 'Nome c1');
            assert.equal(l.body.data[0].classificacao.valor, 'FORNECEDOR');
            assert.equal(l.body.data[0].somenteFornecedor, true);
        });
    } finally { restaurar(); }
});

test('enriquecer (por-telefone): acrescenta classificacao a cada item sem tirar campos', async () => {
    const mem = mockBanco({ clientes: [cli('c1'), cli('c2', { Documento: '555' })], receber: ['c1'], fornecedores: [{ id: 'f1', cnpjCpf: '555' }], pagar: ['f1'] });
    const svc = carregar(mem, '../services/clienteClassificacaoService');
    const itens = [{ clienteId: 'c1', nome: 'x' }, { clienteId: 'c2', nome: 'y' }, { clienteId: 'fantasma', nome: 'z' }];
    await svc.enriquecer(itens, (i) => i.clienteId);
    assert.equal(itens[0].nome, 'x');
    assert.deepEqual([itens[0].classificacao.valor, itens[0].somenteFornecedor], ['CLIENTE', false]);
    assert.deepEqual([itens[1].classificacao.valor, itens[1].somenteFornecedor], ['FORNECEDOR', true]);
    assert.equal(itens[2].classificacao, undefined);
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
            for (const [m, u] of [['GET', `${base}/inativacoes`], ['GET', `${base}/pendentes`], ['POST', `${base}/inativacoes/s9/aprovar`], ['POST', `${base}/inativacoes/s9/recusar`], ['POST', `${base}/clientes/cli-1/classificacao`], ['POST', `${base}/clientes/cli-1/inativacao`]]) {
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

test('rotas do app: classificar e pedir inativação com o usuário logado; grupo=classificar na lista', async () => {
    const banco = mockBanco({ clientes: [cli('cli-1', { ...incompleto }), cli('cli-2')], receber: ['cli-2'] });
    const mem = { ...memInativacao(), ...banco, cliente: { ...banco.cliente, findUnique: async ({ where }) => ({ ...cli(where.UUID) }), findMany: banco.cliente.findMany } };
    const base = '/api/cadastro-pendencias';
    const s = await startTestServer(appComUsuario(mem, { id: 'u3', nome: 'Edu', permissoes: { clientes: { edit: true } } }));
    try {
        const l = await s.request('GET', `${base}/pendentes?grupo=classificar`);
        assert.equal(l.status, 200);
        assert.deepEqual(l.body.data.map((d) => d.id), ['cli-1']);
        assert.deepEqual(l.body.contagens, { acertar: 0, classificar: 1, telefone: 0 });
        assert.equal((await s.request('GET', `${base}/pendentes?grupo=zzz`)).status, 400);

        const c = await s.request('POST', `${base}/clientes/cli-1/classificacao`, { body: { classificacao: 'FORNECEDOR' } });
        assert.equal(c.status, 200);
        assert.deepEqual([c.body.classificacao.valor, c.body.classificacao.somenteFornecedor], ['FORNECEDOR', true]);
        assert.deepEqual([banco.manuais[0].origem, banco.manuais[0].atualizadoPorNome, banco.manuais[0].atualizadoPorId], ['app', 'Edu', 'u3']);
        assert.deepEqual([banco.historico[0].autorTipo, banco.historico[0].autorNome], ['usuario', 'Edu']);
        assert.equal((await s.request('POST', `${base}/clientes/cli-1/classificacao`, { body: { classificacao: 'xx' } })).status, 400);

        const i = await s.request('POST', `${base}/clientes/cli-1/inativacao`, { body: { motivo: 'fechou' } });
        assert.equal(i.status, 201);
        assert.deepEqual([i.body.solicitacao.status, i.body.solicitacao.solicitadoPor, i.body.solicitacao.origem], ['pendente', 'Edu', 'app']);
        const dup = await s.request('POST', `${base}/clientes/cli-1/inativacao`, { body: { motivo: 'fechou' } });
        assert.equal(dup.status, 200); assert.equal(dup.body.duplicado, true);
        assert.equal((await s.request('POST', `${base}/clientes/cli-1/inativacao`, { body: { motivo: 'xx' } })).status, 400);
    } finally { await s.close(); }
});
