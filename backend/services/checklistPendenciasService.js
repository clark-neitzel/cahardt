// Pendências dos veículos (Dia 3, fatia 3A): fontes CALCULADAS (não é uma lista que alguém preenche) + OK do responsável.
// Fonte hoje: VOLTA = diário PRESENCIAL de dia anterior sem checklist de volta concluído e sem OK.
// As fontes 3B (liberação sem resposta) e 3C (despesa divergente) entram em FONTES sem mexer no resto.
// Sem $transaction neste módulo. WhatsApp só no worker (rodarAvisoPendencias), nunca no request.
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

const CHAVE_RESPONSAVEIS = 'checklist_responsaveis';
const CHAVE_VOLTA_INICIO = 'checklist_volta_inicio';
const PREFIXO_AVISO = 'checklist_pend_aviso_';
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA_AVISO = '06:00';
const TIPOS_OK = ['VOLTA']; // 3B/3C acrescentam LIBERACAO e DESPESA aqui
const MOTIVO_MIN = 5;

class ErroPendencia extends Error {
    constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; }
}

const permsDe = (u) => {
    const p = u?.permissoes;
    if (!p) return {};
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p;
};
const ehAdmin = (u) => permsDe(u).admin === true;
const dataBR = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
const fmtKm = (n) => Number(n).toLocaleString('pt-BR');

// ───────────── config: quem libera / dá OK ─────────────
async function lerResponsaveis() {
    let salvo = null;
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: CHAVE_RESPONSAVEIS } });
        salvo = reg && reg.value && typeof reg.value === 'object' ? reg.value : null;
    } catch (e) { console.error('[ChecklistPendencias] falha ao ler responsáveis:', e.message); }
    const avisos = require('./checklistAvisosService');
    // Lista ausente/vazia => admins ativos com telefone (decisão D1: nunca nasce sem ninguém)
    const idsSalvos = Array.isArray(salvo?.ids) ? salvo.ids.map(String) : null;
    const padrao = !idsSalvos || idsSalvos.length === 0;
    const ids = padrao ? (await avisos.adminsComTelefone()).map((a) => a.id) : idsSalvos;
    const minutosProximo = Number.isInteger(salvo?.minutosProximo) ? salvo.minutosProximo : 5;
    const esperaTesteMin = Number.isInteger(salvo?.esperaTesteMin) ? salvo.esperaTesteMin : 10;
    return { ids, padrao, minutosProximo, esperaTesteMin };
}

async function lerVoltaInicio() {
    try {
        const reg = await prisma.appConfig.findUnique({ where: { key: CHAVE_VOLTA_INICIO } });
        if (reg && typeof reg.value === 'string' && RE_DATA.test(reg.value)) return reg.value;
    } catch (e) { console.error('[ChecklistPendencias] falha ao ler volta_inicio:', e.message); }
    // Primeira leitura: começa a contar a partir de hoje (não despeja o histórico antigo como pendência).
    const hoje = getDataReferencia();
    try {
        await prisma.appConfig.create({ data: { key: CHAVE_VOLTA_INICIO, value: hoje } });
    } catch { /* corrida com outra requisição */ }
    return hoje;
}

async function obterConfigResponsaveis() {
    const cfg = await lerResponsaveis();
    const vends = await prisma.vendedor.findMany({
        where: { ativo: true },
        select: { id: true, nome: true, telefone: true, permissoes: true },
        orderBy: { nome: 'asc' },
    });
    const avisos = require('./checklistAvisosService');
    return {
        ids: cfg.ids,
        padraoAdmins: cfg.padrao,
        minutosProximo: cfg.minutosProximo,
        esperaTesteMin: cfg.esperaTesteMin,
        voltaInicio: await lerVoltaInicio(),
        candidatos: vends.map((v) => ({ id: v.id, nome: v.nome, temTelefone: avisos.temTel(v), admin: avisos.ehAdminVend(v) })),
    };
}

async function salvarConfigResponsaveis(body = {}) {
    const atual = await prisma.appConfig.findUnique({ where: { key: CHAVE_RESPONSAVEIS } }).catch(() => null);
    const novo = atual && atual.value && typeof atual.value === 'object' ? { ...atual.value } : {};
    if (body.ids !== undefined) {
        if (!Array.isArray(body.ids)) throw new ErroPendencia(400, 'DESTINATARIO_INVALIDO', 'A lista de responsáveis precisa ser uma lista de ids.');
        const ids = [...new Set(body.ids.map(String))]; // a ORDEM importa (fila da liberação)
        if (ids.length) {
            const ok = await prisma.vendedor.findMany({ where: { id: { in: ids }, ativo: true }, select: { id: true } });
            if (ok.length !== ids.length) throw new ErroPendencia(400, 'DESTINATARIO_INVALIDO', 'Tem responsável que não existe ou está inativo.');
        }
        novo.ids = ids;
    }
    for (const [campo, min, max, nome] of [['minutosProximo', 1, 120, 'Minutos para passar ao próximo'], ['esperaTesteMin', 1, 240, 'Espera do teste']]) {
        if (body[campo] === undefined) continue;
        const n = Number(body[campo]);
        if (!Number.isInteger(n) || n < min || n > max) throw new ErroPendencia(400, 'TEMPO_INVALIDO', `${nome}: use um número inteiro de ${min} a ${max} minutos.`);
        novo[campo] = n;
    }
    if (body.voltaInicio !== undefined) {
        if (typeof body.voltaInicio !== 'string' || !RE_DATA.test(body.voltaInicio)) throw new ErroPendencia(400, 'DATA_INVALIDA', 'Data de início inválida. Use AAAA-MM-DD.');
        await prisma.appConfig.upsert({ where: { key: CHAVE_VOLTA_INICIO }, update: { value: body.voltaInicio }, create: { key: CHAVE_VOLTA_INICIO, value: body.voltaInicio } });
    }
    await prisma.appConfig.upsert({ where: { key: CHAVE_RESPONSAVEIS }, update: { value: novo }, create: { key: CHAVE_RESPONSAVEIS, value: novo } });
    return obterConfigResponsaveis();
}

/** Quem pode dar OK / decidir: administrador ou alguém da lista de responsáveis. Decidido SEMPRE no servidor. */
async function podeDarOk(user) {
    if (!user?.id) return false;
    if (ehAdmin(user)) return true;
    const cfg = await lerResponsaveis();
    return cfg.ids.includes(user.id);
}

/** Quem pode VER a lista: Central de Pendências (admin/Fin. Gerencial/Pode_Ver_Pendencias) ou responsável. */
async function podeVer(user) {
    const p = permsDe(user);
    if (p.admin || p.Pode_Acessar_Financeiro_Gerencial || p.Pode_Ver_Pendencias) return true;
    return podeDarOk(user);
}

// ───────────── fonte VOLTA ─────────────
async function modoDesligado() {
    try {
        const { getModo } = require('./checklistVeiculoService');
        return (await getModo()) === 'DESLIGADO';
    } catch { return false; }
}

/**
 * Diários presenciais de dias anteriores sem volta por foto e sem OK.
 * @param {{dias?:number, vendedorId?:string}} o  dias = janela para trás (padrão 30)
 */
async function listarVolta({ dias = 30, vendedorId } = {}) {
    if (await modoDesligado()) return [];
    const hoje = getDataReferencia();
    const inicio = await lerVoltaInicio();
    const limiteJanela = getDataReferencia(new Date(Date.now() - Math.max(1, dias) * 86400000));
    const desde = inicio > limiteJanela ? inicio : limiteJanela;
    const diarios = await prisma.diarioVendedor.findMany({
        where: {
            modo: 'PRESENCIAL', veiculoId: { not: null },
            dataReferencia: { gte: desde, lt: hoje },
            ...(vendedorId ? { vendedorId } : {}),
        },
        select: {
            id: true, dataReferencia: true, kmInicial: true, kmFinal: true, vendedorId: true,
            vendedor: { select: { id: true, nome: true } },
            veiculo: { select: { id: true, placa: true, modelo: true } },
        },
        orderBy: [{ dataReferencia: 'desc' }, { inicioHora: 'asc' }],
    });
    if (!diarios.length) return [];
    const ids = diarios.map((d) => d.id);
    const [feitas, oks] = await Promise.all([
        prisma.checklistVeiculo.findMany({ where: { diarioId: { in: ids }, momento: 'VOLTA', status: 'CONCLUIDO' }, select: { diarioId: true } }),
        prisma.pendenciaVeiculoOk.findMany({ where: { tipo: 'VOLTA', refId: { in: ids } }, select: { refId: true } }),
    ]);
    const feitasSet = new Set(feitas.map((f) => f.diarioId));
    const okSet = new Set(oks.map((o) => o.refId));
    return diarios
        .filter((d) => !feitasSet.has(d.id) && !okSet.has(d.id))
        .map((d) => ({
            tipo: 'VOLTA',
            refId: d.id,
            dataReferencia: d.dataReferencia,
            motorista: { id: d.vendedor?.id || d.vendedorId, nome: d.vendedor?.nome || null },
            placa: d.veiculo?.placa || null,
            veiculoId: d.veiculo?.id || null,
            kmInicial: d.kmInicial ?? null,
            kmFinal: d.kmFinal ?? null,
            resumo: d.kmFinal == null
                ? 'Não encerrou o dia: falta o KM final e as fotos da volta.'
                : `Encerrou o dia digitando o KM ${fmtKm(d.kmFinal)}, sem as fotos da volta.`,
        }));
}

/** Pendência de volta do PRÓPRIO motorista (campo `pendenciaVolta` do /diarios/status). Nunca lança. */
async function pendenciaVoltaDoMotorista(vendedorId) {
    try {
        const lista = await listarVolta({ dias: 30, vendedorId });
        if (!lista.length) return null;
        const p = lista[0]; // a mais recente
        const { getModo } = require('./checklistVeiculoService');
        const modo = await getModo();
        return {
            diarioId: p.refId, dataReferencia: p.dataReferencia, placa: p.placa, veiculoId: p.veiculoId,
            kmInicial: p.kmInicial, kmFinal: p.kmFinal, total: lista.length,
            bloqueia: modo === 'TRAVA', // TRAVA ainda não é aceita pela API: sempre false hoje
        };
    } catch (e) {
        console.error('[ChecklistPendencias] pendenciaVoltaDoMotorista:', e.message);
        return null;
    }
}

// ───────────── registro de fontes ─────────────
const FONTES = [
    { tipo: 'VOLTA', titulo: 'Volta sem foto', listar: listarVolta },
];

async function listarTodas({ dias = 30 } = {}) {
    const out = [];
    for (const f of FONTES) {
        try {
            out.push(...(await f.listar({ dias })));
        } catch (e) { console.error(`[ChecklistPendencias] fonte ${f.tipo}:`, e.message); }
    }
    out.sort((a, b) => String(b.dataReferencia).localeCompare(String(a.dataReferencia)));
    return out;
}

async function historicoOks(dias = 30) {
    const desde = getDataReferencia(new Date(Date.now() - dias * 86400000));
    const lista = await prisma.pendenciaVeiculoOk.findMany({
        where: { criadoEm: { gte: new Date(`${desde}T00:00:00-03:00`) } },
        orderBy: { criadoEm: 'desc' },
        take: 100,
    });
    const idsVend = [...new Set(lista.map((o) => o.vendedorId).filter(Boolean))];
    const nomes = {};
    if (idsVend.length) {
        const vs = await prisma.vendedor.findMany({ where: { id: { in: idsVend } }, select: { id: true, nome: true } });
        vs.forEach((v) => { nomes[v.id] = v.nome; });
    }
    return lista.map((o) => ({
        tipo: o.tipo, refId: o.refId, dataReferencia: o.dataReferencia,
        motorista: { id: o.vendedorId, nome: nomes[o.vendedorId] || null },
        porNome: o.porNome, motivo: o.motivo, criadoEm: o.criadoEm,
    }));
}

/** GET /pendencias: { podeDarOk, itens, historico } */
async function listarParaTela(user, { dias = 30 } = {}) {
    if (!(await podeVer(user))) throw new ErroPendencia(403, 'SEM_PERMISSAO', 'Sem permissão para ver as pendências dos veículos.');
    const pode = await podeDarOk(user);
    const [itens, historico] = await Promise.all([listarTodas({ dias }), historicoOks(30)]);
    return { podeDarOk: pode, itens: itens.map((i) => ({ ...i, podeDarOk: pode })), historico };
}

/** POST /pendencias/ok: idempotente (OK repetido => { ok:true, jaTinha:true }). */
async function darOk({ tipo, refId, motivo } = {}, user) {
    if (!(await podeDarOk(user))) throw new ErroPendencia(403, 'SEM_PERMISSAO', 'Só quem está na lista de responsáveis (ou administrador) pode dar OK.');
    const mot = String(motivo || '').replace(/\s+/g, ' ').trim();
    if (mot.length < MOTIVO_MIN) throw new ErroPendencia(400, 'MOTIVO_OBRIGATORIO', `Escreva o motivo do OK (pelo menos ${MOTIVO_MIN} letras).`);
    if (!TIPOS_OK.includes(tipo)) throw new ErroPendencia(400, 'TIPO_INVALIDO', 'Tipo de pendência inválido.');
    if (!refId) throw new ErroPendencia(400, 'PENDENCIA_OBRIGATORIA', 'Informe qual pendência.');
    const ref = String(refId);

    const ja = await prisma.pendenciaVeiculoOk.findUnique({ where: { tipo_refId: { tipo, refId: ref } } });
    if (ja) return { ok: true, jaTinha: true };

    // VOLTA: o refId é um diário presencial de dia anterior que ainda está sem volta por foto
    const diario = await prisma.diarioVendedor.findUnique({
        where: { id: ref },
        select: { id: true, modo: true, dataReferencia: true, vendedorId: true },
    });
    if (!diario || diario.modo !== 'PRESENCIAL') throw new ErroPendencia(404, 'PENDENCIA_NAO_ENCONTRADA', 'Não achei essa pendência.');
    if (diario.dataReferencia >= getDataReferencia()) throw new ErroPendencia(409, 'PENDENCIA_AINDA_NAO_VENCEU', 'Esse dia ainda não acabou: o motorista ainda pode tirar as fotos.');
    const feita = await prisma.checklistVeiculo.findFirst({ where: { diarioId: diario.id, momento: 'VOLTA', status: 'CONCLUIDO' }, select: { id: true } });
    if (feita) throw new ErroPendencia(409, 'PENDENCIA_RESOLVIDA', 'Essa pendência já foi resolvida: as fotos da volta já foram enviadas.');

    try {
        await prisma.pendenciaVeiculoOk.create({
            data: {
                tipo, refId: ref, dataReferencia: diario.dataReferencia, vendedorId: diario.vendedorId,
                porId: user.id, porNome: user.nome || 'Responsável', motivo: mot.slice(0, 1000),
            },
        });
    } catch (e) {
        if (e.code === 'P2002') return { ok: true, jaTinha: true }; // clique duplo / dois responsáveis ao mesmo tempo
        throw e;
    }
    return { ok: true, jaTinha: false };
}

// ───────────── aviso das 6h (worker) ─────────────
function montarTextoAviso(dia, itens) {
    const linhas = itens.slice(0, 15).map((i) => `• ${dataBR(i.dataReferencia)} ${i.motorista?.nome || '—'} · ${i.placa || '—'}`);
    if (itens.length > 15) linhas.push(`+${itens.length - 15} outros`);
    return [
        `🚗 *Veículos · pendências de volta* (${dataBR(dia)})`,
        `${itens.length} dia${itens.length > 1 ? 's' : ''} sem foto da volta:`,
        ...linhas,
        'Resolver ou dar OK: app → Central de Pendências',
    ].join('\n');
}

/** Roda a cada tick do scheduler; só age entre 06:00 e 09:00 e uma vez por dia (marcador em app_configs). */
async function rodarAvisoPendencias() {
    const avisos = require('./checklistAvisosService');
    const { dia, minutos } = avisos.agoraSP();
    const [hh, mm] = HORA_AVISO.split(':').map(Number);
    const ini = hh * 60 + mm;
    if (!(minutos >= ini && minutos < ini + 180)) return { enviados: 0, motivo: 'fora_da_janela' };
    const chave = `${PREFIXO_AVISO}${dia}`;
    const tentativa = await avisos.reivindicar(chave);
    if (!tentativa) return { enviados: 0, motivo: 'ja_rodou' };
    try {
        const itens = await listarVolta({ dias: 7 });
        if (!itens.length) {
            await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'OK', enviados: 0, semPendencia: true, em: new Date().toISOString() } } });
            return { enviados: 0, motivo: 'sem_pendencia' };
        }
        const cfg = await lerResponsaveis();
        const dests = await avisos.destinatarios(cfg.ids);
        const env = await avisos.enviarParaTodos(dests, montarTextoAviso(dia, itens), `chk-pend-${dia}`);
        const ok = env.enviados > 0;
        const semDest = !ok && (dests.length === 0 || env.falhas.every((f) => f.motivo === 'sem_telefone'));
        const motivo = semDest ? 'SEM_DESTINATARIO' : JSON.stringify(env.falhas).slice(0, 300);
        if (!ok) console.error(`🚨 [ChecklistPendencias] AVISO DAS 6H DE ${dia} NÃO ENVIADO (tentativa ${tentativa}): ${motivo}`);
        await prisma.appConfig.update({
            where: { key: chave },
            data: { value: ok ? { estado: 'OK', enviados: env.enviados, itens: itens.length, tentativas: tentativa, em: new Date().toISOString() } : { estado: 'ERRO', motivo, tentativas: tentativa, em: new Date().toISOString() } },
        });
        return { enviados: env.enviados };
    } catch (e) {
        console.error(`🚨 [ChecklistPendencias] AVISO DAS 6H DE ${dia} FALHOU (tentativa ${tentativa}): ${e.message}`);
        await prisma.appConfig.update({ where: { key: chave }, data: { value: { estado: 'ERRO', motivo: String(e.message).slice(0, 200), tentativas: tentativa, em: new Date().toISOString() } } }).catch(() => {});
        return { enviados: 0, motivo: 'erro' };
    } finally {
        // limpeza oportunista (> 30 dias)
        try {
            const corte = getDataReferencia(new Date(Date.now() - 30 * 86400000));
            const velhas = await prisma.appConfig.findMany({ where: { key: { startsWith: PREFIXO_AVISO } }, select: { key: true } });
            const apagar = velhas.map((k) => k.key).filter((k) => k.slice(PREFIXO_AVISO.length) < corte);
            if (apagar.length) await prisma.appConfig.deleteMany({ where: { key: { in: apagar } } });
        } catch { /* limpeza nunca derruba */ }
    }
}

module.exports = {
    ErroPendencia, lerResponsaveis, obterConfigResponsaveis, salvarConfigResponsaveis, podeDarOk, podeVer,
    listarVolta, pendenciaVoltaDoMotorista, listarTodas, listarParaTela, darOk, rodarAvisoPendencias, montarTextoAviso,
};
