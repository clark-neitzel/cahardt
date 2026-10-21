// Avisos por WhatsApp do checklist de veículo (Dia 2, Parte C).
//  - "na hora": reprovado que seguiu mesmo assim / resposta NÃO a uma pergunta da IA
//  - resumos 7h/13h: rodados pelo scheduler (rodarResumos), sem duplicar (marcador em app_configs)
// Regras do bot (CLAUDE.md): tipo 'interno', referencia única por (evento, destinatário), texto <= 2000 chars,
// só equipe interna, nunca promocional. NUNCA chamar dentro de $transaction nem de dentro do request do motorista
// (as rotas disparam com setImmediate). Este módulo não usa $transaction.
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

const CHAVE_CONFIG = 'checklist_avisos';
const PREFIXO_RESUMO = 'checklist_avisos_resumo_';
const HORAS_PADRAO = ['07:00', '13:00'];
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHECKLIST_INICIO = '2026-10-20'; // antes disso ninguém tinha checklist por foto
const MAX_TEXTO = 1800;

class ErroAvisos extends Error {
    constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; }
}

const permsDe = (v) => {
    const p = v?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
};
const ehAdminVend = (v) => permsDe(v).admin === true;
const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const temTel = (v) => soDigitos(v.telefone).length >= 10;

// ───────────── relógio de São Paulo ─────────────
function agoraSP(d = new Date()) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const hh = partes.find((p) => p.type === 'hour').value.replace('24', '00');
    const mm = partes.find((p) => p.type === 'minute').value;
    const dia = getDataReferencia(d);
    const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
    return { dia, hhmm: `${hh}:${mm}`, minutos: Number(hh) * 60 + Number(mm), dow };
}
const minutosDe = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const dataBR = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}`; };

// ───────────── configuração ─────────────
async function adminsComTelefone() {
    const vends = await prisma.vendedor.findMany({
        where: { ativo: true, telefone: { not: null } },
        select: { id: true, nome: true, telefone: true, permissoes: true },
    });
    return vends.filter((v) => ehAdminVend(v) && temTel(v));
}

// Chave ausente (ou lista não definida) = admins ativos com telefone (decisão do gerente: não nasce vazio).
async function lerConfig() {
    let salvo = null;
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: CHAVE_CONFIG } });
        salvo = reg && reg.value && typeof reg.value === 'object' ? reg.value : null;
    } catch (e) { console.error('[ChecklistAvisos] falha ao ler config:', e.message); }
    let padraoAdmins = null;
    const admins = async () => padraoAdmins || (padraoAdmins = (await adminsComTelefone()).map((a) => a.id));
    const naHora = Array.isArray(salvo?.naHora) ? salvo.naHora : await admins();
    const resumo = Array.isArray(salvo?.resumo) ? salvo.resumo : await admins();
    const horas = Array.isArray(salvo?.horas) ? salvo.horas : HORAS_PADRAO;
    return {
        naHora, resumo, horas,
        padraoNaHora: !Array.isArray(salvo?.naHora),
        padraoResumo: !Array.isArray(salvo?.resumo),
    };
}

async function obterConfig() {
    const cfg = await lerConfig();
    const vends = await prisma.vendedor.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, telefone: true, permissoes: true },
        orderBy: { nome: 'asc' },
    });
    return {
        naHora: cfg.naHora, resumo: cfg.resumo, horas: cfg.horas,
        padraoNaHora: cfg.padraoNaHora, padraoResumo: cfg.padraoResumo,
        candidatos: vends.map((v) => ({ id: v.id, nome: v.nome, temTelefone: temTel(v), admin: ehAdminVend(v) })),
    };
}

async function salvarConfig(body = {}) {
    const atual = await prisma.appConfig.findUnique({ where: { key: CHAVE_CONFIG } }).catch(() => null);
    const novo = atual && atual.value && typeof atual.value === 'object' ? { ...atual.value } : {};

    for (const campo of ['naHora', 'resumo']) {
        if (body[campo] === undefined) continue;
        if (!Array.isArray(body[campo])) throw new ErroAvisos(400, 'DESTINATARIO_INVALIDO', 'A lista de destinatários precisa ser uma lista de ids.');
        const ids = [...new Set(body[campo].map(String))];
        if (ids.length) {
            const ok = await prisma.vendedor.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true } });
            if (ok.length !== ids.length) throw new ErroAvisos(400, 'DESTINATARIO_INVALIDO', 'Tem destinatário que não existe ou está inativo.');
        }
        novo[campo] = ids;
    }
    if (body.horas !== undefined) {
        if (!Array.isArray(body.horas) || body.horas.length > 4 || body.horas.some((h) => typeof h !== 'string' || !RE_HORA.test(h))) {
            throw new ErroAvisos(400, 'HORA_INVALIDA', 'Horas inválidas. Use até 4 horários no formato HH:MM (ex.: 07:00).');
        }
        novo.horas = [...new Set(body.horas)].sort();
    }
    await prisma.appConfig.upsert({ where: { key: CHAVE_CONFIG }, update: { value: novo }, create: { key: CHAVE_CONFIG, value: novo } });
    return obterConfig();
}

// ───────────── envio ─────────────
function cortar(texto, max = MAX_TEXTO) {
    const t = String(texto || '');
    return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
const trunc = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : `${s.slice(0, n - 1)}…`; };

async function destinatarios(ids) {
    if (!ids.length) return [];
    return prisma.vendedor.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true, nome: true, telefone: true } });
}

// Envia a cada destinatário com referência própria. Sem telefone = pula e loga. `reagendado` conta como sucesso.
async function enviarParaTodos(dests, texto, refBase) {
    const webhookService = require('./webhookService');
    let enviados = 0;
    const falhas = [];
    for (const d of dests) {
        if (!d.telefone || soDigitos(d.telefone).length < 10) {
            console.warn(`[ChecklistAvisos] ${d.nome} sem telefone válido: pulado.`);
            falhas.push({ nome: d.nome, motivo: 'sem_telefone' });
            continue;
        }
        try {
            const r = await webhookService.enviarMensagemCustom(d.telefone, d.nome, cortar(texto, 1990), {
                tipo: 'interno', origem: 'checklist-veiculo', referencia: `${refBase}-${d.id}`,
            });
            if (r && r.ok) enviados++;
            else falhas.push({ nome: d.nome, motivo: r?.motivo || 'falha' });
        } catch (e) {
            console.error('[ChecklistAvisos] erro ao enviar para', d.nome, e.message);
            falhas.push({ nome: d.nome, motivo: e.message });
        }
    }
    return { enviados, falhas };
}

// ───────────── aviso na hora ─────────────
async function carregarChecklist(id) {
    return prisma.checklistVeiculo.findUnique({
        where: { id },
        include: {
            veiculo: { select: { placa: true, modelo: true } },
            vendedor: { select: { nome: true } },
            fotos: { where: { ativa: true, complemento: false }, select: { id: true, angulo: true, problemas: true } },
        },
    });
}
const rotuloAngulo = (a) => {
    try { return require('../config/checklistVeiculoAngulos').ANGULOS[a]?.rotulo || a; } catch { return a; }
};
const arr = (j) => (Array.isArray(j) ? j : []);

function linhasProblemas(c) {
    const linhas = [];
    for (const p of arr(c.problemas)) {
        if (p && p.gravidade === 'REPROVA') linhas.push(`• ${rotuloAngulo(p.angulo)}: ${trunc(p.descricao, 120)}`);
    }
    for (const f of c.fotos) {
        arr(f.problemas).forEach((p) => {
            if (p && p.resposta === 'NAO') linhas.push(`• ${rotuloAngulo(f.angulo)}: ${trunc(p.descricao, 100)} (ele respondeu: NÃO)`);
        });
    }
    return linhas.slice(0, 12).map((l) => trunc(l, 140));
}

function cabecalhoVeiculo(c) {
    return `Motorista: ${c.vendedor?.nome || '—'} · ${c.veiculo?.placa || '—'}${c.veiculo?.modelo ? ` (${c.veiculo.modelo})` : ''}`;
}

async function aoSeguirReprovado(checklistId) {
    const c = await carregarChecklist(checklistId);
    if (!c || c.momento !== 'SAIDA' || c.veredito !== 'REPROVADO' || c.decisao !== 'SEGUIU_TESTE') return { enviados: 0, motivo: 'nao_aplica' };
    const cfg = await lerConfig();
    const dests = await destinatarios(cfg.naHora);
    const texto = [
        `🚗 *Checklist com problema* · ${agoraSP().hhmm}`,
        'Reprovado e seguiu mesmo assim (teste)',
        cabecalhoVeiculo(c),
        ...linhasProblemas(c),
        `Ver fotos: app → Veículos → ${c.veiculo?.placa || ''} → Checklists`,
    ].join('\n');
    return enviarParaTodos(dests, texto, `chk-hora-seguiu-${c.id}`);
}

async function aoResponderNao(checklistId, angulo, indice) {
    const c = await carregarChecklist(checklistId);
    if (!c) return { enviados: 0, motivo: 'nao_encontrado' };
    const f = c.fotos.find((x) => x.angulo === angulo);
    const p = f ? arr(f.problemas)[Number(indice)] : null;
    if (!f || !p || p.resposta !== 'NAO') return { enviados: 0, motivo: 'nao_aplica' };
    const cfg = await lerConfig();
    const dests = await destinatarios(cfg.naHora);
    const texto = [
        `🚗 *Checklist com problema* · ${agoraSP().hhmm}`,
        `${rotuloAngulo(angulo)}${c.momento === 'VOLTA' ? ' (volta)' : ''}: o motorista respondeu NÃO a uma pergunta da IA`,
        cabecalhoVeiculo(c),
        `• ${trunc(p.descricao, 140)}${p.pergunta ? ` — ${trunc(p.pergunta, 100)}` : ''}`,
        `Ver fotos: app → Veículos → ${c.veiculo?.placa || ''} → Checklists`,
    ].join('\n');
    return enviarParaTodos(dests, texto, `chk-hora-nao-${f.id}-${Number(indice)}`);
}

// ───────────── resumos ─────────────
async function montarResumo(dia, hhmm, desde) {
    const { getModo } = require('./checklistVeiculoService');
    const modo = await getModo();
    const diarios = await prisma.diarioVendedor.findMany({
        where: { dataReferencia: dia, modo: 'PRESENCIAL', veiculoId: { not: null } },
        select: { id: true, veiculoId: true, inicioHora: true, vendedor: { select: { nome: true } }, veiculo: { select: { placa: true } } },
        orderBy: { inicioHora: 'asc' },
    });
    const checklists = await prisma.checklistVeiculo.findMany({
        where: { dataReferencia: dia, momento: 'SAIDA' },
        select: {
            id: true, diarioId: true, veiculoId: true, status: true, veredito: true, decisao: true, criadoEm: true,
            vendedor: { select: { nome: true } }, veiculo: { select: { placa: true } },
            fotos: { where: { ativa: true, complemento: false }, select: { problemas: true, aceitaPeloMotorista: true } },
        },
        orderBy: { criadoEm: 'desc' },
    });
    const esperado = dia >= CHECKLIST_INICIO && modo !== 'DESLIGADO';
    const novo = (dt) => !desde || new Date(dt) > desde;

    const comProblema = [];
    const semChecklist = [];
    let discordancias = 0;
    for (const c of checklists) discordancias += c.fotos.filter((f) => f.aceitaPeloMotorista).length;

    for (const d of diarios) {
        const c = checklists.find((x) => x.diarioId === d.id && x.veiculoId === d.veiculoId && x.status === 'CONCLUIDO');
        const nome = `${d.vendedor?.nome || '—'} · ${d.veiculo?.placa || '—'}`;
        if (!c) { if (esperado) semChecklist.push({ txt: nome, novo: novo(d.inicioHora) }); continue; }
        const temNao = c.fotos.some((f) => arr(f.problemas).some((p) => p && p.resposta === 'NAO'));
        const ruim = c.veredito === 'ATENCAO' || c.veredito === 'REPROVADO' || temNao;
        if (ruim) {
            const quando = c.veredito === 'REPROVADO'
                ? (c.decisao === 'SEGUIU_TESTE' ? 'Reprovado, seguiu mesmo assim' : 'Reprovado')
                : (c.veredito === 'ATENCAO' ? 'Atenção' : 'Respondeu NÃO a pergunta da IA');
            comProblema.push({ txt: `${nome}: ${quando}`, novo: novo(c.criadoEm) });
        }
    }
    const montando = checklists
        .filter((c) => c.status === 'RASCUNHO' && !c.diarioId && c.fotos.length > 0)
        .map((c) => ({ txt: `${c.vendedor?.nome || '—'} · ${c.veiculo?.placa || '—'}`, novo: novo(c.criadoEm) }));

    const lista = (itens) => {
        const sel = itens.filter((i) => i.novo);
        const linhas = sel.slice(0, 15).map((i) => `• ${i.txt}`);
        if (sel.length > 15) linhas.push(`+${sel.length - 15} outros`);
        return linhas;
    };
    const cab = [`Saíram ${diarios.length}`, `${comProblema.length} com problema`];
    if (esperado) cab.push(`${semChecklist.length} sem checklist por foto`);

    const partes = [`🚗 *Checklist · resumo das ${hhmm.replace(/^0/, '').replace(':00', 'h').replace(':', 'h')}* (${dataBR(dia)})`, cab.join(' · ')];
    const l1 = lista(comProblema); if (l1.length) partes.push('Com problema:', ...l1);
    const l2 = lista(semChecklist); if (l2.length) partes.push('Sem checklist por foto:', ...l2);
    const l3 = lista(montando); if (l3.length) partes.push('Em andamento:', ...l3);
    if (discordancias > 0) partes.push(`O motorista discordou da IA em ${discordancias} foto${discordancias > 1 ? 's' : ''}.`);
    partes.push('Detalhes: app → Veículos → Checklists');
    return { texto: cortar(partes.join('\n')), saiu: diarios.length, rascunhos: montando.length, comProblema: comProblema.length };
}

// Reivindica o resumo H do dia de forma atômica (chave única). Devolve o nº da tentativa (1 ou 2) ou 0 se não pode enviar.
// ERRO ganha 1 nova tentativa depois de 30 min (o chamador só chega aqui dentro da janela de 3 h); as referências
// por destinatário impedem duplicata. OK, 2ª falha e envio em andamento recente não reenviam.
async function reivindicar(chave) {
    const agora = new Date().toISOString();
    try {
        await prisma.appConfig.create({ data: { key: chave, value: { estado: 'ENVIANDO', em: agora, tentativas: 1 } } });
        return 1;
    } catch (e) {
        if (e.code !== 'P2002') throw e;
        const reg = await prisma.appConfig.findUnique({ where: { key: chave } });
        const v = reg?.value || {};
        const idadeMs = v.em ? Date.now() - new Date(v.em).getTime() : Infinity;
        const tent = Number(v.tentativas) || 1;
        if (v.estado === 'ENVIANDO' && idadeMs > 15 * 60 * 1000) {
            // queda no meio do envio: assume (referências por destinatário impedem duplicata)
            await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'ENVIANDO', em: agora, tentativas: tent, retomado: true } } });
            return tent;
        }
        if (v.estado === 'ERRO' && tent < 2 && idadeMs > 30 * 60 * 1000) {
            await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'ENVIANDO', em: agora, tentativas: tent + 1, erroAnterior: v.motivo || null } } });
            return tent + 1;
        }
        return 0; // OK, ERRO já retentado, ou outro processo enviando agora
    }
}

async function rodarResumos() {
    const cfg = await lerConfig();
    if (!cfg.resumo.length || !cfg.horas.length) return { enviados: 0 };
    const { dia, minutos, dow } = agoraSP();
    const horasOrd = [...cfg.horas].sort();
    let rodou = 0;
    for (const h of horasOrd) {
        const ini = minutosDe(h);
        if (!(minutos >= ini && minutos < ini + 180)) continue;
        const chave = `${PREFIXO_RESUMO}${dia}_${h.replace(':', '')}`;
        const tentativa = await reivindicar(chave);
        if (!tentativa) continue;
        try {
            // "novo desde o resumo anterior do dia" (ou 00:00)
            let desde = null;
            const anterior = horasOrd.filter((x) => x < h).pop();
            if (anterior) {
                const reg = await prisma.appConfig.findUnique({ where: { key: `${PREFIXO_RESUMO}${dia}_${anterior.replace(':', '')}` } });
                if (reg?.value?.estado === 'OK' && reg.value.em) desde = new Date(reg.value.em);
            }
            const r = await montarResumo(dia, h, desde);
            if (dow === 0 && r.saiu === 0 && r.rascunhos === 0) {
                await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'OK', enviados: 0, domingoVazio: true, em: new Date().toISOString() } } });
                continue;
            }
            const dests = await destinatarios(cfg.resumo);
            const env = await enviarParaTodos(dests, r.texto, `chk-resumo-${dia}-${h.replace(':', '')}`);
            const ok = env.enviados > 0;
            const semDest = !ok && (dests.length === 0 || env.falhas.every((f) => f.motivo === 'sem_telefone'));
            const motivo = semDest ? 'SEM_DESTINATARIO' : JSON.stringify(env.falhas).slice(0, 300);
            if (!ok) console.error(`🚨 [ChecklistAvisos] RESUMO ${h} DE ${dia} NÃO ENVIADO (tentativa ${tentativa}): ${motivo}`);
            await prisma.appConfig.update({
                where: { key: chave },
                data: { value: ok ? { estado: 'OK', enviados: env.enviados, tentativas: tentativa, em: new Date().toISOString() } : { estado: 'ERRO', motivo, tentativas: tentativa, em: new Date().toISOString() } },
            });
            rodou += env.enviados;
        } catch (e) {
            console.error(`🚨 [ChecklistAvisos] RESUMO ${h} DE ${dia} FALHOU (tentativa ${tentativa}): ${e.message}`);
            await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'ERRO', motivo: String(e.message).slice(0, 200), tentativas: tentativa, em: new Date().toISOString() } } }).catch(() => {});
        }
    }
    // limpeza oportunista (> 30 dias)
    try {
        const corte = new Date(Date.now() - 30 * 86400000);
        const velhas = await prisma.appConfig.findMany({ where: { key: { startsWith: PREFIXO_RESUMO } }, select: { key: true } });
        const apagar = velhas.filter((k) => {
            const m = k.key.slice(PREFIXO_RESUMO.length).match(/^(\d{4}-\d{2}-\d{2})_/);
            return m && new Date(`${m[1]}T00:00:00Z`) < corte;
        }).map((k) => k.key);
        if (apagar.length) await prisma.appConfig.deleteMany({ where: { key: { in: apagar } } });
    } catch { /* limpeza nunca derruba */ }
    return { enviados: rodou };
}

// ───────────── teste da tela ─────────────
// Manda a mensagem de teste ao telefone do próprio admin logado. Referência nova a cada clique (reenvio manual).
async function testar(user) {
    const v = await prisma.vendedor.findUnique({ where: { id: user.id }, select: { id: true, nome: true, telefone: true } });
    if (!v || !temTel(v)) throw new ErroAvisos(400, 'SEM_TELEFONE', 'Seu cadastro não tem telefone. Cadastre o WhatsApp em Usuários para receber o teste.');
    const webhookService = require('./webhookService');
    const bot = require('./botWhatsappService');
    const texto = 'Teste de aviso do checklist de veículos: funcionando ✅';
    const r = await webhookService.enviarMensagemCustom(v.telefone, v.nome, texto, {
        tipo: 'interno', origem: 'checklist-veiculo', referencia: bot.referenciaUnica(`chk-teste-${v.id}`),
    });
    return { ok: true, enviado: !!r.ok && !r.reagendado, reagendado: !!r.reagendado, motivo: r.ok ? undefined : r.motivo, texto, destinatarios: [{ id: v.id, nome: v.nome }] };
}

module.exports = {
    // helpers reaproveitados por checklistPendenciasService (aviso das 6h)
    agoraSP, reivindicar, enviarParaTodos, destinatarios, adminsComTelefone, dataBR, cortar, temTel, ehAdminVend,
    ErroAvisos, obterConfig, salvarConfig, lerConfig,
    aoSeguirReprovado, aoResponderNao, rodarResumos, montarResumo, testar,
    CHECKLIST_INICIO,
};
