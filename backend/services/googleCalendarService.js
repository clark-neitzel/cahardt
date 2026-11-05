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

// ── Kit Festa ─────────────────────────────────────────────────────────────────
const soDig = (s) => String(s || '').replace(/\D/g, '');

function montarKitFesta(kp) {
    const entrega = String(kp.modo).toLowerCase() === 'entrega';
    const dataYmd = ymd(kp.data);
    const q = quandoEvento(dataYmd, kp.horario);
    const hora = q.hora || String(kp.horario || '').trim();
    const titulo = `🎉 Kit Festa #${kp.numero} · ${kp.nomeCliente} · ${entrega ? 'Entrega' : 'Retirada'}${hora ? ' ' + hora : ''} · ${kp.totalCaixas} caixa${kp.totalCaixas === 1 ? '' : 's'}`;
    const linhas = [];
    (kp.itens || []).forEach(i => linhas.push(`• ${i.quantidade}x ${i.nomeProduto}${i.opcao ? ` (${i.opcao})` : ''}`));
    const d = [`Itens:`, ...linhas];
    if (kp.telefoneCliente) d.push('', `Telefone: ${kp.telefoneCliente}`);
    if (entrega && kp.enderecoEntrega) d.push(`Endereço: ${kp.enderecoEntrega}`);
    if (kp.observacoes) d.push('', `Obs.: ${kp.observacoes}`);
    return { titulo, descricao: d.join('\n'), dataYmd, horario: kp.horario };
}

/**
 * Sincroniza o evento de um pedido Kit Festa com o estado atual:
 *  CONVERTIDO (aprovado) → cria/atualiza; RECUSADO/CANCELADO → apaga; outros → não mexe.
 * Nunca lança.
 */
async function sincronizarKitFesta(id) {
    try {
        const kp = await prisma.kitFestaPedido.findUnique({
            where: { id },
            select: {
                id: true, numero: true, status: true, modo: true, data: true, horario: true, nomeCliente: true,
                telefoneCliente: true, enderecoEntrega: true, observacoes: true, totalCaixas: true, gcalEventId: true,
                itens: { select: { nomeProduto: true, opcao: true, quantidade: true } },
            },
        });
        if (!kp) return { ok: false, motivo: 'nao_encontrado' };
        if (['RECUSADO', 'CANCELADO'].includes(kp.status)) {
            if (!kp.gcalEventId) return { ok: true, nada: true };
            const r = await removerEvento(kp.gcalEventId);
            if (r.ok) await prisma.kitFestaPedido.update({ where: { id }, data: { gcalEventId: null } });
            return r;
        }
        if (kp.status !== 'CONVERTIDO' && kp.status !== 'APROVADO') return { ok: true, nada: true };
        const novoId = await _upsert(kp.gcalEventId, montarKitFesta(kp));
        if (novoId !== kp.gcalEventId) await prisma.kitFestaPedido.update({ where: { id }, data: { gcalEventId: novoId } });
        return { ok: !!novoId, id: novoId };
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarKitFesta:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

// ── Amostras ──────────────────────────────────────────────────────────────────
function montarAmostra(a) {
    const quem = a.cliente ? (a.cliente.NomeFantasia || a.cliente.Nome) : (a.lead?.nomeEstabelecimento || 'Sem cliente');
    const titulo = `🧪 Amostra AM#${a.numero} · ${quem} · ${a.solicitadoPor?.nome || 'Sem vendedor'}`;
    const d = ['Itens:', ...(a.itens || []).map(i => `• ${Number(i.quantidade)}x ${String(i.nomeProduto).replace(/^Amostra - /, '')}`)];
    const tel = a.cliente?.Telefone_Celular || a.cliente?.Telefone_Comercial;
    if (tel) d.push('', `Telefone: ${tel}`);
    if (a.cliente?.End_Logradouro) {
        d.push(`Endereço: ${[a.cliente.End_Logradouro, a.cliente.End_Numero, a.cliente.End_Bairro, a.cliente.End_Cidade].filter(Boolean).join(', ')}`);
    }
    if (a.observacao) d.push('', `Obs.: ${a.observacao}`);
    return { titulo, descricao: d.join('\n'), dataYmd: ymd(a.dataEntrega), horario: null };
}

/** CANCELADA ou sem data → apaga; senão cria/atualiza. Nunca lança. */
async function sincronizarAmostra(id) {
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
        if (a.status === 'CANCELADA' || !a.dataEntrega) {
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

// ── Sincronização dos já existentes (pedidos aprovados / amostras em aberto) ──
let _sincronizando = false;

/**
 * Manda para a agenda o que já existia antes da integração:
 *  Kit Festa aprovado (CONVERTIDO/APROVADO) com data >= hoje;
 *  Amostra fora de ENTREGUE/CANCELADA com dataEntrega >= hoje.
 * Idempotente: quem já tem gcalEventId só é atualizado (conta em jaExistiam).
 * Nunca lança. Devolve { criados, jaExistiam, erros, errosLista }.
 */
async function sincronizarExistentes() {
    const r = { criados: 0, jaExistiam: 0, erros: 0, errosLista: [] };
    if (_sincronizando) return { ...r, ocupado: true };
    _sincronizando = true;
    try {
        const c = await _contexto();
        if (!c.cal) return { ...r, motivo: c.motivo, erros: 1, errosLista: [`agenda indisponível: ${c.motivo}`] };
        const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
        const kits = await prisma.kitFestaPedido.findMany({
            where: { status: { in: ['CONVERTIDO', 'APROVADO'] }, data: { gte: hoje } },
            select: { id: true, numero: true, gcalEventId: true }, orderBy: { data: 'asc' },
        });
        const amostras = await prisma.amostra.findMany({
            where: { status: { notIn: ['ENTREGUE', 'CANCELADA'] }, dataEntrega: { gte: hoje } },
            select: { id: true, numero: true, gcalEventId: true }, orderBy: { dataEntrega: 'asc' },
        });
        const lote = [
            ...kits.map(k => ({ rot: `Kit Festa #${k.numero}`, tinha: !!k.gcalEventId, fn: () => sincronizarKitFesta(k.id) })),
            ...amostras.map(a => ({ rot: `Amostra AM#${a.numero}`, tinha: !!a.gcalEventId, fn: () => sincronizarAmostra(a.id) })),
        ];
        for (const it of lote) {
            const x = await it.fn();
            if (x && x.ok && x.id) { it.tinha ? r.jaExistiam++ : r.criados++; }
            else {
                r.erros++;
                if (r.errosLista.length < 10) r.errosLista.push(`${it.rot}: ${x?.erro || x?.motivo || 'falha'}`);
            }
            await new Promise(res => setTimeout(res, 150)); // respeita a cota da API
        }
        console.log(`[GoogleCalendar] sincronizarExistentes: ${JSON.stringify({ ...r, total: lote.length })}`);
        return r;
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarExistentes:', e?.message || e);
        return { ...r, erros: r.erros + 1, errosLista: [...r.errosLista, e?.message || 'erro'] };
    } finally { _sincronizando = false; }
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
    sincronizarKitFesta, sincronizarAmostra, sincronizarExistentes, disparar, status,
    _montarKitFesta: montarKitFesta, _montarAmostra: montarAmostra, _quandoEvento: quandoEvento,
};
