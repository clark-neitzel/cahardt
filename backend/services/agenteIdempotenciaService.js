// IDEMPOTÊNCIA das ESCRITAS feitas DIRETO pelo agente (matriz em SIM: criar e também editar/excluir/estornar/baixar
// quando o dono liberar).
//
// O agente refaz a chamada quando a rede cai — sem isto, 2 tentativas = 2 despesas (ou 2 baixas). Regra:
//  - header `Idempotency-Key` obrigatório (sem ele: 400 AGENTE_IDEMPOTENCIA_OBRIGATORIA, nada executa);
//  - a chave é consultada ANTES das guardas de segurança: repetição legítima de algo já feito devolve a resposta
//    guardada (`Idempotent-Replay: true`) sem reavaliar nada — senão a guarda de duplicata veria o registro que a
//    própria 1ª chamada criou e transformaria o retry em pedido de autorização (que, autorizado, duplicaria);
//  - 1ª vez (e as guardas deixaram passar): reserva a chave (linha EM_ANDAMENTO, única por agente+chave), deixa a rota
//    rodar e guarda o desfecho NA HORA em que a rota responde (não espera o cliente receber);
//  - mesma chave + pedido diferente (outra função, outro caminho, outro corpo): 422;
//  - mesma chave ainda em andamento: 409;
//  - desfecho INCERTO — a rota respondeu 5xx, ou ficou em andamento há mais de 10 min (servidor caiu no meio): 409
//    "indeterminada". O sistema NUNCA reexecuta sozinho nem repete um erro como se fosse resposta: o agente confere
//    pela leitura se o registro existe antes de usar uma chave nova;
//  - a rota RECUSOU (4xx): a chave é solta (nada foi feito; dá para corrigir e repetir).
// Só banco, sem `$transaction` (a reserva é um INSERT com chave única: dois pedidos simultâneos -> só um vence).
// Não vale para a execução de pedido autorizado (ticket) — aquele caminho tem a sua própria trava de uso único.
const crypto = require('crypto');
const prisma = require('../config/database');

const CABECALHO = 'idempotency-key';
const FORMATO_CHAVE = /^[\x21-\x7e]{8,200}$/; // 8 a 200 caracteres visíveis, sem espaço
const INDETERMINADA_MS = 10 * 60 * 1000;
const MAX_RESPOSTA_BYTES = 256 * 1024;
const VALIDADE_DIAS = 30;

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sha256Bytes = (b) => crypto.createHash('sha256').update(b).digest('hex');

function estavel(v) { // JSON com chaves ordenadas (hash estável do corpo)
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`;
}

const MAX_CORPO_CRU_BYTES = 25 * 1024 * 1024; // o mesmo teto do parser de XML da rota (routes/notasEntrada.js, bodyXml)

const tipoDe = (req) => String(req.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
const ehMultipart = (req) => tipoDe(req).startsWith('multipart/');
const temCorpo = (req) => Number(req.headers['content-length'] || 0) > 0 || (req.headers['transfer-encoding'] !== undefined && req.headers['transfer-encoding'] !== '');

/**
 * Corpo CRU (XML, texto — tudo que não é JSON nem upload): quando a política decide, nenhum parser leu o corpo ainda
 * (`req._body` não está marcado). Tipo + tamanho NÃO basta como impressão digital: dois XML diferentes com o mesmo
 * número de bytes colidiriam, e com `Transfer-Encoding: chunked` nem tamanho existe. Então o corpo é LIDO aqui,
 * vira sha256 do CONTEÚDO, e fica em `req.body` como texto com `req._body = true` — é a convenção do body-parser:
 * o `express.text` da rota vê que o corpo já foi lido e não tenta ler de novo (a rota recebe o mesmo texto de sempre).
 * Só roda para o AGENTE em escrita direta da matriz; requisição humana (JWT) nunca passa por aqui.
 * Devolve { ok: true } ou { ok: false, status, codigo, error }.
 */
function lerCorpoCru(req) {
    if (req._body === true || ehMultipart(req) || !temCorpo(req)) return Promise.resolve({ ok: true }); // já lido (JSON), upload, ou sem corpo
    const codificacao = String(req.headers['content-encoding'] || 'identity').toLowerCase();
    if (codificacao !== 'identity') {
        return Promise.resolve({ ok: false, status: 415, codigo: 'AGENTE_IDEMPOTENCIA_CORPO', error: 'Envie o corpo sem compressão (sem Content-Encoding).' });
    }
    if (Number(req.headers['content-length'] || 0) > MAX_CORPO_CRU_BYTES) {
        return Promise.resolve({ ok: false, status: 413, codigo: 'AGENTE_IDEMPOTENCIA_CORPO', error: 'Corpo maior que 25 MB.' });
    }
    return new Promise((resolve) => {
        const partes = []; let total = 0; let fim = false;
        const acabar = (r) => { if (fim) return; fim = true; req.removeListener('data', aoDado); req.removeListener('end', aoFim); req.removeListener('error', aoErro); req.removeListener('aborted', aoErro); resolve(r); };
        const aoDado = (c) => {
            total += c.length;
            if (total > MAX_CORPO_CRU_BYTES) { req.resume(); acabar({ ok: false, status: 413, codigo: 'AGENTE_IDEMPOTENCIA_CORPO', error: 'Corpo maior que 25 MB.' }); return; }
            partes.push(c);
        };
        const aoFim = () => {
            const bruto = Buffer.concat(partes);
            const charset = (/charset=([^;]+)/i.exec(String(req.headers['content-type'] || '')) || [])[1];
            const latin1 = /^("?)(iso-8859-1|latin1)\1$/i.test(String(charset || '').trim());
            req._agenteCorpoSha = sha256Bytes(bruto);
            req.body = bruto.toString(latin1 ? 'latin1' : 'utf8');
            req._body = true; // body-parser: "corpo já lido" -> o parser da rota não lê de novo
            acabar({ ok: true });
        };
        const aoErro = () => acabar({ ok: false, status: 400, codigo: 'AGENTE_IDEMPOTENCIA_CORPO', error: 'Não foi possível ler o corpo da requisição.' });
        req.on('data', aoDado); req.on('end', aoFim); req.on('error', aoErro); req.on('aborted', aoErro);
    });
}

/**
 * Impressão digital do pedido: método + caminho concreto + query + corpo.
 *  - JSON (lido pelo express.json): o conteúdo, com as chaves ordenadas;
 *  - corpo cru (XML/texto): sha256 do CONTEÚDO (calculado por `lerCorpoCru`);
 *  - upload multipart: tipo + tamanho do envio (o arquivo só é lido pelo multer, dentro da rota). LIMITAÇÃO: dois
 *    uploads diferentes com exatamente o mesmo número de bytes e a mesma chave são tratados como o mesmo pedido.
 */
function hashDoPedido(req) {
    const url = String(req.originalUrl || '').split('#')[0];
    let corpo;
    if (req._agenteCorpoSha) corpo = `cru|${req._agenteCorpoSha}`;
    else if (ehMultipart(req)) corpo = `multipart|${String(req.headers['content-length'] || '')}`;
    else corpo = estavel(req.body === undefined ? null : req.body);
    return sha256(`${String(req.method || '').toUpperCase()} ${url}|${corpo}`);
}

function lerChave(req) {
    const bruto = req.headers[CABECALHO];
    if (bruto === undefined || bruto === null || String(bruto).trim() === '') return { ok: false, motivo: 'ausente' };
    const chave = String(bruto).trim();
    if (!FORMATO_CHAVE.test(chave) || /cah_ag_/i.test(chave)) return { ok: false, motivo: 'invalida' };
    return { ok: true, chave };
}

const SELECT_LINHA = { id: true, funcao: true, corpoHash: true, status: true, respostaStatus: true, resposta: true, criadoEm: true };

/** Situação de uma linha já existente frente ao pedido atual. */
function situacao(linha, { funcao, corpoHash }) {
    if (linha.funcao !== funcao || linha.corpoHash !== corpoHash) return { tipo: 'CONFLITO' };
    if (linha.status === 'CONCLUIDA') return { tipo: 'REPLAY', respostaStatus: linha.respostaStatus || 200, resposta: linha.resposta === undefined ? null : linha.resposta };
    if (linha.status === 'INDETERMINADA') return { tipo: 'INDETERMINADA' };
    if (Date.now() - new Date(linha.criadoEm).getTime() > INDETERMINADA_MS) return { tipo: 'INDETERMINADA' };
    return { tipo: 'EM_ANDAMENTO' };
}

/** Só LÊ: { tipo: 'LIVRE' } se a chave nunca foi usada; senão REPLAY | CONFLITO | EM_ANDAMENTO | INDETERMINADA. */
async function consultar({ vendedorId, chave, funcao, corpoHash }) {
    const linha = await prisma.agenteIdempotencia.findUnique({ where: { vendedorId_chave: { vendedorId, chave } }, select: SELECT_LINHA });
    return linha ? situacao(linha, { funcao, corpoHash }) : { tipo: 'LIVRE' };
}

/** Reserva a chave. Devolve { tipo: 'NOVA', id } | REPLAY | CONFLITO | EM_ANDAMENTO | INDETERMINADA. */
async function iniciar({ vendedorId, chave, funcao, corpoHash }) {
    try {
        const linha = await prisma.agenteIdempotencia.create({
            data: { vendedorId, chave, funcao, corpoHash, status: 'EM_ANDAMENTO' },
            select: { id: true },
        });
        return { tipo: 'NOVA', id: linha.id };
    } catch (e) {
        if (!e || e.code !== 'P2002') throw e;
    }
    // outra chamada reservou entre a consulta e o insert
    const r = await consultar({ vendedorId, chave, funcao, corpoHash });
    return r.tipo === 'LIVRE' ? { tipo: 'EM_ANDAMENTO' } : r; // sumiu no meio (descartada agora): o agente tenta de novo
}

/** Guarda o desfecho de sucesso. Nunca lança (a operação principal já foi feita). */
async function concluir(id, respostaStatus, corpo) {
    try {
        let resposta = null;
        if (corpo !== undefined) {
            let serial = null;
            try { serial = JSON.stringify(corpo); } catch (_) { serial = null; }
            // resposta grande demais ou com cara de token: não guarda o corpo (a repetição devolve só o aviso)
            if (serial && Buffer.byteLength(serial) <= MAX_RESPOSTA_BYTES && !/cah_ag_/i.test(serial)) resposta = JSON.parse(serial);
        }
        await prisma.agenteIdempotencia.update({
            where: { id },
            data: { status: 'CONCLUIDA', respostaStatus, resposta: resposta === null ? undefined : resposta },
        });
    } catch (e) {
        console.error('[AgenteIdempotencia] falha ao guardar a resposta (a operação já foi feita; a chave fica EM_ANDAMENTO):', e && e.message);
    }
}

/** A rota respondeu 5xx: pode ter gravado pela metade. Marca como INDETERMINADA (nunca repete o erro como resposta). Nunca lança. */
async function marcarIndeterminada(id, respostaStatus) {
    try { await prisma.agenteIdempotencia.update({ where: { id }, data: { status: 'INDETERMINADA', respostaStatus } }); }
    catch (e) { console.error('[AgenteIdempotencia] falha ao marcar a chave como indeterminada (fica EM_ANDAMENTO):', e && e.message); }
}

/** A rota RECUSOU (4xx) sem fazer nada: solta a chave para o agente corrigir e tentar de novo. Nunca lança. */
async function descartar(id) {
    try { await prisma.agenteIdempotencia.deleteMany({ where: { id, status: 'EM_ANDAMENTO' } }); }
    catch (e) { console.error('[AgenteIdempotencia] falha ao soltar a chave:', e && e.message); }
}

const ORIENTACAO = 'Envie o header Idempotency-Key com um valor único por operação (ex.: um UUID). Para REPETIR a mesma operação depois de uma falha de rede, mande a MESMA chave com o MESMO corpo.';

/** Responde conforme a situação de uma chave já usada. Devolve true se respondeu. */
function responderSituacao(res, r) {
    if (r.tipo === 'REPLAY') {
        if (typeof res.set === 'function') res.set('Idempotent-Replay', 'true');
        res.status(r.respostaStatus).json(r.resposta !== null ? r.resposta : {
            codigo: 'AGENTE_IDEMPOTENCIA_REPETIDA', repetida: true, respostaOriginalOmitida: true,
            orientacao: 'Esta operação já foi feita com esta chave; a resposta original não foi guardada (grande demais). Consulte o registro pela rota de leitura.',
        });
        return true;
    }
    if (r.tipo === 'CONFLITO') {
        res.status(422).json({ error: 'Esta Idempotency-Key já foi usada com outro pedido (função, caminho ou corpo diferentes).', codigo: 'AGENTE_IDEMPOTENCIA_CONFLITO', orientacao: 'Use uma chave nova para uma operação nova.' });
        return true;
    }
    if (r.tipo === 'EM_ANDAMENTO') {
        res.status(409).json({ error: 'Uma chamada com esta Idempotency-Key ainda está em andamento.', codigo: 'AGENTE_IDEMPOTENCIA_EM_ANDAMENTO', orientacao: 'Aguarde alguns segundos e repita com a MESMA chave.' });
        return true;
    }
    if (r.tipo === 'INDETERMINADA') {
        res.status(409).json({
            error: 'A chamada anterior com esta Idempotency-Key teve desfecho incerto (erro do servidor ou queda no meio). O sistema não repete sozinho.',
            codigo: 'AGENTE_IDEMPOTENCIA_INDETERMINADA',
            orientacao: 'Confira pela rota de leitura se a operação foi feita. Só se NÃO foi, repita com uma chave NOVA.',
        });
        return true;
    }
    return false;
}

/**
 * FASE 1 (antes das guardas): exige o header e consulta a chave — sem reservar nada.
 * Devolve { respondeu: true } (400 / replay / 422 / 409) ou { respondeu: false, vendedorId, funcao, chave, corpoHash }.
 */
async function preparar(req, res, { vendedorId, funcao }) {
    const lida = lerChave(req);
    if (!lida.ok) {
        res.status(400).json({
            error: lida.motivo === 'ausente' ? 'Escrita direta pelo agente exige o header Idempotency-Key.' : 'Idempotency-Key inválida (8 a 200 caracteres visíveis, sem espaço).',
            codigo: 'AGENTE_IDEMPOTENCIA_OBRIGATORIA', chave: funcao, orientacao: ORIENTACAO,
        });
        return { respondeu: true };
    }
    // upload sem Content-Length (chunked): não há tamanho para a impressão digital -> recusa em vez de usar "0" (tudo colidiria)
    if (ehMultipart(req) && !(Number(req.headers['content-length'] || 0) > 0)) {
        res.status(411).json({
            error: 'Upload pelo agente precisa do header Content-Length (não use Transfer-Encoding: chunked).', codigo: 'AGENTE_IDEMPOTENCIA_SEM_TAMANHO',
            orientacao: 'Envie o arquivo com o tamanho declarado (Content-Length).',
        });
        return { respondeu: true };
    }
    const cru = await lerCorpoCru(req); // XML/texto: lê o corpo para a impressão digital ser do CONTEÚDO
    if (!cru.ok) {
        res.status(cru.status).json({ error: cru.error, codigo: cru.codigo });
        return { respondeu: true };
    }
    const pedido = { vendedorId, funcao, chave: lida.chave, corpoHash: hashDoPedido(req) };
    if (responderSituacao(res, await consultar(pedido))) return { respondeu: true };
    return { respondeu: false, ...pedido };
}

/**
 * FASE 2 (as guardas deixaram passar): reserva a chave e instala a captura do desfecho.
 * Devolve true se JÁ respondeu (outra chamada reservou no meio) — a rota não deve rodar.
 */
async function reservar(req, res, pedido) {
    const r = await iniciar(pedido);
    if (r.tipo !== 'NOVA') return responderSituacao(res, r);
    if (typeof res.json !== 'function') return false; // `res` de mentira (proxy interno): sem captura; a chave fica reservada
    // O desfecho é gravado QUANDO A ROTA RESPONDE (res.json / res.send), com o status que ela definiu — não depende
    // de o cliente receber: se a conexão cair, a chave não fica presa em andamento. `finish` é só rede de segurança.
    let finalizou = false;
    const finalizar = (corpo) => {
        if (finalizou) return;
        finalizou = true;
        const st = res.statusCode;
        if (st >= 500) marcarIndeterminada(r.id, st);
        else if (st >= 400) descartar(r.id);
        else concluir(r.id, st, corpo);
    };
    const jsonOriginal = res.json.bind(res);
    res.json = (b) => { finalizar(b); return jsonOriginal(b); };
    if (typeof res.send === 'function') {
        const sendOriginal = res.send.bind(res);
        res.send = (b) => { finalizar(undefined); return sendOriginal(b); }; // resposta que não é JSON: guarda só o status
    }
    if (typeof res.on === 'function') res.on('finish', () => finalizar(undefined));
    return false;
}

/** As duas fases de uma vez (uso direto/testes). Devolve true se já respondeu. */
async function interceptar(req, res, alvo) {
    const p = await preparar(req, res, alvo);
    if (p.respondeu) return true;
    return reservar(req, res, p);
}

/** Scheduler: apaga linhas com mais de 30 dias. Devolve quantas apagou. */
async function limparAntigas() {
    const limite = new Date(Date.now() - VALIDADE_DIAS * 24 * 60 * 60 * 1000);
    const r = await prisma.agenteIdempotencia.deleteMany({ where: { criadoEm: { lt: limite } } });
    return r.count;
}

module.exports = { lerCorpoCru, MAX_CORPO_CRU_BYTES, interceptar, preparar, reservar, consultar, iniciar, concluir, descartar, marcarIndeterminada, limparAntigas, lerChave, hashDoPedido, CABECALHO, INDETERMINADA_MS, VALIDADE_DIAS, MAX_RESPOSTA_BYTES };
