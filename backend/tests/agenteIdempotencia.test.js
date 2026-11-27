// Idempotência das criações diretas do agente (services/agenteIdempotenciaService.js) — D1.
// Pelo caminho HTTP real: authMiddleware verdadeiro (montado 2x) + stub da rota com contador de execuções.
const test = require('node:test');
const assert = require('node:assert/strict');

const { subir, cenario, UUID } = require('./helpers/agenteMatrizApp');

const CP = '/api/contas-pagar';
const CHAVE_CP = `POST ${CP}`;
const corpo = (extra = {}) => ({ descricao: 'Luz', fornecedorId: 'f1', categoria: 'Energia', parcelas: [{ valor: 100, dataVencimento: '2026-12-10' }], ...extra });
const idem = (h, k) => ({ ...h, 'idempotency-key': k });

async function comMatriz(opts) {
    const amb = await subir(opts);
    const c = cenario(amb.db);
    amb.db.guardas.categorias = [{ nome: 'Energia', classificacao: 'OPERACIONAL' }];
    try {
        const r = await amb.srv.request('POST', '/api/admin-exec/agente-matriz-seed?confirmar=1');
        assert.equal(r.status, 200);
    } catch (e) { await amb.srv.close(); throw e; }
    return { ...amb, c };
}

test('chave obrigatória: ausente, vazia, curta, com espaço ou com cara de token → 400 e a rota não roda', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        for (const k of [undefined, '', '   ', 'curta', 'tem espaco no meio', 'x'.repeat(201), 'cah_ag_abcdefghijklmnop']) {
            const headers = k === undefined ? c.luke : idem(c.luke, k);
            const r = await srv.request('POST', CP, { headers, body: corpo() });
            assert.equal(r.status, 400, `chave ${JSON.stringify(k)}`);
            assert.equal(r.body.codigo, 'AGENTE_IDEMPOTENCIA_OBRIGATORIA');
        }
        assert.equal(db.execucoes[CHAVE_CP], undefined);
        assert.equal(db.idem.length, 0);
    } finally { await srv.close(); }
});

test('mesma chave + mesmo corpo: devolve a resposta guardada (Idempotent-Replay) e NÃO cria de novo; ordem das chaves do JSON não importa', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const a = await srv.request('POST', CP, { headers: idem(c.luke, 'chave-0001-aaaa'), body: { a: 1, b: { x: 1, y: 2 }, ...corpo() } });
        assert.equal(a.status, 201);
        await new Promise((r) => setTimeout(r, 20)); // o desfecho é gravado no `finish` da resposta
        assert.equal(db.idem.length, 1);
        assert.equal(db.idem[0].status, 'CONCLUIDA');
        assert.equal(db.idem[0].respostaStatus, 201);
        assert.equal(db.idem[0].funcao, CHAVE_CP);
        for (let i = 0; i < 3; i++) {
            const b = await srv.request('POST', CP, { headers: idem(c.luke, 'chave-0001-aaaa'), body: { ...corpo(), b: { y: 2, x: 1 }, a: 1 } });
            assert.equal(b.status, 201);
            assert.equal(b.headers.get('idempotent-replay'), 'true');
            assert.deepEqual(b.body, a.body);
        }
        assert.equal(db.execucoes[CHAVE_CP], 1);
        // chave nova = registro novo
        const n = await srv.request('POST', CP, { headers: idem(c.luke, 'chave-0002-bbbb'), body: corpo({ descricao: 'Água' }) });
        assert.equal(n.status, 201);
        assert.equal(db.execucoes[CHAVE_CP], 2);
        assert.notEqual(n.body.id, a.body.id);
    } finally { await srv.close(); }
});

test('mesma chave com pedido DIFERENTE (corpo, caminho ou função) → 422 e nada roda', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        const k = 'chave-conflito-0001';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() })).status, 201);
        await new Promise((r) => setTimeout(r, 20));
        const outroCorpo = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo({ descricao: 'Outra coisa' }) });
        assert.equal(outroCorpo.status, 422);
        assert.equal(outroCorpo.body.codigo, 'AGENTE_IDEMPOTENCIA_CONFLITO');
        const outraQuery = await srv.request('POST', `${CP}?x=1`, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(outraQuery.status, 422);
        const outraFuncao = await srv.request('POST', '/api/produtos', { headers: idem(c.luke, k), body: { nome: 'Farinha', categoria: 'MP' } });
        assert.equal(outraFuncao.status, 422);
        assert.equal(db.execucoes[CHAVE_CP], 1);
        assert.equal(db.execucoes['POST /api/produtos'], undefined);
    } finally { await srv.close(); }
});

test('duas chamadas SIMULTÂNEAS com a mesma chave: só uma roda; a outra recebe 409 "em andamento"', async () => {
    let soltar;
    const trava = new Promise((r) => { soltar = r; });
    const lenta = { metodo: 'POST', caminho: '/api/contas-pagar', responder: async (req, res, db) => { await trava; res.status(201).json({ id: `lenta-${db.execucoes['POST /api/contas-pagar']}` }); } };
    const { db, srv, c } = await comMatriz({ rotasExtras: [lenta] });
    try {
        const k = 'chave-corrida-0001';
        const p1 = srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        await new Promise((r) => setTimeout(r, 50));
        const p2 = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(p2.status, 409);
        assert.equal(p2.body.codigo, 'AGENTE_IDEMPOTENCIA_EM_ANDAMENTO');
        soltar();
        const r1 = await p1;
        assert.equal(r1.status, 201);
        assert.equal(db.execucoes[CHAVE_CP], 1);
        await new Promise((r) => setTimeout(r, 20));
        const p3 = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(p3.status, 201);
        assert.equal(p3.headers.get('idempotent-replay'), 'true');
        assert.deepEqual(p3.body, r1.body);
        assert.equal(db.execucoes[CHAVE_CP], 1);
    } finally { soltar(); await srv.close(); }
});

test('servidor caiu no meio (EM_ANDAMENTO há mais de 10 min): 409 indeterminada — nunca reexecuta sozinho', async () => {
    const { db, srv, c, idemSvc } = await comMatriz();
    try {
        const k = 'chave-queda-0001';
        // reserva pelo caminho HTTP real e depois "volta no tempo": linha presa em andamento, como numa queda do servidor
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() })).status, 201);
        await new Promise((r) => setTimeout(r, 20));
        db.idem[0].status = 'EM_ANDAMENTO';
        db.idem[0].criadoEm = new Date(Date.now() - idemSvc.INDETERMINADA_MS - 1000);
        const de_novo = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(de_novo.status, 409);
        assert.equal(de_novo.body.codigo, 'AGENTE_IDEMPOTENCIA_INDETERMINADA');
        assert.equal(db.execucoes[CHAVE_CP], 1, 'não rodou de novo');
    } finally { await srv.close(); }
});

test('a rota RECUSOU (4xx): a chave é solta e o agente pode corrigir e repetir; erro 5xx vira INDETERMINADA (409), nunca replay', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        db.statusDe = { [CHAVE_CP]: 400 };
        const k = 'chave-4xx-0001-aaaa';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() })).status, 400);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(db.idem.length, 0, '4xx solta a chave');
        db.statusDe = {};
        const ok = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo({ descricao: 'corrigido' }) });
        assert.equal(ok.status, 201, 'mesma chave, corpo corrigido: agora cria');
        assert.equal(db.execucoes[CHAVE_CP], 2);

        db.statusDe = { [CHAVE_CP]: 500 };
        const k5 = 'chave-5xx-0001-aaaa';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, k5), body: corpo() })).status, 500);
        await new Promise((r) => setTimeout(r, 20));
        db.statusDe = {};
        assert.equal(db.idem.find((l) => l.chave === k5).status, 'INDETERMINADA');
        const rep = await srv.request('POST', CP, { headers: idem(c.luke, k5), body: corpo() });
        assert.equal(rep.status, 409, '5xx é desfecho incerto: não repete o erro como resposta nem executa de novo');
        assert.equal(rep.body.codigo, 'AGENTE_IDEMPOTENCIA_INDETERMINADA');
        assert.match(rep.body.orientacao, /rota de leitura/);
        assert.equal(rep.headers.get('idempotent-replay'), null);
        assert.equal(db.execucoes[CHAVE_CP], 3);
    } finally { await srv.close(); }
});

test('vale para toda ESCRITA direta do agente em SIM (item 8); leitura, pedido na fila, execução autorizada e humano não usam chave', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        assert.equal((await srv.request('GET', CP, { headers: c.luke })).status, 200);
        assert.equal((await srv.request('POST', `${CP}/avaliar-custo`, { headers: c.luke, body: {} })).status, 201, 'prévia (ver) não pede chave');
        // edição liberada por exceção: sem chave, passa
        await srv.request('PUT', '/api/agentes/luke/politicas', { headers: c.admin, body: { escopo: 'FUNCAO', chave: 'PUT /api/contas-pagar/:id', nivel: 'LIBERADO' } });
        // item 8: TODA escrita direta em SIM exige a chave (não só criar) — e repete sem executar de novo
        const semChave = await srv.request('PUT', `${CP}/${UUID}`, { headers: c.luke, body: { d: 1 } });
        assert.equal(semChave.status, 400);
        assert.equal(semChave.body.codigo, 'AGENTE_IDEMPOTENCIA_OBRIGATORIA');
        const e1 = await srv.request('PUT', `${CP}/${UUID}`, { headers: idem(c.luke, 'editar-0001-abcd'), body: { d: 1 } });
        assert.equal(e1.status, 200);
        await new Promise((r) => setTimeout(r, 20));
        const e2 = await srv.request('PUT', `${CP}/${UUID}`, { headers: idem(c.luke, 'editar-0001-abcd'), body: { d: 1 } });
        assert.equal(e2.headers.get('idempotent-replay'), 'true');
        assert.equal(db.execucoes['PUT /api/contas-pagar/:p'], 1);
        db.idem.length = 0;
        // criação em módulo PEDE: vai para a fila sem exigir chave; a execução autorizada também não exige
        const ped = await srv.request('POST', '/api/pedidos', { headers: c.luke, body: { clienteId: 'c1' } });
        assert.equal(ped.status, 202);
        const aut = await srv.request('POST', `/api/agentes/solicitacoes/${ped.body.solicitacaoId}/autorizar`, { headers: c.admin, body: {} });
        assert.equal(aut.body.status, 'AUTORIZADA', JSON.stringify(aut.body));
        assert.equal(db.execucoes['POST /api/pedidos'], 1);
        assert.equal(db.idem.length, 0);
        // humano (JWT) criando: nada de chave
        assert.equal((await srv.request('POST', CP, { headers: c.admin, body: corpo() })).status, 201);
        assert.equal(db.idem.length, 0);
    } finally { await srv.close(); }
});

test('falha ao GUARDAR a resposta não derruba a criação (a chave fica em andamento e depois indeterminada)', async () => {
    const { db, srv, c } = await comMatriz();
    try {
        db.falharIdemUpdate = true;
        const r = await srv.request('POST', CP, { headers: idem(c.luke, 'chave-falha-log-0001'), body: corpo() });
        assert.equal(r.status, 201, 'a operação principal respondeu normalmente');
        await new Promise((x) => setTimeout(x, 20));
        assert.equal(db.idem[0].status, 'EM_ANDAMENTO');
        const de_novo = await srv.request('POST', CP, { headers: idem(c.luke, 'chave-falha-log-0001'), body: corpo() });
        assert.equal(de_novo.status, 409);
        assert.equal(db.execucoes[CHAVE_CP], 1, 'nunca duplica');
    } finally { await srv.close(); }
});

test('upload (multipart): a impressão digital usa a chave + o tamanho; limpeza apaga só linhas com mais de 30 dias', async () => {
    const { db, srv, idemSvc } = await comMatriz();
    try {
        const req = (len, extra = {}) => ({ method: 'POST', originalUrl: '/api/contas-pagar/1/anexos', headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(len) }, body: {}, ...extra });
        assert.equal(idemSvc.hashDoPedido(req(100)), idemSvc.hashDoPedido(req(100)));
        assert.notEqual(idemSvc.hashDoPedido(req(100)), idemSvc.hashDoPedido(req(101)));
        assert.notEqual(idemSvc.hashDoPedido(req(100)), idemSvc.hashDoPedido(req(100, { originalUrl: '/api/contas-pagar/2/anexos' })));
        const json = (body) => ({ method: 'POST', originalUrl: '/api/x', headers: { 'content-type': 'application/json' }, body });
        assert.equal(idemSvc.hashDoPedido(json({ a: 1, b: 2 })), idemSvc.hashDoPedido(json({ b: 2, a: 1 })));
        assert.notEqual(idemSvc.hashDoPedido(json({ a: 1 })), idemSvc.hashDoPedido(json({ a: 2 })));

        const dia = 24 * 60 * 60 * 1000;
        db.idem.push({ id: 'velha', vendedorId: 'luke', chave: 'k-velha', funcao: 'f', corpoHash: 'h', status: 'CONCLUIDA', criadoEm: new Date(Date.now() - 31 * dia) });
        db.idem.push({ id: 'nova', vendedorId: 'luke', chave: 'k-nova', funcao: 'f', corpoHash: 'h', status: 'CONCLUIDA', criadoEm: new Date(Date.now() - 29 * dia) });
        assert.equal(await idemSvc.limparAntigas(), 1);
        assert.deepEqual(db.idem.map((l) => l.id), ['nova']);
    } finally { await srv.close(); }
});

test('resposta grande demais ou com cara de token não é guardada: a repetição avisa em vez de criar de novo', async () => {
    const grande = { metodo: 'POST', caminho: '/api/contas-pagar', responder: (req, res) => res.status(201).json({ id: 'g1', lixo: 'x'.repeat(300 * 1024) }) };
    const { db, srv, c } = await comMatriz({ rotasExtras: [grande] });
    try {
        const k = 'chave-grande-0001';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() })).status, 201);
        await new Promise((x) => setTimeout(x, 30));
        assert.equal(db.idem[0].status, 'CONCLUIDA');
        assert.equal(db.idem[0].resposta, null);
        const rep = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(rep.status, 201);
        assert.equal(rep.body.codigo, 'AGENTE_IDEMPOTENCIA_REPETIDA');
        assert.equal(db.execucoes[CHAVE_CP], 1);
    } finally { await srv.close(); }
});

test('item 3: o desfecho é gravado quando a ROTA responde — cliente que cai antes de receber não deixa a chave presa', async () => {
    let soltar;
    const trava = new Promise((r) => { soltar = r; });
    const lenta = { metodo: 'POST', caminho: '/api/contas-pagar', responder: async (req, res) => { await trava; res.status(201).json({ id: 'criada-apos-queda' }); } };
    const { db, srv, c } = await comMatriz({ rotasExtras: [lenta] });
    try {
        const k = 'cliente-caiu-0001';
        const http = require('http');
        const { port } = new URL(srv.baseUrl);
        const dados = JSON.stringify(corpo());
        const rq = http.request({ host: '127.0.0.1', port, path: CP, method: 'POST', headers: { authorization: c.luke.authorization, 'content-type': 'application/json', 'content-length': Buffer.byteLength(dados), 'idempotency-key': k } });
        rq.on('error', () => {});
        rq.end(dados);
        for (let i = 0; i < 100 && !db.execucoes[CHAVE_CP]; i++) await new Promise((r) => setTimeout(r, 10)); // a rota começou
        assert.equal(db.idem[0].status, 'EM_ANDAMENTO');
        rq.destroy(); // o cliente cai ANTES de a rota responder
        await new Promise((r) => setTimeout(r, 50));
        soltar(); // a rota termina e responde para uma conexão que já morreu
        for (let i = 0; i < 100 && db.idem[0].status === 'EM_ANDAMENTO'; i++) await new Promise((r) => setTimeout(r, 10));
        assert.equal(db.idem[0].status, 'CONCLUIDA', 'a chave não ficou presa em andamento');
        assert.equal(db.idem[0].respostaStatus, 201);
        const retry = await srv.request('POST', CP, { headers: idem(c.luke, k), body: corpo() });
        assert.equal(retry.status, 201);
        assert.equal(retry.headers.get('idempotent-replay'), 'true');
        assert.deepEqual(retry.body, { id: 'criada-apos-queda' });
        assert.equal(db.execucoes[CHAVE_CP], 1, 'o retry não criou de novo');
    } finally { soltar(); await srv.close(); }
});

test('item 3b: resposta que não é JSON (res.send / res.end) também fecha a chave; 4xx por res.send solta', async () => {
    const texto = { metodo: 'POST', caminho: '/api/contas-pagar', responder: (req, res, db) => (db.modo === 'end' ? res.status(204).end() : db.modo === '4xx' ? res.status(422).send('recusado') : res.status(201).send('ok em texto')) };
    const { db, srv, c } = await comMatriz({ rotasExtras: [texto] });
    try {
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, 'texto-0001-abcd'), body: corpo() })).status, 201);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(db.idem[0].status, 'CONCLUIDA');
        assert.equal(db.idem[0].resposta, null);
        const rep = await srv.request('POST', CP, { headers: idem(c.luke, 'texto-0001-abcd'), body: corpo() });
        assert.equal(rep.body.codigo, 'AGENTE_IDEMPOTENCIA_REPETIDA');
        assert.equal(db.execucoes[CHAVE_CP], 1);
        db.modo = 'end';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, 'end-0001-abcdef'), body: corpo() })).status, 204);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(db.idem.find((l) => l.chave === 'end-0001-abcdef').status, 'CONCLUIDA', 'rede de segurança do finish');
        db.modo = '4xx';
        assert.equal((await srv.request('POST', CP, { headers: idem(c.luke, 'send4xx-0001-ab'), body: corpo() })).status, 422);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(db.idem.find((l) => l.chave === 'send4xx-0001-ab'), undefined);
    } finally { await srv.close(); }
});

// ───────── corpo CRU (XML/texto): impressão digital pelo CONTEÚDO ─────────
// A rota de teste usa o MESMO parser da rota real (routes/notasEntrada.js): express.text({ type: () => true, limit: '25mb' }).
const express = require('express');
const http = require('http');
const XML_ROTA = '/api/notas-entrada/importar-xml';
const CHAVE_XML = `POST ${XML_ROTA}`;
function rotaXml() {
    const bodyXml = express.text({ type: () => true, limit: '25mb' });
    return { metodo: 'POST', caminho: XML_ROTA, responder: (req, res, db) => bodyXml(req, res, (err) => {
        if (err) return res.status(400).json({ error: 'parser falhou' });
        db.recebidos = db.recebidos || [];
        db.recebidos.push({ tipo: typeof req.body, texto: req.body, marcadoAgente: req._agenteCorpoSha !== undefined });
        return res.status(201).json({ ok: true, bytes: Buffer.byteLength(String(req.body)), inicio: String(req.body).slice(0, 30) });
    }) };
}
/** Requisição crua: `chunked: true` manda SEM Content-Length (Transfer-Encoding: chunked), em pedaços. */
function cru(baseUrl, caminho, { headers = {}, corpo = '', chunked = false } = {}) {
    const { port } = new URL(baseUrl);
    return new Promise((resolve, reject) => {
        const h = { ...headers };
        if (!chunked) h['content-length'] = Buffer.byteLength(corpo);
        const rq = http.request({ host: '127.0.0.1', port, path: caminho, method: 'POST', headers: h }, (res) => {
            let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) { /* não-JSON */ } resolve({ status: res.statusCode, headers: res.headers, body: j }); });
        });
        rq.on('error', reject);
        if (chunked) { const b = Buffer.from(corpo); const meio = Math.floor(b.length / 2); rq.write(b.subarray(0, meio)); rq.end(b.subarray(meio)); } else rq.end(corpo);
    });
}
const xmlH = (c, k, tipo = 'text/xml') => ({ ...c.luke, 'content-type': tipo, 'idempotency-key': k });

test('XML: mesma chave + XML DIFERENTE do MESMO tamanho → 422 (não devolve o replay da outra nota); mesmo XML → replay', async () => {
    const { db, srv, c } = await comMatriz({ rotasExtras: [rotaXml()] });
    try {
        const A = '<nfe><numero>1001</numero><valor>10.00</valor></nfe>';
        const B = '<nfe><numero>2002</numero><valor>99.99</valor></nfe>';
        assert.equal(Buffer.byteLength(A), Buffer.byteLength(B), 'os dois XML têm exatamente o mesmo nº de bytes');
        const k = 'xml-mesmo-tamanho-0001';
        const a = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: A });
        assert.equal(a.status, 201, JSON.stringify(a.body));
        assert.equal(db.recebidos[0].tipo, 'string');
        assert.equal(db.recebidos[0].texto, A, 'a rota recebeu o XML inteiro, igual ao enviado');
        await new Promise((r) => setTimeout(r, 20));
        const b = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: B });
        assert.equal(b.status, 422, 'XML diferente com a mesma chave NÃO pode receber o replay do outro');
        assert.equal(b.body.codigo, 'AGENTE_IDEMPOTENCIA_CONFLITO');
        assert.equal(b.headers['idempotent-replay'], undefined);
        const a2 = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: A });
        assert.equal(a2.status, 201);
        assert.equal(a2.headers['idempotent-replay'], 'true');
        assert.deepEqual(a2.body, a.body);
        // o content-type diferente com o MESMO conteúdo é o mesmo pedido (o que conta é o conteúdo)
        const a3 = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k, 'application/xml; charset=utf-8'), corpo: A });
        assert.equal(a3.headers['idempotent-replay'], 'true');
        assert.equal(db.execucoes[CHAVE_XML], 1, 'a rota rodou uma vez só');
        // e o XML B, com chave própria, É importado (nada se perde em silêncio)
        const bOk = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, 'xml-mesmo-tamanho-0002'), corpo: B });
        assert.equal(bOk.status, 201);
        assert.equal(db.recebidos[1].texto, B);
        assert.equal(db.execucoes[CHAVE_XML], 2);
    } finally { await srv.close(); }
});

test('XML sem Content-Length (Transfer-Encoding: chunked): o conteúdo é lido e conferido do mesmo jeito; XML grande (150 KB) chega inteiro', async () => {
    const { db, srv, c } = await comMatriz({ rotasExtras: [rotaXml()] });
    try {
        const A = `<nfe><n>1</n>${'<item>abc</item>'.repeat(10000)}</nfe>`; // ~150 KB: acima do limite de 100 KB do JSON global
        const B = A.replace('<n>1</n>', '<n>2</n>');
        const k = 'xml-chunked-0001-abcd';
        const a = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: A, chunked: true });
        assert.equal(a.status, 201, JSON.stringify(a.body));
        assert.equal(a.body.bytes, Buffer.byteLength(A));
        assert.equal(db.recebidos[0].texto, A);
        await new Promise((r) => setTimeout(r, 20));
        const b = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: B, chunked: true });
        assert.equal(b.status, 422, 'sem Content-Length o tamanho não vira "0": corpos diferentes não colidem');
        const a2 = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: A, chunked: true });
        assert.equal(a2.headers['idempotent-replay'], 'true');
        // mesmo conteúdo, uma vez chunked e outra com Content-Length: é o mesmo pedido
        const a3 = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, k), corpo: A });
        assert.equal(a3.headers['idempotent-replay'], 'true');
        assert.equal(db.execucoes[CHAVE_XML], 1);
        // sem content-type nenhum (a rota real aceita qualquer tipo): também pelo conteúdo
        const semTipo = { ...c.luke, 'idempotency-key': 'xml-sem-tipo-0001-ab' };
        assert.equal((await cru(srv.baseUrl, XML_ROTA, { headers: semTipo, corpo: '<a>1</a>' })).status, 201);
        await new Promise((r) => setTimeout(r, 20));
        assert.equal((await cru(srv.baseUrl, XML_ROTA, { headers: semTipo, corpo: '<a>2</a>' })).status, 422);
        // corpo comprimido não é lido: recusa clara, a rota não roda
        const gz = await cru(srv.baseUrl, XML_ROTA, { headers: { ...xmlH(c, 'xml-gzip-0001-abcdef'), 'content-encoding': 'gzip' }, corpo: 'xxxx' });
        assert.equal(gz.status, 415);
        assert.equal(gz.body.codigo, 'AGENTE_IDEMPOTENCIA_CORPO');
        assert.equal(db.execucoes[CHAVE_XML], 2);
    } finally { await srv.close(); }
});

test('upload (multipart) do agente sem Content-Length → 411 AGENTE_IDEMPOTENCIA_SEM_TAMANHO; com tamanho, segue (tipo + tamanho)', async () => {
    const { db, srv, c, idemSvc } = await comMatriz();
    try {
        const corpoMp = '--x\r\nContent-Disposition: form-data; name="arquivo"; filename="a.pdf"\r\n\r\nconteudo\r\n--x--\r\n';
        const h = { ...c.luke, 'content-type': 'multipart/form-data; boundary=x', 'idempotency-key': 'upload-0001-abcdef' };
        const semTamanho = await cru(srv.baseUrl, `${CP}/${UUID}/anexos`, { headers: h, corpo: corpoMp, chunked: true });
        assert.equal(semTamanho.status, 411);
        assert.equal(semTamanho.body.codigo, 'AGENTE_IDEMPOTENCIA_SEM_TAMANHO');
        assert.equal(db.execucoes['POST /api/contas-pagar/:p/anexos'], undefined);
        assert.equal(db.idem.length, 0);
        const comTamanho = await cru(srv.baseUrl, `${CP}/${UUID}/anexos`, { headers: h, corpo: corpoMp });
        assert.equal(comTamanho.status, 201);
        assert.equal(db.execucoes['POST /api/contas-pagar/:p/anexos'], 1);
        // impressão digital do multipart continua tipo + tamanho (o arquivo só é lido pelo multer, dentro da rota)
        const req = (len) => ({ method: 'POST', originalUrl: '/api/x', headers: { 'content-type': 'multipart/form-data; boundary=y', 'content-length': String(len) }, body: {} });
        assert.equal(idemSvc.hashDoPedido(req(100)), idemSvc.hashDoPedido(req(100)));
        assert.notEqual(idemSvc.hashDoPedido(req(100)), idemSvc.hashDoPedido(req(101)));
    } finally { await srv.close(); }
});

test('HUMANO (JWT) em importar-xml: nada muda — sem chave, sem leitura antecipada do corpo, com ou sem Content-Length; matriz desligada idem', async () => {
    const { db, srv, c } = await comMatriz({ rotasExtras: [rotaXml()] });
    try {
        const A = '<nfe><numero>1001</numero></nfe>';
        const hh = { ...c.admin, 'content-type': 'text/xml' };
        for (const chunked of [false, true]) {
            const r = await cru(srv.baseUrl, XML_ROTA, { headers: hh, corpo: A, chunked });
            assert.equal(r.status, 201, `humano, chunked=${chunked}`);
        }
        // repetir o mesmo XML: humano não tem idempotência por chave — a rota roda de novo, como sempre
        assert.equal((await cru(srv.baseUrl, XML_ROTA, { headers: { ...hh, 'idempotency-key': 'chave-de-humano-0001' }, corpo: A })).status, 201);
        assert.equal(db.execucoes[CHAVE_XML], 3);
        assert.ok(db.recebidos.every((x) => x.tipo === 'string' && x.texto === A && x.marcadoAgente === false), 'quem leu o corpo foi o parser da rota');
        assert.equal(db.idem.length, 0);
        // agente com a matriz DESLIGADA: importar-xml volta a pedir autorização e o corpo cru não é lido pelo middleware
        await srv.request('POST', '/api/admin-exec/agente-matriz-desligar?confirmar=1');
        const ag = await cru(srv.baseUrl, XML_ROTA, { headers: xmlH(c, 'xml-sem-matriz-0001'), corpo: A });
        assert.equal(ag.status, 422, 'sem matriz: é PEDE, e corpo que não é JSON não entra na fila (comportamento antigo)');
        assert.equal(ag.body.codigo, 'AGENTE_SOLICITACAO_INVALIDA');
        assert.equal(db.execucoes[CHAVE_XML], 3);
    } finally { await srv.close(); }
});
