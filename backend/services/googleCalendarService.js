/**
 * Google Calendar — agenda "Produção" (pedidos do quadro Delivery + Kit Festa do site + Amostras aparecem sozinhos).
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
// Regra da agenda Produção (decisão do dono, 05/11/2026): o evento TERMINA na hora da entrega e começa
// `duracaoMin(unidades)` antes (= a hora de começar a produzir). Constantes num lugar só.
const PREPARO_MIN = 20;        // preparo fixo, em minutos
const MIN_POR_UNIDADE = 1.5;   // minutos por unidade (soma das quantidades dos itens)
function duracaoMin(unidades) {
    return PREPARO_MIN + Math.ceil((Number(unidades) || 0) * MIN_POR_UNIDADE);
}
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

const hhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

// Com hora → evento marcado que TERMINA nela e começa `duracao` min antes (travado em 00:00 do mesmo dia);
// sem hora → evento de dia inteiro.
function quandoEvento(dataYmd, horario, duracao = PREPARO_MIN) {
    const m = String(horario || '').match(/(\d{1,2}):(\d{2})/);
    if (m) {
        const fim = `${m[1].padStart(2, '0')}:${m[2]}`;
        const fimMin = Number(m[1]) * 60 + Number(m[2]);
        const iniMin = Math.max(0, fimMin - Math.max(1, Math.round(Number(duracao) || PREPARO_MIN)));
        const fimReal = fimMin > iniMin ? fim : hhmm(iniMin + 15); // 00:00 de entrega: evita evento de duração zero
        const ini = hhmm(iniMin);
        return {
            start: { dateTime: `${dataYmd}T${ini}:00`, timeZone: TZ },
            end: { dateTime: `${dataYmd}T${fimReal}:00`, timeZone: TZ },
            hora: fim,      // hora da ENTREGA
            inicio: ini,    // hora de começar a produzir
        };
    }
    const prox = new Date(`${dataYmd}T00:00:00Z`); prox.setUTCDate(prox.getUTCDate() + 1);
    return { start: { date: dataYmd }, end: { date: prox.toISOString().slice(0, 10) }, hora: null, inicio: null };
}

// Linha da descrição: "Entrega: 14:00 · Começar a produzir: 13:30" ou "Entrega: dia inteiro"
function linhaEntrega(q, rotulo = 'Entrega') {
    return q.hora ? `${rotulo}: ${q.hora} · Começar a produzir: ${q.inicio}` : `${rotulo}: dia inteiro`;
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
async function criarEvento({ titulo, descricao, dataYmd, horario, duracaoMin: dur }) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        const q = quandoEvento(dataYmd, horario, dur);
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
async function atualizarEvento(eventId, { titulo, descricao, dataYmd, horario, duracaoMin: dur }) {
    try {
        const c = await _contexto();
        if (!c.cal) return { ok: false, motivo: c.motivo };
        const q = quandoEvento(dataYmd, horario, dur);
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

// cria ou atualiza; devolve { id, ok }: id vigente (ou null) e ok=true só se o Google confirmou a chamada
async function _upsertR(eventId, dados) {
    if (eventId) {
        const r = await atualizarEvento(eventId, dados);
        if (r.ok) return { id: eventId, ok: true };
        if (!r.naoExiste) return { id: eventId, ok: false };   // erro transitório: mantém o id, tenta de novo na próxima mudança
    }
    const c = await criarEvento(dados);
    return c.ok ? { id: c.id, ok: true } : { id: eventId || null, ok: false };
}
// cria ou atualiza e devolve o id vigente (ou null)
async function _upsert(eventId, dados) { return (await _upsertR(eventId, dados)).id; }

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
    const totalUn = (kp.itens || []).reduce((a, i) => a + (Number(i.quantidade) || 0), 0);
    const dur = duracaoMin(totalUn);
    // Horário = FIM do evento. Se o kit já virou pedido, o horário do PEDIDO manda (relógio do Delivery/edição);
    // pedido sem horário cai no horário escolhido no site.
    const horarioEvento = (kp.pedido && kp.pedido.horaEntrega) || kp.horario;
    const q = quandoEvento(dataYmd, horarioEvento, dur);
    const hora = q.hora || String(horarioEvento || '').trim();
    const status = statusKitFesta(etapa);
    const titulo = `🎉 Kit Festa #${kp.numero} · ${kp.nomeCliente} · ${entrega ? 'Entrega' : 'Retirada'}${hora ? ' ' + hora : ''} · ${kp.totalCaixas} caixa${kp.totalCaixas === 1 ? '' : 's'} · ${status}`;
    const linhas = [];
    (kp.itens || []).forEach(i => linhas.push(`• ${i.quantidade}x ${i.nomeProduto}${i.opcao ? ` (${i.opcao})` : ''}`));
    const d = [`Status: ${status}`, linhaEntrega(q, entrega ? 'Entrega' : 'Retirada'), '', `Itens:`, ...linhas];
    if (kp.telefoneCliente) d.push('', `Telefone: ${kp.telefoneCliente}`);
    if (entrega && kp.enderecoEntrega) d.push(`Endereço: ${kp.enderecoEntrega}`);
    if (kp.observacoes) d.push('', `Obs.: ${kp.observacoes}`);
    return { titulo, descricao: d.join('\n'), dataYmd, horario: horarioEvento, duracaoMin: dur };
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
                pedido: { select: { horaEntrega: true, cancelado: true } },
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

// ── Pedidos do quadro Delivery ────────────────────────────────────────────────
// Elegível = EXATAMENTE o que o kanban Delivery lista (deliveryService.listarPedidos): FATURADO,
// _pedidoAtivoWhere(), item de categoria delivery ativa e registro em DeliveryStatus. Pedido que veio do
// site Kit Festa (KitFestaPedido.pedidoId) NÃO ganha evento de pedido: o evento do kit já mostra a etapa.
// Pedido.gcalEventId guarda o id do evento.

const fmtQtd = (n) => {
    const x = Number(n) || 0;
    return Number.isInteger(x) ? String(x) : x.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
};

/** Prefixo + número do título: 🎉 Kit Festa / 🎁 Bonificação BN# / ZZ# (especial) / 📦 Pedido # */
function rotuloPedidoDelivery(p) {
    const n = p.numero != null ? p.numero : 's/n';
    if (p.canalOrigem === 'KIT_FESTA') return `🎉 Kit Festa #${n}`;
    if (p.bonificacao) return `🎁 Bonificação BN#${n}`;
    if (p.especial) return `📦 Pedido ZZ#${n}`;
    return `📦 Pedido #${n}`;
}

function montarPedidoDelivery(p, etapa) {
    const status = ROTULO_ETAPA_KIT[etapa] || ROTULO_ETAPA_KIT.PEDIDO;
    const itens = p.itens || [];
    const totalUn = itens.reduce((a, i) => a + (Number(i.quantidade) || 0), 0);
    const cli = p.cliente || {};
    const nome = cli.NomeFantasia || cli.Nome || 'Sem cliente';
    const dur = duracaoMin(totalUn);
    const q = quandoEvento(ymd(p.dataVenda), p.horaEntrega, dur);
    const titulo = `${rotuloPedidoDelivery(p)} · ${nome} · ${fmtQtd(totalUn)} un${q.hora ? ' · ' + q.hora : ''} · ${status}`;
    const d = [`Status: ${status}`, linhaEntrega(q), '', 'Itens:', ...itens.map(i => `• ${fmtQtd(i.quantidade)}x ${i.produto?.nome || i.descricao || 'Item'}`)];
    const tel = cli.Telefone_Celular || cli.Telefone || cli.Telefone_Comercial;
    if (tel) d.push('', `Telefone: ${tel}`);
    if (cli.End_Logradouro) {
        d.push(`Endereço: ${[cli.End_Logradouro, cli.End_Numero, cli.End_Bairro, cli.End_Cidade].filter(Boolean).join(', ')}`);
    }
    if (p.vendedor?.nome) d.push(`Vendedor: ${p.vendedor.nome}`);
    if (p.observacoes) d.push('', `Obs.: ${p.observacoes}`);
    return { titulo, descricao: d.join('\n'), dataYmd: ymd(p.dataVenda), horario: p.horaEntrega || null, duracaoMin: dur };
}

/** where do quadro Delivery (mesmas cláusulas do kanban) ou null se não há categoria ativa. Lazy require: sem ciclo. */
async function _whereQuadroDelivery() {
    const ds = require('./deliveryService');
    const filtros = await ds._produtoWhereFiltros();
    if (!filtros.length) return null;
    return {
        ...ds._pedidoAtivoWhere(),
        situacaoCA: 'FATURADO', // depois do spread: não é sobrescrito pelo `not: 'CANCELADO'`
        itens: { some: { OR: filtros.map(f => ({ produto: f })) } },
    };
}

/** Dos ids dados, devolve o Set dos que estão HOJE no quadro e sem vínculo com Kit Festa do site. */
async function _idsNoQuadro(ids) {
    if (!ids.length) return new Set();
    const base = await _whereQuadroDelivery();
    if (!base) return new Set();
    const [peds, dss, kits] = await Promise.all([
        prisma.pedido.findMany({ where: { id: { in: ids }, ...base }, select: { id: true } }),
        prisma.deliveryStatus.findMany({ where: { pedidoId: { in: ids } }, select: { pedidoId: true } }),
        prisma.kitFestaPedido.findMany({ where: { pedidoId: { in: ids } }, select: { pedidoId: true } }),
    ]);
    const temDs = new Set(dss.map(x => x.pedidoId));
    const ehKit = new Set(kits.map(x => x.pedidoId));
    return new Set(peds.map(x => x.id).filter(id => temDs.has(id) && !ehKit.has(id)));
}

const _sigPedido = new Map(); // pedidoId -> assinatura do último conteúdo enviado (evita update sem mudança)

/**
 * Cria/atualiza o evento do pedido se ele está no quadro Delivery; se saiu do quadro (cancelado, excluído,
 * devolução finalizada, não faturado, sem DeliveryStatus, virou kit do site) apaga o evento e zera
 * Pedido.gcalEventId. Nunca lança.
 */
async function sincronizarPedidoDelivery(id) { return serializar('pd:' + id, () => _sincronizarPedidoDelivery(id)); }
async function _sincronizarPedidoDelivery(id) {
    try {
        const atual = await prisma.pedido.findUnique({ where: { id }, select: { id: true, gcalEventId: true } });
        if (!atual) { _sigPedido.delete(id); return { ok: true, nada: true }; }
        const noQuadro = (await _idsNoQuadro([id])).has(id);
        if (!noQuadro) {
            _sigPedido.delete(id);
            if (!atual.gcalEventId) return { ok: true, nada: true };
            const r = await removerEvento(atual.gcalEventId);
            if (r.ok) await prisma.pedido.update({ where: { id }, data: { gcalEventId: null } });
            return r;
        }
        const [p, ds] = await Promise.all([
            prisma.pedido.findUnique({
                where: { id },
                select: {
                    id: true, numero: true, canalOrigem: true, bonificacao: true, especial: true, dataVenda: true, horaEntrega: true, observacoes: true,
                    cliente: { select: { Nome: true, NomeFantasia: true, Telefone: true, Telefone_Celular: true, Telefone_Comercial: true, End_Logradouro: true, End_Numero: true, End_Bairro: true, End_Cidade: true } },
                    vendedor: { select: { nome: true } },
                    itens: { select: { quantidade: true, descricao: true, produto: { select: { nome: true } } } },
                },
            }),
            prisma.deliveryStatus.findUnique({ where: { pedidoId: id }, select: { etapa: true } }),
        ]);
        if (!p || !ds) return { ok: true, nada: true };
        const dados = montarPedidoDelivery(p, ds.etapa);
        if (!dados.dataYmd) return { ok: true, nada: true };
        const sig = JSON.stringify([dados.titulo, dados.descricao, dados.dataYmd, dados.horario, dados.duracaoMin]);
        if (atual.gcalEventId && _sigPedido.get(id) === sig) return { ok: true, nada: true, igual: true, id: atual.gcalEventId };
        const { id: novoId, ok: enviou } = await _upsertR(atual.gcalEventId, dados);
        if (novoId && enviou) _sigPedido.set(id, sig); // só memoriza se o Google confirmou: senão a próxima rodada tenta de novo
        if (novoId !== atual.gcalEventId) await prisma.pedido.update({ where: { id }, data: { gcalEventId: novoId } });
        return { ok: !!novoId && enviou, id: novoId };
    } catch (e) {
        console.error('[GoogleCalendar] sincronizarPedidoDelivery:', e?.message || e);
        return { ok: false, motivo: 'erro', erro: e?.message };
    }
}

/**
 * Rede de segurança (scheduler, 10 min), em poucas consultas em lote e com teto (LIMITE_RECONCILIA):
 *  1) pedido no quadro SEM evento → cria;
 *  2) pedido no quadro (etapa != ENTREGUE) mexido nos últimos 30 min (DeliveryStatus ou Pedido) → sincroniza;
 *  3) pedido COM evento que ficou indevido (cancelado, devolução finalizada, excluído, não faturado, sem
 *     DeliveryStatus) → apaga. (Prisma `not` exclui null: situacaoCA null entra por OR explícito.)
 * Não varre entregues antigos. Inerte sem agenda configurada; só loga quando faz algo. Nunca lança.
 */
const LIMITE_RECONCILIA = 300;
const JANELA_RECONCILIA_MS = 30 * 60 * 1000;
let _reconciliando = false;
async function reconciliarQuadroDelivery() {
    if (_reconciliando) return { ocupado: true };
    _reconciliando = true;
    const r = { criados: 0, atualizados: 0, removidos: 0, erros: 0 };
    try {
        const c = await _contexto();
        if (!c.cal) return { ...r, motivo: c.motivo };
        const desde = new Date(Date.now() - JANELA_RECONCILIA_MS);
        const dss = await prisma.deliveryStatus.findMany({ select: { pedidoId: true, etapa: true, updatedAt: true } });
        const todosDs = dss.map(x => x.pedidoId);
        const abertos = dss.filter(x => x.etapa !== 'ENTREGUE');
        const abertosIds = abertos.map(x => x.pedidoId);
        const recentesDs = abertos.filter(x => x.updatedAt >= desde).map(x => x.pedidoId);
        const base = await _whereQuadroDelivery();

        let novos = [], mexidos = [];
        if (base && abertosIds.length) {
            [novos, mexidos] = await Promise.all([
                prisma.pedido.findMany({ where: { ...base, id: { in: abertosIds }, gcalEventId: null }, select: { id: true }, take: LIMITE_RECONCILIA }),
                prisma.pedido.findMany({
                    where: { ...base, id: { in: abertosIds }, gcalEventId: { not: null }, OR: [{ updatedAt: { gte: desde } }, { id: { in: recentesDs } }] },
                    select: { id: true }, take: LIMITE_RECONCILIA,
                }),
            ]);
        }
        const indevidos = await prisma.pedido.findMany({
            where: {
                gcalEventId: { not: null },
                OR: [
                    { cancelado: true }, { devolucaoFinalizada: true }, { statusEnvio: 'EXCLUIDO' },
                    { situacaoCA: null }, { situacaoCA: { not: 'FATURADO' } },
                    { id: { notIn: todosDs } },
                ],
            },
            select: { id: true }, take: LIMITE_RECONCILIA,
        });
        const kitIds = new Set((await prisma.kitFestaPedido.findMany({
            where: { pedidoId: { in: [...novos, ...mexidos].map(x => x.id) } }, select: { pedidoId: true },
        })).map(x => x.pedidoId));

        const fila = [
            ...indevidos.map(x => ({ id: x.id, tipo: 'rem' })),
            ...novos.filter(x => !kitIds.has(x.id)).map(x => ({ id: x.id, tipo: 'cri' })),
            ...mexidos.filter(x => !kitIds.has(x.id)).map(x => ({ id: x.id, tipo: 'upd' })),
        ];
        const vistos = new Set();
        for (const it of fila) {
            if (vistos.has(it.id)) continue; vistos.add(it.id);
            const x = await sincronizarPedidoDelivery(it.id); // decide sozinho criar/atualizar/apagar; pula se igual
            if (x.nada) continue;
            if (!x.ok) { r.erros++; continue; }
            if (!x.id) r.removidos++; else if (it.tipo === 'cri') r.criados++; else r.atualizados++;
            await pausa();
        }
        if (r.criados || r.atualizados || r.removidos || r.erros) console.log(`[GoogleCalendar] reconciliarQuadroDelivery: ${JSON.stringify(r)}`);
        return r;
    } catch (e) {
        console.error('[GoogleCalendar] reconciliarQuadroDelivery:', e?.message || e);
        return { ...r, erros: r.erros + 1 };
    } finally { _reconciliando = false; }
}

// ── Sincronização dos já existentes (Kit Festa aprovado / amostras aprovadas) ─
let _sincronizando = false;
const LIMITE_LOTE = 50;
const pausa = () => new Promise(res => setTimeout(res, 150)); // respeita a cota da API

/**
 * Manda para a agenda o que já existia antes da integração:
 *  Kit Festa aprovado (CONVERTIDO/APROVADO) e Amostra (SOLICITADA/PREPARACAO/LIBERADO), data >= hoje;
 *  pedidos do quadro Delivery (os que o kanban lista) em andamento ou com data >= hoje.
 *
 * Também FAZ A LIMPEZA do que não deve estar na agenda:
 *  - Pedido com gcalEventId que não está (mais) no quadro Delivery: apaga o evento e zera a coluna;
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

        // 0) pedido com evento que NÃO está mais no quadro Delivery (ou nunca devia estar): apaga o evento
        const comEvento = await prisma.pedido.findMany({
            where: { gcalEventId: { not: null } }, select: { id: true, numero: true }, orderBy: { createdAt: 'asc' },
        });
        const noQuadro = await _idsNoQuadro(comEvento.map(p => p.id));
        const indevidos = comEvento.filter(p => !noQuadro.has(p.id));
        for (const p of indevidos.slice(0, lim)) {
            const x = await sincronizarPedidoDelivery(p.id); // não elegível → apaga e zera a coluna
            if (x.ok && !x.nada) r.removidos++; else if (!x.ok) erro(`Pedido #${p.numero ?? 's/n'}`, x);
            await pausa();
        }
        const pedidosFaltam = Math.max(0, indevidos.length - lim);

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

        // 1b) pedidos do quadro Delivery: em andamento, ou com data de hoje em diante (entregues antigos não entram)
        const baseQuadro = await _whereQuadroDelivery();
        let pedidosPend = [];
        if (baseQuadro) {
            const dss = await prisma.deliveryStatus.findMany({ select: { pedidoId: true, etapa: true } });
            const abertos = dss.filter(x => x.etapa !== 'ENTREGUE').map(x => x.pedidoId);
            const fechados = dss.filter(x => x.etapa === 'ENTREGUE').map(x => x.pedidoId);
            const wherePed = { ...baseQuadro, OR: [{ id: { in: abertos } }, { id: { in: fechados }, dataVenda: { gte: hoje } }] };
            const candidatos = await prisma.pedido.findMany({ where: wherePed, select: { id: true, numero: true, gcalEventId: true }, orderBy: { dataVenda: 'asc' } });
            const kits = new Set((await prisma.kitFestaPedido.findMany({ where: { pedidoId: { in: candidatos.map(x => x.id) } }, select: { pedidoId: true } })).map(x => x.pedidoId));
            const validos = candidatos.filter(x => !kits.has(x.id));
            r.jaExistiam += validos.filter(x => x.gcalEventId).length;
            pedidosPend = validos.filter(x => !x.gcalEventId);
        }

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
            ...pedidosPend.map(p => ({ rot: `Pedido #${p.numero ?? 's/n'}`, fn: () => sincronizarPedidoDelivery(p.id) })),
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
    sincronizarKitFesta, sincronizarAmostra, sincronizarPedidoDelivery, reconciliarQuadroDelivery, sincronizarExistentes, sincronizarExistentesTudo, disparar, status,
    duracaoMin, PREPARO_MIN, MIN_POR_UNIDADE,
    _montarKitFesta: montarKitFesta, _etapaDoKit: etapaDoKit, _kitSaiDaAgenda: kitSaiDaAgenda, _montarAmostra: montarAmostra, _montarPedidoDelivery: montarPedidoDelivery, _idsNoQuadro, _quandoEvento: quandoEvento,
};
