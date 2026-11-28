// POST /api/admin-exec/chat-luke-config — dry-run por padrão, só ?confirmar=1 grava. Prisma mockado em memória.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
const SEGREDO = 'segredo-admin-de-teste-local';
process.env.ADMIN_SECRET = SEGREDO;

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['services/chatLukeAdminService.js', 'services/chatLukeService.js', 'services/lukeWebhookService.js', 'routes/adminExec.js'];

function memoria() {
    const vendedores = new Map();
    const configs = new Map();
    const audits = [];
    const db = { vendedores, configs, audits, addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, ...v }); } };
    const pick = (o, sel) => { if (!sel) return { ...o }; const r = {}; for (const k of Object.keys(sel)) if (sel[k] === true) r[k] = o[k]; return r; };
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findMany: async ({ where, select }) => [...vendedores.values()]
                .filter((v) => (where.agente === undefined || v.agente === where.agente) && (where.ativo === undefined || v.ativo === where.ativo))
                .map((v) => pick(v, select)),
        },
        appConfig: {
            findUnique: async ({ where }) => (configs.has(where.key) ? { key: where.key, value: configs.get(where.key) } : null),
            upsert: async ({ where, update, create }) => { configs.set(where.key, (configs.has(where.key) ? update : create).value); return {}; },
        },
        auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
    });
    return { db, prisma };
}

async function subir() {
    const { db, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    require('../services/chatLukeAdminService'); // carregado com o banco falso (a rota faz require preguiçoso)
    const adminExec = require('../routes/adminExec');
    restaurar();
    const app = express();
    app.use(express.json());
    app.use('/api/admin-exec', adminExec);
    const srv = await startTestServer(app);
    return { db, srv };
}

const H = { 'x-admin-secret': SEGREDO };
const URL = '/api/admin-exec/chat-luke-config';
const chamar = (srv, corpo, conf, headers = H) => srv.request('POST', conf === undefined ? URL : `${URL}?confirmar=${conf}`, { headers, body: corpo });

test('sem segredo ou com segredo errado: 401 e nada gravado', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true });
        assert.equal((await chamar(srv, { ativo: true }, 1, {})).status, 401);
        assert.equal((await chamar(srv, { ativo: true }, 1, { 'x-admin-secret': 'errado' })).status, 401);
        assert.equal(db.configs.size, 0);
    } finally { await srv.close(); }
});

test('dry-run (sem confirmar ou confirmar != "1") não grava e mostra atual/novo/webhook', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true });
        for (const conf of [undefined, 0, 'true', 'sim']) {
            const r = await chamar(srv, { agenteNome: 'Luke (agente)', ativo: true }, conf);
            assert.equal(r.status, 200);
            assert.equal(r.body.dryRun, true);
            assert.equal(r.body.gravado, false);
            assert.equal(r.body.atual.agenteId, null);
            assert.equal(r.body.novo.agenteId, 'luke');
            assert.equal(r.body.novo.ativo, true);
            assert.ok('ligado' in r.body.webhook && !('url' in r.body.webhook) && !('segredo' in r.body.webhook));
        }
        assert.equal(db.configs.size, 0);
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('confirmar=1 grava a config, audita com ator admin-exec e resolve agente por nome', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true });
        db.addVendedor({ id: 'humano', nome: 'Humano', agente: false });
        const r = await chamar(srv, { agenteNome: 'Luke (agente)', ativo: true }, 1);
        assert.equal(r.status, 200);
        assert.equal(r.body.gravado, true);
        assert.equal(r.body.novo.agenteId, 'luke');
        assert.equal(r.body.novo.ativo, true);
        assert.equal(db.configs.get('chat_luke').agenteId, 'luke');
        assert.equal(db.audits.length, 1);
        assert.equal(db.audits[0].acao, 'CHAT_LUKE_CONFIG_ALTERADA');
        assert.equal(db.audits[0].usuarioId, 'admin-exec');
        // só "ativo": mantém o agente já gravado (merge)
        const r2 = await chamar(srv, { ativo: false }, 1);
        assert.equal(r2.status, 200);
        assert.equal(db.configs.get('chat_luke').agenteId, 'luke');
        assert.equal(db.configs.get('chat_luke').ativo, false);
    } finally { await srv.close(); }
});

test('nome inexistente = 404, nome duplicado = 409, inativo/não-agente = 404; nada gravado', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'a1', nome: 'Dup', agente: true });
        db.addVendedor({ id: 'a2', nome: 'Dup', agente: true });
        db.addVendedor({ id: 'inativo', nome: 'Inativo', agente: true, ativo: false });
        db.addVendedor({ id: 'humano', nome: 'Humano', agente: false });
        assert.equal((await chamar(srv, { agenteNome: 'Nao existe' }, 1)).status, 404);
        const dup = await chamar(srv, { agenteNome: 'Dup' }, 1);
        assert.equal(dup.status, 409);
        assert.match(dup.body.error, /a1.*a2/);
        assert.equal((await chamar(srv, { agenteNome: 'Inativo' }, 1)).status, 404);
        assert.equal((await chamar(srv, { agenteNome: 'Humano' }, 1)).status, 404);
        assert.equal((await chamar(srv, { agenteId: 'humano' }, 1)).status, 404);
        assert.equal(db.configs.size, 0);
    } finally { await srv.close(); }
});

test('corpo inválido: vazio, ativo não-booleano, agenteNome não-texto = 400', async () => {
    const { srv } = await subir();
    try {
        assert.equal((await chamar(srv, {}, 1)).status, 400);
        assert.equal((await chamar(srv, { ativo: 'sim' }, 1)).status, 400);
        assert.equal((await chamar(srv, { agenteNome: 5 }, 1)).status, 400);
    } finally { await srv.close(); }
});
