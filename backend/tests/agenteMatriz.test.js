// MATRIZ de permissões da API do agente (módulo × ação) — D1.
// App: um stub por rota do catálogo REAL atrás do authMiddleware verdadeiro (montado 2x, como em produção);
// Prisma em memória (tests/helpers/agenteMatrizApp.js). Nada toca banco nem rede externa.
const test = require('node:test');
const assert = require('node:assert/strict');

const { subir, cenario, UUID } = require('./helpers/agenteMatrizApp');

const CP = '/api/contas-pagar';
const corpoDespesa = (extra = {}) => ({ descricao: 'Luz de novembro', fornecedorId: 'f1', categoria: 'Energia', parcelas: [{ valor: 100, dataVencimento: '2026-12-10' }], ...extra });
const idem = (h, chave) => ({ ...h, 'idempotency-key': chave });

async function comMatriz(opts) {
    const amb = await subir(opts);
    const c = cenario(amb.db);
    amb.db.guardas.categorias = [{ nome: 'Energia', classificacao: 'OPERACIONAL' }, { nome: 'Retirada de lucros', classificacao: 'FORA_DRE' }];
    try {
        const r = await amb.srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(r.status, 200, JSON.stringify(r.body));
    } catch (e) { await amb.srv.close(); throw e; } // não deixa servidor aberto (o processo de teste nunca sairia)
    return { ...amb, c };
}
const celula = (matriz, modulo, acao) => matriz.modulos.find((m) => m.chave === modulo).celulas[acao];

// ───────────────────────── sem o marcador nada muda ─────────────────────────
test('SEM marcador: política antiga intacta — leitura 200, toda escrita 202, e linhas MODULO soltas são ignoradas', async () => {
    const { db, srv } = await subir();
    try {
        const c = cenario(db);
        // células gravadas SEM marcador (ex.: o dono salvou na tela mas não ativou): não valem
        db.addPolitica({ vendedorId: 'luke', escopo: 'MODULO', chave: 'contas_pagar.criar', nivel: 'LIBERADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'MODULO', chave: 'contas_pagar.ver', nivel: 'BLOQUEADO' });
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200);
        const post = await srv.request('POST', CP, { headers: c.luke, body: corpoDespesa() });
        assert.equal(post.status, 202);
        assert.equal(post.body.codigo, 'AGENTE_PEDE_AUTORIZACAO');
        assert.equal(post.body.motivoGuarda, undefined);
        assert.equal(db.execucoes[`POST ${CP}`], undefined, 'a rota não pode ter rodado');
        // os 13 "fixos por chave" só existem com a matriz: sem ela seguem PEDE como hoje
        const wpp = await srv.request('POST', `/api/pedidos/${UUID}/enviar-whatsapp`, { headers: c.luke, body: {} });
        assert.equal(wpp.status, 202);
        // só-admin sem matriz: também PEDE, como hoje
        assert.equal((await srv.request('PUT', '/api/indicadores-gestao/config', { headers: c.luke, body: { aliquota: 1 } })).status, 202);
        // 403 de sempre, com o corpo de sempre
        const bloq = await srv.request('GET', '/api/vendedores', { headers: c.luke });
        assert.equal(bloq.status, 403);
        assert.deepEqual(Object.keys(bloq.body).sort(), ['chave', 'codigo', 'error', 'fixo', 'nivel', 'orientacao']);
        assert.equal(bloq.body.codigo, 'AGENTE_BLOQUEADO');
        // meu-acesso: campo novo `matriz` existe e é null; os antigos seguem
        const eu = await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: c.luke });
        assert.equal(eu.status, 200);
        assert.equal(eu.body.matriz, null);
        assert.ok(eu.body.politica && eu.body.caminhosPermitidos && eu.body.solicitacoes);
        assert.equal(db.idem.length, 0);
    } finally { await srv.close(); }
});

// ───────────────────────── seed e desligar ─────────────────────────
test('seed: dry-run não grava; ?confirmar=1 exato grava as células + o marcador; tabela = seção 6 do plano', async () => {
    const { db, srv } = await subir();
    try {
        cenario(db);
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/caixa/resumo', nivel: 'LIBERADO', motivo: 'dono liberou' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/pedidos', nivel: 'LIBERADO' }); // não restritiva: só ignorada
        for (const q of ['', '?confirmar=true', '?confirmar=0', '?confirmar=11', '?confirmar=1%20']) {
            const seco = await srv.request('POST', `/api/admin-exec/agente-matriz-seed${q}`);
            assert.equal(seco.status, 200);
            assert.equal(seco.body.dryRun, true, `"${q}" tem que ser dry-run`);
        }
        assert.equal(db.politicas.length, 2, 'dry-run não grava nada');
        const seco = (await srv.request('POST', '/api/admin-exec/agente-matriz-seed')).body;
        assert.equal(seco.matrizJaAtiva, false);
        assert.deepEqual(seco.excecoesFuncaoMantidas.map((x) => x.chave), ['GET /api/caixa/resumo']);
        assert.deepEqual(seco.familiasIgnoradas.map((x) => x.chave), ['/api/pedidos']);
        // tabela da seção 6 do plano, escrita aqui À PARTE (expectativa independente do código)
        const S = 'SIM'; const P = 'PEDE';
        assert.deepEqual(seco.tabela, {
            contas_pagar: { ver: S, criar: S, editar: P, excluir: P, estornar: P, baixar: P },
            notas_recebidas: { ver: S, criar: S, editar: P, excluir: P, estornar: P, baixar: P },
            // no plano a linha traz criar/editar = PEDE, mas não há função desse tipo em contas a receber
            // (a única criação é `admin/sincronizar`, só-admin): as duas células ficam "não se aplica"
            contas_receber: { ver: S, excluir: P, estornar: P, baixar: P },
            caixa: { ver: S, criar: P, editar: P, excluir: P, estornar: P, baixar: P },
            conciliacao: { ver: S, criar: S, editar: P, excluir: P, estornar: P, baixar: P },
            dre_categorias: { ver: S, criar: S, editar: P, excluir: P },
            contabilidade: { ver: S },
            indicadores: { ver: S, criar: P, editar: P, excluir: P },
            cadastros: { ver: S, criar: S, editar: P, excluir: P, estornar: P },
            produtos: { ver: S, criar: S, editar: P, excluir: P },
            estoque: { ver: S, editar: P },
            pcp: { ver: S, criar: S, editar: P, excluir: P },
            pedidos: { ver: S, criar: P, editar: P, excluir: P, estornar: P, baixar: P },
            expedicao: { ver: S, criar: P, editar: P, excluir: P, estornar: P, baixar: P },
        });
        const ok = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(ok.body.dryRun, false);
        assert.equal(ok.body.matrizAtiva, true);
        const mod = db.politicas.filter((p) => p.escopo === 'MODULO');
        assert.equal(mod.length, ok.body.gravadas);
        assert.equal(mod.length, Object.values(seco.tabela).reduce((n, m) => n + Object.keys(m).length, 0));
        assert.ok(db.politicas.some((p) => p.escopo === 'MATRIZ' && p.chave === 'ativa' && p.nivel === 'LIBERADO'));
        assert.deepEqual(db.ultimaOpcaoTransacao, { timeout: 20000, maxWait: 10000 });
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_MATRIZ_SEMEADA'));
        // reexecutar não desfaz o que o dono ajustou
        db.politicas.find((p) => p.chave === 'contas_pagar.editar').nivel = 'BLOQUEADO';
        const de_novo = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(de_novo.body.gravadas, 0);
        assert.equal(db.politicas.find((p) => p.chave === 'contas_pagar.editar').nivel, 'BLOQUEADO');
        // sobrescrever=1 volta ao padrão
        const forca = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1&sobrescrever=1');
        assert.equal(forca.body.gravadas, 1);
        assert.equal(db.politicas.find((p) => p.chave === 'contas_pagar.editar').nivel, 'PEDE');
    } finally { await srv.close(); }
});

test('seed: agente inexistente 404; mais de um agente sem agenteId 400 listando; com agenteId funciona', async () => {
    const { db, srv } = await subir();
    try {
        assert.equal((await srv.request('POST', '/api/admin-exec/agente-matriz-seed')).status, 404);
        cenario(db);
        db.addVendedor({ id: 'r2', nome: 'R2', agente: true });
        const dois = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(dois.status, 400);
        assert.equal(dois.body.agentes.length, 2);
        assert.equal(db.politicas.length, 0);
        assert.equal((await srv.request('POST', '/api/admin-exec/agente-matriz-seed?agenteId=adm')).status, 404, 'humano não é agente');
        const um = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1&agenteId=r2');
        assert.equal(um.status, 200);
        assert.ok(db.politicas.every((p) => p.vendedorId === 'r2'));
    } finally { await srv.close(); }
});

test('desligar: dry-run por padrão; com ?confirmar=1 apaga SÓ o marcador e o agente volta à política antiga na hora', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        assert.equal((await srv.request('POST', CP, { headers: c.luke, body: corpoDespesa() })).status, 400, 'com a matriz: criação exige a chave');
        const seco = await srv.request('POST', '/api/admin-exec/agente-matriz-desligar');
        assert.equal(seco.body.dryRun, true);
        assert.equal(seco.body.matrizAtiva, true);
        const celulasAntes = db.politicas.filter((p) => p.escopo === 'MODULO').length;
        const ok = await srv.request('POST', '/api/admin-exec/agente-matriz-desligar?confirmar=1');
        assert.equal(ok.body.estavaAtiva, true);
        assert.equal(db.politicas.filter((p) => p.escopo === 'MATRIZ').length, 0);
        assert.equal(db.politicas.filter((p) => p.escopo === 'MODULO').length, celulasAntes, 'as células ficam guardadas');
        const post = await srv.request('POST', CP, { headers: c.luke, body: corpoDespesa() });
        assert.equal(post.status, 202, 'voltou a pedir autorização para toda escrita');
        assert.equal((await srv.request('POST', `/api/pedidos/${UUID}/enviar-whatsapp`, { headers: c.luke, body: {} })).status, 202);
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_MATRIZ_DESLIGADA'));
        assert.equal((await srv.request('POST', '/api/admin-exec/agente-matriz-desligar?confirmar=1')).body.estavaAtiva, false, 'repetir é inofensivo');
    } finally { await srv.close(); }
});

// ───────────────────────── critério de aceite (c) ─────────────────────────
test('(c) com a matriz: GET 200 · POST sem chave 400 · com chave 201 e repetido = mesma resposta sem 2ª despesa · pago:true 202 · PUT 202 · WhatsApp 403 fixo · só-admin 403', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200);

        const semChave = await srv.request('POST', CP, { headers: c.luke, body: corpoDespesa() });
        assert.equal(semChave.status, 400);
        assert.equal(semChave.body.codigo, 'AGENTE_IDEMPOTENCIA_OBRIGATORIA');
        assert.equal(db.execucoes[`POST ${CP}`], undefined);

        const k = 'despesa-luz-2026-11-0001';
        const a = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpoDespesa() });
        assert.equal(a.status, 201, JSON.stringify(a.body));
        assert.equal(a.headers.get('idempotent-replay'), null);
        const b = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpoDespesa() });
        assert.equal(b.status, 201);
        assert.equal(b.headers.get('idempotent-replay'), 'true');
        assert.deepEqual(b.body, a.body, 'a repetição devolve a MESMA resposta');
        assert.equal(db.execucoes[`POST ${CP}`], 1, 'a rota rodou UMA vez: não há segunda despesa');

        const pago = await srv.request('POST', CP, { headers: idem(c.luke, 'despesa-paga-0001'), body: corpoDespesa({ pago: true, dataPagamento: '2026-11-27' }) });
        assert.equal(pago.status, 202);
        assert.equal(pago.body.codigo, 'AGENTE_PEDE_AUTORIZACAO');
        assert.match(pago.body.motivoGuarda, /PAGO/);
        assert.match(pago.body.resumo, / \[Pede por segurança: .*PAGO.*\]$/, 'o motivo vai no FIM');
        assert.match(pago.body.resumo, /descrição: Luz de novembro/, 'a descrição do pedido não é cortada pelo motivo');
        assert.equal(db.execucoes[`POST ${CP}`], 1);

        const put = await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { descricao: 'x' } });
        assert.equal(put.status, 202);
        assert.equal(put.body.motivoGuarda, undefined);

        const wpp = await srv.request('POST', `/api/pedidos/${UUID}/enviar-whatsapp`, { headers: c.luke, body: {} });
        assert.equal(wpp.status, 403);
        assert.equal(wpp.body.codigo, 'AGENTE_BLOQUEADO');
        assert.equal(wpp.body.fixo, true);
        assert.equal(wpp.body.nivel, 'BLOQUEADO');

        const adm = await srv.request('PUT', '/api/indicadores-gestao/config', { headers: c.luke, body: { aliquota: 1 } });
        assert.equal(adm.status, 403);
        assert.equal(adm.body.codigo, 'AGENTE_SO_ADMIN');
        assert.equal(adm.body.nivel, 'BLOQUEADO', 'o campo nivel continua no corpo');
        assert.equal(adm.body.fixo, false);
        assert.equal(db.solicitacoes.filter((s) => s.chave === 'PUT /api/indicadores-gestao/config').length, 0, 'só-admin não vira solicitação que ia falhar');
    } finally { await srv.close(); }
});

test('os 13 bloqueios fixos por chave: 403 fixo com a matriz, nem exceção do dono libera', async () => {
    const { db, srv, c, politicaSvc } = await comMatriz();
    try {
        const padrao = require('../config/agentePoliticaPadrao');
        const chaves = Object.keys(padrao.BLOQUEIO_CHAVES_MATRIZ);
        assert.equal(chaves.length, 13);
        for (const chave of chaves) {
            const [metodo, caminho] = chave.split(' ');
            // tentativa de furar por exceção direta no banco
            db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave, nivel: 'LIBERADO' });
            politicaSvc.invalidar('luke');
            const r = await srv.request(metodo, caminho.replace(/:p/g, UUID), { headers: idem(c.luke, `fixo-${chaves.indexOf(chave)}-xxxxx`), body: {} });
            assert.equal(r.status, 403, chave);
            assert.equal(r.body.fixo, true, chave);
            assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO', chave);
            assert.equal(db.execucoes[chave], undefined, chave);
        }
        // e a API de exceções recusa mexer nelas
        const put = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: c.admin, body: { escopo: 'FUNCAO', chave: 'POST /api/pedidos/:id/enviar-whatsapp', nivel: 'PEDE' } });
        assert.equal(put.status, 422);
    } finally { await srv.close(); }
});

test('célula em NÃO: 403 AGENTE_SEM_PERMISSAO com {modulo, acao} e nivel BLOQUEADO; célula sem linha também nega', async () => {
    const { db, srv, c, politicaSvc } = await comMatriz();
    try {
        db.politicas.find((p) => p.chave === 'pedidos.ver').nivel = 'BLOQUEADO';
        db.politicas.splice(db.politicas.findIndex((p) => p.chave === 'caixa.baixar'), 1); // linha apagada = NÃO
        db.politicas.find((p) => p.chave === 'estoque.ver').nivel = 'PEDE'; // `ver` não aceita PEDE: linha torta fecha
        politicaSvc.invalidar('luke');
        const r = await srv.request('GET', '/api/pedidos', { headers: c.luke });
        assert.equal(r.status, 403);
        assert.deepEqual({ codigo: r.body.codigo, nivel: r.body.nivel, modulo: r.body.modulo, acao: r.body.acao, fixo: r.body.fixo },
            { codigo: 'AGENTE_SEM_PERMISSAO', nivel: 'BLOQUEADO', modulo: 'pedidos', acao: 'ver', fixo: false });
        const f = await srv.request('POST', '/api/caixa/fechar', { headers: c.luke, body: {} });
        assert.equal(f.status, 403);
        assert.equal(f.body.codigo, 'AGENTE_SEM_PERMISSAO');
        assert.equal(f.body.acao, 'baixar');
        assert.equal((await srv.request('GET', '/api/estoque', { headers: c.luke })).status, 403);
        assert.equal(db.solicitacoes.length, 0);
    } finally { await srv.close(); }
});

test('GET que grava/chama serviço externo continua fora mesmo com ver = SIM; família sem módulo e rota desconhecida seguem bloqueadas', async () => {
    const { srv, c } = await comMatriz();
    try {
        for (const u of ['/api/caixa/resumo', '/api/embarques/mapa', `/api/pedidos/${UUID}/danfe`, '/api/contabilidade/pacote-mes']) {
            const r = await srv.request('GET', u, { headers: c.luke });
            assert.equal(r.status, 403, u);
            assert.equal(r.body.codigo, 'AGENTE_BLOQUEADO', u);
        }
        assert.equal((await srv.request('GET', '/api/tarefas', { headers: c.luke })).status, 403);
        assert.equal((await srv.request('GET', '/api/contas-pagar/nao/existe/essa/rota', { headers: c.luke })).status, 403);
        assert.equal((await srv.request('GET', '/api/rh/funcionarios', { headers: c.luke })).body.fixo, true);
        assert.equal((await srv.request('POST', '/api/clientes/sync', { headers: c.luke, body: {} })).status, 403, 'rota morta');
    } finally { await srv.close(); }
});

test('prévias que só calculam valem como `ver` (sem chave de idempotência, sem fila)', async () => {
    const { srv, c } = await comMatriz();
    try {
        for (const u of [`${CP}/avaliar-custo`, `/api/notas-entrada/${UUID}/avaliar-custo`, `/api/pcp/receitas/${UUID}/escalonar`, '/api/entregas/conferir-folha']) {
            const r = await srv.request('POST', u, { headers: c.luke, body: {} });
            assert.equal(r.status, 201, u);
        }
    } finally { await srv.close(); }
});

// ───────────────────────── exceções e rota nova ─────────────────────────
test('exceção por FUNÇÃO vence a célula; linha de FAMÍLIA é ignorada com a matriz ativa', async () => {
    const { db, srv, c, politicaSvc } = await comMatriz();
    try {
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/contas-pagar', nivel: 'BLOQUEADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/contas-pagar/:p', nivel: 'BLOQUEADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'GET /api/caixa/resumo', nivel: 'LIBERADO' });
        politicaSvc.invalidar('luke');
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200, 'FAMILIA bloqueada não vale mais');
        assert.equal((await srv.request('GET', `${CP}/${UUID}`, { headers: c.luke })).status, 403, 'FUNCAO bloqueada vence o ver = SIM');
        assert.equal((await srv.request('GET', '/api/caixa/resumo', { headers: c.luke })).status, 200, 'FUNCAO liberada abre a exceção de leitura');
        // o dono libera por exceção UMA escrita classificada (editar a despesa): passa direto, sem fila
        const put = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: c.admin, body: { escopo: 'FUNCAO', chave: 'PUT /api/contas-pagar/:id', nivel: 'LIBERADO', motivo: 'teste' } });
        assert.equal(put.status, 200, JSON.stringify(put.body));
        assert.equal((await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { descricao: 'y' } })).status, 400, 'escrita direta em SIM exige a chave, seja qual for a ação');
        assert.equal((await srv.request('PUT', `${CP}/${UUID}`, { headers: idem(c.luke, 'excecao-put-0001'), body: { descricao: 'y' } })).status, 200);
        // mas só-admin não pode ser liberada nem por exceção
        const so = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: c.admin, body: { escopo: 'FUNCAO', chave: 'PUT /api/indicadores-gestao/config', nivel: 'LIBERADO' } });
        assert.equal(so.status, 422);
    } finally { await srv.close(); }
});

test('sem a matriz, a API de exceções continua recusando liberar escrita (mensagem de sempre)', async () => {
    const { db, srv } = await subir();
    try {
        const c = cenario(db);
        const put = await srv.request('PUT', '/api/agentes/luke/politicas', { headers: c.admin, body: { escopo: 'FUNCAO', chave: 'PUT /api/contas-pagar/:id', nivel: 'LIBERADO' } });
        assert.equal(put.status, 422);
        assert.match(put.body.error, /só leitura por enquanto/);
    } finally { await srv.close(); }
});

test('rota de escrita NOVA (não classificada): nasce em PEDE, nunca em SIM; com `editar` em NÃO fica 403; GET novo herda `ver`', async () => {
    const extras = [{ metodo: 'POST', caminho: '/api/contas-pagar/rota-nova-de-escrita' }, { metodo: 'GET', caminho: '/api/contas-pagar/relatorio-novo' }];
    const { db, srv, c, politicaSvc } = await comMatriz({ rotasExtras: extras });
    try {
        const nova = await srv.request('POST', '/api/contas-pagar/rota-nova-de-escrita', { headers: idem(c.luke, 'rota-nova-0001'), body: { a: 1 } });
        assert.equal(nova.status, 202, 'criar = SIM no módulo NÃO dá autonomia a rota não classificada');
        assert.equal(db.execucoes['POST /api/contas-pagar/rota-nova-de-escrita'], undefined);
        assert.equal((await srv.request('GET', '/api/contas-pagar/relatorio-novo', { headers: c.luke })).status, 200);
        // nem exceção LIBERADO gravada direto no banco dá autonomia a ela
        db.addPolitica({ vendedorId: 'luke', escopo: 'FUNCAO', chave: 'POST /api/contas-pagar/rota-nova-de-escrita', nivel: 'LIBERADO' });
        politicaSvc.invalidar('luke');
        assert.equal((await srv.request('POST', '/api/contas-pagar/rota-nova-de-escrita', { headers: c.luke, body: { a: 2 } })).status, 202);
        db.politicas.find((p) => p.chave === 'contas_pagar.editar').nivel = 'BLOQUEADO';
        politicaSvc.invalidar('luke');
        const neg = await srv.request('POST', '/api/contas-pagar/rota-nova-de-escrita', { headers: c.luke, body: { a: 3 } });
        assert.equal(neg.status, 403);
        assert.equal(neg.body.codigo, 'AGENTE_SEM_PERMISSAO');
    } finally { await srv.close(); }
});

// ───────────────────────── guardas (rebaixam SIM para PEDE) ─────────────────────────
test('guardas: categoria fora da DRE / inexistente, duplicata, lote, funções que sempre pedem — tudo vira 202 com o motivo', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        let n = 0;
        const pede = async (metodo, url, body, padraoMotivo) => {
            const r = await srv.request(metodo, url, { headers: idem(c.luke, `guarda-${++n}-abcdef`), body });
            assert.equal(r.status, 202, `${url} ${JSON.stringify(body).slice(0, 80)} -> ${r.status} ${JSON.stringify(r.body)}`);
            assert.match(r.body.motivoGuarda, padraoMotivo);
            return r;
        };
        await pede('POST', CP, corpoDespesa({ categoria: 'Retirada de lucros' }), /FORA da DRE/);
        await pede('POST', CP, corpoDespesa({ categoria: 'Categoria Inventada' }), /não existe e seria criada/);
        await pede('POST', CP, corpoDespesa({ dataPagamento: '2026-11-27' }), /PAGO/);
        db.guardas.contaPagarIgual = { id: 'ja-existe' };
        await pede('POST', CP, corpoDespesa(), /possível duplicata/);
        db.guardas.contaPagarIgual = null;
        await pede('POST', `/api/notas-entrada/${UUID}/gerar-conta`, { categoriaPadrao: 'Energia', pago: true, parcelas: [] }, /PAGO/);
        await pede('POST', `/api/notas-entrada/${UUID}/gerar-conta`, { categoriaPadrao: 'Energia', itens: [{ categoria: 'Retirada de lucros' }] }, /FORA da DRE/);
        await pede('POST', `/api/notas-entrada/${UUID}/registrar-entrada`, { motivo: 'BONIFICACAO' }, /esconde uma dívida/);
        await pede('POST', '/api/conciliacao-bancaria/despesas-lote', { lancamentos: [] }, /lote/);
        await pede('POST', '/api/financeiro-gerencial/por-conta/ajuste', { valor: 10 }, /saldo/);
        await pede('POST', '/api/financeiro-gerencial/grupos-dre', { nome: 'X' }, /DRE/);
        await pede('POST', '/api/produtos', { nome: 'Farinha', categoria: 'Matéria-Prima', estoqueInicial: 10 }, /estoque inicial/);
        await pede('POST', '/api/pcp/receitas', { itemPcpId: 'i1', nome: 'Massa', rendimentoBase: 1, itens: [{}] }, /rascunho/);
        await pede('POST', `/api/pcp/receitas/${UUID}/clonar`, { novoNome: 'Massa 2' }, /ATIVA/);
        await pede('POST', '/api/pcp/itens/importar-lote', { itens: Array.from({ length: 21 }, (_, i) => ({ produtoId: `p${i}`, tipo: 'MP' })) }, /lote com 21/);
        await pede('POST', '/api/fornecedores', { razaoSocial: 'Sem Documento Ltda' }, /sem CNPJ\/CPF/);
        await pede('POST', '/api/clientes', { Nome: 'Fulano' }, /sem CPF\/CNPJ/);
        db.guardas.notaIgual = { id: 'nota-x' };
        await pede('POST', '/api/notas-entrada/lancar-manual', { fornecedorNome: 'F', fornecedorCnpj: '11222333000181', numero: '10', valorTotal: 50, emissao: '2026-11-01' }, /possível duplicata/);
        db.guardas.notaIgual = null;
        db.guardas.falhar = true; // banco fora na hora de conferir: fecha (vira pedido), não libera
        await pede('POST', CP, corpoDespesa(), /não foi possível conferir/);
        db.guardas.falhar = false;
        assert.equal(Object.keys(db.execucoes).filter((k) => !k.startsWith('GET ')).length, 0, 'nenhuma rota de escrita rodou');
        assert.equal(db.idem.length, 0, 'pedido que vai para a fila não reserva chave de idempotência');
        // o motivo aparece para o dono na fila
        const fila = await srv.request('GET', '/api/agentes/solicitacoes', { headers: c.admin });
        assert.ok(fila.body.data.some((i) => / \[Pede por segurança: .+\]$/.test(i.resumo)));

        // e o caminho feliz: as mesmas funções, com corpo limpo, passam direto
        const ok = async (url, body) => {
            const r = await srv.request('POST', url, { headers: idem(c.luke, `feliz-${++n}-abcdef`), body });
            assert.equal(r.status, 201, `${url} -> ${r.status} ${JSON.stringify(r.body)}`);
        };
        await ok(CP, corpoDespesa());
        await ok(`/api/notas-entrada/${UUID}/gerar-conta`, { categoriaPadrao: 'Energia', parcelas: [{ valor: 1, dataVencimento: '2026-12-01' }] });
        await ok('/api/produtos', { nome: 'Farinha', categoria: 'Matéria-Prima' });
        await ok('/api/pcp/receitas', { itemPcpId: 'i1', nome: 'Massa', rendimentoBase: 1, itens: [{}], status: 'rascunho' });
        await ok('/api/pcp/itens/importar-lote', { itens: [{ produtoId: 'p1', tipo: 'MP' }] });
        await ok('/api/fornecedores', { razaoSocial: 'Com Documento Ltda', cnpjCpf: '11222333000181' });
        await ok('/api/clientes', { Nome: 'Fulano', Documento: '11222333000181' });
        await ok('/api/notas-entrada/lancar-manual', { fornecedorNome: 'F', fornecedorCnpj: '11222333000181', numero: '11', valorTotal: 50, emissao: '2026-11-01' });
        await ok('/api/financeiro-gerencial/categorias-despesa', { nome: 'Nova categoria' });
    } finally { await srv.close(); }
});

// ───────────────────────── avisosAgente e fluxo PEDE → autorizar ─────────────────────────
test('(e) rota com efeito externo: a resposta ao agente ganha `avisosAgente` (direto e na execução autorizada); rota comum não ganha', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const g = await srv.request('POST', `/api/notas-entrada/${UUID}/gerar-conta`, { headers: idem(c.luke, 'gerar-conta-0001'), body: { categoriaPadrao: 'Energia', parcelas: [{ valor: 1, dataVencimento: '2026-12-01' }] } });
        assert.equal(g.status, 201);
        assert.equal(g.body.ok, true, 'a operação principal respondeu normalmente');
        assert.equal(g.body.avisosAgente.length, 1);
        assert.match(g.body.avisosAgente[0], /SEFAZ/);
        // a repetição idempotente devolve a mesma coisa, aviso incluído
        const g2 = await srv.request('POST', `/api/notas-entrada/${UUID}/gerar-conta`, { headers: idem(c.luke, 'gerar-conta-0001'), body: { categoriaPadrao: 'Energia', parcelas: [{ valor: 1, dataVencimento: '2026-12-01' }] } });
        assert.deepEqual(g2.body, g.body);
        const semAviso = await srv.request('POST', CP, { headers: idem(c.luke, 'sem-aviso-0001'), body: corpoDespesa() });
        assert.equal(semAviso.body.avisosAgente, undefined);
        // PEDE → dono autoriza → loopback: o resultado guardado leva o aviso (baixa de contas a receber → Asaas)
        const p = await srv.request('POST', `/api/contas-receber/${UUID}/baixa`, { headers: c.luke, body: { valor: 10 } });
        assert.equal(p.status, 202);
        const aut = await srv.request('POST', `/api/agentes/solicitacoes/${p.body.solicitacaoId}/autorizar`, { headers: c.admin, body: {} });
        assert.equal(aut.status, 200, JSON.stringify(aut.body));
        assert.equal(aut.body.status, 'AUTORIZADA');
        assert.match(aut.body.resultado.avisosAgente[0], /Asaas/);
        // resposta em LISTA ou de erro não é alterada
        db.statusDe = { 'POST /api/fornecedores': 400 };
        const erro = await srv.request('POST', '/api/fornecedores', { headers: idem(c.luke, 'forn-erro-0001'), body: { razaoSocial: 'X', cnpjCpf: '1' } });
        assert.equal(erro.status, 400);
        assert.equal(erro.body.avisosAgente, undefined);
    } finally { await srv.close(); }
});

test('(f) com a matriz, o fluxo PEDE → autorizar → loopback continua igual (e recusar também)', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const p = await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { descricao: 'novo texto' } });
        assert.equal(p.status, 202);
        assert.equal(db.execucoes['PUT /api/contas-pagar/:p'], undefined);
        const dup = await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { descricao: 'novo texto' } });
        assert.equal(dup.body.solicitacaoId, p.body.solicitacaoId, 'pedido idêntico reaproveita a pendente');
        assert.equal(dup.body.duplicada, true);
        const aut = await srv.request('POST', `/api/agentes/solicitacoes/${p.body.solicitacaoId}/autorizar`, { headers: c.admin, body: {} });
        assert.equal(aut.status, 200, JSON.stringify(aut.body));
        assert.equal(aut.body.status, 'AUTORIZADA');
        assert.equal(aut.body.resultadoStatus, 200);
        assert.equal(aut.body.resultado.user, 'luke', 'executou COMO o agente');
        assert.equal(aut.body.resultado.sol, p.body.solicitacaoId);
        assert.equal(db.execucoes['PUT /api/contas-pagar/:p'], 1);
        const eu = await srv.request('GET', `/api/agente/v1/solicitacoes/${p.body.solicitacaoId}`, { headers: c.luke });
        assert.equal(eu.body.status, 'AUTORIZADA');
        // pedido rebaixado por guarda: o dono autoriza e a rota roda (a guarda não roda de novo no ticket)
        const pago = await srv.request('POST', CP, { headers: idem(c.luke, 'paga-0002-abcdef'), body: corpoDespesa({ pago: true }) });
        assert.equal(pago.status, 202);
        const aut2 = await srv.request('POST', `/api/agentes/solicitacoes/${pago.body.solicitacaoId}/autorizar`, { headers: c.admin, body: {} });
        assert.equal(aut2.body.status, 'AUTORIZADA', JSON.stringify(aut2.body));
        assert.equal(db.execucoes[`POST ${CP}`], 1);
        // recusar
        const r = await srv.request('DELETE', `/api/anexos/${UUID}`, { headers: c.luke });
        assert.equal(r.status, 202);
        const rec = await srv.request('POST', `/api/agentes/solicitacoes/${r.body.solicitacaoId}/recusar`, { headers: c.admin, body: { observacao: 'não' } });
        assert.equal(rec.body.status, 'RECUSADA');
        // célula virou NÃO depois do pedido: autorizar recusa sozinho, nada roda
        const q = await srv.request('POST', `${CP}/${UUID}/cancelar`, { headers: c.luke, body: {} });
        assert.equal(q.status, 202);
        await srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body: { celulas: [{ modulo: 'contas_pagar', acao: 'excluir', nivel: 'NAO' }] } });
        const aut3 = await srv.request('POST', `/api/agentes/solicitacoes/${q.body.solicitacaoId}/autorizar`, { headers: c.admin, body: {} });
        assert.equal(aut3.status, 409);
        assert.equal(aut3.body.codigo, 'AGENTE_POLITICA_BLOQUEADA');
        assert.equal(db.execucoes['POST /api/contas-pagar/:p/cancelar'], undefined);
    } finally { await srv.close(); }
});

// ───────────────────────── rotas da matriz (admin humano) ─────────────────────────
test('GET/PUT /api/agentes/:id/matriz: só admin humano; (d) trocar a célula muda a resposta da API na hora; auditoria fora da transação', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        for (const [m, u, b] of [['GET', '/api/agentes/luke/matriz'], ['PUT', '/api/agentes/luke/matriz', { celulas: [] }], ['GET', '/api/agentes/luke/matriz/funcoes?modulo=caixa'], ['POST', '/api/agentes/luke/permissoes-base/sincronizar', {}]]) {
            assert.equal((await srv.request(m, u, { headers: c.vend, body: b })).status, 403, `${m} ${u} vendedor comum`);
            const ag = await srv.request(m, u, { headers: c.luke, body: b });
            assert.equal(ag.status, 403, `${m} ${u} agente`);
            assert.equal(ag.body.fixo, true);
            assert.equal((await srv.request(m, u, { body: b })).status, 401, `${m} ${u} sem token`);
        }
        assert.equal((await srv.request('GET', '/api/agentes/adm/matriz', { headers: c.admin })).status, 404, 'humano não tem matriz');

        const m = (await srv.request('GET', '/api/agentes/luke/matriz', { headers: c.admin })).body;
        assert.equal(m.ativa, true);
        assert.equal(m.modulos.length, 14);
        assert.deepEqual(m.acoes.map((a) => a.chave), ['ver', 'criar', 'editar', 'excluir', 'estornar', 'baixar']);
        assert.equal(celula(m, 'contas_pagar', 'criar').nivel, 'SIM');
        assert.equal(celula(m, 'contas_pagar', 'editar').nivel, 'PEDE');
        assert.deepEqual(celula(m, 'contas_pagar', 'ver').niveisAceitos, ['NAO', 'SIM']);
        assert.deepEqual(celula(m, 'contabilidade', 'criar'), { aplicavel: false, nivel: null, funcoes: 0 });
        assert.ok(celula(m, 'contas_pagar', 'ver').funcoes > 5);
        assert.deepEqual(m.sempreBloqueado.map((g) => g.grupo), ['FIXO_DURO', 'EFEITO_EXTERNO', 'SO_ADMIN', 'FORA_DE_ESCOPO']);
        assert.equal(m.sempreBloqueado[1].funcoes.length, 13);
        assert.equal(m.sempreBloqueado[2].funcoes.length, 8);
        assert.deepEqual(m.naoClassificadas, []);

        // (d) editar a despesa: PEDE -> SIM -> NAO, e a API obedece na chamada seguinte
        assert.equal((await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { d: 1 } })).status, 202);
        const g1 = await srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body: { celulas: [{ modulo: 'contas_pagar', acao: 'editar', nivel: 'SIM' }, { modulo: 'contas_pagar', acao: 'ver', nivel: 'SIM' }] } });
        assert.equal(g1.status, 200, JSON.stringify(g1.body));
        assert.deepEqual(g1.body.alteradas, [{ modulo: 'contas_pagar', acao: 'editar', antes: 'PEDE', depois: 'SIM' }], 'só o que mudou');
        assert.deepEqual(db.ultimaOpcaoTransacao, { timeout: 20000, maxWait: 10000 });
        assert.equal((await srv.request('PUT', `${CP}/${UUID}`, { headers: idem(c.luke, 'celula-sim-put-0001'), body: { d: 2 } })).status, 200);
        await srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body: { celulas: [{ modulo: 'contas_pagar', acao: 'editar', nivel: 'NAO' }] } });
        assert.equal((await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { d: 3 } })).status, 403);
        const audit = db.audits.filter((a) => a.acao === 'AGENTE_MATRIZ_ALTERADA');
        assert.equal(audit.length, 2);
        assert.equal(audit[0].usuarioId, 'adm');
        assert.deepEqual(JSON.parse(audit[0].detalhes).alteradas, [{ modulo: 'contas_pagar', acao: 'editar', antes: 'PEDE', depois: 'SIM' }]);
        // gravar o mesmo valor: nada muda, nada é auditado
        const igual = await srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body: { celulas: [{ modulo: 'contas_pagar', acao: 'editar', nivel: 'NAO' }] } });
        assert.equal(igual.body.semMudanca, true);
        assert.equal(db.audits.filter((a) => a.acao === 'AGENTE_MATRIZ_ALTERADA').length, 2);
        // auditoria falhando NÃO desfaz a gravação
        db.falharAudit = true;
        const semLog = await srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body: { celulas: [{ modulo: 'contas_pagar', acao: 'editar', nivel: 'PEDE' }] } });
        assert.equal(semLog.status, 200);
        db.falharAudit = false;
        assert.equal(db.politicas.find((p) => p.chave === 'contas_pagar.editar').nivel, 'PEDE');
        // `permissoes` do usuário não foi tocado em nenhum momento (a matriz não mora lá)
        assert.deepEqual(db.vendedores.get('luke').permissoes, { Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true });
    } finally { await srv.close(); }
});

test('PUT matriz: validações (ver não aceita PEDE, célula que não se aplica, lote tudo-ou-nada) e ativar/desativar pelo corpo', async () => {
    const { db, srv } = await subir();
    try {
        const c = cenario(db);
        const put = (body) => srv.request('PUT', '/api/agentes/luke/matriz', { headers: c.admin, body });
        assert.equal((await put({})).status, 400);
        assert.equal((await put({ celulas: 'x' })).status, 400);
        assert.equal((await put({ celulas: [{ modulo: 'nao_existe', acao: 'ver', nivel: 'SIM' }] })).status, 400);
        assert.equal((await put({ celulas: [{ modulo: 'caixa', acao: 'voar', nivel: 'SIM' }] })).status, 400);
        assert.equal((await put({ celulas: [{ modulo: 'caixa', acao: 'ver', nivel: 'TALVEZ' }] })).status, 400);
        const verPede = await put({ celulas: [{ modulo: 'caixa', acao: 'ver', nivel: 'PEDE' }] });
        assert.equal(verPede.status, 422);
        assert.match(verPede.body.error, /só aceita SIM ou NAO/);
        assert.equal((await put({ celulas: [{ modulo: 'contabilidade', acao: 'criar', nivel: 'SIM' }] })).status, 422, 'célula que não se aplica não é gravável');
        assert.equal((await put({ celulas: [{ modulo: 'estoque', acao: 'baixar', nivel: 'PEDE' }] })).status, 422);
        assert.equal((await put({ celulas: [{ modulo: 'caixa', acao: 'ver', nivel: 'SIM' }, { modulo: 'caixa', acao: 'ver', nivel: 'NAO' }] })).status, 400, 'célula repetida');
        assert.equal((await put({ ativar: 'sim' })).status, 400);
        assert.equal(db.politicas.length, 0, 'nenhuma validação recusada gravou algo');
        // uma célula inválida no meio derruba o lote inteiro
        assert.equal((await put({ celulas: [{ modulo: 'caixa', acao: 'ver', nivel: 'SIM' }, { modulo: 'caixa', acao: 'ver2', nivel: 'SIM' }] })).status, 400);
        assert.equal(db.politicas.length, 0);
        // falha do banco no meio da transação: rollback (tudo ou nada)
        db.falharUpsertEm = 'caixa.criar';
        const meio = await put({ celulas: [{ modulo: 'caixa', acao: 'ver', nivel: 'SIM' }, { modulo: 'caixa', acao: 'criar', nivel: 'PEDE' }] });
        assert.equal(meio.status, 500);
        db.falharUpsertEm = null;
        assert.equal(db.politicas.length, 0, 'rollback: a primeira célula não ficou gravada');
        assert.equal(db.audits.length, 0);
        // grava sem ativar: a matriz fica guardada mas NÃO vale
        const g = await put({ celulas: [{ modulo: 'contas_pagar', acao: 'ver', nivel: 'NAO' }, { modulo: 'contas_pagar', acao: 'criar', nivel: 'sim' }] });
        assert.equal(g.status, 200);
        assert.equal(g.body.ativa, false);
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200, 'sem ativar, vale a política antiga');
        const lida = (await srv.request('GET', '/api/agentes/luke/matriz', { headers: c.admin })).body;
        assert.equal(lida.ativa, false);
        assert.equal(celula(lida, 'contas_pagar', 'ver').nivel, 'NAO');
        assert.equal(celula(lida, 'contas_pagar', 'ver').definida, true);
        assert.equal(celula(lida, 'caixa', 'ver').nivel, 'NAO', 'célula nunca definida aparece como NAO');
        assert.equal(celula(lida, 'caixa', 'ver').definida, false);
        assert.equal(celula(lida, 'caixa', 'ver').padrao, 'SIM');
        // ativa pelo corpo
        const liga = await put({ ativar: true });
        assert.equal(liga.body.marcador, 'LIGADO');
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 403);
        const desliga = await put({ ativar: false });
        assert.equal(desliga.body.marcador, 'DESLIGADO');
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200);
    } finally { await srv.close(); }
});

test('GET /matriz/funcoes: lista o que há dentro da célula, com o nível efetivo de cada função', async () => {
    const { srv, c } = await comMatriz();
    try {
        assert.equal((await srv.request('GET', '/api/agentes/luke/matriz/funcoes', { headers: c.admin })).status, 400);
        assert.equal((await srv.request('GET', '/api/agentes/luke/matriz/funcoes?modulo=caixa&acao=voar', { headers: c.admin })).status, 400);
        const r = (await srv.request('GET', '/api/agentes/luke/matriz/funcoes?modulo=notas_recebidas&acao=criar', { headers: c.admin })).body;
        const por = Object.fromEntries(r.funcoes.map((f) => [f.chave, f]));
        assert.equal(por['POST /api/notas-entrada/importar-xml'].nivel, 'SIM');
        assert.equal(por['POST /api/notas-entrada/:p/registrar-entrada'].nivel, 'PEDE', 'sempre pede, mesmo com criar = SIM');
        assert.ok(por['POST /api/notas-entrada/:p/registrar-entrada'].semprePede);
        assert.match(por['POST /api/notas-entrada/:p/gerar-conta'].efeitoExterno, /SEFAZ/);
        assert.ok(r.funcoes.every((f) => f.acao === 'criar'));
        const tudo = (await srv.request('GET', '/api/agentes/luke/matriz/funcoes?modulo=notas_recebidas', { headers: c.admin })).body;
        const manif = tudo.funcoes.find((f) => f.chave === 'POST /api/notas-entrada/:p/manifestar');
        assert.equal(manif.nivel, 'NAO');
        assert.equal(manif.fixo, true);
        const ind = (await srv.request('GET', '/api/agentes/luke/matriz/funcoes?modulo=indicadores&acao=editar', { headers: c.admin })).body;
        assert.ok(ind.funcoes.filter((f) => f.soAdmin).length >= 2);
        assert.ok(ind.funcoes.filter((f) => f.soAdmin).every((f) => f.nivel === 'NAO' && f.origem === 'so_admin'));
    } finally { await srv.close(); }
});

test('prontidão + sincronizar permissões-base: aponta o que falta; a cópia NUNCA leva admin nem Usuario_Externo', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const antes = (await srv.request('GET', '/api/agentes/luke/matriz', { headers: c.admin })).body;
        assert.equal(celula(antes, 'contas_pagar', 'criar').prontidao.ok, true);
        const cad = celula(antes, 'cadastros', 'criar').prontidao;
        assert.equal(cad.ok, false);
        assert.deepEqual(cad.faltam.map((f) => f.chave), ['clientes.edit']);
        assert.equal(antes.prontidao.ok, false);
        assert.ok(antes.prontidao.faltam.some((f) => f.chave === 'clientes.edit'));
        const s = await srv.request('POST', '/api/agentes/luke/permissoes-base/sincronizar', { headers: c.admin, body: {} });
        assert.equal(s.status, 200, JSON.stringify(s.body));
        assert.equal(s.body.alterou, true);
        assert.ok(s.body.adicionadas.includes('clientes.edit'));
        const perms = db.vendedores.get('luke').permissoes;
        assert.equal(perms.admin, undefined, 'agente nunca vira admin');
        assert.equal(perms.Usuario_Externo, undefined);
        assert.equal(perms.clientes.edit, true);
        assert.equal(perms.Isento_Ponto, true);
        assert.equal(perms.Pode_Acessar_Contas_Pagar, true, 'o que o agente já tinha continua');
        assert.deepEqual(s.body.removidas, []);
        assert.equal(db.historico.length, 1);
        assert.equal(db.historico[0].alteradoPorId, 'adm');
        assert.ok(db.audits.some((a) => a.acao === 'AGENTE_PERMISSOES_BASE_SINCRONIZADAS'));
        const depois = (await srv.request('GET', '/api/agentes/luke/matriz', { headers: c.admin })).body;
        assert.equal(celula(depois, 'cadastros', 'criar').prontidao.ok, true);
        // repetir não regrava
        const de_novo = await srv.request('POST', '/api/agentes/luke/permissoes-base/sincronizar', { headers: c.admin, body: {} });
        assert.equal(de_novo.body.alterou, false);
        assert.equal(db.historico.length, 1);
        // o agente continua entrando (token não foi derrubado por "admin")
        assert.equal((await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: c.luke })).status, 200);
    } finally { await srv.close(); }
});

test('meu-acesso com a matriz ativa: campo aditivo `matriz` com SIM/PEDE/NAO por módulo; contrato antigo intacto', async () => {
    const { srv, c } = await comMatriz();
    try {
        const eu = (await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: c.luke })).body;
        for (const k of ['id', 'nome', 'agente', 'permissoes', 'caminhosPermitidos', 'token', 'politica', 'solicitacoes', 'observacao']) assert.ok(k in eu, `campo antigo ${k}`);
        assert.equal(eu.matriz.ativa, true);
        const cp = eu.matriz.modulos.find((m) => m.modulo === 'contas_pagar');
        assert.deepEqual(cp.acoes, { ver: 'SIM', criar: 'SIM', editar: 'PEDE', excluir: 'PEDE', estornar: 'PEDE', baixar: 'PEDE' });
        assert.deepEqual(eu.matriz.modulos.find((m) => m.modulo === 'contabilidade').acoes, { ver: 'SIM' });
        // o resumo antigo por nível continua coerente (contagens numéricas)
        assert.equal(typeof eu.politica.liberado, 'number');
        assert.ok(eu.politica.pede > 0 && eu.politica.bloqueado > 0);
    } finally { await srv.close(); }
});

test('listagem antiga /politicas segue funcionando com a matriz (campos antigos + modulo/acao aditivos)', async () => {
    const { srv, c } = await comMatriz();
    try {
        const r = await srv.request('GET', '/api/agentes/luke/politicas?familia=/api/contas-pagar&porPagina=200', { headers: c.admin });
        assert.equal(r.status, 200);
        const post = r.body.itens.find((i) => i.chave === 'POST /api/contas-pagar');
        for (const k of ['chave', 'metodo', 'exemplo', 'familia', 'rotulo', 'nivelEfetivo', 'origem', 'fixo']) assert.ok(k in post, k);
        assert.equal(post.nivelEfetivo, 'LIBERADO');
        assert.equal(post.origem, 'matriz');
        assert.equal(post.modulo, 'contas_pagar');
        assert.equal(post.acao, 'criar');
        const fam = await srv.request('GET', '/api/agentes/luke/politicas/familias', { headers: c.admin });
        assert.equal(fam.status, 200);
        assert.ok(fam.body.familias.find((f) => f.familia === '/api/contas-pagar').liberado > 0);
    } finally { await srv.close(); }
});

// ───────────────────────── guardas: unidade ─────────────────────────
test('guardas (unidade): nunca lançam; função sem guarda não rebaixa; `recusarSeAgente` só age dentro de requisição de agente', async () => {
    const { db, srv, guardas } = await subir();
    try {
        assert.deepEqual(await guardas.avaliar('PUT /api/contas-pagar/:p', { body: { pago: true } }), { rebaixar: false, motivos: [] });
        assert.deepEqual(await guardas.avaliar('POST /api/contas-pagar', { body: null }), { rebaixar: false, motivos: [] });
        assert.equal((await guardas.avaliar('POST /api/contas-pagar', { body: { pago: 'true' } })).rebaixar, true);
        assert.equal((await guardas.avaliar('POST /api/contas-pagar', { body: { categoria: 'Vários' } })).rebaixar, false, '"Vários" não é categoria');
        assert.equal((await guardas.avaliar('POST /api/produtos', { body: { estoqueInicial: 0 } })).rebaixar, false);
        assert.equal((await guardas.avaliar('POST /api/produtos', { body: { valorVenda: 10 } })).rebaixar, true);
        assert.equal((await guardas.avaliar('POST /api/conciliacao-bancaria/importar', { body: {}, query: { forcar: '1' } })).rebaixar, true);
        assert.equal((await guardas.avaliar('POST /api/conciliacao-bancaria/importar', { body: {}, query: {} })).rebaixar, false);
        db.guardas.fornecedorIgual = { id: 'f9' };
        assert.match((await guardas.avaliar('POST /api/fornecedores', { body: { razaoSocial: 'Igual' } })).motivos[0], /mesma razão social/);
        db.guardas.itemPcpIgual = { id: 'i9' };
        assert.equal((await guardas.avaliar('POST /api/pcp/itens', { body: { nome: 'Massa', unidade: 'kg' } })).rebaixar, true);
        db.guardas.itemPcpIgual = null;
        assert.equal((await guardas.avaliar('POST /api/pcp/itens', { body: { nome: 'Massa', unidade: 'kg' } })).rebaixar, false);
        // recusarSeAgente: fora de contexto de agente (humano/worker) nunca responde
        const { rodarComoAgente } = require('../utils/agenteContexto');
        const fake = () => { const r = { st: null, corpo: null, status(s) { r.st = s; return r; }, json(b) { r.corpo = b; return r; } }; return r; };
        const humano = fake();
        assert.equal(guardas.recusarSeAgente(humano, true, 'x'), false);
        assert.equal(humano.st, null);
        const agente = fake();
        assert.equal(rodarComoAgente({ vendedorId: 'luke' }, () => guardas.recusarSeAgente(agente, true, 'não pode')), true);
        assert.equal(agente.st, 422);
        assert.equal(agente.corpo.codigo, 'AGENTE_GUARDA');
        const agenteSemCondicao = fake();
        assert.equal(rodarComoAgente({ vendedorId: 'luke' }, () => guardas.recusarSeAgente(agenteSemCondicao, false, 'x')), false);
    } finally { await srv.close(); }
});

// ───────────────────────── correções da revisão (D1 reprovado → itens 1 a 10) ─────────────────────────
test('item 1: retry legítimo (mesma chave + mesmo corpo) devolve REPLAY mesmo que a guarda de duplicata agora enxergue o registro criado', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const casos = [
            [CP, corpoDespesa(), () => { db.guardas.contaPagarIgual = { id: 'a-propria-despesa' }; }, 'retry-despesa-0001'],
            ['/api/pcp/itens', { nome: 'Massa base', unidade: 'kg' }, () => { db.guardas.itemPcpIgual = { id: 'o-proprio-item' }; }, 'retry-item-pcp-0001'],
            ['/api/notas-entrada/lancar-manual', { fornecedorNome: 'F', fornecedorCnpj: '11222333000181', numero: '77', valorTotal: 50, emissao: '2026-11-01' }, () => { db.guardas.notaIgual = { id: 'a-propria-nota' }; }, 'retry-nota-manual-0001'],
        ];
        for (const [url, body, passaAExistir, k] of casos) {
            const chave = `POST ${url}`;
            const a = await srv.request('POST', url, { headers: idem(c.luke, k), body });
            assert.equal(a.status, 201, `${url}: 1ª chamada`);
            passaAExistir(); // a partir daqui a guarda de duplicata ENCONTRA o registro que a 1ª chamada criou
            const b = await srv.request('POST', url, { headers: idem(c.luke, k), body });
            assert.equal(b.status, 201, `${url}: o retry não pode virar 202 "possível duplicata" (${JSON.stringify(b.body).slice(0, 120)})`);
            assert.equal(b.headers.get('idempotent-replay'), 'true', url);
            assert.deepEqual(b.body, a.body, url);
            assert.equal(db.execucoes[chave], 1, `${url}: 1 registro só`);
            // já uma chave NOVA com o mesmo conteúdo é, aí sim, suspeita de duplicata
            const nova = await srv.request('POST', url, { headers: idem(c.luke, `${k}-outra`), body });
            assert.equal(nova.status, 202, `${url}: chave nova + registro igual = pede autorização`);
            assert.match(nova.body.motivoGuarda, /possível duplicata/);
            assert.equal(db.execucoes[chave], 1);
        }
        assert.equal(db.solicitacoes.length, 3, 'só as 3 chamadas com chave nova viraram solicitação');
        assert.equal(db.idem.length, 3, 'guarda que rebaixa não deixa chave reservada');
        assert.ok(db.idem.every((l) => l.status === 'CONCLUIDA'));
    } finally { await srv.close(); }
});

test('item 1b: guarda que rebaixa NÃO reserva a chave — depois de o dono resolver, a mesma chave serve para criar', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const k = 'rebaixada-0001-abcd';
        const p = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpoDespesa({ categoria: 'Categoria Nova' }) });
        assert.equal(p.status, 202);
        assert.equal(db.idem.length, 0);
        const p2 = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpoDespesa({ categoria: 'Categoria Nova' }) });
        assert.equal(p2.status, 202);
        assert.equal(p2.body.duplicada, true, 'retry de pedido na fila reaproveita a mesma solicitação');
        db.guardas.categorias.push({ nome: 'Categoria Nova', classificacao: 'OPERACIONAL' }); // o dono criou a categoria
        const ok = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpoDespesa({ categoria: 'Categoria Nova' }) });
        assert.equal(ok.status, 201);
        assert.equal(db.execucoes[`POST ${CP}`], 1);
    } finally { await srv.close(); }
});

test('item 2: `confirmarCustoForaDaCurva` vindo do agente vira pedido em QUALQUER função; despesa com itens também', async () => {
    const { db, srv, c, politicaSvc } = await comMatriz();
    try {
        // o dono liberou (SIM) editar e estornar em contas a pagar e notas: a flag continua rebaixando
        for (const ch of ['contas_pagar.editar', 'notas_recebidas.editar']) db.politicas.find((p) => p.chave === ch).nivel = 'LIBERADO';
        politicaSvc.invalidar('luke');
        let n = 0;
        const flag = { confirmarCustoForaDaCurva: true };
        for (const [m, url, body] of [
            ['POST', CP, corpoDespesa(flag)],
            ['POST', `/api/notas-entrada/${UUID}/gerar-conta`, { categoriaPadrao: 'Energia', parcelas: [{ valor: 1, dataVencimento: '2026-12-01' }], ...flag }],
            ['PUT', `${CP}/${UUID}/itens`, { itens: [{ produtoId: 'p1', quantidade: 1, valorTotal: 9 }], ...flag }],
            ['POST', `/api/notas-entrada/${UUID}/corrigir-entrada-estoque`, { itens: [], ...flag }],
            ['POST', CP, corpoDespesa({ confirmarCustoForaDaCurva: 'true' })],
        ]) {
            const r = await srv.request(m, url, { headers: idem(c.luke, `flag-${++n}-abcdefgh`), body });
            assert.equal(r.status, 202, `${m} ${url} -> ${r.status}`);
            assert.match(r.body.motivoGuarda, /confirmarCustoForaDaCurva/);
        }
        // registrar-entrada já pede sempre (com ou sem a flag)
        assert.equal((await srv.request('POST', `/api/notas-entrada/${UUID}/registrar-entrada`, { headers: c.luke, body: flag })).status, 202);
        // sem a flag as mesmas edições liberadas passam
        assert.equal((await srv.request('PUT', `${CP}/${UUID}/itens`, { headers: idem(c.luke, 'sem-flag-0001-abcd'), body: { itens: [] } })).status, 200);
        // despesa COM produtos: entrada de estoque sem nota -> pede
        const comItens = await srv.request('POST', CP, { headers: idem(c.luke, 'com-itens-0001-abcd'), body: corpoDespesa({ itens: [{ produtoId: 'p1', quantidade: 2, valorTotal: 10 }] }) });
        assert.equal(comItens.status, 202);
        assert.match(comItens.body.motivoGuarda, /despesa com produtos/);
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, 'sem-itens-0001-abcd'), body: corpoDespesa({ itens: [] }) })).status, 201);
        assert.equal(Object.keys(db.execucoes).filter((k) => !k.startsWith('GET ')).sort().join(), [`POST ${CP}`, 'PUT /api/contas-pagar/:p/itens'].sort().join());
    } finally { await srv.close(); }
});

test('item 4: o seed NÃO reabre o que o dono fechou por FAMÍLIA — BLOQUEADO vira células NAO; PEDE fecha a leitura e limita a escrita', async () => {
    const { db, srv } = await subir();
    try {
        const c = cenario(db);
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/pedidos', nivel: 'BLOQUEADO' });
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/fornecedores', nivel: 'PEDE' });
        // hoje (sem matriz): pedidos bloqueado, fornecedores pede até para ler
        assert.equal((await srv.request('GET', '/api/pedidos', { headers: c.luke })).status, 403);
        assert.equal((await srv.request('GET', '/api/fornecedores', { headers: c.luke })).status, 202);
        const seco = (await srv.request('POST', '/api/admin-exec/agente-matriz-seed')).body;
        assert.equal(seco.podeConfirmar, true);
        assert.deepEqual(seco.tabela.pedidos, { ver: 'NAO', criar: 'NAO', editar: 'NAO', excluir: 'NAO', estornar: 'NAO', baixar: 'NAO' });
        assert.deepEqual(seco.tabela.cadastros, { ver: 'NAO', criar: 'PEDE', editar: 'PEDE', excluir: 'PEDE', estornar: 'PEDE' });
        assert.equal(seco.fechadasPorFamilia, 6 + 2, '6 de pedidos + ver e criar de cadastros');
        assert.match(seco.familiasIgnoradas.find((f) => f.chave === '/api/pedidos').traducao, /ficam NAO/);
        assert.ok(seco.celulas.find((x) => x.modulo === 'pedidos' && x.acao === 'ver').porCausaDe.includes('/api/pedidos'));
        assert.equal(db.politicas.length, 2);
        const ok = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 300));
        // com a matriz ATIVA continua fechado
        const ped = await srv.request('GET', '/api/pedidos', { headers: c.luke });
        assert.equal(ped.status, 403);
        assert.equal(ped.body.codigo, 'AGENTE_SEM_PERMISSAO');
        assert.equal((await srv.request('POST', '/api/pedidos', { headers: c.luke, body: {} })).status, 403);
        assert.equal((await srv.request('GET', '/api/fornecedores', { headers: c.luke })).status, 403, 'leitura que pedia autorização não vira liberada');
        assert.equal((await srv.request('POST', '/api/fornecedores', { headers: c.luke, body: { razaoSocial: 'X', cnpjCpf: '11222333000181' } })).status, 202, 'criar não vira SIM');
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200, 'os outros módulos seguem a regra padrão');
        // nem `sobrescrever` reabre
        const forca = (await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1&sobrescrever=1')).body;
        assert.equal(forca.tabela.pedidos.ver, 'NAO');
        assert.equal(forca.tabela.cadastros.criar, 'PEDE');
        // célula que o dono já tinha aberto na tela também é fechada pelo teto da família
        db.politicas.find((p) => p.chave === 'pedidos.ver').nivel = 'LIBERADO';
        const outra = (await srv.request('POST', '/api/admin-exec/agente-matriz-seed')).body;
        assert.equal(outra.celulas.find((x) => x.modulo === 'pedidos' && x.acao === 'ver').acaoDoSeed, 'FECHAR_POR_FAMILIA');
    } finally { await srv.close(); }
});

test('item 4b: FAMÍLIA restritiva sem módulo na matriz — dry-run avisa e o confirmar=1 é recusado sem gravar nada', async () => {
    const { db, srv } = await subir();
    try {
        cenario(db);
        db.addPolitica({ vendedorId: 'luke', escopo: 'FAMILIA', chave: '/api/tarefas', nivel: 'BLOQUEADO' });
        const seco = await srv.request('POST', '/api/admin-exec/agente-matriz-seed');
        assert.equal(seco.status, 200);
        assert.equal(seco.body.podeConfirmar, false);
        assert.deepEqual(seco.body.familiasSemModulo, [{ chave: '/api/tarefas', nivel: 'BLOQUEADO' }]);
        assert.match(seco.body.comoConfirmar, /NÃO dá para confirmar/);
        const r = await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(r.status, 422);
        assert.match(r.body.error, /\/api\/tarefas = BLOQUEADO/);
        assert.deepEqual(r.body.familiasSemModulo, [{ chave: '/api/tarefas', nivel: 'BLOQUEADO' }]);
        assert.equal(db.politicas.length, 1, 'nada gravado, matriz não ligada');
        // FAMÍLIA LIBERADA sem módulo não impede (não é restrição)
        db.politicas[0].nivel = 'LIBERADO';
        assert.equal((await srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1')).status, 200);
    } finally { await srv.close(); }
});

test('item 9: sincronizar permissões-base é ADITIVO — admin que só tem `admin:true` não tira nada do agente', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const rica = { Pode_Acessar_Contas_Pagar: true, Pode_Baixar_Contas_Pagar: true, Pode_Acessar_Caixa: true, clientes: { view: true, edit: true }, pcp: { itens: true, receitas: false }, estoque: [{ categoria: 'MP' }], limite: 5 };
        db.vendedores.get('luke').permissoes = JSON.parse(JSON.stringify(rica));
        db.vendedores.get('adm').permissoes = { admin: true };
        const s = await srv.request('POST', '/api/agentes/luke/permissoes-base/sincronizar', { headers: c.admin, body: {} });
        assert.equal(s.status, 200, JSON.stringify(s.body));
        assert.deepEqual(s.body.removidas, []);
        assert.equal(s.body.ligadasDepois >= s.body.ligadasAntes, true);
        const depois = db.vendedores.get('luke').permissoes;
        assert.deepEqual({ ...depois, Isento_Ponto: undefined }, { ...rica, Isento_Ponto: undefined }, 'tudo o que o agente tinha continua igual');
        assert.equal(depois.admin, undefined);
        // admin com mais coisas: só ACRESCENTA (inclusive dentro de objeto), sem desligar o que o agente tem e o admin não
        db.vendedores.get('adm').permissoes = { admin: true, Usuario_Externo: true, Admin: true, Pode_Acessar_Caixa: false, Pode_Fechar_Caixa: true, clientes: { view: true, edit: false, extra: true }, pcp: { receitas: true }, produtos: { edit: true }, estoque: [{ categoria: 'OUTRA' }], limite: 99 };
        const s2 = await srv.request('POST', '/api/agentes/luke/permissoes-base/sincronizar', { headers: c.admin, body: {} });
        assert.deepEqual(s2.body.removidas, []);
        const p = db.vendedores.get('luke').permissoes;
        assert.equal(p.Pode_Acessar_Caixa, true, 'admin com false não desliga');
        assert.equal(p.Pode_Fechar_Caixa, true);
        assert.deepEqual(p.clientes, { view: true, edit: true, extra: true });
        assert.deepEqual(p.pcp, { itens: true, receitas: true });
        assert.deepEqual(p.produtos, { edit: true });
        assert.deepEqual(p.estoque, [{ categoria: 'MP' }], 'lista que o agente já tem não é trocada');
        assert.equal(p.limite, 5);
        assert.equal(p.admin, undefined);
        assert.equal(p.Admin, undefined);
        assert.equal(p.Usuario_Externo, undefined);
        assert.equal((await srv.request('GET', '/api/agente/v1/meu-acesso', { headers: c.luke })).status, 200, 'o token do agente segue válido');
    } finally { await srv.close(); }
});

test('item 10: o motivo da guarda não corta a descrição do pedido, mesmo com descrição e motivo longos', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const longo = 'Compra de insumos diversos para a produção da semana do Natal '.repeat(3).trim();
        const r = await srv.request('POST', CP, { headers: idem(c.luke, 'resumo-longo-0001'), body: corpoDespesa({ descricao: longo, observacao: 'obs '.repeat(30), categoria: 'Categoria Inventada Com Nome Bem Comprido Para Estourar', pago: true, dataPagamento: '2026-11-27', confirmarCustoForaDaCurva: true }) });
        assert.equal(r.status, 202);
        const semMotivo = r.body.resumo.slice(0, r.body.resumo.indexOf(' [Pede por segurança: '));
        assert.ok(semMotivo.includes(longo.slice(0, 80)), 'a descrição está inteira (até o limite de 80 do campo)');
        assert.match(semMotivo, /valor|vencimento|fornecedor|obs\./, 'os outros campos do resumo continuam lá');
        assert.match(r.body.resumo, /\]$/);
        assert.equal(db.solicitacoes[0].resumo, r.body.resumo);
    } finally { await srv.close(); }
});
