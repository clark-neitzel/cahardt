// Webhook de SAÍDA (CA-Hardt -> Luke): avisa o Luke quando uma solicitação do agente chega a um estado final
// ou quando um usuário manda mensagem no chat do Luke.
//
// Desenho (docs/plano-chat-luke-webhook.md):
//  - FILA NO BANCO (luke_webhook_eventos), espelho de bot_whatsapp_envios: o evento nasce junto do fato e o POST externo
//    sai depois, do worker (tick de 15 s) ou do "acorda fila" chamado numa rota JWT. Nunca dentro de `$transaction`.
//  - Evento de SOLICITAÇÃO nasce por VARREDURA (estados finais alterados desde o marco de ativação), não por gancho em cada
//    transição: cobre os updateMany sem ids (expirar, indeterminar, recusar em massa) sem tocar no authMiddleware/serviço.
//  - Evento MAGRO: só ids, tipo, status e URL relativa. Texto, nome e anexo o Luke busca pela API autenticada dele.
//  - eventoId = id da linha; NÃO muda nos reenvios (o Luke deduplica por ele).
//  - Segredo (LUKE_WEBHOOK_SECRET) só em env: nunca em log, banco, resposta ou erro gravado.
//  - Só https; redirect:'error'; timeout de 10 s; 2xx = sucesso; 5xx/429/rede/timeout reagendam; demais 4xx = FALHA sem laço.
//  - Este serviço NÃO usa assertNaoAgente de propósito: a URL vem só de env e o corpo é montado pelo servidor; o POST sai do
//    worker (sem contexto de agente) ou do "acorda fila" de uma rota de usuário humano. A resposta do Luke não gera evento.
const crypto = require('crypto');
const prisma = require('../config/database');

const TIPO_SOLICITACAO = 'solicitacao.atualizada';
const TIPO_CHAT = 'chat.mensagem';
const ESTADOS_FINAIS = ['AUTORIZADA', 'RECUSADA', 'ERRO', 'ERRO_INDETERMINADO', 'EXPIRADA'];
const ESPERAS_S = [15, 60, 5 * 60, 30 * 60, 2 * 60 * 60]; // espera depois da falha da tentativa 1..5
const MAX_TENTATIVAS = ESPERAS_S.length + 1;              // 6 no total, depois FALHA + reenvio manual
const TIMEOUT_MS = 10 * 1000;
const LEASE_MS = 60 * 1000;                               // "reserva" do evento enquanto uma instância o envia
const RETRY_AFTER_MAX_S = 5 * 60;
const LOTE = 20;
const VARREDURA_LOTE = 200;
const VARREDURA_SOBREPOSICAO_MS = 2 * 60 * 1000;          // reler 2 min para trás (commit tardio); a chave de dedupe evita repetir
const VARREDURA_JANELA_MAX_MS = 7 * 24 * 60 * 60 * 1000;  // depois de um restart nunca varre mais que 7 dias
const CHAVE_MARCO = 'luke_webhook_inicio';
const MAX_ERRO = 300;

let rodando = false;       // trava de sobreposição do tick (vale por instância)
let varridoAte = null;     // cursor em memória da varredura
let marcoCache = null;
let avisouUrlInvalida = false;

function erro(status, msg, codigo) { const e = new Error(msg); e.status = status; if (codigo) e.codigo = codigo; return e; }

// ───────────────────────── configuração (env) ─────────────────────────
/** Lê a env a cada chamada (mudar no EasyPanel vale no próximo envio). Nunca devolve o segredo para fora do serviço. */
function config() {
    const url = String(process.env.LUKE_WEBHOOK_URL || '').trim();
    const segredo = String(process.env.LUKE_WEBHOOK_SECRET || '');
    const modo = String(process.env.LUKE_WEBHOOK_AUTH || 'hmac').trim().toLowerCase() === 'bearer' ? 'bearer' : 'hmac';
    let urlOk = false;
    if (url) {
        try {
            const u = new URL(url);
            urlOk = u.protocol === 'https:' && !u.username && !u.password;
        } catch (_) { urlOk = false; }
        if (!urlOk && !avisouUrlInvalida) {
            avisouUrlInvalida = true;
            console.warn('[LukeWebhook] LUKE_WEBHOOK_URL ignorada: precisa ser uma URL https:// sem usuário/senha. Webhook desligado.');
        }
    }
    return { ligado: urlOk && segredo.length > 0, url: urlOk ? url : '', segredo, modo, urlConfigurada: url.length > 0, segredoConfigurado: segredo.length > 0 };
}

/** Estado do webhook para a tela do admin: só booleanos/modo, nunca URL nem segredo. */
function estadoPublico() {
    const c = config();
    return { ligado: c.ligado, modo: c.modo, urlConfigurada: c.urlConfigurada, segredoConfigurado: c.segredoConfigurado };
}

// ───────────────────────── fila ─────────────────────────
/**
 * Põe um evento na fila (idempotente pela chave de dedupe: repetir não duplica nem lança — INSERT ... ON CONFLICT DO NOTHING,
 * seguro dentro de `$transaction`). `db` pode ser o `tx` de uma transação. Sem URL/segredo o evento nasce DESLIGADO.
 * Devolve { id, criado }.
 */
async function enfileirar({ tipo, chaveDedupe, payload, solicitacaoId = null, conversaId = null, mensagemId = null }, db = prisma) {
    const cfg = config();
    const id = crypto.randomUUID();
    const r = await db.lukeWebhookEvento.createMany({
        data: [{
            id, tipo, chaveDedupe, payload: payload || {},
            status: cfg.ligado ? 'PENDENTE' : 'DESLIGADO',
            proximaEm: cfg.ligado ? new Date() : null,
            solicitacaoId, conversaId, mensagemId,
        }],
        skipDuplicates: true,
    });
    return { id, criado: r.count === 1 };
}

/** Evento de chat: só ids (+ assunto e quantidade de anexos). Texto e anexos o Luke lê pela API dele. */
function enfileirarChat({ conversaId, mensagemId, assunto, qtdAnexos }, db = prisma) {
    return enfileirar({
        tipo: TIPO_CHAT,
        chaveDedupe: `chat:${mensagemId}`,
        payload: { conversaId, mensagemId, assunto: assunto || null, qtdAnexos: qtdAnexos || 0 },
        conversaId, mensagemId,
    }, db);
}

// ───────────────────────── corpo, assinatura, POST ─────────────────────────
function montarCorpo(ev, agora = new Date()) {
    // campos fixos DEPOIS do payload: o payload nunca consegue trocar eventoId/tipo
    return JSON.stringify({ ...(ev.payload && typeof ev.payload === 'object' ? ev.payload : {}), eventoId: ev.id, tipo: ev.tipo, enviadoEm: agora.toISOString() });
}

function assinarHmac(segredo, corpo) {
    return 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo, 'utf8').digest('hex');
}

function montarCabecalhos(cfg, ev, corpo, agora) {
    const h = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Luke-Event': ev.tipo,
        'X-Luke-Delivery': ev.id,
        'X-Luke-Timestamp': String(Math.floor(agora.getTime() / 1000)),
        'User-Agent': 'CA-Hardt-Webhook/1',
    };
    if (cfg.modo === 'bearer') h.Authorization = `Bearer ${cfg.segredo}`;
    else h['X-Hub-Signature-256'] = assinarHmac(cfg.segredo, corpo);
    return h;
}

/** Texto de erro curto e SEM segredo (corta em 300 e troca qualquer ocorrência do segredo). */
function erroLimpo(txt, segredo) {
    let t = String(txt == null ? '' : txt);
    if (segredo) t = t.split(segredo).join('[oculto]');
    return t.slice(0, MAX_ERRO);
}

function lerRetryAfter(valor) {
    if (!valor) return null;
    const n = Number(valor);
    if (Number.isFinite(n) && n >= 0) return Math.min(Math.ceil(n), RETRY_AFTER_MAX_S);
    const t = Date.parse(valor);
    if (Number.isFinite(t)) return Math.min(Math.max(Math.ceil((t - Date.now()) / 1000), 0), RETRY_AFTER_MAX_S);
    return null;
}

/** Faz UM POST. Devolve { ok, httpStatus?, retryAfterSeg?, erro? }. Nunca lança. */
async function postar(cfg, ev, agora = new Date()) {
    const corpo = montarCorpo(ev, agora);
    try {
        const res = await fetch(cfg.url, {
            method: 'POST',
            headers: montarCabecalhos(cfg, ev, corpo, agora),
            body: corpo,
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const retryAfterSeg = lerRetryAfter(res.headers.get('retry-after'));
        try { await res.body?.cancel(); } catch (_) { /* não precisamos da resposta */ }
        return { ok: res.status >= 200 && res.status < 300, httpStatus: res.status, retryAfterSeg };
    } catch (e) {
        const causa = e && e.cause && (e.cause.code || e.cause.message);
        let msg;
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) msg = `timeout (${TIMEOUT_MS / 1000}s)`;
        else if (/redirect/i.test(`${e && e.message} ${causa || ''}`)) {
            // redirecionamento nunca é seguido (levaria corpo/assinatura a outro destino) e repetir não muda nada: FALHA direta
            return { ok: false, definitivo: true, erro: 'o destino respondeu com redirecionamento (recusado)' };
        } else msg = `falha de rede${causa ? `: ${causa}` : ''}`;
        return { ok: false, erro: erroLimpo(msg, cfg.segredo) };
    }
}

/** Espera (ms) antes da próxima tentativa, dado o número de tentativas JÁ feitas. `aleatorio` injetável p/ teste. */
function esperaMs(tentativasFeitas, retryAfterSeg, aleatorio = Math.random) {
    const base = ESPERAS_S[Math.min(Math.max(tentativasFeitas, 1), ESPERAS_S.length) - 1] * 1000;
    const jitter = 1 + (aleatorio() * 0.4 - 0.2); // ±20%
    const comJitter = Math.round(base * jitter);
    return retryAfterSeg != null ? Math.max(comJitter, retryAfterSeg * 1000) : comJitter;
}

// ───────────────────────── processar um evento ─────────────────────────
async function aposResultadoChat(ev, sucesso) {
    if (ev.tipo !== TIPO_CHAT || !ev.mensagemId) return;
    try {
        if (sucesso) await prisma.chatLukeMensagem.updateMany({ where: { id: ev.mensagemId, status: 'ENVIADO' }, data: { status: 'PROCESSANDO' } });
        else await prisma.chatLukeMensagem.updateMany({ where: { id: ev.mensagemId, status: { in: ['ENVIADO', 'PROCESSANDO'] } }, data: { status: 'ERRO' } });
    } catch (e) {
        console.error('[LukeWebhook] evento já resolvido, mas falhou ao atualizar o estado da mensagem:', e.message);
    }
}

async function processarEvento(ev, cfg, agora) {
    const tentativa = ev.tentativas + 1; // o "claim" já incrementou no banco; ev vem da leitura anterior
    const r = await postar(cfg, ev, agora);
    let dados;
    if (r.ok) {
        dados = { status: 'ENVIADO', httpStatus: r.httpStatus, ultimoErro: null, proximaEm: null, enviadoEm: new Date() };
    } else {
        const reagendavel = !r.definitivo && (r.httpStatus === undefined || r.httpStatus === 429 || r.httpStatus >= 500);
        const motivo = r.httpStatus !== undefined ? `HTTP ${r.httpStatus}` : r.erro;
        if (reagendavel && tentativa < MAX_TENTATIVAS) {
            dados = { status: 'PENDENTE', httpStatus: r.httpStatus ?? null, ultimoErro: erroLimpo(motivo, cfg.segredo), proximaEm: new Date(Date.now() + esperaMs(tentativa, r.retryAfterSeg)) };
        } else {
            dados = { status: 'FALHA', httpStatus: r.httpStatus ?? null, ultimoErro: erroLimpo(reagendavel ? `${motivo} (esgotou as ${MAX_TENTATIVAS} tentativas)` : `${motivo} (recusado pelo destino; não reenvia sozinho)`, cfg.segredo), proximaEm: null };
        }
    }
    await prisma.lukeWebhookEvento.update({ where: { id: ev.id }, data: dados });
    if (dados.status === 'ENVIADO') await aposResultadoChat(ev, true);
    else if (dados.status === 'FALHA') await aposResultadoChat(ev, false);
    if (dados.status === 'FALHA') console.error(`[LukeWebhook] evento ${ev.id} (${ev.tipo}) ficou em FALHA: ${dados.ultimoErro}`);
    return dados.status;
}

// ───────────────────────── varredura de solicitações ─────────────────────────
async function marcoDeAtivacao() {
    if (marcoCache) return marcoCache;
    const ler = async () => {
        const c = await prisma.appConfig.findUnique({ where: { key: CHAVE_MARCO } });
        const t = c && typeof c.value === 'string' ? Date.parse(c.value) : NaN;
        return Number.isFinite(t) ? new Date(t) : null;
    };
    let m = await ler();
    if (!m) {
        // 1ª vez (1º deploy): marca "agora" — o histórico de solicitações antigas NÃO dispara evento. upsert vazio no update:
        // se outra instância gravou primeiro, vale a dela.
        await prisma.appConfig.upsert({ where: { key: CHAVE_MARCO }, update: {}, create: { key: CHAVE_MARCO, value: new Date().toISOString() } });
        m = (await ler()) || new Date();
    }
    marcoCache = m;
    return m;
}

function chaveSolicitacao(s) {
    return `sol:${s.id}:${s.status}:${s.execComecouEm ? new Date(s.execComecouEm).getTime() : 0}`;
}

/** Cria os eventos das solicitações que chegaram a um estado final desde o marco. Idempotente. Devolve { novos }. */
async function varrerSolicitacoes(agora = new Date()) {
    const marco = await marcoDeAtivacao();
    const piso = Math.max(marco.getTime(), agora.getTime() - VARREDURA_JANELA_MAX_MS);
    const desde = new Date(varridoAte ? Math.max(piso, varridoAte.getTime() - VARREDURA_SOBREPOSICAO_MS) : piso);
    const linhas = await prisma.agenteSolicitacao.findMany({
        where: { status: { in: ESTADOS_FINAIS }, updatedAt: { gt: desde } },
        orderBy: { updatedAt: 'asc' },
        take: VARREDURA_LOTE,
        select: { id: true, status: true, execComecouEm: true, updatedAt: true },
    });
    varridoAte = linhas.length >= VARREDURA_LOTE ? linhas[linhas.length - 1].updatedAt : agora;
    if (!linhas.length) return { novos: 0 };

    const chaves = linhas.map(chaveSolicitacao);
    const ja = new Set((await prisma.lukeWebhookEvento.findMany({ where: { chaveDedupe: { in: chaves } }, select: { chaveDedupe: true } })).map((x) => x.chaveDedupe));
    const novas = linhas.filter((s, i) => !ja.has(chaves[i]));
    if (!novas.length) return { novos: 0 };

    // vínculo conversa/mensagem de cada solicitação nova (só existe quando nasceu de uma mensagem do chat)
    const vinculos = await prisma.chatLukeMensagemSolicitacao.findMany({
        where: { solicitacaoId: { in: novas.map((s) => s.id) } },
        select: { solicitacaoId: true, mensagemId: true, origem: true, criadoEm: true, mensagem: { select: { conversaId: true } } },
        orderBy: { criadoEm: 'asc' },
    });
    const porSolicitacao = new Map();
    for (const v of vinculos) {
        const lista = porSolicitacao.get(v.solicitacaoId) || [];
        lista.push(v);
        porSolicitacao.set(v.solicitacaoId, lista);
    }

    let novos = 0;
    const tocar = new Set();
    for (const s of novas) {
        const lista = porSolicitacao.get(s.id) || [];
        const principal = lista.find((v) => v.origem === 'HEADER') || lista[0] || null; // a mensagem do USUÁRIO que originou o pedido
        const r = await enfileirar({
            tipo: TIPO_SOLICITACAO,
            chaveDedupe: chaveSolicitacao(s),
            payload: {
                solicitacao: {
                    id: s.id, status: s.status,
                    consultaUrl: `/api/agente/v1/solicitacoes/${s.id}`,
                    conversaId: principal ? principal.mensagem.conversaId : null,
                    mensagemId: principal ? principal.mensagemId : null,
                },
            },
            solicitacaoId: s.id,
            conversaId: principal ? principal.mensagem.conversaId : null,
            mensagemId: principal ? principal.mensagemId : null,
        });
        if (r.criado) { novos += 1; lista.forEach((v) => tocar.add(v.mensagemId)); }
    }
    // "toca" as mensagens ligadas para o polling do chat perceber a mudança de estado (o estado em si é derivado na leitura)
    if (tocar.size) {
        try { await prisma.chatLukeMensagem.updateMany({ where: { id: { in: [...tocar] } }, data: { atualizadoEm: new Date() } }); }
        catch (e) { console.error('[LukeWebhook] eventos criados, mas falhou ao avisar o chat:', e.message); }
    }
    return { novos };
}

// ───────────────────────── tick ─────────────────────────
/**
 * Varre (opcional) e envia o que está pendente. Seguro para chamar de qualquer lugar: trava de sobreposição por instância e
 * "reserva" (lease) por evento no banco — duas instâncias nunca enviam o mesmo evento ao mesmo tempo. Nunca lança.
 */
async function processarFila({ varrer = true } = {}) {
    if (rodando) return { pulou: true };
    rodando = true;
    const resumo = { novos: 0, enviados: 0, reagendados: 0, falhas: 0, desligados: 0 };
    try {
        if (varrer) {
            try { resumo.novos = (await varrerSolicitacoes()).novos; }
            catch (e) { console.error('[LukeWebhook] varredura de solicitações falhou:', e.message); }
        }
        const cfg = config();
        const agora = new Date();
        if (!cfg.ligado) {
            // desligaram a env com eventos na fila: não deixa acumular para disparar em rajada quando religarem
            const r = await prisma.lukeWebhookEvento.updateMany({ where: { status: 'PENDENTE', proximaEm: { lte: agora } }, data: { status: 'DESLIGADO', proximaEm: null } });
            resumo.desligados = r.count;
            return resumo;
        }
        const pendentes = await prisma.lukeWebhookEvento.findMany({
            where: { status: 'PENDENTE', proximaEm: { lte: agora } },
            orderBy: { criadoEm: 'asc' },
            take: LOTE,
        });
        for (const ev of pendentes) {
            const reservou = await prisma.lukeWebhookEvento.updateMany({
                where: { id: ev.id, status: 'PENDENTE', proximaEm: { lte: agora } },
                data: { tentativas: { increment: 1 }, proximaEm: new Date(Date.now() + LEASE_MS) },
            });
            if (reservou.count !== 1) continue; // outra instância pegou
            try {
                const st = await processarEvento(ev, cfg, new Date());
                if (st === 'ENVIADO') resumo.enviados += 1; else if (st === 'PENDENTE') resumo.reagendados += 1; else resumo.falhas += 1;
            } catch (e) {
                console.error(`[LukeWebhook] evento ${ev.id}: erro ao registrar o resultado (volta pela reserva em 1 min):`, e.message);
            }
        }
        return resumo;
    } catch (e) {
        console.error('[LukeWebhook] processarFila:', e.message);
        return { ...resumo, erro: true };
    } finally {
        rodando = false;
    }
}

/** "Acorda a fila" sem esperar o tick de 15 s — fire-and-forget, SEMPRE depois da transação/resposta. Nunca lança. */
function acordarFila() {
    setImmediate(() => { processarFila({ varrer: false }).catch((e) => console.error('[LukeWebhook] acordarFila:', e.message)); });
}

// ───────────────────────── admin: listar e reenviar ─────────────────────────
function paraItem(e) {
    return {
        id: e.id, eventoId: e.id, tipo: e.tipo, status: e.status, tentativas: e.tentativas, proximaEm: e.proximaEm,
        httpStatus: e.httpStatus, ultimoErro: e.ultimoErro, solicitacaoId: e.solicitacaoId, conversaId: e.conversaId, mensagemId: e.mensagemId,
        criadoEm: e.criadoEm, enviadoEm: e.enviadoEm,
    };
}

const STATUS_FILA = ['PENDENTE', 'ENVIADO', 'FALHA', 'DESLIGADO'];
const TIPOS_FILA = [TIPO_SOLICITACAO, TIPO_CHAT];

async function listar({ status, tipo, solicitacaoId, conversaId, page, limit } = {}) {
    const where = {};
    if (status) {
        const st = String(status).toUpperCase();
        if (!STATUS_FILA.includes(st)) throw erro(400, `status deve ser um de: ${STATUS_FILA.join(', ')}.`, 'STATUS_INVALIDO');
        where.status = st;
    }
    if (tipo) {
        if (!TIPOS_FILA.includes(String(tipo))) throw erro(400, `tipo deve ser um de: ${TIPOS_FILA.join(', ')}.`, 'TIPO_INVALIDO');
        where.tipo = String(tipo);
    }
    if (solicitacaoId) where.solicitacaoId = String(solicitacaoId);
    if (conversaId) where.conversaId = String(conversaId);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const [total, linhas, porStatus] = await Promise.all([
        prisma.lukeWebhookEvento.count({ where }),
        prisma.lukeWebhookEvento.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (pg - 1) * lim, take: lim }),
        prisma.lukeWebhookEvento.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
        page: pg, limit: lim, total, webhook: estadoPublico(),
        resumo: Object.fromEntries(porStatus.map((g) => [g.status, g._count._all])),
        data: linhas.map(paraItem),
    };
}

/** Reenvia com o MESMO eventoId. Só sai se o webhook estiver ligado (senão 409 e o evento fica como está). */
async function reenviar(id) {
    const ev = await prisma.lukeWebhookEvento.findUnique({ where: { id: String(id) } });
    if (!ev) throw erro(404, 'Evento não encontrado.', 'NAO_ENCONTRADO');
    if (ev.status === 'PENDENTE') throw erro(409, 'Este evento já está na fila para envio.', 'JA_NA_FILA');
    if (!config().ligado) throw erro(409, 'O webhook está desligado (falta LUKE_WEBHOOK_URL https:// ou LUKE_WEBHOOK_SECRET no servidor). Configure e reenvie.', 'WEBHOOK_DESLIGADO');
    const r = await prisma.lukeWebhookEvento.updateMany({
        where: { id: ev.id, status: { in: ['FALHA', 'DESLIGADO', 'ENVIADO'] } },
        data: { status: 'PENDENTE', tentativas: 0, proximaEm: new Date(), ultimoErro: null, httpStatus: null },
    });
    if (r.count !== 1) throw erro(409, 'O evento mudou de estado enquanto era reenviado. Atualize a lista.', 'ESTADO_MUDOU');
    if (ev.tipo === TIPO_CHAT && ev.mensagemId) {
        try { await prisma.chatLukeMensagem.updateMany({ where: { id: ev.mensagemId, status: 'ERRO' }, data: { status: 'ENVIADO' } }); }
        catch (e) { console.error('[LukeWebhook] reenvio enfileirado, mas falhou ao voltar o estado da mensagem:', e.message); }
    }
    acordarFila();
    return paraItem(await prisma.lukeWebhookEvento.findUnique({ where: { id: ev.id } }));
}

/** Só para teste: zera o estado em memória. */
function _resetarParaTeste() { rodando = false; varridoAte = null; marcoCache = null; avisouUrlInvalida = false; }

module.exports = {
    TIPO_SOLICITACAO, TIPO_CHAT, ESTADOS_FINAIS, ESPERAS_S, MAX_TENTATIVAS, TIMEOUT_MS,
    config, estadoPublico, enfileirar, enfileirarChat, montarCorpo, assinarHmac, montarCabecalhos, esperaMs, erroLimpo, lerRetryAfter, chaveSolicitacao,
    varrerSolicitacoes, processarFila, acordarFila, listar, reenviar, _resetarParaTeste,
};
