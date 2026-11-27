// Fila de SOLICITAÇÕES do agente (PR-B).
//
// Fluxo: função com política PEDE -> o authMiddleware NÃO executa; guarda o pedido (criarOuReaproveitar) e responde 202.
// O dono (admin humano) AUTORIZA -> o sistema executa a chamada guardada COMO o usuário do agente, por LOOPBACK HTTP
// (pelo pipeline real do Express: mesmas validações e permissões da rota), com um TICKET de uso único; ou RECUSA.
//
// Regras que NÃO podem quebrar:
//  - a execução é uma chamada de rede -> NUNCA dentro de `$transaction`; aqui nem há transação: a reivindicação é um
//    `updateMany ... where status=...` atômico (duplo clique -> só um vence);
//  - o ticket (cah_ag_exec_...) só existe em memória e no header da chamada local; no banco fica o SHA-256;
//  - nada de token/ticket/hash em log, AuditLog ou resposta; corpo e resultado só aparecem REDIGIDOS;
//  - NUNCA reexecuta sozinho: timeout/queda no meio = ERRO_INDETERMINADO e o dono decide (repetir);
//  - tudo durável no banco (multi-instância): a varredura do scheduler só olha o banco.
const crypto = require('crypto');
const http = require('http');
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const politica = require('./agentePoliticaService');
const catalogo = require('./agenteCatalogoRotas');
const { rotuloDe } = require('../config/agenteRotulos');
const { lerAntes, temAntes } = require('../config/agenteAntes');
const { telaDestino } = require('../config/agenteTelas');

const PREFIXO_TICKET = 'cah_ag_exec_';
const STATUS = ['PENDENTE', 'EXECUTANDO', 'AUTORIZADA', 'RECUSADA', 'ERRO', 'ERRO_INDETERMINADO', 'EXPIRADA'];
const VALIDADE_MS = 72 * 60 * 60 * 1000;          // pedido pendente vale 72 h
const TICKET_VALIDADE_MS = 2 * 60 * 1000;         // o ticket tem que ser usado até 2 min depois de emitido
const REPETIR_APOS_MS = 5 * 60 * 1000;            // só dá para repetir depois disto desde o início da execução (a 1ª ainda pode estar rodando)
const INDETERMINADO_MS = 5 * 60 * 1000;           // EXECUTANDO há mais que isto: o servidor caiu no meio -> ERRO_INDETERMINADO
const EXEC_TIMEOUT_MS = 90 * 1000;                // a chamada local desiste (e vira ERRO_INDETERMINADO) após isto
const TETO_PENDENTES = 200;                       // por agente
const MAX_BODY_BYTES = 100 * 1024;
const MAX_RESULTADO_BYTES = 16 * 1024;
const MAX_RESPOSTA_BYTES = 1024 * 1024;           // o que lemos da resposta local (resto é descartado)
const MAX_QUERY = 2000;
const MAX_IDS = 20;
const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const METODOS_COM_CORPO = ['POST', 'PUT', 'PATCH'];
const ERRO_FINAL = ['ERRO', 'ERRO_INDETERMINADO'];
const AVISO_REPETIR = 'As rotas do sistema ainda NÃO leem a Idempotency-Key: repetir uma CRIAÇÃO pode duplicar o registro. Confira a tela de destino (o efeito pode já existir) antes de repetir.';
const AVISO_5XX = 'a rota pode ter executado parcialmente: confira a tela de destino antes de pedir de novo.';
const ROTA_TELA_SOLICITACOES = '/admin/agentes/solicitacoes'; // onde o selo/bloco "Solicitações do Luke" leva

function erro(status, msg, codigo, extra) {
    const e = new Error(msg);
    e.status = status;
    if (codigo) e.codigo = codigo;
    if (extra) e.extra = extra;
    return e;
}

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// ───────────────────────── redação de segredos ─────────────────────────
const CHAVE_SENSIVEL = /senha|password|passwd|token|secret|authorization|api[-_]?key|credencia|cookie|segredo/i;
const OCULTO = '[oculto]';

/** Cópia do valor sem campos sensíveis (por NOME de campo) e sem qualquer texto com cah_ag_. Profundidade e tamanho limitados. */
function redigir(v, nivel = 0) {
    if (v == null) return v;
    if (nivel > LIM.profundidade) return OCULTO;
    if (typeof v === 'string') {
        if (/cah_ag_/i.test(v)) return OCULTO;
        return v.length > LIM.texto ? `${v.slice(0, LIM.texto)}…` : v;
    }
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.slice(0, LIM.itens).map((x) => redigir(x, nivel + 1));
    const o = {};
    for (const k of Object.keys(v).slice(0, LIM.chaves)) {
        const val = CHAVE_SENSIVEL.test(k) ? OCULTO : redigir(v[k], nivel + 1);
        // `o['__proto__'] = x` TROCARIA o protótipo (e a chave sumiria da exibição): grava como propriedade própria
        if (k === '__proto__') Object.defineProperty(o, k, { value: val, enumerable: true, writable: true, configurable: true });
        else o[k] = val;
    }
    return o;
}

// Limites de EXIBIÇÃO de `redigir` (o dono só revê o que aparece): corpo que os excede é recusado no pedido.
const LIM = { profundidade: 8, itens: 500, chaves: 500, texto: 2000 };

/** true se o corpo seria cortado/ocultado ao exibir (então o dono não conseguiria revisar tudo o que será executado). */
function excedeLimitesDeExibicao(v, nivel = 0) {
    if (v == null) return false;
    if (nivel > LIM.profundidade) return true;
    if (typeof v === 'string') return v.length > LIM.texto;
    if (typeof v !== 'object') return false;
    if (Array.isArray(v)) return v.length > LIM.itens || v.some((x) => excedeLimitesDeExibicao(x, nivel + 1));
    const ks = Object.keys(v);
    return ks.length > LIM.chaves || ks.some((k) => excedeLimitesDeExibicao(v[k], nivel + 1));
}

/** Query string para EXIBIR: sem '?', campos sensíveis ocultos, ou null se vazia. */
function redigirQuery(q) {
    const t = String(q || '').replace(/^\?/, '');
    if (!t) return null;
    const partes = t.split('&').filter(Boolean).map((par) => {
        const i = par.indexOf('=');
        const k = i === -1 ? par : par.slice(0, i);
        const v = i === -1 ? null : par.slice(i + 1);
        let kd = k; try { kd = decodeURIComponent(k); } catch (_) { /* usa cru */ }
        if (CHAVE_SENSIVEL.test(kd) || CHAVE_SENSIVEL.test(k)) return `${k}=${OCULTO}`;
        let vd = v; try { vd = v === null ? null : decodeURIComponent(v); } catch (_) { vd = v; }
        if (vd !== null && /cah_ag_/i.test(vd)) return `${k}=${OCULTO}`;
        return v === null ? k : `${k}=${v}`;
    });
    const r = partes.join('&');
    return r.length > 500 ? `${r.slice(0, 500)}…` : r;
}

function estavel(v) { // JSON com chaves ordenadas (hash estável do corpo)
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`;
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${estavel(v[k])}`).join(',')}}`;
}

function iguais(a, b) { return estavel(a) === estavel(b); }

// ───────────────────────── resumo legível ─────────────────────────
const CAMPOS_RESUMO = [
    ['descricao', 'descrição'], ['descrição', 'descrição'], ['nome', 'nome'], ['razaoSocial', 'razão social'], ['nomeFantasia', 'fantasia'],
    ['fornecedor', 'fornecedor'], ['fornecedorNome', 'fornecedor'], ['valor', 'valor'], ['valorTotal', 'valor'], ['total', 'total'],
    ['vencimento', 'vencimento'], ['dataVencimento', 'vencimento'], ['numeroNota', 'nota'], ['motivo', 'motivo'], ['observacao', 'obs.'],
];

function textoCampo(v) {
    if (v == null) return null;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80);
    return null;
}

function resumoDe(chave, metodo, caminho, body, query) {
    const base = rotuloDe(chave) || `${metodo} ${caminho}`;
    const partes = [];
    const usados = new Set();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
        for (const [campo, rotulo] of CAMPOS_RESUMO) {
            if (partes.length >= 4) break;
            if (usados.has(rotulo) || CHAVE_SENSIVEL.test(campo)) continue;
            const t = textoCampo(body[campo]);
            if (t && !/cah_ag_/i.test(t)) { partes.push(`${rotulo}: ${t}`); usados.add(rotulo); }
        }
    }
    const q = redigirQuery(query);
    if (q) partes.push(`consulta: ${q.slice(0, 120)}`);
    return (partes.length ? `${base} — ${partes.join(' · ')}` : base).slice(0, 300);
}

// ───────────────────────── ids do resultado ─────────────────────────
const CAMPO_ID = /^(id|numero|.+Id)$/;

/** Campos `id` / `*Id` / `numero` do resultado, até 2 níveis dentro do objeto raiz, no máximo MAX_IDS. Chave = caminho pontuado. */
function extrairIds(res) {
    const ids = {};
    let n = 0;
    function andar(v, prefixo, nivel) {
        if (n >= MAX_IDS || v == null || typeof v !== 'object') return;
        const entradas = Array.isArray(v) ? v.slice(0, MAX_IDS).map((x, i) => [String(i), x]) : Object.entries(v);
        for (const [k, x] of entradas) {
            if (n >= MAX_IDS) return;
            const caminho = prefixo ? `${prefixo}.${k}` : k;
            if (CAMPO_ID.test(k) && (typeof x === 'string' || typeof x === 'number') && !CHAVE_SENSIVEL.test(k)) { ids[caminho] = x; n += 1; }
            else if (x && typeof x === 'object' && nivel < 2) andar(x, caminho, nivel + 1);
        }
    }
    andar(res, '', 0);
    return ids;
}

// ───────────────────────── validação do pedido (no authMiddleware) ─────────────────────────
/** Lê a requisição do agente e devolve { ok:true, ... } ou { ok:false, motivo }. NUNCA lança. */
function lerPedido(req) {
    const metodo = String(req.method || '').toUpperCase();
    if (!METODOS.includes(metodo)) return { ok: false, motivo: `Método ${metodo} não pode ser pedido para autorização.` };
    const tipo = String(req.headers['content-type'] || '').toLowerCase();
    if (tipo.startsWith('multipart/')) return { ok: false, motivo: 'Pedidos com arquivo/anexo (multipart) não entram na fila de autorização. Envie sem o arquivo ou peça ao dono para anexar na tela.' };
    const tamanho = Number(req.headers['content-length'] || 0);
    if (tamanho > MAX_BODY_BYTES) return { ok: false, motivo: 'Corpo maior que 100 KB não entra na fila de autorização.' };
    const bruto = String(req.originalUrl || '');
    const i = bruto.indexOf('?');
    const caminho = (i === -1 ? bruto : bruto.slice(0, i)).split('#')[0];
    const query = i === -1 ? '' : bruto.slice(i + 1).split('#')[0];
    if (query.length > MAX_QUERY) return { ok: false, motivo: 'Parâmetros de URL grandes demais para a fila de autorização.' };
    let body = req.body;
    const temCorpo = tamanho > 0 || (req.headers['transfer-encoding'] || '') !== '';
    if (temCorpo && !tipo.includes('json')) return { ok: false, motivo: 'Só corpo JSON (application/json) entra na fila de autorização.' };
    if (temCorpo && body === undefined) return { ok: false, motivo: 'O corpo desta requisição não pôde ser lido para guardar o pedido.' };
    if (body !== null && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0) body = null;
    if (body !== undefined && body !== null && typeof body !== 'object') return { ok: false, motivo: 'Corpo inválido: envie um objeto ou lista JSON.' };
    if (body === undefined) body = null;
    if (body !== null && !METODOS_COM_CORPO.includes(metodo) && metodo !== 'DELETE') body = null; // GET não leva corpo
    let serial = '';
    try { serial = body === null ? '' : JSON.stringify(body); } catch (_) { return { ok: false, motivo: 'Corpo não serializável.' }; }
    if (Buffer.byteLength(serial) > MAX_BODY_BYTES) return { ok: false, motivo: 'Corpo maior que 100 KB não entra na fila de autorização.' };
    if (body !== null && excedeLimitesDeExibicao(body)) return { ok: false, motivo: 'Corpo grande demais para o dono revisar (limites: 500 itens por lista, 500 campos por objeto, 2000 caracteres por texto, 8 níveis). Divida em pedidos menores.' };
    if (/cah_ag_/i.test(serial) || /cah_ag_/i.test(query)) return { ok: false, motivo: 'O pedido contém um token de agente no corpo ou nos parâmetros; remova-o.' };
    return { ok: true, metodo, caminho, query, body, corpoHash: sha256(estavel(body)) };
}

// ───────────────────────── criação ─────────────────────────
const ORIENTACAO = 'O sistema NÃO executou esta ação: ela foi guardada e aguarda a autorização do dono. Consulte o andamento em `consulta`; ao ser AUTORIZADA, `resultado` e `idsResultado` trazem o que a rota devolveu. Não repita o pedido enquanto estiver PENDENTE.';

function resposta202(s, duplicada) {
    return {
        codigo: 'AGENTE_PEDE_AUTORIZACAO', status: s.status, solicitacaoId: s.id, resumo: s.resumo,
        consulta: `/api/agente/v1/solicitacoes/${s.id}`, expiraEm: s.expiraEm, duplicada: duplicada === true,
        orientacao: ORIENTACAO,
    };
}

/**
 * Guarda o pedido (ou devolve o PENDENTE idêntico que já existe). `pedido` = retorno de lerPedido; `decisao` = politica.avaliar.
 * Devolve { solicitacao, duplicada }. Lança erro(429) no teto de pendentes.
 */
async function criarOuReaproveitar({ pedido, decisao, vendedor, tokenPrefixo }) {
    const filtroIgual = () => ({
        agenteId: vendedor.id, status: 'PENDENTE', chave: decisao.chave, caminho: pedido.caminho, query: pedido.query,
        corpoHash: pedido.corpoHash, expiraEm: { gt: new Date() },
    });
    // caminho rápido (sem lock): pedido idêntico já pendente
    const existente = await prisma.agenteSolicitacao.findFirst({ where: filtroIgual() });
    if (existente) return { solicitacao: existente, duplicada: true };
    let antes = null;
    if (temAntes(decisao.chave)) {
        try { antes = await lerAntes(decisao.chave, pedido.caminho); }
        catch (e) { console.error('[AgenteSolicitacao] falha ao ler o "antes" (segue sem ele):', e.message); }
    }
    const id = crypto.randomUUID();
    // Só banco aqui dentro. O lock (por agente, até o fim da transação) serializa pedidos simultâneos do mesmo agente:
    // dois pedidos idênticos em paralelo viram UMA solicitação e o teto de pendentes não estoura por corrida.
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agente-solicitacao|${vendedor.id}`}))`;
        const ja = await tx.agenteSolicitacao.findFirst({ where: filtroIgual() });
        if (ja) return { solicitacao: ja, duplicada: true };
        const pendentes = await tx.agenteSolicitacao.count({ where: { agenteId: vendedor.id, status: 'PENDENTE', expiraEm: { gt: new Date() } } });
        if (pendentes >= TETO_PENDENTES) {
            throw erro(429, `Há ${pendentes} solicitações pendentes deste agente (teto ${TETO_PENDENTES}). Aguarde o dono decidir antes de pedir mais.`, 'AGENTE_SOLICITACOES_EXCESSO');
        }
        const solicitacao = await tx.agenteSolicitacao.create({
            data: {
                id, agenteId: vendedor.id, agenteNome: vendedor.nome || 'agente', tokenPrefixo: tokenPrefixo || null,
                metodo: pedido.metodo, caminho: pedido.caminho, query: pedido.query, chave: decisao.chave,
                body: pedido.body === null ? undefined : pedido.body, corpoHash: pedido.corpoHash,
                // guarda da matriz rebaixou um SIM para PEDE: o motivo vai DEPOIS da descrição, com limite próprio
                // (a descrição do pedido nunca é cortada por causa dele; a coluna é texto livre)
                resumo: resumoDe(decisao.chave, pedido.metodo, pedido.caminho, pedido.body, pedido.query)
                    .concat(decisao.motivoGuarda ? ` [Pede por segurança: ${String(decisao.motivoGuarda).slice(0, 220)}]` : ''),
                antes: antes === null ? undefined : antes,
                status: 'PENDENTE', expiraEm: new Date(Date.now() + VALIDADE_MS), idempotencyKey: `sol-${id}`,
            },
        });
        return { solicitacao, duplicada: false };
    }, { timeout: 20000, maxWait: 10000 });
}

// ───────────────────────── auditoria (fora do fluxo principal) ─────────────────────────
async function auditar(acao, solicitacao, ator, extra) {
    try {
        await prisma.auditLog.create({
            data: {
                acao, entidade: 'AgenteSolicitacao', entidadeId: String(solicitacao.id),
                detalhes: JSON.stringify({
                    solicitacaoId: solicitacao.id, agenteId: solicitacao.agenteId, agenteNome: solicitacao.agenteNome,
                    metodo: solicitacao.metodo, caminho: String(solicitacao.caminho || '').slice(0, 300), chave: solicitacao.chave,
                    corpoHash: solicitacao.corpoHash, ...(extra || {}),
                }),
                usuarioId: String(ator?.id || solicitacao.agenteId), usuarioNome: String(ator?.nome || solicitacao.agenteNome || 'agente'),
            },
        });
    } catch (e) {
        console.error(`[AgenteSolicitacao] falha ao gravar auditoria ${acao} (operação já efetivada):`, e.message);
    }
}

// ───────────────────────── item (contrato com o frontend) ─────────────────────────
function paraItem(s, { agora } = {}) {
    const familia = catalogo.familiaDe(String(s.chave || '').split(' ')[1] || s.caminho);
    const body = redigir(s.body === undefined ? null : s.body);
    const item = {
        id: s.id, agenteId: s.agenteId, agenteNome: s.agenteNome, metodo: s.metodo, caminho: s.caminho,
        chave: s.chave, rotulo: rotuloDe(s.chave), resumo: s.resumo, body,
        query: redigirQuery(s.query), bodyTruncado: false, // pedido que excederia a exibição é recusado na entrada (422)
        status: s.status, expiraEm: s.expiraEm, createdAt: s.createdAt,
        decididoPorNome: s.decididoPorNome || null, decididoEm: s.decididoEm || null, observacaoDecisao: s.observacaoDecisao || null,
        resultadoStatus: s.resultadoStatus == null ? null : s.resultadoStatus,
        resultado: redigir(s.resultado === undefined ? null : s.resultado),
        idsResultado: s.idsResultado === undefined ? null : s.idsResultado,
        telaDestino: telaDestino(familia, body),
        antes: s.antes === undefined ? null : s.antes,
        mudouDesdePedido: null,
        possivelDuplicata: false,
        // botão "Repetir" só vale a partir daqui (início da execução + 5 min); null fora de ERRO_INDETERMINADO
        repetirLiberaEm: s.status === 'ERRO_INDETERMINADO' && s.execComecouEm ? new Date(new Date(s.execComecouEm).getTime() + REPETIR_APOS_MS).toISOString() : null,
        repetidoPorNome: s.repetidoPorNome || null, repetidoEm: s.repetidoEm || null,
    };
    if (ERRO_FINAL.includes(s.status)) {
        const r = item.resultado;
        item.mensagemErro = (r && typeof r === 'object' && (r.error || r.erro || r.mensagem || r.message)) ? String(r.error || r.erro || r.mensagem || r.message).slice(0, 500) : null;
    }
    if (agora !== undefined) { // calculado pelo chamador (PENDENTE com "antes" registrado)
        item.mudouDesdePedido = agora.mudou;
        if (agora.mudou) item.agora = agora.valor;
    }
    return item;
}

/** Para PENDENTE com "antes": refaz a foto e compara. Devolve { mudou, valor } ou undefined (sem comparação). */
async function compararAntes(s) {
    if (s.status !== 'PENDENTE' || s.antes == null || !temAntes(s.chave)) return undefined;
    let valor = null;
    try { valor = await lerAntes(s.chave, s.caminho); }
    catch (e) { console.error('[AgenteSolicitacao] falha ao refazer o "antes":', e.message); return undefined; }
    return { mudou: !iguais(s.antes, valor), valor };
}

/** Existe OUTRA solicitação idêntica (mesmo agente+função+caminho+corpo) PENDENTE ou AUTORIZADA nas últimas 24 h? */
async function temDuplicata(s) {
    if (s.status !== 'PENDENTE' || !s.corpoHash) return false;
    try {
        const outra = await prisma.agenteSolicitacao.findFirst({
            where: {
                id: { not: s.id }, agenteId: s.agenteId, chave: s.chave, caminho: s.caminho, corpoHash: s.corpoHash,
                OR: [{ status: 'PENDENTE' }, { status: 'AUTORIZADA', updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }],
            },
            select: { id: true },
        });
        return !!outra;
    } catch (e) {
        console.error('[AgenteSolicitacao] falha ao checar duplicata (segue sem o aviso):', e.message);
        return false;
    }
}

async function comAntes(s) {
    const [agora, dup] = await Promise.all([compararAntes(s), temDuplicata(s)]);
    const item = paraItem(s, { agora });
    item.possivelDuplicata = dup;
    return item;
}

// ───────────────────────── leitura (admin) ─────────────────────────
async function expirarVencidas() {
    const r = await prisma.agenteSolicitacao.updateMany({
        where: { status: 'PENDENTE', expiraEm: { lte: new Date() } },
        data: { status: 'EXPIRADA' },
    });
    return r.count;
}

async function marcarIndeterminadas() {
    const r = await prisma.agenteSolicitacao.updateMany({
        where: { status: 'EXECUTANDO', execComecouEm: { lt: new Date(Date.now() - INDETERMINADO_MS) } },
        data: { status: 'ERRO_INDETERMINADO', execHash: null, resultado: { error: 'A execução não terminou (o servidor reiniciou ou a resposta se perdeu). Confira na tela de destino se o efeito aconteceu antes de repetir.' } },
    });
    return r.count;
}

async function varredura() {
    const expiradas = await expirarVencidas();
    const indeterminadas = await marcarIndeterminadas();
    return { expiradas, indeterminadas };
}

function paginar({ page, limit }) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    return { page: pg, limit: lim, skip: (pg - 1) * lim };
}

async function listar({ status, agenteId, page, limit } = {}) {
    const st = status ? String(status).toUpperCase() : null;
    if (st && !STATUS.includes(st)) throw erro(400, `status deve ser um de: ${STATUS.join(', ')}.`);
    await expirarVencidas();
    const where = {};
    if (st) where.status = st;
    if (agenteId) where.agenteId = String(agenteId);
    const p = paginar({ page, limit });
    const [total, linhas] = await Promise.all([
        prisma.agenteSolicitacao.count({ where }),
        prisma.agenteSolicitacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    return { page: p.page, limit: p.limit, total, data: await Promise.all(linhas.map(comAntes)) };
}

async function contagem() {
    await expirarVencidas();
    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [pendentes, indeterminadas, erros] = await Promise.all([
        prisma.agenteSolicitacao.count({ where: { status: 'PENDENTE' } }),
        prisma.agenteSolicitacao.count({ where: { status: 'ERRO_INDETERMINADO' } }),
        prisma.agenteSolicitacao.count({ where: { status: 'ERRO', updatedAt: { gte: desde } } }),
    ]);
    return { pendentes, comErro: indeterminadas + erros };
}

async function obter(id) {
    const s = await prisma.agenteSolicitacao.findUnique({ where: { id: String(id) } });
    if (!s) throw erro(404, 'Solicitação não encontrada.');
    if (s.status === 'PENDENTE' && s.expiraEm <= new Date()) {
        await expirarVencidas();
        return prisma.agenteSolicitacao.findUnique({ where: { id: s.id } });
    }
    return s;
}

async function item(id) { return comAntes(await obter(id)); }

// ───────────────────────── leitura (do PRÓPRIO agente) ─────────────────────────
function paraAgente(s) {
    return {
        id: s.id, status: s.status, resumo: s.resumo, resultadoStatus: s.resultadoStatus == null ? null : s.resultadoStatus,
        resultado: redigir(s.resultado === undefined ? null : s.resultado), idsResultado: s.idsResultado === undefined ? null : s.idsResultado,
        decididoPorNome: s.decididoPorNome || null, observacaoDecisao: s.observacaoDecisao || null, createdAt: s.createdAt, expiraEm: s.expiraEm,
    };
}

async function listarDoAgente(agenteId, { status, page, limit } = {}) {
    const st = status ? String(status).toUpperCase() : null;
    if (st && !STATUS.includes(st)) throw erro(400, `status deve ser um de: ${STATUS.join(', ')}.`);
    await expirarVencidas();
    const where = { agenteId: String(agenteId) };
    if (st) where.status = st;
    const p = paginar({ page, limit });
    const [total, linhas] = await Promise.all([
        prisma.agenteSolicitacao.count({ where }),
        prisma.agenteSolicitacao.findMany({ where, orderBy: { createdAt: 'desc' }, skip: p.skip, take: p.limit }),
    ]);
    return { page: p.page, limit: p.limit, total, data: linhas.map(paraAgente) };
}

async function doAgente(agenteId, id) {
    await expirarVencidas();
    const s = await prisma.agenteSolicitacao.findFirst({ where: { id: String(id), agenteId: String(agenteId) } });
    if (!s) throw erro(404, 'Solicitação não encontrada.');
    return paraAgente(s);
}

async function pendentesDoAgente(agenteId) {
    return prisma.agenteSolicitacao.count({ where: { agenteId: String(agenteId), status: 'PENDENTE', expiraEm: { gt: new Date() } } });
}

// ───────────────────────── execução por loopback ─────────────────────────
function novoTicket() {
    const ticket = PREFIXO_TICKET + crypto.randomBytes(32).toString('base64url');
    return { ticket, hash: sha256(ticket) };
}

function urlDe(s) { return s.caminho + (s.query ? `?${s.query}` : ''); }

/** Faz a chamada local. Devolve { status, texto } ou { falha: 'recusada'|'indeterminada', detalhe }. NUNCA lança. */
function chamarLoopback(s, ticket, porta) {
    return new Promise((resolve) => {
        let fim = false;
        const terminar = (v) => { if (!fim) { fim = true; resolve(v); } };
        try {
            const corpo = s.body != null && s.metodo !== 'GET' ? JSON.stringify(s.body) : null;
            const headers = {
                Authorization: `Bearer ${ticket}`, Accept: 'application/json', 'User-Agent': 'cah-agente-solicitacao',
                'Idempotency-Key': s.idempotencyKey || `sol-${s.id}`, 'X-Agente-Solicitacao': s.id,
            };
            if (corpo !== null) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(corpo); }
            const rq = http.request({ host: '127.0.0.1', port: porta, method: s.metodo, path: urlDe(s), headers }, (res) => {
                const partes = []; let tam = 0;
                res.on('data', (c) => { if (tam < MAX_RESPOSTA_BYTES) { partes.push(c); tam += c.length; } });
                res.on('end', () => terminar({ status: res.statusCode, texto: Buffer.concat(partes).toString('utf8') }));
                res.on('error', () => terminar({ falha: 'indeterminada', detalhe: 'a conexão caiu durante a resposta' }));
                res.on('aborted', () => terminar({ falha: 'indeterminada', detalhe: 'a conexão caiu durante a resposta' }));
            });
            rq.setTimeout(EXEC_TIMEOUT_MS, () => { terminar({ falha: 'indeterminada', detalhe: `sem resposta em ${EXEC_TIMEOUT_MS / 1000}s` }); rq.destroy(); });
            rq.on('error', (e) => {
                // nunca chegou a conectar: a rota NÃO rodou -> erro "certo"; qualquer outra queda = não sabemos
                if (e && (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND' || e.code === 'EADDRNOTAVAIL')) terminar({ falha: 'recusada', detalhe: 'não foi possível alcançar o servidor para executar' });
                else terminar({ falha: 'indeterminada', detalhe: 'a conexão caiu no meio da execução' });
            });
            if (corpo !== null) rq.write(corpo);
            rq.end();
        } catch (e) {
            terminar({ falha: 'recusada', detalhe: 'não foi possível montar a chamada de execução' });
        }
    });
}

function mensagemDe(r, texto) {
    if (r && typeof r === 'object') {
        const m = r.error || r.erro || r.mensagem || r.message;
        if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 500);
    }
    return null;
}

/** Decide o estado final a partir da resposta local e grava (só se ainda EXECUTANDO). Devolve a solicitação atualizada. */
async function finalizar(s, resp) {
    let status; let resultadoStatus = null; let resultado = null; let ids = null;
    if (resp.falha) {
        status = resp.falha === 'recusada' ? 'ERRO' : 'ERRO_INDETERMINADO';
        resultado = { error: resp.falha === 'recusada' ? `Não executou: ${resp.detalhe}.` : `Resultado indeterminado: ${resp.detalhe}. Confira na tela de destino se o efeito aconteceu antes de repetir.` };
    } else {
        resultadoStatus = resp.status;
        let json = null;
        try { json = resp.texto ? JSON.parse(resp.texto) : null; } catch (_) { json = null; }
        const limpo = redigir(json !== null ? json : (resp.texto ? { texto: resp.texto.slice(0, 500) } : null));
        const ok = resp.status >= 200 && resp.status < 300;
        status = ok ? 'AUTORIZADA' : 'ERRO';
        if (ok) ids = extrairIds(limpo);
        let grav = limpo;
        if (ok && grav !== null && Buffer.byteLength(JSON.stringify(grav)) > MAX_RESULTADO_BYTES) grav = { truncado: true, bytes: Buffer.byteLength(JSON.stringify(grav)), aviso: 'Resposta grande demais para guardar; os ids foram extraídos.' };
        if (!ok) {
            let msg = mensagemDe(limpo, resp.texto) || `A rota recusou o pedido (HTTP ${resp.status}).`;
            if (resp.status >= 500) msg = `${msg.slice(0, 300)} — ATENÇÃO: ${AVISO_5XX}`;
            grav = { error: msg, ...(limpo && typeof limpo === 'object' && !Array.isArray(limpo) && Buffer.byteLength(JSON.stringify(limpo)) < 4096 ? limpo : {}) };
            grav.error = msg;
        }
        resultado = grav;
    }
    const dados = { status, resultadoStatus, execHash: null };
    dados.resultado = resultado === null ? undefined : resultado;
    if (ids !== null) dados.idsResultado = ids;
    await prisma.agenteSolicitacao.updateMany({ where: { id: s.id, status: 'EXECUTANDO' }, data: dados });
    return prisma.agenteSolicitacao.findUnique({ where: { id: s.id } });
}

/** Reivindica (atômico), emite o ticket e executa. `donoDoStatus`: estado de que se parte ('PENDENTE' ou 'ERRO_INDETERMINADO'). */
async function reivindicarEExecutar(s, donoDoStatus, ator, porta) {
    const { ticket, hash } = novoTicket();
    const agora = new Date();
    const dados = { status: 'EXECUTANDO', execHash: hash, execComecouEm: agora };
    const where = { id: s.id, status: donoDoStatus };
    if (donoDoStatus === 'PENDENTE') {
        where.expiraEm = { gt: agora };
        Object.assign(dados, { decididoPorId: String(ator.id), decididoPorNome: String(ator.nome || 'admin'), decididoEm: agora });
    } else { // REPETIR: limpa o resultado da tentativa anterior e registra QUEM repetiu (a decisão original fica como está)
        Object.assign(dados, {
            resultado: Prisma.DbNull, idsResultado: Prisma.DbNull, resultadoStatus: null,
            repetidoPorId: String(ator.id), repetidoPorNome: String(ator.nome || 'admin'), repetidoEm: agora,
        });
    }
    const r = await prisma.agenteSolicitacao.updateMany({ where, data: dados });
    if (r.count !== 1) {
        const atual = await prisma.agenteSolicitacao.findUnique({ where: { id: s.id }, select: { status: true } });
        throw erro(409, atual ? `Esta solicitação já está ${atual.status}.` : 'Solicitação não encontrada.', 'SOLICITACAO_JA_DECIDIDA', { status: atual ? atual.status : null });
    }
    const atual = await prisma.agenteSolicitacao.findUnique({ where: { id: s.id } });
    let mensagemAnterior;
    if (donoDoStatus !== 'PENDENTE') { // texto da tentativa indeterminada (já foi limpo da linha ao reivindicar)
        const r = s.resultado && typeof s.resultado === 'object' ? s.resultado : null;
        const t = r && (r.error || r.erro || r.mensagem || r.message);
        mensagemAnterior = t ? String(redigir(String(t))).slice(0, 300) : null;
    }
    await auditar('AGENTE_SOLICITACAO_DECIDIDA', atual, ator, { decisao: donoDoStatus === 'PENDENTE' ? 'AUTORIZAR' : 'REPETIR', ...(donoDoStatus !== 'PENDENTE' ? { mensagemAnterior } : {}), repetidoPor: donoDoStatus === 'PENDENTE' ? undefined : String(ator.nome || 'admin'), decididoPor: String(ator.nome || 'admin') });
    const resp = await chamarLoopback(atual, ticket, porta);
    const final = await finalizar(atual, resp);
    await auditar('AGENTE_SOLICITACAO_EXECUTADA', final, ator, { statusFinal: final.status, resultadoStatus: final.resultadoStatus == null ? null : final.resultadoStatus, decididoPor: String(ator.nome || 'admin') });
    return final;
}

function portaLoopback(porta) {
    const n = Number(process.env.AGENTE_LOOPBACK_PORT || porta || process.env.PORT || 3000);
    return Number.isInteger(n) && n > 0 && n < 65536 ? n : 3000;
}

async function recalcularPolitica(app, s) {
    return politica.avaliar(app, s.agenteId, s.metodo, urlDe(s));
}

/** AUTORIZAR (admin humano). `opts`: { app, porta, confirmarMudanca }. Devolve o ITEM final (já executado). */
async function autorizar(id, ator, opts = {}) {
    let s = await obter(id);
    if (s.status !== 'PENDENTE') throw erro(409, `Esta solicitação já está ${s.status}.`, 'SOLICITACAO_JA_DECIDIDA', { status: s.status });
    const d = await recalcularPolitica(opts.app, s);
    if (d.nivel === 'BLOQUEADO') {
        const r = await prisma.agenteSolicitacao.updateMany({
            where: { id: s.id, status: 'PENDENTE' },
            data: { status: 'RECUSADA', decididoPorId: 'sistema', decididoPorNome: 'Sistema (política mudou)', decididoEm: new Date(), observacaoDecisao: 'A função passou a ser BLOQUEADA para o agente depois do pedido; nada foi executado.' },
        });
        if (r.count === 1) await auditar('AGENTE_SOLICITACAO_DECIDIDA', s, ator, { decisao: 'RECUSADA_AUTOMATICA', motivo: 'politica_bloqueada', decididoPor: String(ator?.nome || 'admin') });
        throw erro(409, 'Esta função foi bloqueada para o agente depois do pedido: a solicitação foi recusada e nada foi executado.', 'AGENTE_POLITICA_BLOQUEADA');
    }
    const cmp = await compararAntes(s);
    if (cmp && cmp.mudou && opts.confirmarMudanca !== true) {
        throw erro(409, 'O item mudou desde o pedido do agente. Confira o antes e o depois e confirme para executar mesmo assim.', 'MUDOU_DESDE_O_PEDIDO', { mudouDesdePedido: true, antes: s.antes, depois: cmp.valor });
    }
    const final = await reivindicarEExecutar(s, 'PENDENTE', ator, portaLoopback(opts.porta));
    return comAntes(final);
}

/** RECUSAR (admin humano): não executa. */
async function recusar(id, ator, observacao) {
    const obs = observacao == null ? null : String(observacao).trim();
    if (obs && obs.length > 500) throw erro(400, 'A observação deve ter no máximo 500 caracteres.');
    const s = await obter(id);
    const agora = new Date();
    const r = await prisma.agenteSolicitacao.updateMany({
        where: { id: s.id, status: 'PENDENTE', expiraEm: { gt: agora } },
        data: { status: 'RECUSADA', decididoPorId: String(ator.id), decididoPorNome: String(ator.nome || 'admin'), decididoEm: agora, observacaoDecisao: obs || null },
    });
    if (r.count !== 1) {
        const atual = await prisma.agenteSolicitacao.findUnique({ where: { id: s.id }, select: { status: true } });
        throw erro(409, `Esta solicitação já está ${atual ? atual.status : 'decidida'}.`, 'SOLICITACAO_JA_DECIDIDA', { status: atual ? atual.status : null });
    }
    const final = await prisma.agenteSolicitacao.findUnique({ where: { id: s.id } });
    await auditar('AGENTE_SOLICITACAO_DECIDIDA', final, ator, { decisao: 'RECUSAR', decididoPor: String(ator.nome || 'admin') });
    return paraItem(final);
}

/** REPETIR (admin humano, só ERRO_INDETERMINADO): reexecuta com a MESMA Idempotency-Key e um ticket novo.
 *  Exige (1) passar >= 5 min desde o início da execução anterior (ela pode ainda estar rodando) e (2) `confirmarRepeticao:true`. */
async function repetir(id, ator, opts = {}) {
    const s = await obter(id);
    if (s.status !== 'ERRO_INDETERMINADO') throw erro(409, `Só dá para repetir uma solicitação com resultado indeterminado (esta está ${s.status}).`, 'SOLICITACAO_NAO_REPETIVEL', { status: s.status });
    const inicio = s.execComecouEm ? new Date(s.execComecouEm).getTime() : 0;
    if (Date.now() - inicio < REPETIR_APOS_MS) {
        throw erro(409, 'Muito cedo para repetir: a execução anterior pode ainda estar em andamento. Aguarde alguns minutos e confira a tela de destino.', 'REPETIR_MUITO_CEDO',
            { liberaEm: new Date(inicio + REPETIR_APOS_MS).toISOString(), aviso: AVISO_REPETIR });
    }
    if (opts.confirmarRepeticao !== true) {
        const familia = catalogo.familiaDe(String(s.chave || '').split(' ')[1] || s.caminho);
        throw erro(409, 'Confirme que conferiu a tela de destino antes de repetir.', 'CONFIRMAR_REPETICAO',
            { aviso: AVISO_REPETIR, destino: telaDestino(familia, redigir(s.body === undefined ? null : s.body)), antes: s.antes === undefined ? null : s.antes });
    }
    const d = await recalcularPolitica(opts.app, s);
    if (d.nivel === 'BLOQUEADO') throw erro(409, 'Esta função está bloqueada para o agente agora; não repetida.', 'AGENTE_POLITICA_BLOQUEADA');
    const final = await reivindicarEExecutar(s, 'ERRO_INDETERMINADO', ator, portaLoopback(opts.porta));
    return comAntes(final);
}

/** Token do agente revogado/rotacionado: recusa na hora TODAS as PENDENTES DO AGENTE (não só as feitas com aquele token;
 *  EXECUTANDO em andamento NÃO é tocado). Nunca lança. */
async function recusarPendentesDoAgente(agenteId, motivo, ator) {
    try {
        const alvos = await prisma.agenteSolicitacao.findMany({ where: { agenteId: String(agenteId), status: 'PENDENTE' }, select: { id: true } });
        if (!alvos.length) return 0;
        const agora = new Date();
        const r = await prisma.agenteSolicitacao.updateMany({
            where: { agenteId: String(agenteId), status: 'PENDENTE' },
            data: {
                status: 'RECUSADA', decididoPorId: 'sistema', decididoPorNome: 'Sistema (token revogado/rotacionado)', decididoEm: agora,
                observacaoDecisao: 'Token do agente revogado/rotacionado — todos os pedidos pendentes DO AGENTE foram recusados',
            },
        });
        if (r.count > 0) {
            try {
                await prisma.auditLog.create({
                    data: {
                        acao: 'AGENTE_SOLICITACOES_RECUSADAS_AUTO', entidade: 'Agente', entidadeId: String(agenteId),
                        detalhes: JSON.stringify({ agenteId: String(agenteId), escopo: 'todas as pendentes do agente (não só as do token revogado)', quantidade: r.count, motivo: motivo || 'token revogado/rotacionado', ids: alvos.slice(0, 50).map((x) => x.id) }),
                        usuarioId: String(ator?.id || 'sistema'), usuarioNome: String(ator?.nome || 'Sistema'),
                    },
                });
            } catch (e) { console.error('[AgenteSolicitacao] falha ao gravar auditoria da recusa automática (operação já efetivada):', e.message); }
        }
        return r.count;
    } catch (e) {
        console.error('[AgenteSolicitacao] falha ao recusar as pendentes do agente (token já revogado):', e.message);
        return 0;
    }
}

// ───────────────────────── ticket de execução (authMiddleware) ─────────────────────────
function ehTicket(token) { return typeof token === 'string' && token.startsWith(PREFIXO_TICKET); }

function ehLoopback(req) {
    // A chamada local legítima NUNCA traz cabeçalhos de proxy; com eles a requisição veio de fora (proxy no mesmo host) -> recusa.
    const h = (req && req.headers) || {};
    if (h['x-forwarded-for'] !== undefined || h['forwarded'] !== undefined || h['x-real-ip'] !== undefined) return false;
    const a = String(req.socket && req.socket.remoteAddress || '');
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

/**
 * Valida o ticket de uma chamada local e o CONSOME (uso único). Devolve
 * { ok:true, solicitacao, vendedor, permissoes } ou { ok:false, status, error, codigo }. Nunca devolve nem loga o ticket.
 */
async function consumirTicket(req, ticket) {
    const invalido = { ok: false, status: 401, error: 'Ticket de execução inválido, expirado ou já usado.', codigo: 'AGENTE_TICKET_INVALIDO' };
    if (!ehTicket(ticket) || ticket.length > 200 || !ehLoopback(req)) return invalido;
    const hash = sha256(ticket);
    const s = await prisma.agenteSolicitacao.findUnique({ where: { execHash: hash } });
    if (!s || s.status !== 'EXECUTANDO' || !s.execComecouEm) return invalido;
    if (Date.now() - new Date(s.execComecouEm).getTime() > TICKET_VALIDADE_MS) return invalido;
    const bruto = String(req.originalUrl || '');
    const i = bruto.indexOf('?');
    const caminho = i === -1 ? bruto : bruto.slice(0, i);
    const query = i === -1 ? '' : bruto.slice(i + 1);
    // o ticket vale para UMA chamada: este método + este caminho + estes parâmetros, exatamente os guardados
    if (String(req.method).toUpperCase() !== s.metodo || caminho !== s.caminho || query !== (s.query || '')) return invalido;
    // uso único: zera o hash de forma atômica; quem perder a corrida (ou reusar o ticket) não passa
    const uso = await prisma.agenteSolicitacao.updateMany({ where: { id: s.id, execHash: hash, status: 'EXECUTANDO' }, data: { execHash: null } });
    if (uso.count !== 1) return invalido;
    const v = await prisma.vendedor.findUnique({ where: { id: s.agenteId }, select: { id: true, nome: true, ativo: true, agente: true, permissoes: true, maxDescontoFlex: true } });
    const negado = { ok: false, status: 401, error: 'O usuário-agente desta solicitação não está mais ativo.', codigo: 'AGENTE_TOKEN_INVALIDO' };
    if (!v || v.ativo === false || v.agente !== true) return negado;
    const permissoes = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
    if (permissoes.admin === true) return { ok: false, status: 403, error: 'Agente não pode ter permissão de administrador.', codigo: 'AGENTE_ADMIN_PROIBIDO' };
    return { ok: true, solicitacao: s, vendedor: v, permissoes, hash };
}

module.exports = {
    PREFIXO_TICKET, STATUS, TETO_PENDENTES, VALIDADE_MS, TICKET_VALIDADE_MS, INDETERMINADO_MS, REPETIR_APOS_MS, EXEC_TIMEOUT_MS, MAX_BODY_BYTES, ROTA_TELA_SOLICITACOES,
    redigir, redigirQuery, excedeLimitesDeExibicao, estavel, extrairIds, resumoDe, lerPedido, resposta202, criarOuReaproveitar,
    listar, contagem, item, obter, listarDoAgente, doAgente, pendentesDoAgente,
    autorizar, recusar, repetir, recusarPendentesDoAgente, varredura, expirarVencidas, marcarIndeterminadas,
    ehTicket, ehLoopback, consumirTicket, paraItem, auditar, sha256,
};
