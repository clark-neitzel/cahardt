// Telefones do WhatsApp: o que o número precisa ter (55 + DDD + número), pendência "Telefone
// incompleto" em Cadastros pra acertar, ordem preferida e "funcionando". Prisma mockado.
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
const ROUTER_CLIENTES = path.join(__dirname, '../routes/clienteRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js', 'routes/clienteRoutes.js', 'controllers/clienteContatoController.js',
    'services/clienteContatoService.js', 'services/clienteHistoricoService.js',
    'services/analyticsConsultaService.js', 'services/analyticsRegistroService.js',
    'services/analyticsComum.js', 'services/analyticsClienteFichaService.js',
    'services/clienteCadastroCompletoService.js', 'services/clienteInativacaoService.js',
    'services/clienteClassificacaoService.js', 'services/clienteTelefonesService.js',
    'services/botWhatsappService.js', 'middlewares/analyticsAuth.js',
];

function carregar(mock, arquivo) {
    const restaurar = stubModule(DATABASE, makeMockPrisma(mock));
    limparCacheContendo(...CACHE);
    const svc = require(arquivo);
    restaurar();
    return svc;
}

const { avaliarTelefone } = require('../utils/telefoneWhatsapp');

// ── 1. o que o número precisa ter ─────────────────────────────────────────
test('avaliarTelefone: DDD + número ganha o 55 sozinho; com 55 fica como está', () => {
    assert.deepEqual(avaliarTelefone('(47) 99999-8888'), { status: 'normalizado', numero: '5547999998888', motivo: null, rotulo: null });
    assert.equal(avaliarTelefone('4734221100').numero, '554734221100');            // fixo
    assert.equal(avaliarTelefone('4788095072').numero, '554788095072');            // celular antigo sem o 9
    assert.deepEqual(avaliarTelefone('+55 47 99999-8888'), { status: 'ok', numero: '5547999998888', motivo: null, rotulo: null });
    assert.equal(avaliarTelefone('554734221100').status, 'ok');
    assert.equal(avaliarTelefone('047 99999-8888').numero, '5547999998888');        // zero do interurbano
    assert.equal(avaliarTelefone('').status, 'vazio');
    assert.equal(avaliarTelefone(null).status, 'vazio');
});

test('avaliarTelefone: sem DDD, DDD inexistente, dígitos errados e "55 no lugar do DDD" são incompletos', () => {
    const motivo = (raw, opts) => { const r = avaliarTelefone(raw, opts); assert.equal(r.numero, null, raw); assert.equal(r.status, 'incompleto', raw); return r.motivo; };
    assert.equal(motivo('55996293920'), 'ddd_55');              // Posto 44 Richter (Joinville)
    assert.equal(motivo('5528995930'), 'ddd_55');
    assert.equal(motivo('99629-3920'), 'sem_ddd');
    assert.equal(motivo('34471023'), 'sem_ddd');
    assert.equal(motivo('0474299403'), 'sem_ddd');              // 047 + 7 dígitos
    assert.equal(motivo('5935778920'), 'ddd_invalido');         // DDD 59 não existe
    assert.equal(motivo('47888092707'), 'celular_sem_9');       // 11 dígitos sem o 9
    assert.equal(motivo('453264801145'), 'tamanho');
    assert.equal(motivo('0'), 'tamanho');
    assert.equal(motivo('4700000000'), 'numero_invalido');
    assert.equal(motivo('9999999999'), 'numero_invalido');
    // DDD 55 de verdade (RS) só vale se o cadastro é do RS
    assert.equal(avaliarTelefone('55996293920', { uf: 'RS' }).numero, '5555996293920');
});

test('botWhatsappService.normalizarTelefone usa a mesma régua (não manda mais 55996293920 para a Z-API)', () => {
    const bot = carregar({}, '../services/botWhatsappService');
    assert.equal(bot.normalizarTelefone('47999998888'), '5547999998888');
    assert.equal(bot.normalizarTelefone('5547999998888'), '5547999998888');
    assert.equal(bot.normalizarTelefone('55996293920'), null);
    assert.equal(bot.normalizarTelefone('0474299403'), null);
    assert.equal(bot.normalizarTelefone('123'), null);
});

// ── 2. lista ordenada (pura) ───────────────────────────────────────────────
test('montarTelefones: ordem padrão, sem repetir número (com/sem 55 e 9), preferido = 1º válido', () => {
    const { montarTelefones } = carregar({}, '../services/clienteTelefonesService');
    const cli = {
        Telefone_Celular: '0474299403',             // incompleto (vem primeiro na ordem padrão mas não é o preferido)
        Telefone: '47 3422-1100',
        Telefone_Comercial: '554734221100',         // mesmo número do Telefone
        whatsapp: { numeros: ['47988095072'] },
    };
    const contatos = [{ id: 'k1', nome: 'Maria', telefone: '5547988095072', ultimoContatoEm: new Date() }, { id: 'k2', nome: 'João', telefone: '47 99111-2222' }];
    const r = montarTelefones(cli, contatos, null);
    assert.deepEqual(r.telefones.map((t) => t.final), ['9403', '5072', '1100', '2222']);
    assert.deepEqual(r.telefones[1].fontes, ['whatsapp', 'contato']);
    assert.deepEqual(r.telefones[1].pessoas, ['Maria']);
    assert.deepEqual(r.telefones[2].fontes, ['telefone', 'comercial']);
    assert.equal(r.preferido, '5547988095072');
    assert.equal(r.telefones.filter((t) => t.preferencial).length, 1);
    assert.equal(r.ordemDefinida, false);
    assert.equal(r.pendencia.campo, 'telefoneIncompleto');
    assert.equal(r.pendencia.semNumeroValido, false);
    assert.deepEqual(r.pendencia.numeros.map((n) => [n.final, n.motivo]), [['9403', 'sem_ddd']]);
});

test('montarTelefones: ordem gravada vem primeiro, chave que sumiu é ignorada, funcionando marcado', () => {
    const { montarTelefones } = carregar({}, '../services/clienteTelefonesService');
    const cli = { Telefone_Celular: '47988095072', Telefone: '47991117038' };
    const pref = { ordem: ['4791117038', 'chave-que-sumiu'], funcionandoChave: '4788095072', funcionandoEm: new Date('2026-11-10T12:00:00Z') };
    const r = montarTelefones(cli, [], pref);
    assert.deepEqual(r.telefones.map((t) => t.final), ['7038', '5072']);
    assert.equal(r.preferido, '5547991117038');
    assert.equal(r.funcionando, '5547988095072');
    assert.equal(r.telefones[1].funcionandoEm, '2026-11-10T12:00:00.000Z');
    assert.equal(r.ordemDefinida, true);
    assert.equal(r.pendencia, null);
});

test('montarTelefones: só número incompleto → sem preferido e semNumeroValido', () => {
    const { montarTelefones } = carregar({}, '../services/clienteTelefonesService');
    const r = montarTelefones({ Telefone_Celular: '55996293920', End_Estado: 'SC' }, [], null);
    assert.equal(r.preferido, null);
    assert.equal(r.pendencia.semNumeroValido, true);
    assert.equal(r.pendencia.numeros[0].rotuloMotivo, 'Parece que falta o DDD (tem 55 no lugar do DDD)');
});

// ── 3. banco mockado: pendentes, ficha, rotas ──────────────────────────────
const TABELA = { id: '1000', idCondicao: 'AVISTA_DIN', nomeCondicao: 'À vista', ativo: true, acrescimoPreco: 0, qtdParcelas: 1, parcelasDias: 0 };
const VENDEDOR = { id: 'v1', nome: 'Carla', ativo: true };
const cli = (UUID, extra = {}) => ({
    UUID, Nome: `Razão ${UUID}`, NomeFantasia: `Nome ${UUID}`, Documento: null, Perfis: null, Ativo: true, End_Cidade: 'Joinville', End_Estado: 'SC',
    Dia_de_venda: 'TER', Dia_de_entrega: 'QUA', Condicao_de_pagamento: '1000', idVendedor: 'v1', vendedor: VENDEDOR,
    Telefone_Celular: '47999998888', Telefone: null, Telefone_Comercial: null, whatsapp: null, ...extra,
});

function mockBanco({ clientes, receber = [], contatos = [], prefs = [] }) {
    const mem = {
        prefs: prefs.map((p) => ({ ...p })), historico: [],
        tabelaPreco: { findMany: async () => [TABELA] },
        cliente: {
            findMany: async ({ where } = {}) => clientes.filter((c) => (where?.Ativo ? c.Ativo !== false : true) && (!where?.UUID?.in || where.UUID.in.includes(c.UUID))).map((c) => ({ ...c })),
            findUnique: async ({ where }) => { const c = clientes.find((x) => x.UUID === where.UUID); return c ? { ...c } : null; },
        },
        contaReceber: { findMany: async () => receber.map((clienteId) => ({ clienteId })) },
        pedido: { findMany: async (args) => (args?.distinct ? [] : []) },
        pedidoItem: { findMany: async () => [] },
        contaPagar: { findMany: async () => [] },
        clienteClassificacao: { findMany: async () => [] },
        clienteContato: {
            findMany: async ({ where } = {}) => contatos.filter((c) => !where?.clienteUuid || c.clienteUuid === where.clienteUuid).map((c) => ({ ...c })),
        },
        clienteTelefonePreferencia: {
            findUnique: async ({ where }) => { const p = mem.prefs.find((x) => x.clienteId === where.clienteId); return p ? { ...p } : null; },
            upsert: async ({ where, create, update }) => {
                const p = mem.prefs.find((x) => x.clienteId === where.clienteId);
                if (p) { Object.assign(p, update); return { ...p }; }
                mem.prefs.push({ ...create }); return { ...create };
            },
            updateMany: async ({ where, data }) => { let n = 0; for (const p of mem.prefs) if (p.clienteId === where.clienteId) { Object.assign(p, data); n++; } return { count: n }; },
        },
        clienteAlteracao: { createMany: async ({ data }) => { mem.historico.push(...data); return { count: data.length }; } },
    };
    return mem;
}

async function comApp(mem, fn) {
    const s = await startTestServer(buildApp('/api/analytics', ROUTER, makeMockPrisma(mem), CACHE));
    try { await fn(s.request); } finally { await s.close(); }
}

test('cadastros-pendentes: cliente completo com telefone incompleto entra em acertar e no grupo telefone; contagens', async () => {
    const mem = mockBanco({
        clientes: [
            cli('c-ok'),                                                     // completo, número bom: fora
            cli('c-richter', { Telefone_Celular: '55996293920' }),           // completo, telefone incompleto: entra
            cli('c-incompleto', { Dia_de_entrega: null }),                   // falta campo, número bom
            cli('c-dois', { Dia_de_entrega: null, Telefone: '34471023' }),   // falta campo E telefone
            cli('c-contato'),                                                // telefone ruim só na pessoa do WhatsApp
            cli('c-nada', { Telefone_Celular: '123' }),                      // a classificar: não entra em telefone
        ],
        receber: ['c-ok', 'c-richter', 'c-incompleto', 'c-dois', 'c-contato'],
        contatos: [{ clienteUuid: 'c-contato', telefone: '5935778920' }],
    });
    await comApp(mem, async (request) => {
        const r = await request('GET', '/api/analytics/v1/cadastros-pendentes', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.contagens, { acertar: 4, classificar: 1, telefone: 3 });
        assert.deepEqual(r.body.data.map((d) => d.id).sort(), ['c-contato', 'c-dois', 'c-incompleto', 'c-richter']);
        const richter = r.body.data.find((d) => d.id === 'c-richter');
        assert.equal(richter.completo, true);
        assert.deepEqual(richter.faltando, []);                              // a regra da Ana não muda
        assert.deepEqual(richter.pendencias, [{ campo: 'telefoneIncompleto', rotulo: 'Telefone incompleto' }]);
        assert.equal(richter.telefoneIncompleto.semNumeroValido, true);
        assert.deepEqual(richter.telefoneIncompleto.numeros.map((n) => [n.final, n.motivo]), [['3920', 'ddd_55']]);
        const dois = r.body.data.find((d) => d.id === 'c-dois');
        assert.deepEqual(dois.pendencias.map((p) => p.campo), ['diaEntrega', 'telefoneIncompleto']);
        assert.equal(r.body.data.find((d) => d.id === 'c-incompleto').telefoneIncompleto, null);

        const t = await request('GET', '/api/analytics/v1/cadastros-pendentes?grupo=telefone', { headers: LEITURA });
        assert.equal(t.status, 200);
        assert.deepEqual(t.body.data.map((d) => d.id).sort(), ['c-contato', 'c-dois', 'c-richter']);
    });
});

test('ficha: telefonesWhatsapp na ordem preferida, com número no formato da Z-API', async () => {
    const mem = mockBanco({
        clientes: [cli('cli-1', { Telefone_Celular: '47988095072', Telefone: '47991117038' })],
        receber: ['cli-1'],
        prefs: [{ clienteId: 'cli-1', ordem: ['4791117038'], funcionandoChave: null }],
    });
    await comApp(mem, async (request) => {
        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/ficha', { headers: LEITURA });
        assert.equal(r.status, 200);
        const w = r.body.telefonesWhatsapp;
        assert.deepEqual(w.telefones.map((t) => t.numero), ['5547991117038', '5547988095072']);
        assert.equal(w.preferido, '5547991117038');
        assert.equal(w.pendencia, null);
        assert.deepEqual(r.body.cadastro, { completo: true, faltando: [] });
    });
});

test('ficha: sem a tabela de preferência (deploy no meio) → ordem padrão, não quebra', async () => {
    const mem = mockBanco({ clientes: [cli('cli-1', { Telefone: '47991117038' })], receber: ['cli-1'] });
    mem.clienteTelefonePreferencia = { findUnique: async () => { throw new Error('relation "cliente_telefone_preferencia" does not exist'); } };
    await comApp(mem, async (request) => {
        const r = await request('GET', '/api/analytics/v1/clientes/cli-1/ficha', { headers: LEITURA });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.telefonesWhatsapp.telefones.map((t) => t.final), ['8888', '7038']);
    });
});

test('API: GET telefones, PUT ordem (exige agente, valida número do cliente, grava histórico) e POST funcionando', async () => {
    const mem = mockBanco({ clientes: [cli('cli-1', { Telefone_Celular: '47988095072', Telefone: '47991117038' })] });
    await comApp(mem, async (request) => {
        const g = await request('GET', '/api/analytics/v1/clientes/cli-1/telefones', { headers: LEITURA });
        assert.equal(g.status, 200);
        assert.deepEqual(g.body.telefones.map((t) => t.final), ['5072', '7038']);
        assert.equal(g.body.preferido, '5547988095072');

        assert.equal((await request('PUT', '/api/analytics/v1/clientes/cli-1/telefones/ordem', { headers: LEITURA, body: { ordem: ['47991117038'] } })).status, 400);
        const ruim = await request('PUT', '/api/analytics/v1/clientes/cli-1/telefones/ordem', { headers: AGENTE, body: { ordem: ['47 90000-1111'] } });
        assert.equal(ruim.status, 400);
        assert.equal(ruim.body.codigo, 'TELEFONE_NAO_E_DO_CLIENTE');
        assert.equal((await request('PUT', '/api/analytics/v1/clientes/cli-1/telefones/ordem', { headers: AGENTE, body: {} })).status, 400);

        const p = await request('PUT', '/api/analytics/v1/clientes/cli-1/telefones/ordem', { headers: AGENTE, body: { ordem: ['+55 (47) 99111-7038'] } });
        assert.equal(p.status, 200);
        assert.equal(p.body.preferido, '5547991117038');
        assert.deepEqual(mem.prefs[0].ordem, ['4791117038']);
        assert.deepEqual([mem.prefs[0].atualizadoPorTipo, mem.prefs[0].atualizadoPorNome], ['agente', 'ana']);
        assert.equal(mem.historico.length, 1);
        assert.deepEqual([mem.historico[0].campo, mem.historico[0].valorAntigo, mem.historico[0].valorNovo], ['ordemTelefones', 'ordem padrão', '1º …7038, 2º …5072']);

        const f = await request('POST', '/api/analytics/v1/clientes/cli-1/telefones/funcionando', { headers: AGENTE, body: { telefone: '554788095072' } });
        assert.equal(f.status, 200);
        assert.equal(f.body.funcionando, '5547988095072');
        assert.equal(f.body.preferido, '5547991117038', 'funcionando não troca a ordem escolhida pela equipe');
        assert.equal(mem.historico.at(-1).campo, 'telefoneFuncionando');
        const f2 = await request('POST', '/api/analytics/v1/clientes/cli-1/telefones/funcionando', { headers: AGENTE, body: { telefone: '554788095072' } });
        assert.equal(f2.status, 200);
        assert.equal(mem.historico.filter((h) => h.campo === 'telefoneFuncionando').length, 1, 'mesmo número de novo não repete o histórico');
        assert.equal((await request('POST', '/api/analytics/v1/clientes/cli-1/telefones/funcionando', { headers: AGENTE, body: { telefone: '4790000111' } })).status, 400);

        const v = await request('PUT', '/api/analytics/v1/clientes/cli-1/telefones/ordem', { headers: AGENTE, body: { ordem: [] } });
        assert.equal(v.status, 200);
        assert.equal(v.body.ordemDefinida, false);
        assert.equal(v.body.preferido, '5547988095072');
        assert.equal((await request('GET', '/api/analytics/v1/clientes/nao-existe/telefones', { headers: LEITURA })).status, 404);
    });
});

function appClientes(mem, user) {
    const restaurar = stubModule(DATABASE, makeMockPrisma(mem));
    limparCacheContendo(...CACHE);
    const router = require(ROUTER_CLIENTES);
    restaurar();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { if (user) req.user = user; next(); });
    app.use('/api/clientes', router);
    return app;
}

test('app: GET /clientes/:uuid/telefones; PUT ordem exige permissão de editar clientes e grava o usuário', async () => {
    const mem = mockBanco({ clientes: [cli('cli-1', { Telefone_Celular: '47988095072', Telefone: '47991117038' })] });
    const sem = await startTestServer(appClientes(mem, { id: 'u1', nome: 'Zé', permissoes: { clientes: { view: true } } }));
    try {
        assert.equal((await sem.request('GET', '/api/clientes/cli-1/telefones')).status, 200);
        const r = await sem.request('PUT', '/api/clientes/cli-1/telefones/ordem', { body: { ordem: ['47991117038'] } });
        assert.equal(r.status, 403);
        assert.equal(mem.prefs.length, 0);
    } finally { await sem.close(); }
    const ok = await startTestServer(appClientes(mem, { id: 'u3', nome: 'Leticia', permissoes: { clientes: { edit: true } } }));
    try {
        const r = await ok.request('PUT', '/api/clientes/cli-1/telefones/ordem', { body: { ordem: ['47991117038', '47988095072'] } });
        assert.equal(r.status, 200);
        assert.equal(r.body.preferido, '5547991117038');
        assert.deepEqual([mem.prefs[0].atualizadoPorTipo, mem.prefs[0].atualizadoPorId, mem.prefs[0].atualizadoPorNome], ['usuario', 'u3', 'Leticia']);
        assert.deepEqual([mem.historico[0].autorTipo, mem.historico[0].autorNome, mem.historico[0].tela], ['usuario', 'Leticia', 'Cadastro > Telefones do WhatsApp']);
    } finally { await ok.close(); }
});
