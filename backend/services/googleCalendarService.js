/**
 * Google Calendar — agenda "Produção" (Kit Festa + Amostras aparecem sozinhos).
 *
 * Reaproveita as credenciais OAuth do Google Drive (app_configs.gdrive_config:
 * clientId, clientSecret, refreshToken). O refresh token precisa ter sido autorizado
 * com o escopo `calendar.events` (reautorização manual do dono — ver
 * GET /api/config-gcal/auth-url).
 *
 * ID da agenda: app_configs.gcal_config = { calendarId }. Sem calendarId o serviço fica inerte.
 *
 * REGRA: NADA aqui pode derrubar o fluxo principal (pedido/amostra). Toda função é
 * best-effort: erro só vira log `[GoogleCalendar]`. Nunca chamar dentro de $transaction.
 */

const { google } = require('googleapis');
const prisma = require('../config/database');
const gdrive = require('./googleDriveService');

const TZ = 'America/Sao_Paulo';
const DURACAO_PADRAO_MIN = 60;
const ESCOPO_CALENDAR = 'https://www.googleapis.com/auth/calendar.events';

let _cfgCache = null;
let _cfgCacheAt = 0;
let _cal = null;
let _calRefreshToken = null;

async function carregarConfig() {
    if (_cfgCache && Date.now() - _cfgCacheAt < 30000) return _cfgCache;
    let cfg = {};
    try {
        const row = await prisma.appConfig.findUnique({ where: { key: 'gcal_config' } });
        cfg = (row?.value && typeof row.value === 'object') ? row.value : {};
    } catch (e) {
        console.warn('[GoogleCalendar] Falha ao carregar config:', e.message);
    }
    _cfgCache = cfg;
    _cfgCacheAt = Date.now();
    return cfg;
}

function limparCacheConfig() { _cfgCache = null; _cfgCacheAt = 0; _cal = null; _calRefreshToken = null; }

async function getCalendar() {
    const g = await gdrive.carregarConfig();
    if (!(g && g.ativo && g.clientId && g.clientSecret && g.refreshToken)) return null;
    if (_cal && _calRefreshToken === g.refreshToken) return _cal;
    const auth = new google.auth.OAuth2(g.clientId, g.clientSecret);
    auth.setCredentials({ refresh_token: g.refreshToken });
    _cal = google.calendar({ version: 'v3', auth });
    _calRefreshToken = g.refreshToken;
    return _cal;
}

// ── Montagem do horário ───────────────────────────────────────────────────────
function ymd(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10); // colunas de data guardam meia-noite UTC
}

function somaMinutos(hhmm, min) {
    const [h, m] = hhmm.split(':').map(Number);
    const t = Math.min(h * 60 + m + min, 23 * 60 + 59);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Com hora → evento marcado (1h); sem hora → evento de dia inteiro.
function quandoEvento(dataYmd, horario) {
    const m = String(horario || '').match(/(\d{1,2}):(\d{2})/);
    if (m) {
        const ini = `${m[1].padStart(2, '0')}:${m[2]}`;
        return {
            start: { dateTime: `${dataYmd}T${ini}:00`, timeZone: TZ },
            end: { dateTime: `${dataYmd}T${somaMinutos(ini, DURACAO_PADRAO_MIN)}:00`, timeZone: TZ },
            hora: ini,
        };
    }
    const prox = new Date(`${dataYmd}T00:00:00Z`); prox.setUTCDate(prox.getUTCDate() + 1);
    return { start: { date: dataYmd }, end: { date: prox.toISOString().slice(0, 10) }, hora: null };
}

// ── Operações de baixo nível (nunca lançam) ───────────────────────────────────
async function _contexto() {
    const cfg = await carregarConfig();
    if (!cfg.calendarId) return { motivo: 'sem_calendar_id' };
    const cal = await getCalendar();
    if (!cal) return { motivo: 'nao_configurado' };
    return { cal, calendarId: cfg.calendarId };
}

/** Cria o evento. Devolve { ok, id } */
async function criarEvento({ titulo, descricao, dataYmd, horario }) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        const q = quandoEvento(dataYmd, horario);
        const requestBody = { summary: titulo, description: descricao || '', start: q.start, end: q.end };
        console.log('[GoogleCalendar] events.insert', JSON.stringify({ calendarId: c.calendarId, summary: titulo }));
        const r = await c.cal.events.insert({ calendarId: c.calendarId, requestBody });
        return { ok: true, id: r.data.id };
    } catch (e) {
        console.error('[GoogleCalendar] Falha ao criar evento:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

/** Atualiza o evento. Se ele não existe mais na agenda (404/410), devolve { ok:false, naoExiste:true }. */
async function atualizarEvento(eventId, { titulo, descricao, dataYmd, horario }) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        const q = quandoEvento(dataYmd, horario);
        const requestBody = { summary: titulo, description: descricao || '', start: q.start, end: q.end };
        console.log('[GoogleCalendar] events.update', JSON.stringify({ calendarId: c.calendarId, eventId, summary: titulo }));
        const r = await c.cal.events.update({ calendarId: c.calendarId, eventId, requestBody });
        return { ok: true, id: r.data.id };
    } catch (e) {
        const st = e?.code || e?.response?.status;
        if (st === 404 || st === 410) return { ok: false, naoExiste: true };
        console.error('[GoogleCalendar] Falha ao atualizar evento:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

/** Remove o evento (já inexistente conta como sucesso). */
async function removerEvento(eventId) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        console.log('[GoogleCalendar] events.delete', JSON.stringify({ calendarId: c.calendarId, eventId }));
        await c.cal.events.delete({ calendarId: c.calendarId, eventId });
        return { ok: true };
    } catch (e) {
        const st = e?.code || e?.response?.status;
        if (st === 404 || st === 410) return { ok: true, jaRemovido: true };
        console.error('[GoogleCalendar] Falha ao remover evento:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

// cria ou atualiza e devolve o id vigente (ou null)
async function _upsert(eventId, dados) {
    if (eventId) {
        const r = await atualizarEvento(eventId, dados);
        if (r.ok) return eventId;
        if (!r.naoExiste) return eventId;       // erro transitório: mantém o id, tenta de novo na próxima mudança
    }
    const c = await criarEvento(dados);
    return c.ok ? c.id : (eventId || null);
}

// Evita criar o evento em duplicidade quando o gancho e a rotina de conferência
// pegam o mesmo registro ao mesmo tempo (fila por chave, dentro deste processo).
const _filas = new Map();
function serializar(chave, fn) {
    const ant = _filas.get(chave) || Promise.resolve();
    const prox = ant.catch(() => {}).then(fn);
    _filas.set(chave, prox);
    prox.finally(() => { if (_filas.get(chave) === prox) _filas.delete(chave); }).catch(() => {});
    return prox;
}

// ── Kit Festa ─────────────────────────────────────────────────────────────────
const soDig = (s) => String(s || '').replace(/\D/g, '');

const ROTULO_ETAPA_KIT = { PEDIDO: 'A produzir', PRODUCAO: 'Em produção', SAINDO: 'Saiu para entrega', ENTREGUE: 'Entregue' };
/** Status que aparece na agenda: etapa da aba Delivery; sem pedido/etapa ainda → "Aprovado". */
function statusKitFesta(etapa) { return ROTULO_ETAPA_KIT[etapa] || 'Aprovado'; }

/** Tem pedido mas ainda sem DeliveryStatus → está na 1ª coluna ("A produzir"); sem pedido → null ("Aprovado"). */
function etapaDoKit(kp, etapaDelivery) { return kp.pedidoId ? (etapaDelivery || 'PEDIDO') : null; }
/** Sai da agenda: recusado/cancelado, pedido vinculado cancelado, ou CONVERTIDO que perdeu o pedido (excluído). */
function kitSaiDaAgenda(kp, pedidoCancelado) {
    return ['RECUSADO', 'CANCELADO'].includes(kp.status) || !!pedidoCancelado || (kp.status === 'CONVERTIDO' && !kp.pedidoId);
}

function montarKitFesta(kp, etapa) {
    const entrega = String(kp.modo).toLowerCase() === 'entrega';
    const dataYmd = ymd(kp.data);
    const q = quandoEvento(dataYmd, kp.horario);
    const hora = q.hora || String(kp.horario || '').trim();
    const status = statusKitFesta(etapa);
    const titulo = `🎉 Kit Festa #${kp.numero} · ${kp.nomeCliente} · ${entrega ? 'Entrega' : 'Retirada'}${hora ? ' ' + hora : ''} · ${kp.totalCaixas} caixa${kp.totalCaixas === 1 ? '' : 's'} · ${status}`;
    const linhas = [];
    (kp.itens || []).forEach(i => linhas.push(`• ${i.quantidade}x ${i.nomeProduto}${i.opcao ? ` (${i.opcao})` : ''}`));
    const d = [`Status: ${status}`, '', `Itens:`, ...linhas];
    if (kp.telefoneCliente) d.push('', `Telefone: ${kp.telefoneCliente}`);
    if (entrega && kp.enderecoEntrega) d.push(`Endereço: ${kp.enderecoEntrega}`);
    if (kp.observacoes) d.push('', `Obs.: ${kp.observacoes}`);
    return { titulo, descricao: d.join('\n'), dataYmd, horario: kp.horario };
}

/**
 * Sincroniza o evento de um pedido Kit Festa com o estado atual:
 *  CONVERTIDO/APROVADO → cria/atualiza com o status da aba Delivery no título; RECUSADO/CANCELADO
 *  (ou pedido vinculado cancelado) → apaga; outros → não mexe.
 * Nunca lança.
 */
async function sincronizarKitFesta(id) { return serializar('kf:' + id, () => _sincronizarKitFesta(id)); }
async function _sincronizarKitFesta(id) {
    try {
        const kp = await prisma.kitFestaPedido.findUnique({
            where: { id },
            select: {
                id: true, numero: true, status: true, modo: true, data: true, horario: true, nomeCliente: true,
                telefoneCliente: true, enderecoEntrega: true, observacoes: true, totalCaixas: true, gcalEventId: true,
                pedidoId: true,
                itens: { select: { nomeProduto: true, opcao: true, quantidade: true } },
            },
        });
        if (!kp) return { ok: false, motivo: 'nao_encontrado' };
        // etapa da aba Delivery (se já virou pedido) e se o pedido foi cancelado
        let etapa = null, pedidoCancelado = false;
        if (kp.pedidoId) {
            const [ds, ped] = await Promise.all([
                prisma.deliveryStatus.findUnique({ where: { pedidoId: kp.pedidoId }, select: { etapa: true } }),
                prisma.pedido.findUnique({ where: { id: kp.pedidoId }, select: { cancelado: true } }),
            ]);
            etapa = etapaDoKit(kp, ds?.etapa);
            pedidoCancelado = !!ped?.cancelado;
        }
        if (kitSaiDaAgenda(kp, pedidoCancelado)) {
            if (!kp.gcalEventId) return { ok: true, nada: true };
            const r = await removerEvento(kp.gcalEventId);
            if (r.ok) await prisma.kitFestaPedido.update({ where: { id }, data: { gcalEventId: null } });
            return r;
        }
        if (kp.status !== 'CONVERTIDO' && kp.status !== 'APROVADO') return { ok: true, nada: true };
        const novoId = await _upsert(kp.gcalEventId, montarKitFesta(kp, etapa));
        if (novoId !== kp.gcalEventId) await prisma.kitFestaPedido.update({ where: { id }, data: { gcalEventId: novoId } });
        return { ok: !!novoId, id: novoId };
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarKitFesta:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

// ── Amostras ──────────────────────────────────────────────────────────────────
const ROTULO_STATUS_AMOSTRA = { SOLICITADA: 'Solicitada', PREPARACAO: 'Em preparação', LIBERADO: 'Liberada', ENTREGUE: 'Entregue' };
const STATUS_AMOSTRA_NA_AGENDA = Object.keys(ROTULO_STATUS_AMOSTRA);

function montarAmostra(a) {
    const status = ROTULO_STATUS_AMOSTRA[a.status] || a.status;
    const quem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead?.nomeEstabelecimento || 'Sem cliente');
    const titulo = `🧪 Amostra AM#${a.numero} · ${quem} · ${a.solicitadoPor?.nome || 'Sem vendedor'} · ${status}`;
    const d = [`Status: ${status}`, '', 'Itens:', ...(a.itens || []).map(i => `• ${Number(i.quantidade)}x ${String(i.nomeProduto).replace(/^Amostra - /, '')}`)];
    const tel = a.cliente?.Telefone_Celular || a.cliente?.Telefone_Comercial;
    if (tel) d.push('', `Telefone: ${tel}`);
    if (a.cliente?.End_Logradouro) {
        d.push(`Endereço: ${[a.cliente.End_Logradouro, a.cliente.End_Numero, a.cliente.End_Bairro, a.cliente.End_Cidade].filter(Boolean).join(', ')}`);
    }
    if (a.observacao) d.push('', `Obs.: ${a.observacao}`);
    return { titulo, descricao: d.join('\n'), dataYmd: ymd(a.dataEntrega), horario: null };
}

/** SOLICITADA/PREPARACAO/LIBERADO/ENTREGUE com data entram; CANCELADA ou sem data → apaga. Nunca lança. */
async function sincronizarAmostra(id) { return serializar('am:' + id, () => _sincronizarAmostra(id)); }
async function _sincronizarAmostra(id) {
    try {
        const a = await prisma.amostra.findUnique({
            where: { id },
            select: {
                id: true, numero: true, status: true, dataEntrega: true, observacao: true, gcalEventId: true,
                solicitadoPor: { select: { nome: true } },
                lead: { select: { nomeEstabelecimento: true } },
                cliente: { select: { NomeFantasia: true, Nome: true, Telefone_Celular: true, Telefone_Comercial: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true } },
                itens: { select: { nomeProduto: true, quantidade: true } },
            },
        });
        if (!a) return { ok: false, motivo: 'nao_encontrada' };
        if (!STATUS_AMOSTRA_NA_AGENDA.includes(a.status) || !a.dataEntrega) {
            if (!a.gcalEventId) return { ok: true, nada: true };
            const r = await removerEvento(a.gcalEventId);
            if (r.ok) await prisma.amostra.update({ where: { id }, data: { gcalEventId: null } });
            return r;
        }
        const novoId = await _upsert(a.gcalEventId, montarAmostra(a));
        if (novoId !== a.gcalEventId) await prisma.amostra.update({ where: { id }, data: { gcalEventId: novoId } });
        return { ok: !!novoId, id: novoId };
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarAmostra:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

// ── Sincronização dos já existentes (Kit Festa aprovado / amostras aprovadas) ─
let _sincronizando = false;
const LIMITE_LOTE = 50;
const pausa = () => new Promise(res => setTimeout(res, 150)); // respeita a cota da API

/**
 * Manda para a agenda o que já existia antes da integração:
 *  Kit Festa aprovado (CONVERTIDO/APROVADO) e Amostra (SOLICITADA/PREPARACAO/LIBERADO), data >= hoje.
 *
 * Também FAZ A LIMPEZA do que não deve estar na agenda:
 *  - eventos de PEDIDO de entrega (Pedido.gcalEventId, escopo reprovado em 11/2026): apaga o evento no
 *    Google e zera a coluna (idempotente: depois de limpo, não encontra mais nada);
 *  - amostras CANCELADAS que tenham evento.
 *
 * Idempotente e em LOTES: faz no máximo `limite` (padrão 50) operações de limpeza e `limite` criações
 * por chamada e devolve `restantes` (quantas faltam) — quem chama repete até restantes = 0.
 * Quem já tem evento NÃO volta a chamar o Google: conta em `jaExistiam`.
 * Nunca lança. Devolve { criados, jaExistiam, removidos, erros, errosLista, restantes }.
 */
async function sincronizarExistentes({ limite = LIMITE_LOTE } = {}) {
    const r = { criados: 0, jaExistiam: 0, removidos: 0, erros: 0, errosLista: [], restantes: 0 };
    if (_sincronizando) return { ...r, ocupado: true };
    _sincronizando = true;
    try {
        const c = await _contexto();
        if (!c.cal) return { ...r, motivo: c.motivo, erros: 1, errosLista: [`agenda indisponível: ${c.motivo}`] };
        const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
        const lim = Math.max(1, limite);
        const erro = (rot, x) => { r.erros++; if (r.errosLista.length < 10) r.errosLista.push(`${rot}: ${x?.erro || x?.motivo || 'falha'}`); };

        // 0) limpeza única: eventos de pedido de entrega (não fazem parte da agenda)
        const pedidosComEvento = await prisma.pedido.findMany({
            where: { gcalEventId: { not: null } },
            select: { id: true, numero: true, gcalEventId: true }, orderBy: { createdAt: 'asc' }, take: lim,
        });
        for (const p of pedidosComEvento) {
            const x = await removerEvento(p.gcalEventId); // 404/410 já conta como ok
            if (x.ok) {
                await prisma.pedido.update({ where: { id: p.id }, data: { gcalEventId: null } });
                r.removidos++;
            } else erro(`Pedido #${p.numero ?? 's/n'}`, x);
            await pausa();
        }
        const pedidosFaltam = await prisma.pedido.count({ where: { gcalEventId: { not: null } } });

        // 0b) amostras CANCELADAS que ainda têm evento: apaga
        const amostrasIndevidas = await prisma.amostra.findMany({
            where: { status: 'CANCELADA', gcalEventId: { not: null } },
            select: { id: true, numero: true }, take: lim,
        });
        for (const a of amostrasIndevidas) {
            const x = await sincronizarAmostra(a.id);
            if (x.ok && !x.nada) r.removidos++; else if (!x.ok) erro(`Amostra AM#${a.numero}`, x);
            await pausa();
        }
        const amostrasIndevidasFaltam = await prisma.amostra.count({ where: { status: 'CANCELADA', gcalEventId: { not: null } } });

        // 1) o que já tem evento: não chama o Google (os ganchos mantêm o evento atualizado)
        // CONVERTIDO sem pedido (excluído) não é elegível; APROVADO sem pedido é
        const whereKit = { OR: [{ status: 'APROVADO' }, { status: 'CONVERTIDO', pedidoId: { not: null } }], data: { gte: hoje } };
        const whereAm = { status: { in: ['SOLICITADA', 'PREPARACAO', 'LIBERADO'] }, dataEntrega: { gte: hoje } };
        r.jaExistiam += await prisma.kitFestaPedido.count({ where: { ...whereKit, gcalEventId: { not: null } } });
        r.jaExistiam += await prisma.amostra.count({ where: { ...whereAm, gcalEventId: { not: null } } });

        // 2) o que ainda NÃO tem evento (pendentes), em ordem de data, cortado em `limite`
        const kits = await prisma.kitFestaPedido.findMany({
            where: { ...whereKit, gcalEventId: null }, select: { id: true, numero: true }, orderBy: { data: 'asc' },
        });
        const amostras = await prisma.amostra.findMany({
            where: { ...whereAm, gcalEventId: null }, select: { id: true, numero: true }, orderBy: { dataEntrega: 'asc' },
        });
        const pendentes = [
            ...kits.map(k => ({ rot: `Kit Festa #${k.numero}`, fn: () => sincronizarKitFesta(k.id) })),
            ...amostras.map(a => ({ rot: `Amostra AM#${a.numero}`, fn: () => sincronizarAmostra(a.id) })),
        ];
        const lote = pendentes.slice(0, lim);
        r.restantes = (pendentes.length - lote.length) + pedidosFaltam + amostrasIndevidasFaltam;
        for (const it of lote) {
            const x = await it.fn();
            if (x && x.nada) continue; // ficou inelegível no meio do caminho: não conta
            if (x && x.ok && x.id) r.criados++; else erro(it.rot, x);
            await pausa();
        }
        console.log(`[GoogleCalendar] sincronizarExistentes: ${JSON.stringify({ ...r, lote: lote.length })}`);
        return r;
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarExistentes:', e?.message || e);
        return { ...r, erros: r.erros + 1, errosLista: [...r.errosLista, e?.message || 'erro'] };
    } finally { _sincronizando = false; }
}

/**
 * Roda os lotes em sequência até acabar (uso interno, em segundo plano — ex.: logo após a
 * reautorização). Respeita a trava e para se um lote não avançar (só erros) ou após 100 lotes.
 */
async function sincronizarExistentesTudo() {
    const total = { criados: 0, jaExistiam: 0, removidos: 0, erros: 0, errosLista: [], restantes: 0 };
    for (let n = 0; n < 100; n++) {
        const r = await sincronizarExistentes();
        if (r.ocupado) { await new Promise(res => setTimeout(res, 5000)); continue; }
        if (n === 0) total.jaExistiam = r.jaExistiam;
        total.criados += r.criados; total.removidos += r.removidos; total.erros += r.erros;
        total.errosLista = [...total.errosLista, ...r.errosLista].slice(0, 10);
        total.restantes = r.restantes;
        if (!r.restantes || !(r.criados || r.removidos) || r.motivo) break;
    }
    console.log(`[GoogleCalendar] sincronizarExistentesTudo: ${JSON.stringify(total)}`);
    return total;
}

// Disparo "esqueça e siga": nunca bloqueia nem propaga erro ao chamador.
function disparar(fn, ...args) {
    Promise.resolve().then(() => fn(...args)).catch(e => console.error('[GoogleCalendar] disparar:', e?.message || e));
}

// ── Status / teste (usado pela tela de configuração) ──────────────────────────
async function status() {
    try {
        const g = await gdrive.carregarConfig();
        const cfg = await carregarConfig();
        const temWebClient = !!(cfg.webClientId && cfg.webClientSecret);
        if (!(g && g.ativo && g.clientId && g.clientSecret && g.refreshToken)) {
            return { conectado: false, motivo: temWebClient ? 'google_nao_configurado' : 'sem_web_client', temWebClient };
        }
        if (!cfg.calendarId) return { conectado: false, motivo: 'sem_calendar_id', temWebClient };
        const cal = await getCalendar();
        // events.list é coberto pelo escopo calendar.events (calendars.get NÃO é). A resposta traz o
        // nome da agenda em `summary`; 404 = agenda não encontrada.
        const r = await cal.events.list({ calendarId: cfg.calendarId, maxResults: 1 });
        return { conectado: true, agenda: r.data.summary || null, calendarId: cfg.calendarId, temWebClient };
    } catch (e) {
        const st = e?.code || e?.response?.status;
        let motivo = 'erro';
        if (st === 404) motivo = 'agenda_nao_encontrada';
        else if (st === 401 || st === 403 || /insufficient|scope|invalid_grant/i.test(e?.message || '')) motivo = 'sem_permissao_calendar'; // reautorizar
        // reautorizar exige o cliente web: sem ele, o motivo útil é cadastrá-lo primeiro
        try { const c = await carregarConfig(); if (motivo === 'sem_permissao_calendar' && !(c.webClientId && c.webClientSecret)) motivo = 'sem_web_client'; } catch (_) {}
        return { conectado: false, motivo, erro: e?.message };
    }
}

module.exports = {
    ESCOPO_CALENDAR, carregarConfig, limparCacheConfig,
    criarEvento, atualizarEvento, removerEvento,
    sincronizarKitFesta, sincronizarAmostra, sincronizarExistentes, sincronizarExistentesTudo, disparar, status,
    _montarKitFesta: montarKitFesta, _etapaDoKit: etapaDoKit, _kitSaiDaAgenda: kitSaiDaAgenda, _montarAmostra: montarAmostra, _quandoEvento: quandoEvento,
};
