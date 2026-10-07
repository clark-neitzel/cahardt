/**
 * Indicadores de Gestao (Etapa 3, bloco A) — metas por indicador.
 * Tabela indicadores_metas (uma linha por versao; vigente = vigenciaFim null).
 * O CATALOGO e fechado e manda no rotulo, unidade, sentido e escopo: o cliente nao envia sentido.
 */
const prisma = require('../config/database');

const TZ = 'America/Sao_Paulo';
const round1 = (v) => Math.round(Number(v) * 10) / 10;

const CATALOGO = {
    MC_PCT: { rotulo: 'Margem de contribuição', unidade: 'pct', sentido: 'MAIOR_MELHOR', escopo: 'completo', tolAtencao: 0, tolAgir: 5 },
    RESULTADO_PCT: { rotulo: 'Resultado operacional', unidade: 'pct', sentido: 'MAIOR_MELHOR', escopo: 'completo', tolAtencao: 0, tolAgir: 5 },
    CUSTO_INSUMOS_VAR_PCT: { rotulo: 'Variação do custo dos insumos (8 semanas)', unidade: 'pct', sentido: 'MENOR_MELHOR', escopo: 'producao', tolAtencao: 0, tolAgir: 3 },
    PERDA_PCT: { rotulo: 'Perda além da ficha (% do consumo)', unidade: 'pct', sentido: 'MENOR_MELHOR', escopo: 'producao', tolAtencao: 0, tolAgir: 1.5 },
    RENDIMENTO_PCT: { rotulo: 'Rendimento do lote', unidade: 'pct', sentido: 'MAIOR_MELHOR', escopo: 'producao', tolAtencao: 0, tolAgir: 3 },
    DESVIO_CUSTO_PCT: { rotulo: 'Custo real acima do padrão', unidade: 'pct', sentido: 'MENOR_MELHOR', escopo: 'producao', tolAtencao: 0, tolAgir: 3 },
    DIAS_ESTOQUE_PA: { rotulo: 'Dias de estoque (produto acabado)', unidade: 'dias', sentido: 'MENOR_MELHOR', escopo: 'producao', tolAtencao: 0, tolAgir: 5 }
};

const erro400 = (msg) => { const e = new Error(msg); e.status = 400; return e; };
const n = (v) => (v == null ? null : Number(v));

/** @returns {Promise<Map<string, object>>} indicador -> linha vigente (Decimals ja em Number) */
async function listarVigentes() {
    const linhas = await prisma.indicadorMeta.findMany({ where: { vigenciaFim: null }, orderBy: { vigenciaInicio: 'desc' } });
    const mapa = new Map();
    for (const l of linhas) {
        if (mapa.has(l.indicador)) continue; // defesa: se houver 2 vigentes, vale a mais nova
        mapa.set(l.indicador, {
            ...l, alvo: n(l.alvo), toleranciaAtencao: n(l.toleranciaAtencao), toleranciaAgir: n(l.toleranciaAgir)
        });
    }
    return mapa;
}

/** Semaforo com meta (plano A.3). `meta` = linha vigente. */
function avaliar(valor, meta) {
    if (valor == null || !Number.isFinite(Number(valor)) || !meta) return { status: 'sem_dado', palavra: '', base: 'nenhuma' };
    const v = Number(valor);
    const dif = meta.sentido === 'MAIOR_MELHOR' ? meta.alvo - v : v - meta.alvo; // positivo = pior que o alvo
    const unidade = CATALOGO[meta.indicador]?.unidade || 'pct';
    let status, palavra;
    if (dif <= meta.toleranciaAtencao) { status = 'ok'; palavra = 'no alvo'; }
    else if (dif <= meta.toleranciaAgir) { status = 'atencao'; palavra = 'atenção'; }
    else { status = 'agir'; palavra = 'agir'; }
    return {
        status, palavra, base: 'meta',
        meta: { alvo: meta.alvo, sentido: meta.sentido, unidade },
        delta: Math.round((v - meta.alvo) * 100) / 100
    };
}

/** Bloco `meta` aditivo dos KPIs ({alvo,sentido,unidade} | null). */
function blocoMeta(meta) {
    if (!meta) return null;
    return { alvo: meta.alvo, sentido: meta.sentido, unidade: CATALOGO[meta.indicador]?.unidade || 'pct' };
}

/** GET /metas — filtra por escopo NO SERVIDOR. */
async function listar({ completo, admin }) {
    const vigentes = await listarVigentes();
    const metas = Object.entries(CATALOGO)
        .filter(([, c]) => completo || c.escopo === 'producao')
        .map(([indicador, c]) => {
            const v = vigentes.get(indicador);
            return {
                indicador, rotulo: c.rotulo, unidade: c.unidade, escopo: c.escopo, sentido: c.sentido,
                alvo: v ? v.alvo : null,
                toleranciaAtencao: v ? v.toleranciaAtencao : c.tolAtencao,
                toleranciaAgir: v ? v.toleranciaAgir : c.tolAgir,
                padroes: { sentido: c.sentido, toleranciaAtencao: c.tolAtencao, toleranciaAgir: c.tolAgir },
                vigenciaInicio: v ? v.vigenciaInicio.toISOString() : null,
                atualizadoPorNome: v ? v.atualizadoPorNome : null
            };
        });
    return { podeEditar: !!admin, metas };
}

function numeroValido(v, rotulo) {
    if (typeof v === 'string') {
        if (!v.trim()) throw erro400(`"${rotulo}": informe um número.`); // '' / branco não vira 0
        v = Number(v.replace(',', '.'));
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) throw erro400(`Valor inválido em "${rotulo}".`);
    return v;
}

/** PUT /metas — valida tudo antes de gravar; grava em $transaction so com banco. */
async function salvarLote(itens, { userId, userNome } = {}) {
    if (!Array.isArray(itens) || !itens.length) throw erro400('Envie ao menos uma meta.');
    const vigentes = await listarVigentes();
    const ops = [];
    const vistos = new Set();
    for (const it of itens) {
        const cat = CATALOGO[it?.indicador];
        if (!cat) throw erro400(`Indicador desconhecido: ${it?.indicador}.`);
        if (vistos.has(it.indicador)) throw erro400(`Indicador repetido: ${cat.rotulo}.`);
        vistos.add(it.indicador);
        const atual = vigentes.get(it.indicador);
        if (it.alvo === null) { // remover meta
            if (atual) ops.push({ indicador: it.indicador, remover: true });
            continue;
        }
        const max = cat.unidade === 'dias' ? 365 : 100;
        const alvo = numeroValido(it.alvo, cat.rotulo);
        const tolA = numeroValido(it.toleranciaAtencao ?? (atual ? atual.toleranciaAtencao : cat.tolAtencao), cat.rotulo);
        const tolG = numeroValido(it.toleranciaAgir ?? (atual ? atual.toleranciaAgir : cat.tolAgir), cat.rotulo);
        if (alvo < 0 || alvo > max) throw erro400(`"${cat.rotulo}": a meta deve ficar entre 0 e ${max}.`);
        if (tolA < 0 || tolG < 0 || tolA > max || tolG > max) throw erro400(`"${cat.rotulo}": as tolerâncias devem ficar entre 0 e ${max}.`);
        if (tolA > tolG) throw erro400(`"${cat.rotulo}": "atenção a partir de" não pode ser maior que "agir a partir de".`);
        const igual = atual && atual.alvo === alvo && atual.toleranciaAtencao === tolA && atual.toleranciaAgir === tolG;
        if (igual) continue; // nada mudou: nao cria versao
        ops.push({ indicador: it.indicador, alvo, tolA, tolG, sentido: cat.sentido });
    }
    if (ops.length) {
        const agora = new Date();
        await prisma.$transaction(async (tx) => {
            for (const op of ops) {
                await tx.indicadorMeta.updateMany({ where: { indicador: op.indicador, vigenciaFim: null }, data: { vigenciaFim: agora } });
                if (!op.remover) {
                    await tx.indicadorMeta.create({
                        data: {
                            indicador: op.indicador, alvo: op.alvo, sentido: op.sentido,
                            toleranciaAtencao: op.tolA, toleranciaAgir: op.tolG, vigenciaInicio: agora,
                            atualizadoPorId: userId || null, atualizadoPorNome: userNome || null
                        }
                    });
                }
            }
        }, { timeout: 20000, maxWait: 10000 });
    }
    return { gravadas: ops.filter((o) => !o.remover).length, removidas: ops.filter((o) => o.remover).length };
}

/** "Sugerir pela media": 3 meses FECHADOS. So sugere, nunca grava. */
async function sugerirPelaMedia() {
    const gestao = require('./indicadoresGestaoService'); // lazy: evita dependencia circular
    const ordemCusto = require('./ordemCustoService');
    const hojeYm = new Date().toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
    const somaMeses = (ym, k) => { const [a, m] = ym.split('-').map(Number); const t = a * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
    const fimMes = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`; };
    const baseMeses = [somaMeses(hojeYm, -3), somaMeses(hojeYm, -2), somaMeses(hojeYm, -1)];

    const calcs = await Promise.all(baseMeses.map((ym) => gestao.calcularPeriodo(`${ym}-01`, fimMes(ym))));
    const media = (arr) => {
        const v = arr.filter((x) => x != null && Number.isFinite(x));
        return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const rows = await ordemCusto.ordensApuradas(new Date(`${baseMeses[0]}-01T00:00:00-03:00`), new Date(`${fimMes(baseMeses[2])}T23:59:59.999-03:00`));
    const agg = ordemCusto.agregarOrdens(rows);
    const temOrdens = agg.ordens >= 3;

    const mk = (indicador, valor, obs) => ({
        indicador,
        alvoSugerido: valor != null ? round1(valor) : null,
        base: valor != null ? 'media3m' : 'sem_base',
        observacao: obs
    });
    const SEM = 'Sem histórico confiável: preencha manualmente.';
    const semOrdens = `Poucas ordens finalizadas e apuradas nos 3 meses (${agg.ordens}; precisa de 3).`;
    const mediaMc = media(calcs.map((c) => c.mcPct));
    const mediaRes = media(calcs.map((c) => c.resultadoPct));
    const sugestoes = [
        mk('MC_PCT', mediaMc, mediaMc != null ? 'Média da margem de contribuição dos 3 últimos meses fechados.' : 'Menos de 2 meses fechados com vendas: preencha manualmente.'),
        mk('RESULTADO_PCT', mediaRes, mediaRes != null ? 'Média do resultado operacional dos 3 últimos meses fechados.' : 'Menos de 2 meses fechados com vendas: preencha manualmente.'),
        mk('CUSTO_INSUMOS_VAR_PCT', null, SEM),
        mk('PERDA_PCT', temOrdens ? agg.pctProduzido : null, temOrdens ? `Perda média de ${agg.ordens} ordens dos 3 últimos meses.` : semOrdens),
        mk('RENDIMENTO_PCT', temOrdens ? agg.rendimentoRealPct : null, temOrdens ? `Rendimento médio de ${agg.ordens} ordens dos 3 últimos meses.` : semOrdens),
        mk('DESVIO_CUSTO_PCT', temOrdens ? agg.desvioPct : null, temOrdens ? `Desvio médio de ${agg.ordens} ordens dos 3 últimos meses.` : semOrdens),
        mk('DIAS_ESTOQUE_PA', null, SEM)
    ];
    return { baseMeses, sugestoes };
}

module.exports = { CATALOGO, listarVigentes, avaliar, blocoMeta, listar, salvarLote, sugerirPelaMedia };
