/**
 * Uso da IA no Dashboard do admin: quanto custou, por dia, quem usou, onde gastou,
 * e se o gasto é PONTUAL (uma vez) ou RECORRENTE (todo dia).
 * Lê SÓ a tabela ia_uso_logs (gravada por aiProvider.registrarUso). Dia sempre em America/Sao_Paulo.
 * Mostra o que o CA-Hardt chamou — NÃO é a fatura da OpenAI.
 */
const prisma = require('../config/database');
const { lerPrecos, precoDoModelo, cotacaoEfetiva } = require('./iaCustoService');

// ── Constantes de classificação (janela fixa de 30 dias) ──
const JANELA_CLASSIFICACAO_DIAS = 30;
const DIAS_RECORRENTE = 5;      // >= 5 dias distintos com uso
const DIAS_OCASIONAL_MIN = 3;   // 3-4 dias
const MIN_DIAS_COBERTURA = 5;   // menos que isso de histórico => "POUCOS_DADOS" (não classifica errado)
const MAX_DIAS = 90;

const ROTULOS = {
    CLIPPY: 'Clippy (assistente de ajuda)',
    ORIENTACAO_CLIENTE: 'Orientação de atendimento por cliente',
    COMO_FAZER_MONTAR: 'Como Fazer: montar manual com IA',
    COMO_FAZER_REPARO: 'Como Fazer: reparo do JSON',
    COMO_FAZER_AJUSTE: 'Como Fazer: melhorar/simplificar passo',
    COMO_FAZER_SUGESTAO: 'Como Fazer: sugestões',
    CHECKLIST_FOTO: 'Checklist do veículo: análise de foto',
    CUPOM_DESPESA: 'Leitura de comprovante de despesa',
    OUTRO: 'Sem identificação',
};
const ROTULOS_GATILHO = {
    AUTOMATICO_NOTURNO: 'automático da noite',
    AUTOMATICO_ATENDIMENTO: 'automático após atendimento',
    MANUAL: 'manual',
};
const rotuloOrigem = (o) => ROTULOS[o] || o;

const num = (v) => (v == null ? 0 : Number(v));
const r6 = (n) => Number(n.toFixed(6));
const r4 = (n) => Number(n.toFixed(4));

const DIA_SP_SQL = `(("criado_em" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date`;

function hojeSP() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
function somaDias(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// data real: 2026-02-31 NÃO vale (ida e volta tem que devolver a mesma data)
const ehData = (s) => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const t = Date.parse(`${s}T12:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};
const MS_DIA = 86400000;
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / MS_DIA) + 1; // aritmética, sem laço
function listaDias(de, ate) { const out = []; if (diasEntre(de, ate) > 400) return out; for (let d = de; d <= ate; d = somaDias(d, 1)) out.push(d); return out; }

function resolverPeriodo(q = {}) {
    const hoje = hojeSP();
    let ate = ehData(q.ate) ? q.ate : hoje;
    let de, pediuDias = null;
    if (ehData(q.de)) de = q.de;
    else {
        let dias = parseInt(q.dias, 10);
        if (!Number.isFinite(dias) || dias < 1) dias = 30;
        if (dias > MAX_DIAS) pediuDias = dias;
        dias = Math.min(dias, MAX_DIAS);
        de = somaDias(ate, -(dias - 1));
    }
    if (de > ate) [de, ate] = [ate, de];
    // período grande demais: corta em 90 dias ancorado em `ate` limitado a HOJE (nunca no futuro) e AVISA
    let encurtado = false, deOriginal = null, ateOriginal = null;
    // 1º limita `ate` a HOJE (futuro não tem dado); só então mede o tamanho e, se passar de 90, corta
    let ateFut = null;
    if (ate > hoje) { ateFut = ate; ate = hoje; if (de > ate) de = ate; }
    if (pediuDias) { encurtado = true; deOriginal = somaDias(ate, -(pediuDias - 1)); ateOriginal = ate; }
    if (diasEntre(de, ate) > MAX_DIAS) {
        encurtado = true; deOriginal = de; ateOriginal = ateFut || ate;
        de = somaDias(ate, -(MAX_DIAS - 1));
    }
    return { de, ate, hoje, encurtado, deOriginal: encurtado ? deOriginal : null, ateOriginal: encurtado ? ateOriginal : null };
}

async function linhasAgrupadas(inicio, fim) {
    // agrupado por dia/origem/gatilho/usuário/modelo: poucas linhas, o resto é feito aqui
    return prisma.$queryRawUnsafe(`
        SELECT ${DIA_SP_SQL}::text AS dia, "origem", "gatilho", "automatico", "usuario_id" AS "usuarioId",
               MAX("usuario_nome") AS "usuarioNome", "modelo",
               COUNT(*)::int AS chamadas,
               COUNT(*) FILTER (WHERE NOT "ok")::int AS falhas,
               COUNT(*) FILTER (WHERE "retroativo")::int AS retro,
               COALESCE(SUM("custo_usd"),0) AS custo,
               COUNT(*) FILTER (WHERE "custo_usd" IS NULL)::int AS "semCusto",
               COALESCE(SUM("tokens_prompt") FILTER (WHERE "custo_usd" IS NULL),0) AS "tpNull",
               COALESCE(SUM("tokens_resposta") FILTER (WHERE "custo_usd" IS NULL),0) AS "trNull",
               COUNT(*) FILTER (WHERE "custo_usd" IS NULL AND ("tokens_prompt" IS NULL OR "tokens_resposta" IS NULL))::int AS "semTokens",
               COUNT(*) FILTER (WHERE "custo_usd" IS NULL AND NOT "ok" AND ("tokens_prompt" IS NULL OR "tokens_resposta" IS NULL))::int AS "semTokensFalha",
               COALESCE(SUM("tokens_total"),0) AS tokens,
               MAX("criado_em") AS ultimo
        FROM "ia_uso_logs"
        WHERE "criado_em" >= ($1::date - 1) AND "criado_em" < ($2::date + 2)
          AND ${DIA_SP_SQL} BETWEEN $1::date AND $2::date
        GROUP BY 1,2,3,4,5,7`, inicio, fim);
}

/** Custo efetivo de um grupo: gravado + (linhas sem custo recalculadas com o preço atual => estimado). */
function custoDoGrupo(g, precos) {
    const gravado = num(g.custo);
    let estimado = 0, semPreco = 0;
    // falha sem tokens = custo REAL zero (nada foi cobrado): não conta como "sem preço"
    const zeroReal = num(g.semTokensFalha);
    if (g.semCusto > 0) {
        const p = precoDoModelo(g.modelo, precos); // override do admin > preço padrão > null
        const ok = !!p;
        if (ok && g.semTokens < g.semCusto) {
            estimado = (num(g.tpNull) * p.entradaUsdPorM + num(g.trNull) * p.saidaUsdPorM) / 1e6;
            semPreco = g.semTokens - zeroReal; // as sem tokens (e que não foram falha) seguem sem custo
        } else semPreco = g.semCusto - zeroReal;
    }
    return { gravado, estimado, total: gravado + estimado, semPreco, zeroReal };
}

function classificar(diasAtivos, cobertura) {
    if (diasAtivos <= 0) return 'SEM_USO';
    if (cobertura < MIN_DIAS_COBERTURA) return 'POUCOS_DADOS';
    if (diasAtivos >= DIAS_RECORRENTE) return 'RECORRENTE';
    if (diasAtivos >= DIAS_OCASIONAL_MIN) return 'OCASIONAL';
    return 'PONTUAL';
}

async function resumo(q = {}) {
    const { de, ate, hoje, encurtado, deOriginal, ateOriginal } = resolverPeriodo(q);
    const precos = await lerPrecos();
    const cotInfo = await cotacaoEfetiva(precos, { aguardarRede: true });
    const cot = cotInfo.valor;
    const temCot = Number.isFinite(cot) && cot > 0;
    const brl = (usd) => (temCot ? r4(usd * cot) : null);

    const ini30 = somaDias(hoje, -(JANELA_CLASSIFICACAO_DIAS - 1));
    const ini7 = somaDias(hoje, -6);
    const inicioQ = ini30 < de ? ini30 : de;
    const fimQ = ate > hoje ? ate : hoje;

    const [linhas, ext, desdeOrigens] = await Promise.all([
        linhasAgrupadas(inicioQ, fimQ),
        prisma.$queryRawUnsafe(`
            SELECT MIN(${DIA_SP_SQL})::text AS desde,
                   (SELECT MIN(${DIA_SP_SQL})::text FROM "ia_uso_logs" WHERE NOT "retroativo") AS "desdeReal",
                   (SELECT MAX(${DIA_SP_SQL})::text FROM "ia_uso_logs" WHERE "retroativo") AS "retroAte"
            FROM "ia_uso_logs"`),
        // primeiro dia de uso REAL de cada origem (a cobertura é por origem, não global)
        prisma.$queryRawUnsafe(`SELECT "origem", MIN(${DIA_SP_SQL})::text AS desde FROM "ia_uso_logs" GROUP BY 1`),
    ]);
    const desdeReal = ext[0] && ext[0].desdeReal ? ext[0].desdeReal : null;
    const desdePorOrigem = new Map(desdeOrigens.map((r) => [r.origem, r.desde]));
    // origens SEM fonte retroativa (Clippy, comprovante...) contam desde o 1º registro real do painel (global);
    // as COM retroativo contam desde o 1º uso da própria origem (histórico reconstruído)
    const ORIGENS_SEM_RETRO = new Set(['CLIPPY', 'CUPOM_DESPESA', 'OUTRO']);
    const coberturaOrigem = (o) => { const d = ORIGENS_SEM_RETRO.has(o) ? (desdeReal || desdePorOrigem.get(o)) : desdePorOrigem.get(o); return d ? Math.min(JANELA_CLASSIFICACAO_DIAS, Math.max(1, diasEntre(d, hoje))) : 0; };
    // nomes: o snapshot do log pode faltar (linhas retroativas) — resolve pelo cadastro, em lote
    const idsUsuarios = [...new Set(linhas.map((g) => g.usuarioId).filter(Boolean))];
    const nomesCadastro = new Map();
    if (idsUsuarios.length) {
        try { (await prisma.vendedor.findMany({ where: { id: { in: idsUsuarios } }, select: { id: true, nome: true } })).forEach((v) => nomesCadastro.set(v.id, v.nome)); }
        catch (e) { console.error('[IaUso] nomes de usuário:', e.message); }
    }
    for (const g of linhas) if (g.usuarioId && nomesCadastro.get(g.usuarioId)) g.usuarioNome = nomesCadastro.get(g.usuarioId);
    const desde = ext[0] && ext[0].desde ? ext[0].desde : null;
    const retroativoAte = ext[0] && ext[0].retroAte ? ext[0].retroAte : null;
    const coberturaDias = desde ? Math.min(JANELA_CLASSIFICACAO_DIAS, Math.max(1, diasEntre(desde, hoje))) : 0;

    const grupos = linhas.map((g) => ({ ...g, c: custoDoGrupo(g, precos) }));
    const soma = (arr) => arr.reduce((a, g) => ({
        usd: a.usd + g.c.total, estimado: a.estimado + g.c.estimado, chamadas: a.chamadas + g.chamadas,
        falhas: a.falhas + g.falhas, tokens: a.tokens + num(g.tokens), semPreco: a.semPreco + g.c.semPreco,
        comCusto: a.comCusto + (g.chamadas - g.c.semPreco - g.c.zeroReal),
    }), { usd: 0, estimado: 0, chamadas: 0, falhas: 0, tokens: 0, semPreco: 0, comCusto: 0 });
    // Nunca mostrar 0 como grátis: se há chamada sem preço e NENHUMA com custo, o valor é null ("—").
    // Parcial: soma só as precificadas e semPreco > 0 sinaliza.
    const todasSemPreco = (semPreco, comCusto) => semPreco > 0 && comCusto <= 0;
    const valorCusto = (usd, semPreco, comCusto) => ({
        custoUsd: todasSemPreco(semPreco, comCusto) ? null : r6(usd),
        custoBrl: todasSemPreco(semPreco, comCusto) ? null : brl(usd),
    });

    // ── KPIs (janelas fixas, independem do período escolhido) ──
    const kHoje = soma(grupos.filter((g) => g.dia === hoje));
    const k7 = soma(grupos.filter((g) => g.dia >= ini7 && g.dia <= hoje));
    const k30 = soma(grupos.filter((g) => g.dia >= ini30 && g.dia <= hoje));
    const noPeriodo = grupos.filter((g) => g.dia >= de && g.dia <= ate);
    const kP = soma(noPeriodo);
    const par = (k) => ({ ...valorCusto(k.usd, k.semPreco, k.comCusto), chamadas: k.chamadas, semPreco: k.semPreco });
    const kpis = {
        hoje: par(kHoje), ultimos7dias: par(k7), ultimos30dias: par(k30),
        periodo: { ...par(kP), tokens: kP.tokens, falhas: kP.falhas, percentualFalhas: kP.chamadas ? Number(((kP.falhas / kP.chamadas) * 100).toFixed(1)) : 0, custoEstimadoUsd: r6(kP.estimado) },
        semPreco: kP.semPreco,
        cotacaoBrl: temCot ? cot : null, cotacaoFonte: cotInfo.fonte, cotacaoEstimada: cotInfo.estimada === true, cotacaoAtualizadaEm: cotInfo.atualizadoEm || null,
        desde, retroativoAte,
    };

    // ── porDia (período) ──
    const mapaDia = new Map(listaDias(de, ate).map((d) => [d, { dia: d, custoUsd: 0, chamadas: 0, automatico: 0, manual: 0, automaticoCustoUsd: 0, manualCustoUsd: 0, semPreco: 0, comCusto: 0, autSemPreco: 0, autComCusto: 0, manSemPreco: 0, manComCusto: 0 }]));
    for (const g of noPeriodo) {
        const d = mapaDia.get(g.dia); if (!d) continue;
        const cc = g.chamadas - g.c.semPreco - g.c.zeroReal;
        d.custoUsd += g.c.total; d.chamadas += g.chamadas; d.semPreco += g.c.semPreco; d.comCusto += cc;
        if (g.automatico) { d.automatico += g.chamadas; d.automaticoCustoUsd += g.c.total; d.autSemPreco += g.c.semPreco; d.autComCusto += cc; }
        else { d.manual += g.chamadas; d.manualCustoUsd += g.c.total; d.manSemPreco += g.c.semPreco; d.manComCusto += cc; }
    }
    const porDia = [...mapaDia.values()].map((d) => ({
        dia: d.dia, ...valorCusto(d.custoUsd, d.semPreco, d.comCusto), chamadas: d.chamadas,
        automatico: d.automatico, manual: d.manual,
        automaticoCustoUsd: todasSemPreco(d.autSemPreco, d.autComCusto) ? null : r6(d.automaticoCustoUsd),
        manualCustoUsd: todasSemPreco(d.manSemPreco, d.manComCusto) ? null : r6(d.manualCustoUsd),
        semPreco: d.semPreco,
    }));

    // ── classificação (janela fixa 30 dias) ──
    const na30 = grupos.filter((g) => g.dia >= ini30 && g.dia <= hoje);
    const diasPor = (arr) => new Set(arr.map((g) => g.dia)).size;
    const classeOrigem = new Map();
    const origens30 = new Map();
    for (const g of na30) { if (!origens30.has(g.origem)) origens30.set(g.origem, []); origens30.get(g.origem).push(g); }
    for (const [o, arr] of origens30) classeOrigem.set(o, { diasAtivos: diasPor(arr), classe: classificar(diasPor(arr), coberturaOrigem(o)) });

    // ── porOrigem (período) ──
    const mapaOrigem = new Map();
    for (const g of noPeriodo) {
        if (!mapaOrigem.has(g.origem)) mapaOrigem.set(g.origem, { origem: g.origem, usd: 0, estimado: 0, chamadas: 0, semPreco: 0, comCusto: 0, ultimo: null });
        const o = mapaOrigem.get(g.origem);
        o.usd += g.c.total; o.estimado += g.c.estimado; o.chamadas += g.chamadas;
        o.semPreco += g.c.semPreco; o.comCusto += g.chamadas - g.c.semPreco - g.c.zeroReal;
        if (!o.ultimo || new Date(g.ultimo) > new Date(o.ultimo)) o.ultimo = g.ultimo;
    }
    const porOrigem = [...mapaOrigem.values()].sort((a, b) => b.usd - a.usd).map((o) => {
        const c = classeOrigem.get(o.origem) || { diasAtivos: 0, classe: classificar(0, coberturaOrigem(o.origem)) };
        return {
            origem: o.origem, rotulo: rotuloOrigem(o.origem), ...valorCusto(o.usd, o.semPreco, o.comCusto), chamadas: o.chamadas, semPreco: o.semPreco,
            diasAtivos: c.diasAtivos, ultimoUso: o.ultimo ? new Date(o.ultimo).toISOString() : null, classe: c.classe,
            estimado: o.estimado > 0,
        };
    });

    // ── porUsuario (período) ──
    const mapaUser = new Map();
    for (const g of noPeriodo) {
        const chave = g.usuarioId || (g.automatico ? '__SISTEMA__' : '__SEM_ID__');
        if (!mapaUser.has(chave)) mapaUser.set(chave, {
            usuarioId: g.usuarioId || null,
            nome: g.usuarioId ? (g.usuarioNome || 'Usuário removido') : (g.automatico ? 'Sistema (automático)' : 'Sem identificação'),
            usd: 0, chamadas: 0, semPreco: 0, comCusto: 0, porOrigem: new Map(),
        });
        const u = mapaUser.get(chave);
        if (g.usuarioId && g.usuarioNome) u.nome = g.usuarioNome;
        u.usd += g.c.total; u.chamadas += g.chamadas;
        u.semPreco += g.c.semPreco; u.comCusto += g.chamadas - g.c.semPreco - g.c.zeroReal;
        u.porOrigem.set(g.origem, (u.porOrigem.get(g.origem) || 0) + g.c.total + g.chamadas * 1e-9);
    }
    // vários ids que não têm nome (usuário apagado) viram UMA linha "Usuário removido"
    const REMOVIDO = 'Usuário removido';
    const listaUser = [];
    let removido = null;
    for (const u of mapaUser.values()) {
        if (u.usuarioId && u.nome === REMOVIDO) {
            if (!removido) { removido = { usuarioId: null, nome: REMOVIDO, usd: 0, chamadas: 0, semPreco: 0, comCusto: 0, porOrigem: new Map() }; listaUser.push(removido); }
            removido.usd += u.usd; removido.chamadas += u.chamadas; removido.semPreco += u.semPreco; removido.comCusto += u.comCusto;
            for (const [o, v] of u.porOrigem) removido.porOrigem.set(o, (removido.porOrigem.get(o) || 0) + v);
        } else listaUser.push(u);
    }
    const porUsuario = listaUser.sort((a, b) => b.usd - a.usd).map((u) => {
        const prin = [...u.porOrigem.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
            usuarioId: u.usuarioId, nome: u.nome, ...valorCusto(u.usd, u.semPreco, u.comCusto), chamadas: u.chamadas, semPreco: u.semPreco,
            origemPrincipal: prin ? prin[0] : null, origemPrincipalRotulo: prin ? rotuloOrigem(prin[0]) : null,
        };
    });

    // ── classificacao: origem (+ gatilho em ORIENTACAO_CLIENTE) na janela de 30 dias ──
    const mapaItem = new Map();
    for (const g of na30) {
        const comGatilho = g.origem === 'ORIENTACAO_CLIENTE';
        const gat = comGatilho ? (g.gatilho || 'MANUAL') : null;
        const chave = `${g.origem}|${gat || ''}`;
        if (!mapaItem.has(chave)) mapaItem.set(chave, { origem: g.origem, gatilho: gat, arr: [] });
        mapaItem.get(chave).arr.push(g);
    }
    const itens = [...mapaItem.values()].map(({ origem, gatilho, arr }) => {
        const dias = diasPor(arr);
        const t = soma(arr);
        return {
            origem, gatilho, rotulo: rotuloOrigem(origem) + (gatilho ? ` (${ROTULOS_GATILHO[gatilho] || gatilho})` : ''),
            diasAtivos: dias, classe: classificar(dias, coberturaOrigem(origem)), chamadas: t.chamadas, ...valorCusto(t.usd, t.semPreco, t.comCusto), semPreco: t.semPreco,
            _usd: t.usd,
        };
    }).sort((a, b) => b._usd - a._usd);
    const totais = {};
    for (const classe of ['RECORRENTE', 'OCASIONAL', 'PONTUAL', 'POUCOS_DADOS']) {
        const doGrupo = itens.filter((i) => i.classe === classe);
        const usd = doGrupo.reduce((a, i) => a + i._usd, 0);
        totais[classe] = { itens: doGrupo.length, chamadas: doGrupo.reduce((a, i) => a + i.chamadas, 0), custoUsd: r6(usd), custoBrl: brl(usd), semPreco: doGrupo.reduce((a, i) => a + i.semPreco, 0) };
    }
    for (const i of itens) delete i._usd;
    const classificacao = {
        janelaDias: JANELA_CLASSIFICACAO_DIAS, regra: { recorrenteDiasMin: DIAS_RECORRENTE, ocasionalDiasMin: DIAS_OCASIONAL_MIN, pontualDiasMax: DIAS_OCASIONAL_MIN - 1 },
        coberturaDias, itensPoucosDados: itens.filter((i) => i.classe === 'POUCOS_DADOS').length, poucosDados: kP.chamadas > 0 && itens.some((i) => i.classe === 'POUCOS_DADOS'), itens, totais,
    };

    return { periodo: { de, ate, hoje, fuso: 'America/Sao_Paulo', encurtado, deOriginal, ateOriginal }, kpis, porDia, porOrigem, porUsuario, classificacao, rotulos: ROTULOS };
}

// ─────────────────────────────────────────────
// Backfill idempotente (retroativo=true, refRetro único). Só importa o período ANTERIOR ao 1º
// registro novo (nunca duplica com o log gravado pelo aiProvider).
// ─────────────────────────────────────────────
const ORIGEM_COMO_FAZER = {
    MONTAR: 'COMO_FAZER_MONTAR', PEDIR_DIFERENTE: 'COMO_FAZER_MONTAR',
    MELHORAR_PASSO: 'COMO_FAZER_AJUSTE', SIMPLIFICAR_PASSO: 'COMO_FAZER_AJUSTE',
    SUGERIR_NAOFAZER: 'COMO_FAZER_SUGESTAO', SUGERIR_SEDERERRADO: 'COMO_FAZER_SUGESTAO',
    SUGERIR_PERGUNTAS: 'COMO_FAZER_SUGESTAO', SUGERIR_PASSOS: 'COMO_FAZER_SUGESTAO',
};
const GATILHO_ANALISE = { NOTURNO: 'AUTOMATICO_NOTURNO', ATENDIMENTO: 'AUTOMATICO_ATENDIMENTO' };
const LOTE = 500;

async function backfill() {
    const precos = await lerPrecos();
    const cotInfo = await cotacaoEfetiva(precos, { aguardarRede: true });
    const cot = cotInfo.estimada ? NaN : cotInfo.valor;
    const primeiroNovo = await prisma.iaUsoLog.findFirst({ where: { retroativo: false }, orderBy: { criadoEm: 'asc' }, select: { criadoEm: true } });
    // só importa o que veio ANTES; margem de 2 min porque abrirUso() do Como Fazer cria o registro ANTES da chamada
    // (o log novo é gravado no fim), e a chamada em curso no corte seria contada duas vezes
    const corte = primeiroNovo ? new Date(primeiroNovo.criadoEm.getTime() - 2 * 60 * 1000) : null;
    const filtroData = corte ? { lt: corte } : undefined;
    const resultado = { corte: corte ? corte.toISOString() : null, fontes: {} };

    const gravar = async (dados) => {
        let inseridas = 0;
        for (let i = 0; i < dados.length; i += LOTE) {
            const r = await prisma.iaUsoLog.createMany({ data: dados.slice(i, i + LOTE), skipDuplicates: true });
            inseridas += r.count;
        }
        return inseridas;
    };

    // 1) ia_analise_logs (exato; NÃO seleciona prompt_enviado nem JSONs)
    const analises = await prisma.iaAnaliseLog.findMany({
        where: filtroData ? { criadoEm: filtroData } : {},
        select: { id: true, disparadoPor: true, disparadoPorUsuarioId: true, modelo: true, tokensPrompt: true, tokensResposta: true, tokensTotal: true, duracaoMs: true, sucesso: true, criadoEm: true, clienteId: true },
    });
    const idsA = [...new Set(analises.map((a) => a.disparadoPorUsuarioId).filter(Boolean))];
    const nomesA = new Map(idsA.length ? (await prisma.vendedor.findMany({ where: { id: { in: idsA } }, select: { id: true, nome: true } })).map((v) => [v.id, v.nome]) : []);
    const dadosA = [];
    for (const a of analises) {
        dadosA.push({
            criadoEm: a.criadoEm, origem: 'ORIENTACAO_CLIENTE', gatilho: GATILHO_ANALISE[a.disparadoPor] || 'MANUAL',
            automatico: !!GATILHO_ANALISE[a.disparadoPor], provedor: 'openai', modelo: a.modelo || '?',
            tokensPrompt: a.tokensPrompt, tokensResposta: a.tokensResposta, tokensTotal: a.tokensTotal,
            custoUsd: null, custoBrl: null, // sem preço da época: o painel estima com o preço atual (marcado "estimado")
            usuarioId: a.disparadoPorUsuarioId || null, usuarioNome: a.disparadoPorUsuarioId ? nomesA.get(a.disparadoPorUsuarioId) || null : null, referencia: a.clienteId, retroativo: true,
            refRetro: `ia_analise_logs:${a.id}`, ok: a.sucesso, duracaoMs: a.duracaoMs,
        });
    }
    resultado.fontes.ia_analise_logs = { lidas: analises.length, inseridas: await gravar(dadosA) };

    // 2) como_fazer_ia_usos (exato, com custo gravado)
    const usos = await prisma.comoFazerIaUso.findMany({
        where: filtroData ? { createdAt: filtroData } : {},
        select: { id: true, createdAt: true, vendedorId: true, vendedorNome: true, acao: true, provedor: true, modelo: true, tokensEntrada: true, tokensSaida: true, custoUsd: true, duracaoMs: true, resultado: true, erroCodigo: true },
    });
    const dadosC = usos.map((u) => ({
        criadoEm: u.createdAt, origem: ORIGEM_COMO_FAZER[u.acao] || 'OUTRO', gatilho: 'MANUAL', automatico: false,
        provedor: u.provedor, modelo: u.modelo, tokensPrompt: u.tokensEntrada, tokensResposta: u.tokensSaida,
        tokensTotal: u.tokensEntrada != null && u.tokensSaida != null ? u.tokensEntrada + u.tokensSaida : null,
        custoUsd: u.custoUsd, custoBrl: u.custoUsd != null && Number.isFinite(cot) && cot > 0 ? Number((Number(u.custoUsd) * cot).toFixed(4)) : null,
        usuarioId: u.vendedorId, usuarioNome: u.vendedorNome, referencia: u.id, retroativo: true,
        refRetro: `como_fazer_ia_usos:${u.id}`, ok: u.resultado !== 'ERRO', erroCodigo: u.erroCodigo, duracaoMs: u.duracaoMs,
    }));
    resultado.fontes.como_fazer_ia_usos = { lidas: usos.length, inseridas: await gravar(dadosC) };

    // 3) checklist_veiculo_fotos (só o total de tokens: divide 85% entrada / 15% saída p/ ESTIMAR; custo fica null => "estimado")
    const fotos = await prisma.checklistVeiculoFoto.findMany({
        where: { iaTokens: { not: null }, ...(filtroData ? { criadoEm: filtroData } : {}) },
        select: { id: true, criadoEm: true, iaModelo: true, iaTokens: true, iaMs: true, statusIa: true, checklist: { select: { vendedorId: true } } },
    });
    const ids = [...new Set(fotos.map((f) => f.checklist && f.checklist.vendedorId).filter(Boolean))];
    const nomes = new Map((await prisma.vendedor.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((v) => [v.id, v.nome]));
    const dadosF = fotos.map((f) => {
        const total = f.iaTokens; const prompt = Math.round(total * 0.85);
        const uid = f.checklist ? f.checklist.vendedorId : null;
        return {
            criadoEm: f.criadoEm, origem: 'CHECKLIST_FOTO', gatilho: 'MANUAL', automatico: false, provedor: 'openai', modelo: f.iaModelo || '?',
            tokensPrompt: prompt, tokensResposta: total - prompt, tokensTotal: total, custoUsd: null, custoBrl: null,
            usuarioId: uid, usuarioNome: uid ? nomes.get(uid) || null : null, referencia: f.id, retroativo: true,
            refRetro: `checklist_veiculo_fotos:${f.id}`, ok: f.statusIa !== 'IA_INDISPONIVEL', duracaoMs: f.iaMs,
        };
    });
    resultado.fontes.checklist_veiculo_fotos = { lidas: fotos.length, inseridas: await gravar(dadosF), observacao: 'tokens divididos 85%/15% (estimado)' };

    return resultado;
}

/** Preenche custoUsd/custoBrl NULOS com o preço resolvido (override > padrão). Idempotente; não mexe em quem já tem custo. */
async function recalcularCustos() {
    const precos = await lerPrecos();
    const cotInfo = await cotacaoEfetiva(precos, { aguardarRede: true });
    const cot = cotInfo.estimada ? null : cotInfo.valor;
    const grupos = await prisma.$queryRawUnsafe(`SELECT DISTINCT "modelo" FROM "ia_uso_logs" WHERE "custo_usd" IS NULL AND "tokens_prompt" IS NOT NULL AND "tokens_resposta" IS NOT NULL`);
    const r = { atualizadas: 0, modelosSemPreco: [] };
    for (const { modelo } of grupos) {
        const p = precoDoModelo(modelo, precos);
        if (!p) { r.modelosSemPreco.push(modelo); continue; }
        const n = await prisma.$executeRawUnsafe(
            `UPDATE "ia_uso_logs" SET "custo_usd" = ROUND((("tokens_prompt" * $2::numeric + "tokens_resposta" * $3::numeric) / 1000000), 6),
                    "custo_brl" = CASE WHEN $4::numeric IS NULL THEN NULL ELSE ROUND((("tokens_prompt" * $2::numeric + "tokens_resposta" * $3::numeric) / 1000000) * $4::numeric, 4) END
             WHERE "modelo" = $1 AND "custo_usd" IS NULL AND "tokens_prompt" IS NOT NULL AND "tokens_resposta" IS NOT NULL`,
            modelo, p.entradaUsdPorM, p.saidaUsdPorM, cot);
        r.atualizadas += n;
    }
    return r;
}

module.exports = { resumo, backfill, recalcularCustos, resolverPeriodo, ROTULOS, JANELA_CLASSIFICACAO_DIAS, DIAS_RECORRENTE, DIAS_OCASIONAL_MIN, MIN_DIAS_COBERTURA };
