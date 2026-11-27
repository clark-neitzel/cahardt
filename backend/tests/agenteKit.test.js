// Kit de conexão (GET /api/agentes/:id/kit), especificação OpenAPI viva (GET /api/agente/v1/openapi.json)
// e cópia de permissões-base na criação de agente pela tela (POST /api/agentes com copiarPermissoesBase: true).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-teste-jwt-0123456789abcdef';

const { subir, cenario } = require('./helpers/agenteMatrizApp');

test('Kit de conexão e OpenAPI: sem segredos, sem rotas em NÃO nem bloqueios fixos; reflete a matriz ativa', async () => {
    const { db, srv } = await subir();
    try {
        const { admin: H_ADMIN, luke: H_AGENTE } = cenario(db);
        const agenteId = 'luke';

        // 1) Antes de ativar a matriz: GET /api/agentes/:id/kit e GET /api/agente/v1/openapi.json funcionam e zero cah_ag_
        let rKit = await srv.request('GET', `/api/agentes/${agenteId}/kit`, { headers: H_ADMIN });
        assert.equal(rKit.status, 200);
        assert.equal(rKit.body.ativa, false);
        assert.ok(rKit.body.markdown.includes('Kit de Conexão por API'));
        assert.equal(/cah_ag_/i.test(JSON.stringify(rKit.body)), false, 'kit nunca deve conter prefixo/segredo de token');

        let rOas = await srv.request('GET', '/api/agente/v1/openapi.json', { headers: H_AGENTE });
        assert.equal(rOas.status, 200);
        assert.equal(rOas.body.openapi, '3.1.0');
        assert.equal(rOas.body['x-matriz-ativa'], false);
        assert.equal(/cah_ag_/i.test(JSON.stringify(rOas.body)), false, 'openapi nunca deve conter prefixo/segredo de token');
        const pathsAntes = Object.keys(rOas.body.paths || {});
        assert.ok(pathsAntes.includes('/api/agente/v1/meu-acesso'), 'autodescoberta sempre liberada deve constar no openapi');
        assert.ok(pathsAntes.includes('/api/auth/me'), '/api/auth/me sempre liberada deve constar no openapi');
        assert.equal(pathsAntes.some((p) => p.includes('enviar-whatsapp')), false, 'bloqueio fixo por chave omitido mesmo com matriz desligada');
        assert.equal(rOas.body.paths['/api/indicadores-gestao/config']?.put, undefined, 'rota SO_ADMIN (PUT) omitida mesmo com matriz desligada');
        assert.equal(pathsAntes.some((p) => p === '/api/clientes/sync'), false, 'rota morta omitida mesmo com matriz desligada');
        assert.equal(
            (rOas.body.paths['/api/contas-pagar/avaliar-custo']?.post?.parameters || []).some((p) => p.name === 'Idempotency-Key'),
            false,
            'prévia de leitura (avaliar-custo) não exige Idempotency-Key'
        );

        // 2) Ativa a matriz com contas_pagar.criar = SIM, contas_pagar.editar = PEDE e produtos.ver = NAO, produtos.criar = NAO
        const rPut = await srv.request('PUT', `/api/agentes/${agenteId}/matriz`, {
            headers: H_ADMIN,
            body: {
                ativar: true,
                celulas: [
                    { modulo: 'contas_pagar', acao: 'ver', nivel: 'SIM' },
                    { modulo: 'contas_pagar', acao: 'criar', nivel: 'SIM' },
                    { modulo: 'contas_pagar', acao: 'editar', nivel: 'PEDE' },
                    { modulo: 'produtos', acao: 'ver', nivel: 'NAO' },
                    { modulo: 'produtos', acao: 'criar', nivel: 'NAO' },
                ],
            },
        });
        assert.equal(rPut.status, 200);

        // 3) OpenAPI agora tem x-matriz-ativa=true, inclui contas-pagar GET/POST(SIM)/PUT(PEDE),
        //    OMITE produtos (que está NÃO) e OMITE qualquer bloqueio fixo (/api/vendedores, /api/agentes, /api/config, enviar-whatsapp)
        rOas = await srv.request('GET', '/api/agente/v1/openapi.json', { headers: H_AGENTE });
        assert.equal(rOas.status, 200);
        assert.equal(rOas.body['x-matriz-ativa'], true);
        const paths = Object.keys(rOas.body.paths || {});
        assert.ok(paths.includes('/api/contas-pagar'), 'contas-pagar deve estar no openapi');
        assert.equal(rOas.body.paths['/api/contas-pagar'].post['x-nivel-agente'], 'SIM');
        assert.ok(
            (rOas.body.paths['/api/contas-pagar'].post.parameters || []).some((p) => p.name === 'Idempotency-Key' && p.required === true),
            'POST em SIM documenta Idempotency-Key obrigatória'
        );
        assert.equal(rOas.body.paths['/api/contas-pagar/{id}'].put['x-nivel-agente'], 'PEDE');
        assert.equal(paths.some((p) => p.startsWith('/api/produtos')), false, 'módulo em NÃO não entra no openapi');
        for (const proibido of ['/api/agentes', '/api/vendedores', '/api/config', '/api/admin-exec']) {
            assert.equal(paths.some((p) => p.startsWith(proibido)), false, `bloqueio fixo não pode entrar: ${proibido}`);
        }
        assert.equal(
            paths.some((p) => p.includes('enviar-whatsapp')),
            false,
            'rota com bloqueio fixo por chave não pode entrar no openapi'
        );

        // 4) Kit de conexão atualizado e sem segredos
        rKit = await srv.request('GET', `/api/agentes/${agenteId}/kit`, { headers: H_ADMIN });
        assert.equal(rKit.status, 200);
        assert.equal(rKit.body.ativa, true);
        assert.ok(rKit.body.resumo.sim >= 2);
        assert.ok(rKit.body.resumo.pede >= 1);
        assert.equal(/cah_ag_/i.test(rKit.body.markdown), false);
    } finally {
        await srv.close();
    }
});

test('POST /api/agentes com copiarPermissoesBase=true nasce com permissões de base (sem admin nem Usuario_Externo)', async () => {
    const { db, srv } = await subir();
    try {
        const { admin: H_ADMIN } = cenario(db);
        const r = await srv.request('POST', '/api/agentes', {
            headers: H_ADMIN,
            body: { nome: 'Agente Fiscal Novo', copiarPermissoesBase: true },
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.agente, true);
        assert.equal(r.body.permissoes.admin, undefined);
        assert.equal(r.body.permissoes.Usuario_Externo, undefined);
        assert.equal(r.body.permissoes.Isento_Ponto, true);
        assert.equal(r.body.permissoes.Pode_Acessar_Contas_Pagar, true);
        assert.equal(r.body.permissoes.Pode_Baixar_Contas_Pagar, true);
        assert.equal(r.body.permissoes.clientes?.edit, true);

        // Matriz desse agente novo já reporta prontidão ok!
        const m = await srv.request('GET', `/api/agentes/${r.body.id}/matriz`, { headers: H_ADMIN });
        assert.equal(m.status, 200);
        assert.equal(m.body.prontidao.ok, true);

        // E se um agente antigo tinha permissões vazias e o admin só tem `{ admin: true }`, sincronizar com `incluirModulos: true` resolve a prontidão!
        db.vendedores.get('adm').permissoes = { admin: true };
        db.vendedores.get(r.body.id).permissoes = {};
        const sync = await srv.request('POST', `/api/agentes/${r.body.id}/permissoes-base/sincronizar`, {
            headers: H_ADMIN,
            body: { incluirModulos: true },
        });
        assert.equal(sync.status, 200);
        assert.equal(sync.body.alterou, true);
        const mDepois = await srv.request('GET', `/api/agentes/${r.body.id}/matriz`, { headers: H_ADMIN });
        assert.equal(mDepois.body.prontidao.ok, true);
    } finally {
        await srv.close();
    }
});
