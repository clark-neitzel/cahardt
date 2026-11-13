// Histórico de alterações do cliente (cliente_alteracoes): diff, autor, tolerância a falha e leitura.
// Prisma mockado — nunca toca banco real.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
process.env.ANALYTICS_API_KEY = process.env.ANALYTICS_API_KEY || 'chave-teste-analytics-agentes';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const CHAVE = process.env.ANALYTICS_API_KEY;
const LEITURA = { 'x-analytics-key': CHAVE };
const AGENTE = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'ana' };
const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const DATABASE = path.join(__dirname, '../config/database.js');
const CACHE = [
    'routes/analyticsRoutes.js',
    'services/clienteContatoService.js',
    'services/clienteHistoricoService.js',
    'services/analyticsConsultaService.js',
    'services/analyticsRegistroService.js',
    'services/analyticsComum.js',
    'middlewares/analyticsAuth.js',
];

// Serviço de histórico isolado, com o Prisma que o teste entregar.
function carregarHistorico(mock) {
    const restaurar = stubModule(DATABASE, makeMockPrisma(mock));
    limparCacheContendo('services/clienteHistoricoService.js');
    const svc = require('../services/clienteHistoricoService');
    restaurar();
    return svc;
}

function mockContatos({ createMany } = {}) {
    const gravadas = [];
    const contatos = [];
    const cliente = { UUID: 'cli-1', Nome: 'Padaria', NomeFantasia: 'Padaria do Zé', Ativo: true, End_Cidade: 'Joinville', End_Estado: 'SC' };
    return {
        gravadas, contatos,
        cliente: { findUnique: async () => ({ ...cliente }) },
        clienteContato: {
            findMany: async ({ where } = {}) => contatos.filter((c) => (!where?.telefoneChave || c.telefoneChave === where.telefoneChave) && (!where?.clienteUuid || c.clienteUuid === where.clienteUuid)).map((c) => ({ ...c })),
            findUnique: async ({ where }) => { const r = contatos.find((c) => c.id === where.id); return r ? { ...r } : null; },
            create: async ({ data }) => {
                const row = { nome: null, papel: null, nota: null, ultimoContatoEm: null, createdAt: new Date(), updatedAt: new Date(), ...data };
                contatos.push(row); return { ...row };
            },
            update: async ({ where, data }) => {
                const r = contatos.find((c) => c.id === where.id);
                Object.assign(r, data); return { ...r };
            },
            updateMany: async ({ where, data }) => {
                const r = contatos.find((c) => c.id === where.id && c.nomeChave === where.nomeChave);
                if (!r) return { count: 0 };
                Object.assign(r, data); return { count: 1 };
            },
            delete: async ({ where }) => { contatos.splice(contatos.findIndex((c) => c.id === where.id), 1); return {}; },
        },
        auditLog: { create: async ({ data }) => data },
        clienteAlteracao: {
            createMany: createMany || (async ({ data }) => { gravadas.push(...data); return { count: data.length }; }),
        },
    };
}

// ── diff ─────────────────────────────────────────────────────────────────────

test('diff: só campos que mudaram; vazio, null e undefined contam como igual', () => {
    const h = carregarHistorico({});
    const d = h.calcularDiff(
        { Nome: 'A', Email: null, Telefone: '', Ativo: true, Dia_de_venda: 'Seg' },
        { Nome: 'A', Email: '', Telefone: undefined, Ativo: false, Dia_de_venda: 'Ter' },
        ['Nome', 'Email', 'Telefone', 'Ativo', 'Dia_de_venda'],
    );
    assert.deepEqual(d, [
        { campo: 'Ativo', de: 'true', para: 'false' },
        { campo: 'Dia_de_venda', de: 'Seg', para: 'Ter' },
    ]);
});

test('diff: sem mudança nenhuma devolve lista vazia (no-op não gera linha)', () => {
    const h = carregarHistorico({});
    assert.deepEqual(h.calcularDiff({ a: 1, b: ['x'] }, { a: 1, b: ['x'] }), []);
    assert.deepEqual(h.calcularDiff({ a: 1 }, { a: 1 }, ['a', 'ausente']), []);
});

test('diff: campo com nome de segredo grava só que mudou, nunca o valor', () => {
    const h = carregarHistorico({});
    const d = h.calcularDiff(
        { senha: 'abc123', apiKey: null, token: 'x', Nome: 'A' },
        { senha: 'xyz789', apiKey: 'sk-secreta', token: 'x', Nome: 'B' },
    );
    const json = JSON.stringify(d);
    assert.ok(!json.includes('abc123') && !json.includes('xyz789') && !json.includes('sk-secreta'));
    assert.deepEqual(d.find((x) => x.campo === 'senha'), { campo: 'senha', de: '***', para: '***' });
    assert.deepEqual(d.find((x) => x.campo === 'apiKey'), { campo: 'apiKey', de: null, para: '***' });
    assert.equal(d.find((x) => x.campo === 'token'), undefined);
    assert.equal(d.find((x) => x.campo === 'Nome').para, 'B');
});

test('diff: chave secreta dentro de objeto também é mascarada', () => {
    const h = carregarHistorico({});
    const d = h.calcularDiff({ cfg: { a: 1 } }, { cfg: { a: 1, password: 'p@ss', nested: { token: 't0k' } } });
    assert.ok(!JSON.stringify(d).includes('p@ss') && !JSON.stringify(d).includes('t0k'));
});

test('diff: texto longo é cortado, mas mudança só no fim ainda é detectada', () => {
    const h = carregarHistorico({});
    const base = 'x'.repeat(2000);
    const d = h.calcularDiff({ nota: `${base}A` }, { nota: `${base}B` });
    assert.equal(d.length, 1);
    assert.equal(d[0].de.length, 500);
    assert.ok(d[0].de.endsWith('…'));
});

// ── autor ────────────────────────────────────────────────────────────────────

test('autorDe: agente da API x usuário do app', () => {
    const h = carregarHistorico({});
    assert.deepEqual(h.autorDe({ agente: 'luke' }), { tipo: 'agente', id: 'agente:luke', nome: 'luke', origem: 'api_agente' });
    assert.deepEqual(h.autorDe({ id: 'u1', nome: 'Maria' }), { tipo: 'usuario', id: 'u1', nome: 'Maria', origem: 'app' });
});

// ── gravação ─────────────────────────────────────────────────────────────────

test('registrar: falha ao gravar não lança e devolve 0', async () => {
    const h = carregarHistorico({
        clienteAlteracao: { createMany: async () => { throw new Error('banco fora'); } },
    });
    const orig = console.error; console.error = () => {};
    try {
        const n = await h.registrar({ clienteId: 'c', ator: { id: 'u', nome: 'M' }, mudancas: [{ campo: 'Nome', de: 'a', para: 'b' }] });
        assert.equal(n, 0);
    } finally { console.error = orig; }
});

test('registrar: sem mudança não escreve nada', async () => {
    let chamou = false;
    const h = carregarHistorico({ clienteAlteracao: { createMany: async () => { chamou = true; } } });
    assert.equal(await h.registrar({ clienteId: 'c', ator: {}, mudancas: [] }), 0);
    assert.equal(chamou, false);
});

test('agente grava contato pela API: histórico leva o nome do agente e origem api_agente', async () => {
    const mem = mockContatos();
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try {
        const criou = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', { headers: AGENTE, body: { telefone: '47999998888' } });
        assert.equal(criou.status, 201);
        const aprendeu = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', { headers: AGENTE, body: { nome: 'Maria', telefone: '47999998888', papel: 'dona' } });
        assert.equal(aprendeu.status, 200);
        const id = criou.body.contato.id;
        const patch = await request('PATCH', `/api/analytics/v1/contatos/${id}`, { headers: AGENTE, body: { papel: 'compras' } });
        assert.equal(patch.status, 200);
        const repetido = await request('PATCH', `/api/analytics/v1/contatos/${id}`, { headers: AGENTE, body: { papel: 'compras' } });
        assert.equal(repetido.status, 200);

        assert.ok(mem.gravadas.length >= 4);
        assert.ok(mem.gravadas.every((l) => l.autorNome === 'ana' && l.autorTipo === 'agente' && l.origem === 'api_agente' && l.clienteId === 'cli-1' && l.entidade === 'contato' && l.entidadeId === id));
        assert.equal(mem.gravadas[0].acao, 'criado');
        assert.ok(mem.gravadas.some((l) => l.campo === 'nome' && l.valorAntigo === null && l.valorNovo === 'Maria'));
        assert.ok(mem.gravadas.some((l) => l.campo === 'papel' && l.valorAntigo === 'dona' && l.valorNovo === 'compras'));
        // PATCH repetido, igual ao valor atual: nenhuma linha nova
        assert.equal(mem.gravadas.filter((l) => l.campo === 'papel' && l.valorNovo === 'compras').length, 1);
    } finally { await close(); }
});

test('usuário do app grava contato: histórico leva o usuário logado, origem app, e exclusão fica registrada', async () => {
    const mem = mockContatos();
    buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE); // carrega o serviço com o mock
    const contatos = require('../services/clienteContatoService');
    const usuario = { id: 'vend-9', nome: 'Carla Escritório' };
    const r = await contatos.gravar('cli-1', { nome: 'Pedro', telefone: '47988887777' }, usuario);
    await contatos.atualizar(r.contato.id, { papel: 'gerente' }, usuario, 'cli-1');
    await contatos.excluir(r.contato.id, usuario, 'cli-1');
    assert.ok(mem.gravadas.length >= 3);
    assert.ok(mem.gravadas.every((l) => l.autorId === 'vend-9' && l.autorNome === 'Carla Escritório' && l.autorTipo === 'usuario' && l.origem === 'app'));
    assert.deepEqual(mem.gravadas.map((l) => l.acao), ['criado', 'alterado', 'excluido']);
    assert.match(mem.gravadas[2].valorAntigo, /Pedro/);
});

test('falha ao gravar o histórico não quebra o salvamento do contato', async () => {
    const mem = mockContatos({ createMany: async () => { throw new Error('tabela inexistente'); } });
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    const orig = console.error; console.error = () => {};
    try {
        const r = await request('POST', '/api/analytics/v1/clientes/cli-1/contatos', { headers: AGENTE, body: { nome: 'Ana', telefone: '47977776666' } });
        assert.equal(r.status, 201);
        assert.equal(r.body.contato.nome, 'Ana');
        assert.equal(mem.contatos.length, 1);
    } finally { console.error = orig; await close(); }
});

// ── leitura ──────────────────────────────────────────────────────────────────

function mockLeitura() {
    const consultas = [];
    const linha = (i) => ({
        id: `id-${i}`, createdAt: new Date(`2026-11-1${i}T15:00:00Z`), clienteId: 'cli-1', entidade: 'cliente', entidadeId: null,
        acao: 'alterado', campo: 'Nome', valorAntigo: 'A', valorNovo: 'B', autorTipo: 'usuario', autorId: 'u', autorNome: 'Maria', origem: 'app', tela: 'CARTEIRA',
    });
    return {
        consultas,
        clienteAlteracao: {
            count: async ({ where }) => { consultas.push({ where }); return 2; },
            findMany: async (args) => { consultas.push(args); return [linha(2), linha(1)]; },
        },
    };
}

test('GET alteracoes: exige a chave, aplica filtros e limita o tamanho da página', async () => {
    const mem = mockLeitura();
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try {
        const semChave = await request('GET', '/api/analytics/v1/clientes/cli-1/alteracoes');
        assert.equal(semChave.status, 401);

        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/alteracoes?desde=2026-11-01&ate=2026-11-13&campo=Nome&autor=mar&origem=app&entidade=cliente&limite=9999', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.equal(r.body.limit, 200);
        assert.equal(r.body.total, 2);
        assert.equal(r.body.data.length, 2);
        assert.equal(r.body.data[0].em, '2026-11-12T15:00:00.000Z');
        assert.deepEqual(r.body.data[0].autor, { tipo: 'usuario', id: 'u', nome: 'Maria' });
        assert.equal(r.body.data[0].origem, 'app');
        const q = mem.consultas.find((c) => c.take);
        assert.equal(q.take, 200);
        assert.deepEqual(q.orderBy[0], { createdAt: 'desc' });
        const w = q.where;
        assert.equal(w.clienteId, 'cli-1');
        assert.equal(w.campo, 'Nome');
        assert.equal(w.origem, 'app');
        assert.equal(w.entidade, 'cliente');
        assert.deepEqual(w.autorNome, { contains: 'mar', mode: 'insensitive' });
        assert.equal(w.createdAt.gte.toISOString(), '2026-11-01T03:00:00.000Z'); // 00:00 em São Paulo
        assert.equal(w.createdAt.lte.toISOString(), '2026-11-14T02:59:59.999Z'); // 23:59:59 em São Paulo
    } finally { await close(); }
});

test('GET alteracoes: filtros inválidos dão 400 e a API não tem rota para apagar/editar histórico', async () => {
    const mem = mockLeitura();
    const { close, request } = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try {
        for (const qs of ['origem=xyz', 'entidade=pedido', 'desde=ontem', 'desde=2026-11-10&ate=2026-11-01']) {
            const r = await request('GET', `/api/analytics/v1/clientes/cli-1/alteracoes?${qs}`, { headers: LEITURA });
            assert.equal(r.status, 400, qs);
        }
        for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
            const r = await request(m, '/api/analytics/v1/clientes/cli-1/alteracoes', { headers: AGENTE, body: {} });
            assert.ok([404, 405].includes(r.status), `${m} → ${r.status}`);
        }
    } finally { await close(); }
});
