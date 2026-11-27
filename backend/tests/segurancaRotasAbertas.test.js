// Rotas que qualquer usuário logado atravessava (auditoria PR4): /api/config, /api/vendedores,
// /api/migrations, /api/mensagens-agendadas e POST /api/estoque/sync-produto.
// Sem banco real: Prisma mockado. A autenticação é simulada por um middleware de teste que
// preenche req.user a partir do header `x-perfil` (JSON das permissões) — o authMiddleware real
// só faz isso depois de validar o JWT; aqui o foco é o que a ROTA faz com req.user.permissoes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { makeMockPrisma, stubModule, limparCacheContendo } = require('./helpers/mockPrisma');
const { startTestServer } = require('./helpers/httpServer');

const DATABASE_MODULE = path.join(__dirname, '../config/database.js');
const R = (rel) => path.join(__dirname, '..', rel);

function montar(mountPath, routerRel, mockPrisma, cache = []) {
    const restaurar = stubModule(DATABASE_MODULE, mockPrisma);
    limparCacheContendo(R(routerRel), ...cache.map(c => R(c)));
    const router = require(R(routerRel));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = { id: 'u1', permissoes: JSON.parse(req.headers['x-perfil'] || '{}') };
        next();
    });
    app.use(mountPath, router);
    app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'erro de teste' }); });
    restaurar();
    return app;
}

const perfil = (p) => ({ 'x-perfil': JSON.stringify(p) });
const COMUM = perfil({ pedidos: { view: true } });
const ADMIN = perfil({ admin: true });

// ───────────────────────── /api/config ─────────────────────────
function prismaConfig(gravacoes) {
    const linhas = [
        { key: 'categorias_vendas', value: ['A'] },
        { key: 'whatsapp_ativo', value: { value: true } },
        { key: 'email_config', value: { host: 'smtp.x', pass: 'SEGREDO-SMTP' } },
        { key: 'asaas_config', value: { apiKey: 'SEGREDO-ASAAS' } },
        { key: 'focus_nfe_webhook_secret', value: 'SEGREDO-WH' },
        { key: 'como_fazer_aparelhos', value: { cozinha: { hash: 'h' } } },
        { key: 'menu_favoritos_outro-usuario', value: ['/x'] },
        { key: 'ia_precos', value: { x: 1 } },
        { key: 'chave_nova_com_token', value: 'T' },
        { key: 'backup_status', value: { banco: { arquivo: 'dump-SEGREDO.dump' } } },
        { key: 'diag_pdf_extrato_ultimo', value: { linhas: 'LINHA-EXTRATO-SEGREDO' } },
    ];
    return makeMockPrisma({
        appConfig: {
            findMany: async () => linhas,
            findUnique: async ({ where }) => linhas.find(l => l.key === where.key) || null,
            upsert: async ({ where, update }) => { gravacoes.push({ key: where.key, value: update.value }); return { key: where.key, value: update.value }; },
        },
    });
}

const CACHE_CONFIG = ['routes/configRoutes.js', 'controllers/configController.js', 'config/configChavesSensiveis.js'];

test('config: GET / (lista) esconde chaves sensíveis de usuário comum e mostra as comuns', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        const r = await srv.request('GET', '/api/config', { headers: COMUM });
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.body).sort(), ['categorias_vendas', 'whatsapp_ativo']);
        assert.ok(!r.texto.includes('SEGREDO'));
    } finally { await srv.close(); }
});

test('config: GET / para admin continua devolvendo tudo (inclusive sensíveis e ia_*)', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        const r = await srv.request('GET', '/api/config', { headers: ADMIN });
        assert.equal(r.status, 200);
        for (const k of ['email_config', 'asaas_config', 'focus_nfe_webhook_secret', 'como_fazer_aparelhos', 'ia_precos', 'categorias_vendas']) {
            assert.ok(k in r.body, `admin deveria ver ${k}`);
        }
    } finally { await srv.close(); }
});

test('config: GET /:key sensível -> 403 para comum, 200 para admin; chave comum segue legível', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        for (const k of ['email_config', 'asaas_config', 'focus_nfe_webhook_secret', 'como_fazer_aparelhos', 'chave_nova_com_token', 'menu_favoritos_outro-usuario']) {
            const r = await srv.request('GET', `/api/config/${k}`, { headers: COMUM });
            assert.equal(r.status, 403, k);
            assert.ok(r.body.error);
            assert.ok(!r.texto.includes('SEGREDO'));
        }
        const ok = await srv.request('GET', '/api/config/email_config', { headers: ADMIN });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.pass, 'SEGREDO-SMTP');
        // chaves não sensíveis que telas de usuário comum leem hoje
        for (const k of ['categorias_vendas', 'whatsapp_ativo']) {
            const r = await srv.request('GET', `/api/config/${k}`, { headers: COMUM });
            assert.equal(r.status, 200, k);
        }
        // rotas fixas antes do /:key continuam abertas (não foram tocadas)
        assert.equal((await srv.request('GET', '/api/config/ia', { headers: COMUM })).status, 403); // guarda ia_* existente
    } finally { await srv.close(); }
});

test('config: POST /:key -> comum 403 (nada gravado); Configurações editar e admin gravam', async () => {
    const gravacoes = [];
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig(gravacoes), CACHE_CONFIG));
    try {
        let r = await srv.request('POST', '/api/config/categorias_vendas', { headers: COMUM, body: ['X'] });
        assert.equal(r.status, 403);
        assert.equal(gravacoes.length, 0);

        // só ver Configurações não grava
        r = await srv.request('POST', '/api/config/categorias_vendas', { headers: perfil({ configuracoes: { view: true } }), body: ['X'] });
        assert.equal(r.status, 403);
        assert.equal(gravacoes.length, 0);

        r = await srv.request('POST', '/api/config/categorias_vendas', { headers: perfil({ configuracoes: { edit: true } }), body: ['X'] });
        assert.equal(r.status, 200);
        r = await srv.request('POST', '/api/config/tipos_atendimento', { headers: ADMIN, body: [] });
        assert.equal(r.status, 200);
        assert.deepEqual(gravacoes.map(g => g.key), ['categorias_vendas', 'tipos_atendimento']);
    } finally { await srv.close(); }
});

test('config: POST em chave sensível só admin (nem Configurações→editar grava)', async () => {
    const gravacoes = [];
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig(gravacoes), CACHE_CONFIG));
    try {
        for (const k of ['email_config', 'asaas_config', 'focus_nfe_webhook_secret', 'qualquer_senha_x']) {
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: COMUM, body: { a: 1 } })).status, 403, k);
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: perfil({ configuracoes: { edit: true } }), body: { a: 1 } })).status, 403, k);
        }
        assert.equal(gravacoes.length, 0);
        assert.equal((await srv.request('POST', '/api/config/email_config', { headers: ADMIN, body: { a: 1 } })).status, 200);
        assert.equal(gravacoes.length, 1);
    } finally { await srv.close(); }
});

test('config: exceções das telas atuais — toggle whatsapp_ativo (Pode_Editar_Caixa) e chaves do Ponto', async () => {
    const gravacoes = [];
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig(gravacoes), CACHE_CONFIG));
    try {
        assert.equal((await srv.request('POST', '/api/config/whatsapp_ativo', { headers: COMUM, body: { value: false } })).status, 403);
        assert.equal((await srv.request('POST', '/api/config/whatsapp_ativo', { headers: perfil({ Pode_Editar_Caixa: true }), body: { value: false } })).status, 200);
        // Pode_Editar_Caixa não vale para outras chaves
        assert.equal((await srv.request('POST', '/api/config/categorias_vendas', { headers: perfil({ Pode_Editar_Caixa: true }), body: [] })).status, 403);

        for (const k of ['empresa_geofence', 'ponto_link_base', 'rh_feriados']) {
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: COMUM, body: {} })).status, 403, k);
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: perfil({ Pode_Ver_Ponto: true }), body: {} })).status, 200, k);
        }
        assert.equal((await srv.request('POST', '/api/config/rh_feriados', { headers: perfil({ Pode_Editar_Ponto: true }), body: {} })).status, 200);
        // Pode_Ver_Ponto não vale para chave fora do Ponto
        assert.equal((await srv.request('POST', '/api/config/categorias_vendas', { headers: perfil({ Pode_Ver_Ponto: true }), body: [] })).status, 403);
    } finally { await srv.close(); }
});

// ───────────────────────── /api/vendedores ─────────────────────────
test('vendedores: listar e obter nunca devolvem `senha`; permissoes continuam (PainelEmbarque usa)', async () => {
    const linha = { id: 'v1', nome: 'Ana', login: 'ana', senha: '$2a$10$HASHSECRETO', permissoes: { Pode_Executar_Entregas: true }, ativo: true, acessoExterno: false, percentualFlex: 5 };
    const prisma = makeMockPrisma({
        vendedor: {
            findMany: async () => [linha],
            findUnique: async () => linha,
        },
        pedido: { findMany: async () => [] },
    });
    const srv = await startTestServer(montar('/api/vendedores', 'routes/vendedorRoutes.js', prisma,
        ['routes/vendedorRoutes.js', 'controllers/vendedorController.js', 'services/flexService.js']));
    try {
        const lista = await srv.request('GET', '/api/vendedores', { headers: COMUM });
        assert.equal(lista.status, 200);
        assert.equal(lista.body.length, 1);
        assert.ok(!('senha' in lista.body[0]));
        assert.ok(!lista.texto.includes('HASHSECRETO'));
        assert.deepEqual(lista.body[0].permissoes, { Pode_Executar_Entregas: true });
        assert.ok('flexDinamico' in lista.body[0]);
        assert.equal(lista.body[0].login, 'ana');

        const um = await srv.request('GET', '/api/vendedores/v1', { headers: ADMIN });
        assert.equal(um.status, 200);
        assert.ok(!('senha' in um.body));
        assert.ok(!um.texto.includes('HASHSECRETO'));
        assert.equal(um.body.nome, 'Ana');
        assert.deepEqual(um.body.permissoes, { Pode_Executar_Entregas: true });
    } finally { await srv.close(); }
});

// ───────────────────────── /api/migrations ─────────────────────────
test('migrations: comum 403 (DDL não roda); admin passa pela guarda', async () => {
    const chamadas = [];
    const prisma = makeMockPrisma({
        $executeRawUnsafe: async (q) => { chamadas.push(q); return 0; },
        $queryRawUnsafe: async () => [],
    });
    const srv = await startTestServer(montar('/api/migrations', 'routes/migrationRoutes.js', prisma,
        ['routes/migrationRoutes.js', 'controllers/migrationController.js']));
    try {
        for (const rota of ['apply-ncm', 'apply-contas-receber', 'sync-contas-receber']) {
            const r = await srv.request('POST', `/api/migrations/${rota}`, { headers: COMUM });
            assert.equal(r.status, 403, rota);
        }
        assert.equal(chamadas.length, 0, 'nenhum DDL pode ter rodado');
        const ok = await srv.request('POST', '/api/migrations/apply-ncm', { headers: ADMIN });
        assert.equal(ok.status, 200);
        assert.equal(chamadas.length, 1);
    } finally { await srv.close(); }
});

// ───────────────────────── /api/mensagens-agendadas ─────────────────────────
test('mensagens-agendadas: comum 403 em todas as rotas (inclusive disparar); admin lista e cria', async () => {
    const criadas = [];
    const prisma = makeMockPrisma({
        mensagemAgendada: {
            findMany: async () => [{ id: 'm1' }],
            create: async ({ data }) => { criadas.push(data); return { id: 'm2', ...data }; },
            findUnique: async () => null,
        },
    });
    const srv = await startTestServer(montar('/api/mensagens-agendadas', 'routes/mensagemAgendadaRoutes.js', prisma,
        ['routes/mensagemAgendadaRoutes.js', 'controllers/mensagemAgendadaController.js']));
    try {
        const alvos = [
            ['GET', '/api/mensagens-agendadas'], ['GET', '/api/mensagens-agendadas/preview/v1'], ['GET', '/api/mensagens-agendadas/m1'],
            ['POST', '/api/mensagens-agendadas'], ['PUT', '/api/mensagens-agendadas/m1'],
            ['DELETE', '/api/mensagens-agendadas/m1'], ['POST', '/api/mensagens-agendadas/m1/disparar'],
        ];
        for (const [m, u] of alvos) {
            const r = await srv.request(m, u, { headers: COMUM, body: m === 'GET' || m === 'DELETE' ? undefined : { vendedorId: 'v', tipo: 'meta', hora: '08:00', diasSemana: [1] } });
            assert.equal(r.status, 403, `${m} ${u}`);
            assert.ok(r.body.error);
        }
        assert.equal(criadas.length, 0);
        assert.equal((await srv.request('GET', '/api/mensagens-agendadas', { headers: ADMIN })).status, 200);
        const c = await srv.request('POST', '/api/mensagens-agendadas', { headers: ADMIN, body: { vendedorId: 'v', tipo: 'meta', hora: '08:00', diasSemana: [1] } });
        assert.equal(c.status, 201);
        // disparar como admin chega no controller (404 = mensagem inexistente, não 403)
        assert.equal((await srv.request('POST', '/api/mensagens-agendadas/zzz/disparar', { headers: ADMIN })).status, 404);
    } finally { await srv.close(); }
});

// ───────────────────────── POST /api/estoque/sync-produto ─────────────────────────
test('estoque sync-produto: comum 403; produtos.edit e admin passam pela guarda (chegam ao 404 de produto inexistente)', async () => {
    const prisma = makeMockPrisma({
        produto: { findUnique: async () => null },
    });
    const srv = await startTestServer(montar('/api/estoque', 'routes/estoqueRoutes.js', prisma,
        ['routes/estoqueRoutes.js', 'services/estoqueService.js', 'middlewares/permissaoProdutos.js']));
    try {
        const url = '/api/estoque/sync-produto/p1';
        assert.equal((await srv.request('POST', url, { headers: COMUM })).status, 403);
        // objeto produtos só de leitura NÃO libera (permissão é objeto, não booleano)
        assert.equal((await srv.request('POST', url, { headers: perfil({ produtos: { view: true, edit: false } }) })).status, 403);
        assert.equal((await srv.request('POST', url, { headers: perfil({ produtos: { view: true, edit: true } }) })).status, 404);
        assert.equal((await srv.request('POST', url, { headers: ADMIN })).status, 404);
    } finally { await srv.close(); }
});

// ───────────────────────── /api/config: lista de permitidas, case-insensitive, legado ─────────────────────────
test('config: escrita por não-admin com Configurações→editar só nas chaves da lista de permitidas', async () => {
    const gravacoes = [];
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig(gravacoes), CACHE_CONFIG));
    try {
        const EDITOR = perfil({ configuracoes: { edit: true } });
        const PERMITIDAS = ['categorias_vendas', 'categorias_especial', 'tipos_atendimento', 'origens_lead', 'acoes_atendimento', 'acoes_lead', 'whatsapp_ativo', 'empresa_geofence', 'ponto_link_base', 'rh_feriados'];
        for (const k of PERMITIDAS) {
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: EDITOR, body: {} })).status, 200, `permitida ${k}`);
        }
        assert.equal(gravacoes.length, PERMITIDAS.length);
        gravacoes.length = 0;
        // chaves com rota própria restrita a admin: não-admin NÃO grava, nem com Configurações→editar
        for (const k of ['caixa_conferencia', 'inadimplencia_config', 'cadastro_nome_config', 'whatsapp_cliente_config', 'gps_clientes_config',
            'asaas_conta_financeira_ca_id', 'nfe_devolucao_ref_item', 'captura_nfe_ativa', 'despesa_comprovante_trava', 'ponto_acerto',
            'canhoto_nota', 'ia_consulta_config', 'ia_precos', 'CATEGORIAS_VENDAS']) {
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: EDITOR, body: { x: 1 } })).status, 403, k);
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: COMUM, body: { x: 1 } })).status, 403, k);
        }
        assert.equal(gravacoes.length, 0);
        // admin grava qualquer chave
        assert.equal((await srv.request('POST', '/api/config/caixa_conferencia', { headers: ADMIN, body: { x: 1 } })).status, 200);
        assert.equal(gravacoes.length, 1);
    } finally { await srv.close(); }
});

test('config: `configuracoes: true` (booleano legado) edita as permitidas; só `view` -> 403 nas permitidas', async () => {
    const gravacoes = [];
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig(gravacoes), CACHE_CONFIG));
    try {
        const LEGADO = perfil({ configuracoes: true });
        const SO_VER = perfil({ configuracoes: { view: true, edit: false } });
        for (const k of ['categorias_vendas', 'tipos_atendimento', 'acoes_lead', 'whatsapp_ativo']) {
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: LEGADO, body: {} })).status, 200, `legado ${k}`);
            assert.equal((await srv.request('POST', `/api/config/${k}`, { headers: SO_VER, body: {} })).status, 403, `so-ver ${k}`);
        }
        // booleano legado não vira admin: chave fora da lista segue 403
        assert.equal((await srv.request('POST', '/api/config/caixa_conferencia', { headers: LEGADO, body: {} })).status, 403);
        assert.equal(gravacoes.length, 4);
    } finally { await srv.close(); }
});

test('config: chave sensível em MAIÚSCULAS/com espaço não escapa da guarda de leitura; backup_status é sensível', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        for (const k of ['EMAIL_CONFIG', 'Asaas_Config', '%20email_config', 'MENU_FAVORITOS_x', 'Focus_NFE_Webhook_Secret', 'backup_status', 'BACKUP_STATUS']) {
            const r = await srv.request('GET', `/api/config/${k}`, { headers: COMUM });
            assert.equal(r.status, 403, k);
        }
        assert.equal((await srv.request('GET', '/api/config/EMAIL_CONFIG', { headers: ADMIN })).status, 200);
        // a lista não mostra backup_status ao comum
        const lista = await srv.request('GET', '/api/config', { headers: COMUM });
        assert.ok(!('backup_status' in lista.body));
    } finally { await srv.close(); }
});

// ───────────────────────── GET /api/pedidos/:id sem hash de senha ─────────────────────────
test('pedidos: GET /:id (controller.detalhar) não devolve `senha` de vendedor nem de usuarioLancamento', async () => {
    const HASH = '$2a$10$HASHDOPEDIDOSECRETO';
    const usuario = (id, nome) => ({ id, nome, login: nome.toLowerCase(), senha: HASH, permissoes: { admin: false }, email: null });
    let includeRecebido = null;
    // Emula o `omit` do Prisma nas relações pedidas (o teste falha se o service não pedir omit).
    const aplicarOmit = (linha, spec) => {
        if (!spec || spec === true || !spec.omit) return linha;
        const copia = { ...linha };
        for (const [campo, omitido] of Object.entries(spec.omit)) if (omitido) delete copia[campo];
        return copia;
    };
    const prisma = makeMockPrisma({
        pedido: {
            findUnique: async ({ include }) => {
                includeRecebido = include;
                return {
                    id: 'p1', especial: false, itens: [], cobrancasAsaas: [], embarque: null,
                    vendedor: aplicarOmit(usuario('v1', 'Vend'), include.vendedor),
                    usuarioLancamento: aplicarOmit(usuario('u1', 'Lanc'), include.usuarioLancamento),
                };
            },
        },
    });
    const restaurar = stubModule(DATABASE_MODULE, prisma);
    limparCacheContendo(R('controllers/pedidoController.js'), R('services/pedidoService.js'));
    const controller = require(R('controllers/pedidoController.js'));
    restaurar();
    let status = 200, corpo;
    const res = { status(c) { status = c; return this; }, json(b) { corpo = b; return this; } };
    await controller.detalhar({ params: { id: 'p1' }, user: { id: 'x', permissoes: { admin: true } } }, res);
    assert.equal(status, 200);
    assert.ok(includeRecebido, 'service deveria ter consultado o pedido');
    assert.ok(!('senha' in corpo.vendedor));
    assert.ok(!('senha' in corpo.usuarioLancamento));
    assert.ok(!JSON.stringify(corpo).includes('HASHDOPEDIDOSECRETO'));
    // mesmos demais campos
    assert.equal(corpo.vendedor.nome, 'Vend');
    assert.equal(corpo.usuarioLancamento.login, 'lanc');
    assert.deepEqual(corpo.vendedor.permissoes, { admin: false });
});

test('config: diag_pdf_extrato_ultimo e backup_status — comum 403 e some da lista; admin 200', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        for (const k of ['diag_pdf_extrato_ultimo', 'DIAG_PDF_EXTRATO_ULTIMO', 'backup_status']) {
            const c = await srv.request('GET', `/api/config/${k}`, { headers: COMUM });
            assert.equal(c.status, 403, k);
            assert.ok(!c.texto.includes('SEGREDO'));
        }
        const a = await srv.request('GET', '/api/config/diag_pdf_extrato_ultimo', { headers: ADMIN });
        assert.equal(a.status, 200);
        assert.equal(a.body.linhas, 'LINHA-EXTRATO-SEGREDO');
        const lista = await srv.request('GET', '/api/config', { headers: COMUM });
        assert.ok(!('diag_pdf_extrato_ultimo' in lista.body));
        assert.ok(!lista.texto.includes('SEGREDO'));
        const listaAdmin = await srv.request('GET', '/api/config', { headers: ADMIN });
        assert.ok('diag_pdf_extrato_ultimo' in listaAdmin.body);
    } finally { await srv.close(); }
});

test('config: GET /backup/status — comum 403; Pode_Editar_Caixa e admin 200 (mesmo critério da seção Backup)', async () => {
    const srv = await startTestServer(montar('/api/config', 'routes/configRoutes.js', prismaConfig([]), CACHE_CONFIG));
    try {
        const c = await srv.request('GET', '/api/config/backup/status', { headers: COMUM });
        assert.equal(c.status, 403);
        assert.ok(c.body.error);
        assert.ok(!c.texto.includes('SEGREDO'));
        // só ver Configurações ou editar Configurações não basta
        assert.equal((await srv.request('GET', '/api/config/backup/status', { headers: perfil({ configuracoes: { view: true, edit: true } }) })).status, 403);
        const caixa = await srv.request('GET', '/api/config/backup/status', { headers: perfil({ Pode_Editar_Caixa: true }) });
        assert.equal(caixa.status, 200);
        assert.ok('status' in caixa.body && 'driveConfigurado' in caixa.body);
        const adm = await srv.request('GET', '/api/config/backup/status', { headers: ADMIN });
        assert.equal(adm.status, 200);
    } finally { await srv.close(); }
});
