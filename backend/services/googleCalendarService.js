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
async function sincronizarKitFesta(id) { return serializar('kf:' + id, () => _sincronizarKitFesta(id)); }
async function _sincronizarKitFesta(id) {
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
const LIMITE_LOTE = 50;

/**
 * Manda para a agenda o que já existia antes da integração:
 *  Kit Festa aprovado (CONVERTIDO/APROVADO) e Amostra fora de ENTREGUE/CANCELADA (data >= hoje);
 *  Pedidos de delivery elegíveis (ver pedidoElegivel) com data de entrega >= hoje.
 *
 * Idempotente e em LOTES: cria no máximo `limite` (padrão 50) eventos que ainda não existem por
 * chamada e devolve `restantes` (quantos faltam) — quem chama repete até restantes = 0.
 * Quem já tem evento NÃO volta a chamar o Google (os ganchos e a rotina de conferência mantêm
 * o evento atualizado): conta em `jaExistiam`. Pedido com evento que deixou de ser elegível
 * (devolução total, balcão, cancelado) é apagado da agenda e conta em `removidos`.
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
        const ontem = new Date(hoje); ontem.setUTCDate(ontem.getUTCDate() - 1); // folga de fuso; corte exato pela data de SP
        const hojeStr = hojeSP();
        
        // 1) o que já tem evento: confere sem chamar o Google (só remove se deixou de valer)
        const kitsComEvento = await prisma.kitFestaPedido.count({ where: { status: { in: ['CONVERTIDO', 'APROVADO'] }, data: { gte: hoje }, gcalEventId: { not: null } } });
        const amostrasComEvento = await prisma.amostra.count({ where: { status: { notIn: ['ENTREGUE', 'CANCELADA'] }, dataEntrega: { gte: hoje }, gcalEventId: { not: null } } });
        r.jaExistiam += kitsComEvento + amostrasComEvento;
        const pedidosComEvento = await prisma.pedido.findMany({
            where: { gcalEventId: { not: null }, dataVenda: { gte: ontem } },
            select: { id: true, numero: true }, orderBy: { dataVenda: 'asc' },
        });
        for (const p of pedidosComEvento) {
            const x = await sincronizarPedido(p.id, { semAtualizar: true });
            if (x.semMudanca) r.jaExistiam++;
            else if (x.ok && !x.nada) { r.removidos++; await new Promise(res => setTimeout(res, 150)); }
            else if (!x.ok) { r.erros++; if (r.errosLista.length < 10) r.errosLista.push(`Pedido #${p.numero ?? 's/n'}: ${x.erro || x.motivo || 'falha'}`); }
        }

        // 2) o que ainda NÃO tem evento (pendentes), em ordem de data, cortado em `limite`
        const kits = await prisma.kitFestaPedido.findMany({
            where: { status: { in: ['CONVERTIDO', 'APROVADO'] }, data: { gte: hoje }, gcalEventId: null },
            select: { id: true, numero: true }, orderBy: { data: 'asc' },
        });
        const amostras = await prisma.amostra.findMany({
            where: { status: { notIn: ['ENTREGUE', 'CANCELADA'] }, dataEntrega: { gte: hoje }, gcalEventId: null },
            select: { id: true, numero: true }, orderBy: { dataEntrega: 'asc' },
        });
        const pedidos = await prisma.pedido.findMany({
            where: {
                cancelado: false, gcalEventId: null, dataVenda: { gte: ontem },
                // mesmos filtros de pedidoElegivel, para o lote avançar sem travar em inelegíveis
                cliente: { OR: [{ gps: null }, { gps: { balcao: false } }] },
                devolucoes: { none: { status: 'ATIVA', escopo: 'TOTAL' } },
                AND: [
                    { OR: [{ canalOrigem: null }, { canalOrigem: { not: 'KIT_FESTA' } }] },
                    { OR: [{ situacaoCA: 'FATURADO' }, { especial: true, numero: { not: null } }, { bonificacao: true, numero: { not: null } }] },
                ],
            },
            select: { id: true, numero: true, especial: true, bonificacao: true, dataVenda: true }, orderBy: { dataVenda: 'asc' },
        });
        const pendentes = [
            ...pedidos.filter(p => dataSP(p.dataVenda) >= hojeStr).map(p => ({
                rot: `${p.bonificacao ? 'Bonificação BN#' : p.especial ? 'Pedido ZZ#' : 'Pedido #'}${p.numero ?? 's/n'}`,
                fn: () => sincronizarPedido(p.id),
            })),
            ...kits.map(k => ({ rot: `Kit Festa #${k.numero}`, fn: () => sincronizarKitFesta(k.id) })),
            ...amostras.map(a => ({ rot: `Amostra AM#${a.numero}`, fn: () => sincronizarAmostra(a.id) })),
        ];
        const lote = pendentes.slice(0, Math.max(1, limite));
        r.restantes = pendentes.length - lote.length;
        for (const it of lote) {
            const x = await it.fn();
            if (x && x.nada) continue; // ficou inelegível no meio do caminho: não conta
            if (x && x.ok && x.id) r.criados++;
            else {
                r.erros++;
                if (r.errosLista.length < 10) r.errosLista.push(`${it.rot}: ${x?.erro || x?.motivo || 'falha'}`);
            }
            await new Promise(res => setTimeout(res, 150)); // respeita a cota da API
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
        if (!r.restantes || !r.criados || r.motivo) break;
    }
    console.log(`[GoogleCalendar] sincronizarExistentesTudo: ${JSON.stringify(total)}`);
    return total;
}

// ── Pedidos de delivery (normais, especiais e bonificações) ───────────────────
const dataSP = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }) : null);
const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * Critério de elegibilidade (decisão do dono, 11/2026):
 *  - NÃO cancelado e SEM devolução TOTAL ativa;
 *  - NÃO vindo do Kit Festa (canalOrigem KIT_FESTA — o evento já existe pelo KitFestaPedido);
 *  - cliente NÃO é "balcão" (retira na empresa);
 *  - venda firme: situacaoCA = FATURADO, OU especial já lançado (tem número ZZ#),
 *    OU bonificação já lançada (tem número BN#).
 */
function pedidoElegivel(p) {
    if (!p || p.cancelado) return false;
    if (p.canalOrigem === 'KIT_FESTA') return false;
    if (p.cliente?.gps?.balcao) return false;
    if ((p.devolucoes || []).length > 0) return false; // já filtradas: ATIVA + TOTAL
    if (p.bonificacao) return p.numero != null;
    if (p.especial) return p.numero != null;
    return p.situacaoCA === 'FATURADO';
}

const fmtQtd = (n) => { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace('.', ','); };

function montarPedido(p) {
    const cli = p.cliente?.NomeFantasia || p.cliente?.Nome || 'Sem cliente';
    const un = (p.itens || []).reduce((s, i) => s + Number(i.quantidade || 0), 0);
    const num = p.numero != null ? p.numero : 's/n';
    const rot = p.bonificacao ? `🎁 Bonificação BN#${num}` : `📦 Pedido ${p.especial ? 'ZZ#' : '#'}${num}`;
    const titulo = `${rot} · ${cli} · ${fmtQtd(un)} un`;
    const d = ['Itens:', ...(p.itens || []).map(i => `• ${fmtQtd(i.quantidade)}x ${i.produto?.nome || i.descricao || 'Item'}`)];
    const tel = p.cliente?.Telefone_Celular || p.cliente?.Telefone_Comercial;
    if (tel) d.push('', `Telefone: ${tel}`);
    const c = p.cliente || {};
    if (c.End_Logradouro) d.push(`Endereço: ${[c.End_Logradouro, c.End_Numero, c.End_Bairro, c.End_Cidade].filter(Boolean).join(', ')}`);
    if (p.vendedor?.nome) d.push(`Vendedor: ${p.vendedor.nome}`);
    if (p.observacoes) d.push('', `Observações: ${p.observacoes}`);
    return { titulo, descricao: d.join('\n'), dataYmd: dataSP(p.dataVenda), horario: null };
}

/**
 * Sincroniza o evento de um pedido com o estado atual: elegível → cria/atualiza (só cria se a
 * data de entrega é de hoje em diante); não elegível (cancelado, devolução total, balcão…) → apaga.
 * Nunca lança.
 */
async function sincronizarPedido(id, opts = {}) { return serializar('pd:' + id, () => _sincronizarPedido(id, opts)); }
async function _sincronizarPedido(id, opts = {}) {
    try {
        const p = await prisma.pedido.findUnique({
            where: { id },
            select: {
                id: true, numero: true, especial: true, bonificacao: true, situacaoCA: true, cancelado: true,
                canalOrigem: true, dataVenda: true, observacoes: true, gcalEventId: true,
                vendedor: { select: { nome: true } },
                cliente: { select: { NomeFantasia: true, Nome: true, Telefone_Celular: true, Telefone_Comercial: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true, gps: { select: { balcao: true } } } },
                itens: { select: { quantidade: true, descricao: true, produto: { select: { nome: true } } } },
                devolucoes: { where: { status: 'ATIVA', escopo: 'TOTAL' }, select: { id: true }, take: 1 },
            },
        });
        if (!p) return { ok: true, nada: true };
        if (!pedidoElegivel(p)) {
            if (!p.gcalEventId) return { ok: true, nada: true };
            const r = await removerEvento(p.gcalEventId);
            if (r.ok) await prisma.pedido.update({ where: { id }, data: { gcalEventId: null } });
            return r;
        }
        if (opts.semAtualizar && p.gcalEventId) return { ok: true, id: p.gcalEventId, semMudanca: true }; // só conferência
        const dia = dataSP(p.dataVenda);
        if (!p.gcalEventId && (!dia || dia < hojeSP())) return { ok: true, nada: true }; // entrega passada: não cria
        const novoId = await _upsert(p.gcalEventId, montarPedido(p));
        if (novoId !== p.gcalEventId) await prisma.pedido.update({ where: { id }, data: { gcalEventId: novoId } });
        return { ok: !!novoId, id: novoId };
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarPedido:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

/** Remove o evento de um pedido que está sendo EXCLUÍDO (chamar com o gcalEventId lido antes do delete). */
function removerEventoDePedidoExcluido(gcalEventId) {
    if (gcalEventId) disparar(removerEvento, gcalEventId);
}

/**
 * Rede de segurança: reconcilia pedidos alterados há pouco (qualquer caminho que mexa em
 * situação/data/cancelamento, inclusive sincronizações), cobrindo o que os ganchos não pegam.
 */
async function reconciliarPedidosRecentes(minutos = 30, limite = 300) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        const desde = new Date(Date.now() - minutos * 60000);
        const rows = await prisma.pedido.findMany({
            where: { updatedAt: { gte: desde }, OR: [{ canalOrigem: null }, { canalOrigem: { not: 'KIT_FESTA' } }] },
            select: { id: true }, orderBy: { updatedAt: 'desc' }, take: limite,
        });
        let feitos = 0;
        for (const r of rows) {
            const x = await sincronizarPedido(r.id);
            if (!x.nada) { feitos++; await new Promise(res => setTimeout(res, 150)); }
        }
        if (feitos) console.log(`[GoogleCalendar] reconciliarPedidosRecentes: ${feitos} pedido(s) sincronizado(s)`);
        return { ok: true, verificados: rows.length, sincronizados: feitos };
    } catch (e) {
        console.error('[GoogleCalendar] reconciliarPedidosRecentes:', e?.message || e);
        return { ok: false, erro: e?.message };
    }
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
    sincronizarKitFesta, sincronizarAmostra, sincronizarPedido, removerEventoDePedidoExcluido, reconciliarPedidosRecentes, sincronizarExistentes, sincronizarExistentesTudo, disparar, status,
    _montarKitFesta: montarKitFesta, _montarPedido: montarPedido, _pedidoElegivel: pedidoElegivel, _montarAmostra: montarAmostra, _quandoEvento: quandoEvento,
};
