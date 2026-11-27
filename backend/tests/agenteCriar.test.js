// POST /api/admin-exec/agente-criar — cria o usuário-agente + permissões copiadas + token.
// Prisma mockado em memória (nunca toca banco real).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';
const SEGREDO = 'segredo-admin-de-teste-local';
process.env.ADMIN_SECRET = SEGREDO;

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const RAIZ = path.join(__dirname, '..');
const DATABASE_MODULE = path.join(RAIZ, 'config/database.js');
const CACHE = ['services/agenteCriarService.js', 'services/agenteTokenService.js', 'routes/adminExec.js'];

function memoria() {
    const vendedores = new Map();
    const tokens = new Map();
    const audits = [];
    const historico = [];
    const db = {
        vendedores, tokens, audits, historico, falhaToken: false,
        addVendedor(v) { vendedores.set(v.id, { ativo: true, agente: false, permissoes: {}, ...v }); },
    };
    const pick = (obj, sel) => { if (!sel) return { ...obj }; const o = {}; for (const k of Object.keys(sel)) if (sel[k] === true) o[k] = obj[k]; return o; };
    const prisma = makeMockPrisma({
        vendedor: {
            findUnique: async ({ where, select }) => { const v = vendedores.get(where.id); return v ? pick(v, select) : null; },
            findMany: async ({ where, select }) => [...vendedores.values()].filter((v) => {
                if (where.agente !== undefined) return v.agente === where.agente;
                if (where.nome) return String(v.nome).toLowerCase() === where.nome.equals.toLowerCase();
                return true;
            }).map((v) => pick(v, select)),
            create: async ({ data, select }) => {
                if (data.login) throw new Error('teste: agente não deve ter login');
                const v = { ativo: true, createdAt: new Date(), ...data };
                vendedores.set(v.id, v); return pick(v, select);
            },
            update: async ({ where, data }) => { Object.assign(vendedores.get(where.id), data); return vendedores.get(where.id); },
        },
        agenteToken: {
            create: async ({ data, select }) => {
                if (db.falhaToken) throw new Error(`Invalid \`prisma.agenteToken.create()\` invocation: data: { hash: "${data.hash}", prefixo: "${data.prefixo}", segredo: "cah_ag_${data.prefixo}XXXX" } — falha simulada do banco`);
                const row = { id: `tk-${tokens.size + 1}`, revogadoEm: null, ultimoUsoEm: null, ultimoUsoIp: null, totalUsos: 0, criadoEm: new Date(), ...data };
                tokens.set(row.id, row); return pick(row, select);
            },
            findMany: async ({ where, select }) => [...tokens.values()].filter((t) => t.vendedorId === where.vendedorId && t.nome === where.nome && t.revogadoEm === null).map((t) => pick(t, select)),
        },
        auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
        vendedorPermissoesHistorico: {
            create: async ({ data }) => { historico.push({ id: historico.length + 1, ...data }); return data; },
            findMany: async () => [],
            deleteMany: async () => ({ count: 0 }),
        },
    });
    return { db, prisma };
}

async function subir() {
    const { db, prisma } = memoria();
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(...CACHE);
    require('../services/agenteCriarService'); // a rota o carrega sob demanda: tem que nascer ligado ao prisma fake
    const adminExec = require('../routes/adminExec');
    restaurar();
    const app = express();
    app.use(express.json());
    app.use('/api/admin-exec', adminExec);
    const srv = await startTestServer(app);
    return { db, srv };
}

const H = { 'x-admin-secret': SEGREDO };
const post = (srv, corpo, confirmar) => srv.request('POST', `/api/admin-exec/agente-criar${confirmar ? '?confirmar=1' : ''}`, { headers: H, body: corpo });
const donoPadrao = () => ({
    id: 'dono', nome: 'Dono Teste',
    permissoes: { admin: true, Usuario_Externo: false, pedidos: { view: true, edit: true }, Pode_Ver_X: true, Pode_Ver_Off: false, financeiro: true },
});
const agentes = (db) => [...db.vendedores.values()].filter((v) => v.agente);

test('sem segredo: 401 (rota protegida como as demais)', async () => {
    const { srv } = await subir();
    try {
        const r = await srv.request('POST', '/api/admin-exec/agente-criar', { body: { copiarPermissoesDe: 'x' } });
        assert.equal(r.status, 401);
    } finally { await srv.close(); }
});

test('dry-run: não grava nada e não devolve segredo', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' });
        assert.equal(r.status, 200);
        assert.equal(r.body.dryRun, true);
        assert.deepEqual(r.body.origem, { id: 'dono', nome: 'Dono Teste' });
        assert.equal(r.body.agenteJaExiste, false);
        assert.equal(r.body.permissoesACopiar, 5); // pedidos, Pode_Ver_X, Pode_Ver_Off, financeiro, Isento_Ponto
        assert.ok(r.body.chavesLigadas.includes('pedidos.view'));
        assert.ok(r.body.chavesLigadas.includes('Isento_Ponto'));
        assert.ok(!r.body.chavesLigadas.includes('admin'));
        assert.equal(r.body.tokenAtivoExistente, null);
        assert.equal(r.body.token, undefined);
        assert.equal(agentes(db).length, 0);
        assert.equal(db.tokens.size, 0);
        assert.equal(db.audits.length, 0);
        assert.equal(db.historico.length, 0);
        assert.match(r.headers.get('cache-control'), /no-store/);
    } finally { await srv.close(); }
});

test('confirmar: cria agente, permissões sem admin/Usuario_Externo + Isento_Ponto, token, histórico', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.match(r.headers.get('cache-control'), /no-store/);
        assert.match(r.body.token, /^cah_ag_[A-Za-z0-9_-]{40,}$/);
        assert.equal(r.body.agente.nome, 'Luke (agente)');
        assert.equal(r.body.permissoes.copiadas, 5);
        assert.ok(r.body.tokenPrefixo && r.body.expiraEm);
        const [ag] = agentes(db);
        assert.equal(ag.agente, true);
        assert.equal(ag.acessoExterno, true);
        assert.equal(ag.login, null);
        assert.equal(ag.senha, null);
        assert.deepEqual(ag.permissoes, {
            pedidos: { view: true, edit: true }, Pode_Ver_X: true, Pode_Ver_Off: false, financeiro: true, Isento_Ponto: true,
        });
        assert.equal('admin' in ag.permissoes, false);
        assert.equal('Usuario_Externo' in ag.permissoes, false);
        assert.notEqual(ag.permissoes.pedidos, db.vendedores.get('dono').permissoes.pedidos); // cópia profunda
        const [tk] = [...db.tokens.values()];
        assert.equal(tk.vendedorId, ag.id);
        assert.equal(tk.nome, 'luke-bpo');
        assert.equal(tk.hash, crypto.createHash('sha256').update(r.body.token).digest('hex'));
        assert.equal(db.historico.length, 1);
        assert.equal(db.historico[0].alteradoPorNome.includes('admin-exec'), true);
        assert.deepEqual(db.historico[0].permissoesAntes, {});
        assert.deepEqual(db.audits.map((a) => a.acao).sort(), ['AGENTE_CRIADO', 'AGENTE_CRIAR_ADMIN_EXEC', 'AGENTE_TOKEN_CRIADO']);
        for (const a of db.audits) assert.equal(a.usuarioId, 'admin-exec');
    } finally { await srv.close(); }
});

test('token em claro só na resposta: auditoria não tem token nem hash', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        const r = await post(srv, { copiarPermissoesDe: 'dono' }, true); // nome sem diferenciar maiúscula
        assert.equal(r.status, 200);
        const hash = [...db.tokens.values()][0].hash;
        const tudo = JSON.stringify(db.audits) + JSON.stringify(db.historico);
        assert.equal(tudo.includes(r.body.token), false);
        assert.equal(tudo.includes(r.body.token.slice(7)), false);
        assert.equal(tudo.includes(hash), false);
        assert.equal(tudo.includes('cah_ag_'), false);
        const dry = await post(srv, { copiarPermissoesDe: 'dono' });
        assert.equal(JSON.stringify(dry.body).includes(r.body.token), false);
    } finally { await srv.close(); }
});

test('reexecutar não duplica agente nem token; novoToken gera outro', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        const r1 = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        const r2 = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r2.status, 200);
        assert.equal(r2.body.token, null);
        assert.equal(r2.body.tokenPrefixo, r1.body.tokenPrefixo);
        assert.equal(r2.body.agente.id, r1.body.agente.id);
        assert.equal(r2.body.agente.criadoAgora, false);
        assert.ok(r2.body.avisos.some((a) => /novoToken/.test(a)));
        assert.equal(agentes(db).length, 1);
        assert.equal(db.tokens.size, 1);
        assert.equal(db.historico.length, 1); // permissões idênticas: sem 2ª linha
        const dry = await post(srv, { copiarPermissoesDe: 'Dono Teste' });
        assert.equal(dry.body.agenteJaExiste, true);
        assert.equal(dry.body.tokenAtivoExistente.prefixo, r1.body.tokenPrefixo);
        const r3 = await post(srv, { copiarPermissoesDe: 'Dono Teste', novoToken: true }, true);
        assert.match(r3.body.token, /^cah_ag_/);
        assert.notEqual(r3.body.token, r1.body.token);
        assert.equal(db.tokens.size, 2);
        assert.equal(agentes(db).length, 1);
    } finally { await srv.close(); }
});

test('token expirado ou revogado não conta como ativo: gera novo', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        const tk = [...db.tokens.values()][0];
        tk.expiraEm = new Date(Date.now() - 1000);
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.match(r.body.token, /^cah_ag_/);
        assert.equal(db.tokens.size, 2);
        tk.expiraEm = new Date(Date.now() + 1e9);
        for (const t of db.tokens.values()) t.revogadoEm = new Date();
        const r2 = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.match(r2.body.token, /^cah_ag_/);
        assert.equal(db.tokens.size, 3);
    } finally { await srv.close(); }
});

test('origem: inexistente 404; não admin 400; agente 400; inativa 400; ambígua 409', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        db.addVendedor({ id: 'v1', nome: 'Vendedor Comum', permissoes: { pedidos: true } });
        db.addVendedor({ id: 'ag', nome: 'Outro Agente', agente: true, permissoes: { admin: true } });
        db.addVendedor({ id: 'ina', nome: 'Admin Inativo', ativo: false, permissoes: { admin: true } });
        db.addVendedor({ id: 'd1', nome: 'Gemeo', permissoes: { admin: true } });
        db.addVendedor({ id: 'd2', nome: 'gemeo', permissoes: { admin: true } });
        db.addVendedor({ id: 'adm-str', nome: 'Admin String', permissoes: JSON.stringify({ admin: true, Pode_Ver_S: true }) });
        db.addVendedor({ id: 'adm-lixo', nome: 'Admin Lixo', permissoes: '{quebrado' });
        const casos = [['Fantasma', 404], ['Vendedor Comum', 400], ['Outro Agente', 400], ['Admin Inativo', 400], ['Gemeo', 409], ['Admin Lixo', 422]];
        for (const [ref, status] of casos) {
            const r = await post(srv, { copiarPermissoesDe: ref }, true);
            assert.equal(r.status, status, `${ref}: ${JSON.stringify(r.body)}`);
            assert.ok(r.body.error);
        }
        // id resolve a ambiguidade
        const ok = await post(srv, { copiarPermissoesDe: 'd1' });
        assert.equal(ok.status, 200);
        assert.equal(agentes(db).length, 1); // só o "Outro Agente" do cenário; nada novo criado pelos erros
        assert.equal(db.audits.length, 0);
    } finally { await srv.close(); }
});

test('permissões da origem em string JSON (e dupla) são lidas', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'o1', nome: 'Origem Str', permissoes: JSON.stringify({ admin: true, Pode_Ver_S: true, Usuario_Externo: true }) });
        const r = await post(srv, { copiarPermissoesDe: 'Origem Str' }, true);
        assert.equal(r.status, 200);
        assert.deepEqual(agentes(db)[0].permissoes, { Pode_Ver_S: true, Isento_Ponto: true });
        db.addVendedor({ id: 'o2', nome: 'Origem Dupla', permissoes: JSON.stringify(JSON.stringify({ admin: true, Pode_Ver_D: true })) });
        const r2 = await post(srv, { copiarPermissoesDe: 'o2', nome: 'Agente Dois' }, true);
        assert.equal(r2.status, 200);
        const dois = agentes(db).find((a) => a.nome === 'Agente Dois');
        assert.deepEqual(dois.permissoes, { Pode_Ver_D: true, Isento_Ponto: true });
    } finally { await srv.close(); }
});

test('agente existente inativo: erro 409 e nada é gravado', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        db.addVendedor({ id: 'luke', nome: '  luke (AGENTE) ', agente: true, ativo: false, permissoes: {} });
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r.status, 409);
        assert.match(r.body.error, /INATIVO/);
        assert.equal(db.tokens.size, 0);
        assert.equal(db.historico.length, 0);
        assert.deepEqual(db.vendedores.get('luke').permissoes, {});
    } finally { await srv.close(); }
});

test('agente existente com permissões diferentes: mantém e avisa; sobrescrever:true grava + histórico', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        db.addVendedor({ id: 'luke', nome: 'Luke (agente)', agente: true, acessoExterno: true, permissoes: { Pode_Ver_Antigo: true } });
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r.status, 200);
        assert.equal(r.body.agente.id, 'luke');
        assert.equal(r.body.permissoes.gravadasAgora, false);
        assert.deepEqual(db.vendedores.get('luke').permissoes, { Pode_Ver_Antigo: true });
        assert.ok(r.body.avisos.some((a) => /MANTIDAS/.test(a)));
        assert.match(r.body.token, /^cah_ag_/); // token sai mesmo assim
        const r2 = await post(srv, { copiarPermissoesDe: 'Dono Teste', sobrescrever: true }, true);
        assert.equal(r2.body.permissoes.gravadasAgora, true);
        assert.equal(db.vendedores.get('luke').permissoes.Isento_Ponto, true);
        assert.equal(db.historico.length, 1);
        assert.deepEqual(db.historico[0].permissoesAntes, { Pode_Ver_Antigo: true });
    } finally { await srv.close(); }
});

test('falha ao gerar o token: erro claro, agente e permissões ficam, reexecutar reaproveita', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        db.falhaToken = true;
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r.status, 500);
        assert.match(r.body.error, /TOKEN NÃO foi gerado/);
        assert.ok(r.body.agenteId);
        assert.equal(agentes(db).length, 1);
        assert.equal(db.tokens.size, 0);
        db.falhaToken = false;
        const r2 = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r2.status, 200);
        assert.match(r2.body.token, /^cah_ag_/);
        assert.equal(agentes(db).length, 1);
        assert.equal(db.tokens.size, 1);
        assert.equal(db.historico.length, 1);
    } finally { await srv.close(); }
});

test('validação do corpo (mensagens em português)', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor(donoPadrao());
        const ruins = [
            [{}, /copiarPermissoesDe/],
            [{ copiarPermissoesDe: '' }, /copiarPermissoesDe/],
            [{ copiarPermissoesDe: 'Dono Teste', validadeDias: 400 }, /validadeDias/],
            [{ copiarPermissoesDe: 'Dono Teste', validadeDias: 0 }, /validadeDias/],
            [{ copiarPermissoesDe: 'Dono Teste', validadeDias: 1.5 }, /validadeDias/],
            [{ copiarPermissoesDe: 'Dono Teste', novoToken: 'sim' }, /novoToken/],
            [{ copiarPermissoesDe: 'Dono Teste', nome: 123 }, /nome/],
            [{ copiarPermissoesDe: 'Dono Teste', tokenNome: 'x'.repeat(81) }, /tokenNome/],
        ];
        for (const [corpo, re] of ruins) {
            const r = await post(srv, corpo, true);
            assert.equal(r.status, 400, JSON.stringify(corpo));
            assert.match(r.body.error, re);
        }
        assert.equal(agentes(db).length, 0);
        const ok = await post(srv, { copiarPermissoesDe: 'Dono Teste', validadeDias: 365, tokenNome: 'outro', nome: 'Agente X' }, true);
        assert.equal(ok.status, 200);
        assert.equal(ok.body.agente.nome, 'Agente X');
        assert.equal([...db.tokens.values()][0].nome, 'outro');
    } finally { await srv.close(); }
});

test('o token nunca vai para console.log/error durante a execução', async () => {
    const { db, srv } = await subir();
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
    let token;
    try {
        db.addVendedor(donoPadrao());
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        token = r.body.token;
        db.falhaToken = true;
        await post(srv, { copiarPermissoesDe: 'Dono Teste', novoToken: true }, true);
    } finally {
        Object.assign(console, orig);
        await srv.close();
    }
    assert.ok(token);
    assert.equal(logs.join('\n').includes(token), false);
    assert.equal(/cah_ag_(?!\*\*\*)/.test(logs.join('\n')), false); // só a forma mascarada pode aparecer
});

test('falha do token: resposta e log NÃO repetem hash, prefixo-segredo nem cah_ag_ vindos do erro do Prisma', async () => {
    const { db, srv } = await subir();
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn };
    for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
    let r;
    try {
        db.addVendedor(donoPadrao());
        db.falhaToken = true;
        r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
    } finally {
        Object.assign(console, orig);
        await srv.close();
    }
    assert.equal(r.status, 500);
    assert.match(r.body.error, /TOKEN NÃO foi gerado/);
    assert.match(r.body.error, /repita a chamada/);
    assert.equal(/[0-9a-f]{64}/i.test(r.texto), false);
    assert.equal(r.texto.includes('cah_ag_'), false);
    assert.equal(r.texto.includes('falha simulada'), false);
    const log = logs.join('\n');
    assert.equal(/[0-9a-f]{64}/i.test(log), false);
    assert.equal(/cah_ag_(?!\*\*\*)/.test(log), false);
    assert.ok(log.includes('falha ao gravar o token'));
});

test('chaves proibidas: admin/Usuario_Externo em qualquer caixa e com espaços não são copiadas', async () => {
    const { db, srv } = await subir();
    try {
        db.addVendedor({ id: 'o', nome: 'Origem Caixa', permissoes: { admin: true, Admin: true, ' ADMIN ': true, ' usuario_externo ': true, USUARIO_EXTERNO: true, Usuario_Externo: true, Pode_Ver_Z: true } });
        const r = await post(srv, { copiarPermissoesDe: 'Origem Caixa' }, true);
        assert.equal(r.status, 200);
        assert.deepEqual(agentes(db)[0].permissoes, { Pode_Ver_Z: true, Isento_Ponto: true });
    } finally { await srv.close(); }
});

test('sem ADMIN_SECRET no ambiente: 503 (fail-closed) e nada é gravado', async () => {
    const { db, srv } = await subir();
    const guardado = process.env.ADMIN_SECRET;
    const errOrig = console.error;
    console.error = () => {};
    try {
        db.addVendedor(donoPadrao());
        delete process.env.ADMIN_SECRET;
        const r = await post(srv, { copiarPermissoesDe: 'Dono Teste' }, true);
        assert.equal(r.status, 503);
        assert.equal(agentes(db).length, 0);
        assert.equal(db.tokens.size, 0);
    } finally {
        console.error = errOrig;
        process.env.ADMIN_SECRET = guardado;
        await srv.close();
    }
});
