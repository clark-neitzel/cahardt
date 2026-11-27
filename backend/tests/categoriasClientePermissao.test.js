// Quem pode GRAVAR categorias de cliente (routes/categoriasCliente.js): admin, quem edita Configurações (a tela mora lá —
// mesma régua de routes/configRoutes.js) ou quem tem "Gerenciar Clientes". Leitura segue aberta a quem está logado.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');
const { stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const SVC = path.join(__dirname, '../services/categoriaClienteService.js');
const ROTA = path.join(__dirname, '../routes/categoriasCliente.js');

function montar() {
    const gravacoes = [];
    const restaurar = stubModule(SVC, {
        listar: async () => [{ id: 1, nome: 'Buffet' }], detalhar: async () => ({ id: 1 }),
        criar: async (b) => { gravacoes.push('criar'); return { id: 2, ...b }; },
        atualizar: async (id, b) => { gravacoes.push('atualizar'); return { id, ...b }; },
        deletar: async () => { gravacoes.push('deletar'); },
    });
    limparCacheContendo('routes/categoriasCliente.js');
    const router = require(ROTA);
    restaurar();
    const app = express();
    app.use(express.json());
    app.use('/api/categorias-cliente', (req, res, next) => { req.user = { id: 'u', permissoes: JSON.parse(req.headers['x-perms'] || '{}') }; next(); }, router);
    return { app, gravacoes, regra: router.podeEscreverCategoriasCliente };
}

test('categorias de cliente: grava quem é admin, edita Configurações ou gerencia clientes; os demais só leem', async () => {
    const { app, gravacoes } = montar();
    const srv = await startTestServer(app);
    try {
        const casos = [
            ['sem permissão', {}, false],
            ['só clientes.view', { clientes: { view: true, edit: false } }, false],
            ['configuracoes só leitura (vê a tela)', { configuracoes: { view: true, edit: false } }, false],
            ['configuracoes objeto vazio', { configuracoes: {} }, false],
            ['configuracoes.edit (quem grava hoje pela tela)', { configuracoes: { view: true, edit: true } }, true],
            ['configuracoes true (legado)', { configuracoes: true }, true],
            ['clientes.edit', { clientes: { view: true, edit: true } }, true],
            ['admin', { admin: true }, true],
        ];
        let esperadas = 0;
        for (const [nome, perms, grava] of casos) {
            const headers = { 'x-perms': JSON.stringify(perms) };
            assert.equal((await srv.request('GET', '/api/categorias-cliente', { headers })).status, 200, `${nome}: ler`);
            const p = await srv.request('POST', '/api/categorias-cliente', { headers, body: { nome: 'X' } });
            const u = await srv.request('PUT', '/api/categorias-cliente/1', { headers, body: { nome: 'Y' } });
            const d = await srv.request('DELETE', '/api/categorias-cliente/1', { headers });
            assert.deepEqual([p.status, u.status, d.status], grava ? [201, 200, 204] : [403, 403, 403], nome);
            if (grava) esperadas += 3;
        }
        assert.equal(gravacoes.length, esperadas, 'só as gravações permitidas chegaram ao serviço');
    } finally { await srv.close(); }
});

test('a régua de Configurações usada aqui é a MESMA de routes/configRoutes.js (texto da regra idêntico)', () => {
    const fs = require('fs');
    const regra = (arquivo) => {
        const linha = fs.readFileSync(path.join(__dirname, '..', arquivo), 'utf8').split('\n').find((l) => l.startsWith('const podeEditarConfig = (p) =>'));
        return linha.slice(0, linha.indexOf(';') + 1);
    };
    assert.equal(regra('routes/categoriasCliente.js'), regra('routes/configRoutes.js'));
});
