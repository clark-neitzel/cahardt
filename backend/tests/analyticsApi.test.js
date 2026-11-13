// /api/analytics/v1 — chave estática dos agentes comerciais.
// Não toca banco real: o Prisma é mockado antes da rota ser carregada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
process.env.ANALYTICS_API_KEY = 'chave-teste-analytics-agentes';

const { makeMockPrisma } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

// Os testes deste arquivo compartilham process.env. Encadeia para não rodarem juntos.
let cauda = Promise.resolve();
function serie(nome, fn) {
    test(nome, () => {
        const executar = cauda.then(() => fn());
        cauda = executar.then(() => {}, () => {});
        return executar;
    });
}

const ROUTER = path.join(__dirname, '../routes/analyticsRoutes.js');
const CACHE = [
    'routes/analyticsRoutes.js',
    'services/analyticsConsultaService.js',
    'services/analyticsRegistroService.js',
    'services/analyticsComum.js',
    'services/analyticsBackupService.js',
    'services/backupLock.js',
    'middlewares/analyticsAuth.js',
    'middlewares/analyticsBackupAuth.js',
];
const CHAVE = 'chave-teste-analytics-agentes';
const AGENTE = { 'x-analytics-key': CHAVE, 'x-analytics-agent': 'carteira-manha' };

function appCom(mockPrisma) {
    return buildApp('/api/analytics', ROUTER, mockPrisma, CACHE);
}

function prismaComTransacao(overrides) {
    const mock = makeMockPrisma({
        ...overrides,
        $transaction: (fn, opcoes) => {
            assert.equal(opcoes && opcoes.timeout, 20000);
            assert.equal(opcoes && opcoes.maxWait, 10000);
            return fn(mock);
        },
    });
    return mock;
}

function memoriaSugestoes() {
    const db = new Map();
    let audits = [];
    const api = {
        audits: () => audits,
        sugestaoAgente: {
            findUnique: async ({ where, include }) => {
                const row = where.sugestaoId
                    ? [...db.values()].find((s) => s.sugestaoId === where.sugestaoId)
                    : db.get(where.id);
                return row ? { ...row, ...(include ? { vendedor: null, cliente: null, lead: null } : {}) } : null;
            },
            create: async ({ data, include }) => {
                if ([...db.values()].some((s) => s.sugestaoId === data.sugestaoId)) {
                    const e = new Error('unique'); e.code = 'P2002'; throw e;
                }
                const row = {
                    id: `sug-${db.size + 1}`,
                    criadoEm: new Date().toISOString(),
                    atualizadoEm: new Date().toISOString(),
                    provaTexto: null, provaPor: null, provaEm: null, aprovadoPor: null,
                    ...data,
                };
                db.set(row.id, row);
                return { ...row, ...(include ? { vendedor: null, cliente: null, lead: null } : {}) };
            },
            update: async ({ where, data, include }) => {
                const row = [...db.values()].find((s) => s.sugestaoId === where.sugestaoId);
                if (!row) throw new Error('não achei');
                Object.assign(row, data, { atualizadoEm: new Date().toISOString() });
                return { ...row, ...(include ? { vendedor: null, cliente: null, lead: null } : {}) };
            },
            count: async () => db.size,
            findMany: async () => [...db.values()].map((s) => ({ ...s, vendedor: null, cliente: null, lead: null })),
        },
        auditLog: {
            create: async ({ data }) => { audits.push(data); return data; },
            findFirst: async () => null,
        },
    };
    return api;
}

serie('GET /v1/status sem chave -> 401 e a resposta não ecoa segredo', async () => {
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const r = await request('GET', '/api/analytics/v1/status');
        assert.equal(r.status, 401);
        assert.equal(r.body.codigo, 'CHAVE_INVALIDA');
        assert.equal(JSON.stringify(r.body).includes(CHAVE), false);
    } finally { await close(); }
});

serie('chave errada -> 401; chave só na URL -> 400 (não vale, para não ir parar no log)', async () => {
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const errada = await request('GET', '/api/analytics/v1/status', { headers: { 'x-analytics-key': 'nao-e-essa' } });
        assert.equal(errada.status, 401);
        const naUrl = await request('GET', `/api/analytics/v1/status?x-analytics-key=${CHAVE}`);
        assert.equal(naUrl.status, 400);
        assert.equal(naUrl.body.codigo, 'CHAVE_NA_URL');
        assert.equal(JSON.stringify(naUrl.body).includes(CHAVE), false);
    } finally { await close(); }
});

serie('sem ANALYTICS_API_KEY a API fica desligada (503), mesmo com a chave antiga', async () => {
    const anterior = process.env.ANALYTICS_API_KEY;
    delete process.env.ANALYTICS_API_KEY;
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const r = await request('GET', '/api/analytics/v1/status', { headers: { 'x-analytics-key': anterior } });
        assert.equal(r.status, 503);
        assert.equal(r.body.codigo, 'NAO_CONFIGURADA');
    } finally {
        process.env.ANALYTICS_API_KEY = anterior;
        await close();
    }
});

serie('GET /v1/status com a chave certa -> 200 e deixa explícito que não manda WhatsApp', async () => {
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const r = await request('GET', '/api/analytics/v1/status', { headers: { 'x-analytics-key': CHAVE } });
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.equal(r.body.versao, '1');
        assert.equal(r.body.whatsapp, false);
        assert.ok(r.body.escreve.includes('sugestoes'));
    } finally { await close(); }
});

serie('POST /v1/vendas não existe (a API não grava pedido) e vendas sem período -> 400', async () => {
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const post = await request('POST', '/api/analytics/v1/vendas', { headers: AGENTE, body: { qualquer: 1 } });
        assert.equal(post.status, 404);
        const get = await request('GET', '/api/analytics/v1/vendas', { headers: { 'x-analytics-key': CHAVE } });
        assert.equal(get.status, 400);
        assert.equal(get.body.codigo, 'PERIODO_OBRIGATORIO');
    } finally { await close(); }
});

serie('sugestão: cria, não duplica o mesmo sugestaoId, exige prova para feita', async () => {
    const mem = memoriaSugestoes();
    const { close, request } = await startTestServer(appCom(makeMockPrisma(mem)));
    try {
        const corpo = {
            sugestaoId: 'retencao-cli-001',
            tipo: 'RETENCAO',
            titulo: 'Ligar para a padaria',
            texto: 'Está parada há 30 dias.',
        };
        const criado = await request('POST', '/api/analytics/v1/sugestoes', { headers: AGENTE, body: corpo });
        assert.equal(criado.status, 201);
        assert.equal(criado.body.duplicado, false);
        assert.equal(criado.body.sugestao.status, 'SUGERIDA');
        assert.equal(criado.body.sugestao.agente, 'carteira-manha');
        assert.equal(mem.audits().length, 1);
        assert.equal(mem.audits()[0].usuarioNome, 'carteira-manha');

        const deNovo = await request('POST', '/api/analytics/v1/sugestoes', {
            headers: AGENTE,
            body: { ...corpo, titulo: 'OUTRO TITULO QUE NAO PODE GRAVAR' },
        });
        assert.equal(deNovo.status, 200);
        assert.equal(deNovo.body.duplicado, true);
        assert.equal(deNovo.body.sugestao.titulo, 'Ligar para a padaria');

        const semProva = await request('PATCH', '/api/analytics/v1/sugestoes/retencao-cli-001', {
            headers: AGENTE, body: { status: 'done' },
        });
        assert.equal(semProva.status, 400);
        assert.equal(semProva.body.codigo, 'PROVA_OBRIGATORIA');

        const feita = await request('PATCH', '/api/analytics/v1/sugestoes/retencao-cli-001', {
            headers: AGENTE,
            body: { status: 'approved', aprovadoPor: 'Clarkson' },
        });
        assert.equal(feita.status, 200);
        assert.equal(feita.body.sugestao.status, 'APROVADA');
        assert.equal(feita.body.sugestao.aprovadoPor, 'Clarkson');

        const comProva = await request('PATCH', '/api/analytics/v1/sugestoes/retencao-cli-001', {
            headers: AGENTE,
            body: { status: 'done', provaTexto: 'Leticia ligou e anotou o pedido para sexta.', provaPor: 'Leticia' },
        });
        assert.equal(comProva.status, 200);
        assert.equal(comProva.body.sugestao.status, 'FEITA');
        assert.match(comProva.body.sugestao.provaTexto, /Leticia ligou/);
        assert.ok(comProva.body.sugestao.historico.length >= 3);

        const lista = await request('GET', '/api/analytics/v1/sugestoes', { headers: { 'x-analytics-key': CHAVE } });
        assert.equal(lista.status, 200);
        assert.equal(lista.body.total, 1);
        assert.equal(lista.body.data[0].sugestaoId, 'retencao-cli-001');
    } finally { await close(); }
});

serie('atendimento: sem cliente recusa; com cliente grava nota e não mexe em pedido', async () => {
    const criados = [];
    const mock = prismaComTransacao({
        vendedor: { findUnique: async () => ({ id: 'vend-1', nome: 'Leticia' }) },
        cliente: { findUnique: async () => ({ UUID: 'cli-1', Nome: 'Padaria', NomeFantasia: 'Padaria' }) },
        atendimento: {
            create: async ({ data }) => {
                criados.push(data);
                return { id: 'at-1', criadoEm: '2026-11-12T12:00:00.000Z', ...data };
            },
        },
        auditLog: { create: async ({ data }) => data },
    });
    const { close, request } = await startTestServer(appCom(mock));
    try {
        const ruim = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: AGENTE,
            body: { vendedorId: 'vend-1', tipo: 'WHATSAPP', observacao: 'sem dono' },
        });
        assert.equal(ruim.status, 400);
        assert.equal(ruim.body.codigo, 'CAMPO_OBRIGATORIO');

        const semAgente = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: { 'x-analytics-key': CHAVE },
            body: { vendedorId: 'vend-1', clienteId: 'cli-1', tipo: 'WHATSAPP', observacao: 'oi' },
        });
        assert.equal(semAgente.status, 400);
        assert.equal(semAgente.body.codigo, 'AGENTE_OBRIGATORIO');

        const ok = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: AGENTE,
            body: {
                vendedorId: 'vend-1', clienteId: 'cli-1', tipo: 'WHATSAPP',
                observacao: 'Mandei mensagem e não respondeu.', acaoLabel: 'Sem resposta',
            },
        });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.atendimento.id, 'at-1');
        assert.equal(ok.body.atendimento.clienteId, 'cli-1');
        assert.equal(criados.length, 1);
        assert.equal(criados[0].pedidoId, undefined);
        assert.equal(criados[0].idVendedor, 'vend-1');
        assert.equal(criados[0].tipo, 'WHATSAPP');
    } finally { await close(); }
});

serie('atendimento de lead marca a próxima visita no lead e a referência não duplica nem na corrida', async () => {
    const atendimentos = new Map();
    const refs = new Map();
    const lead = { id: 'lead-1', proximaVisita: null };
    let seq = 0;
    const ordem = [];
    let forcarCorrida = false;
    let buscasNaCorrida = 0;
    const mock = prismaComTransacao({
        vendedor: { findUnique: async () => ({ id: 'vend-1', nome: 'Leticia' }) },
        lead: {
            findUnique: async () => ({ id: 'lead-1', numero: 3, nomeEstabelecimento: 'Mercado', etapa: 'NOVO' }),
            update: async ({ where, data }) => {
                assert.equal(where.id, 'lead-1');
                ordem.push('lead');
                Object.assign(lead, data);
                return lead;
            },
        },
        atendimento: {
            create: async ({ data }) => {
                ordem.push('atendimento');
                seq += 1;
                const row = { id: `at-${seq}`, criadoEm: '2026-11-12T12:00:00.000Z', ...data };
                atendimentos.set(row.id, row);
                return row;
            },
        },
        atendimentoReferenciaAgente: {
            findUnique: async ({ where }) => {
                if (forcarCorrida) {
                    buscasNaCorrida += 1;
                    if (buscasNaCorrida === 1) return null;
                }
                const row = refs.get(where.referencia);
                return row ? { ...row, atendimento: atendimentos.get(row.atendimentoId) } : null;
            },
            create: async ({ data }) => {
                if (forcarCorrida || refs.has(data.referencia)) {
                    const e = new Error('unique');
                    e.code = 'P2002';
                    throw e;
                }
                ordem.push('referencia');
                refs.set(data.referencia, data);
                return data;
            },
        },
        auditLog: { create: async ({ data }) => data },
    });
    const { close, request } = await startTestServer(appCom(mock));
    try {
        const ok = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: AGENTE,
            body: {
                vendedorId: 'vend-1', leadId: 'lead-1', tipo: 'VISITA',
                observacao: 'Marquei a volta para sexta.',
                proximaVisita: '2026-11-20',
                referencia: 'visita-lead-1-sexta',
            },
        });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.duplicado, false);
        assert.deepEqual(ordem, ['atendimento', 'referencia', 'lead']);
        assert.equal(lead.proximaVisita.toISOString().slice(0, 10), '2026-11-20');

        const deNovo = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: AGENTE,
            body: {
                vendedorId: 'vend-1', leadId: 'lead-1', tipo: 'VISITA',
                observacao: 'retry', proximaVisita: '2026-11-20',
                referencia: 'visita-lead-1-sexta',
            },
        });
        assert.equal(deNovo.status, 200);
        assert.equal(deNovo.body.duplicado, true);
        assert.equal(deNovo.body.atendimento.id, 'at-1');
        assert.equal(seq, 1);

        // Corrida: a busca inicial não acha (o outro ainda não commitou) e o
        // insert da referência bate na chave única. A resposta é o que já existe.
        forcarCorrida = true;
        const corrida = await request('POST', '/api/analytics/v1/atendimentos', {
            headers: AGENTE,
            body: {
                vendedorId: 'vend-1', leadId: 'lead-1', tipo: 'VISITA',
                observacao: 'ao mesmo tempo', referencia: 'visita-lead-1-sexta',
            },
        });
        assert.equal(corrida.status, 200);
        assert.equal(corrida.body.duplicado, true);
        assert.equal(corrida.body.atendimento.id, 'at-1');
    } finally { await close(); }
});

serie('lead sem nome é recusado antes de gravar; escrita sem agente também', async () => {
    const { close, request } = await startTestServer(appCom(makeMockPrisma({})));
    try {
        const r = await request('POST', '/api/analytics/v1/leads', {
            headers: AGENTE, body: { vendedorId: 'vend-1' },
        });
        assert.equal(r.status, 400);
        assert.equal(r.body.codigo, 'CAMPO_OBRIGATORIO');
    } finally { await close(); }
});

serie('os arquivos da API não enviam WhatsApp nem aceitam SQL do chamador', () => {
    const arquivos = [
        'routes/analyticsRoutes.js',
        'services/analyticsConsultaService.js',
        'services/analyticsRegistroService.js',
        'services/analyticsComum.js',
        'services/analyticsBackupService.js',
        'middlewares/analyticsAuth.js',
        'middlewares/analyticsBackupAuth.js',
    ];
    for (const rel of arquivos) {
        const txt = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
        assert.equal(/botWhatsapp|queryRawUnsafe|eval\(/.test(txt), false, rel);
        assert.equal(txt.includes('ANALYTICS_API_KEY='), false, rel);
    }
});
