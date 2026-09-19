// /api/ia-consulta/v1 — API de leitura para a IA externa (bot da Ana no WhatsApp).
// Cobre os DOIS níveis de autenticação do contrato (ver backend/middlewares/iaConsultaMiddleware.js
// e backend/docs/ia-consulta-api.md):
//   1) x-ia-api-key — identifica o BOT (obrigatória em TODO /v1/*);
//   2) Bearer <jwt> — identifica o CLIENTE já autenticado (só nas rotas que usam
//      exigirClienteCongelados, ex.: GET /v1/congelados/perfil).
// Também confirma o contrato de envelope `{ meta: { versaoApi, avisos, geradoEm }, dados }`
// que o app consumidor depende para saber se uma mudança futura vai quebrar algo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'segredo-teste-jwt-0123456789abcdef';
process.env.IA_WHATSAPP_API_KEY = 'chave-teste-ia-whatsapp';

const { makeMockPrisma, limparCacheContendo, stubModule } = require('./helpers/mockPrisma');
const { buildApp } = require('./helpers/testApp');
const { startTestServer } = require('./helpers/httpServer');

const ROUTER = path.join(__dirname, '../routes/iaConsultaRoutes.js');
// A rota carrega controllers -> services (kitFestaService, congeladosService, iaClienteService,
// iaCatalogoService) que capturam `prisma` no topo do arquivo; limpar o cache deles também,
// senão pegam o prisma real (ou o mock de um teste anterior) requerido antes.
const CACHE_FRAGMENTOS = [
    'controllers/kitFestaController.js', 'controllers/congeladosController.js',
    'controllers/iaClienteController.js', 'controllers/iaCatalogoController.js',
    'services/kitFestaService.js', 'services/congeladosService.js',
    'services/iaClienteService.js', 'services/iaCatalogoService.js',
];

function montarApp() {
    // /v1/status não toca no banco — nenhum model precisa de stub (qualquer uso
    // acidental de prisma faria o mock explodir, o que já seria uma falha do teste).
    const mockPrisma = makeMockPrisma({});
    return buildApp('/api/ia-consulta', ROUTER, mockPrisma, CACHE_FRAGMENTOS);
}

test('GET /v1/status sem x-ia-api-key -> 401', async () => {
    const app = montarApp();
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('GET', '/api/ia-consulta/v1/status');
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('GET /v1/status com x-ia-api-key errada -> 401', async () => {
    const app = montarApp();
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('GET', '/api/ia-consulta/v1/status', {
            headers: { 'x-ia-api-key': 'chave-errada' },
        });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('GET /v1/status com x-ia-api-key certa -> 200, envelope meta.avisos presente (contrato da IA)', async () => {
    const app = montarApp();
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('GET', '/api/ia-consulta/v1/status', {
            headers: { 'x-ia-api-key': 'chave-teste-ia-whatsapp' },
        });
        assert.equal(r.status, 200);
        // Contrato: toda resposta de sucesso vem envelopada em { meta, dados }.
        assert.ok(r.body.meta, 'resposta deveria ter meta');
        assert.ok(Array.isArray(r.body.meta.avisos), 'meta.avisos deveria ser um array (mesmo vazio)');
        assert.equal(typeof r.body.meta.versaoApi, 'string');
        assert.ok(r.body.meta.geradoEm);
        assert.deepEqual(r.body.dados, { ok: true });
    } finally {
        await close();
    }
});

// ── Segunda camada: token do CLIENTE (Bearer JWT), usada nas rotas /congelados/* autenticadas.
// Testa a função real exigirClienteCongelados isoladamente (sem passar pelos controllers de
// negócio, que exigiriam mockar todo o congeladosService) — o que importa aqui é o contrato do
// TOKEN: gerado com o mesmo JWT_SECRET do servidor, tipo 'congelados', aceito; qualquer outro,
// recusado.
test('camada de cliente (Bearer): token ausente -> 401', async () => {
    limparCacheContendo('middlewares/iaConsultaMiddleware.js', 'config/jwtSecret.js');
    const { exigirClienteCongelados } = require('../middlewares/iaConsultaMiddleware');
    const app = express();
    app.get('/protegida', exigirClienteCongelados, (req, res) => res.json({ ok: true, congelados: req.congelados }));
    const { close, request } = await startTestServer(app);
    try {
        const r = await request('GET', '/protegida');
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('camada de cliente (Bearer): JWT com tipo diferente de "congelados" -> 401', async () => {
    limparCacheContendo('middlewares/iaConsultaMiddleware.js', 'config/jwtSecret.js');
    const { exigirClienteCongelados } = require('../middlewares/iaConsultaMiddleware');
    const app = express();
    app.get('/protegida', exigirClienteCongelados, (req, res) => res.json({ ok: true }));
    const { close, request } = await startTestServer(app);
    try {
        const tokenErrado = jwt.sign({ id: 1, tipo: 'admin' }, process.env.JWT_SECRET);
        const r = await request('GET', '/protegida', { headers: { Authorization: `Bearer ${tokenErrado}` } });
        assert.equal(r.status, 401);
    } finally {
        await close();
    }
});

test('camada de cliente (Bearer): JWT válido tipo "congelados" -> 200 e req.congelados populado', async () => {
    limparCacheContendo('middlewares/iaConsultaMiddleware.js', 'config/jwtSecret.js');
    const { exigirClienteCongelados } = require('../middlewares/iaConsultaMiddleware');
    const app = express();
    app.get('/protegida', exigirClienteCongelados, (req, res) => res.json({ ok: true, congelados: req.congelados }));
    const { close, request } = await startTestServer(app);
    try {
        const token = jwt.sign({ id: 77, documento: '12345678900', nome: 'Cliente Teste', tipo: 'congelados' }, process.env.JWT_SECRET);
        const r = await request('GET', '/protegida', { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(r.status, 200);
        assert.equal(r.body.congelados.id, 77);
        assert.equal(r.body.congelados.documento, '12345678900');
    } finally {
        await close();
    }
});
