/**
 * Painel Carteira (Dashboard Gerencial, aba "Carteira") — cálculo por REGRA, sem IA.
 *
 * Substitui a leitura da aba Recorrência. NÃO usa statusRecompra/diasSemComprar do
 * ClienteInsight (aquele conta cancelado e usa createdAt). Aqui:
 *  - pedido válido = faturado/especial, sem bonificação, NÃO cancelado (data = dataVenda);
 *  - cadastros ligados em `cliente_mesmo_que` formam UM cliente; cadastro inativo que compra entra;
 *  - ritmo = maior entre o ciclo do cadastro e a média dos intervalos dos últimos 6 pedidos
 *    (precisa de 3+ dias de pedido); parado = 21+ dias E 2x o ritmo, até 180 dias.
 *
 * Desempenho: UMA carga (2 ondas de consultas, sem N+1) guardada em memória por 10 min;
 * os blocos são calculados em Node a partir dela. `invalidar()` é chamado ao gravar "Já sei".
 * Cada bloco roda em try/catch próprio: se um falhar vira `null`, a rota não cai.
 */
const { Prisma } = require('@prisma/client');
const prisma = require('../config/database');
const projecaoVendasService = require('./projecaoVendasService');
const {
    TZ, isoNowTZ, inicioDiaSP, fimDiaSP, somaDiasISO, somaMesesYM, segundaDaSemana, diasNoMes, diffDias
} = require('../utils/dataSP');

const TTL_MS = 10 * 60 * 1000;
const DIAS_PARADO_MIN = 21;
const DIAS_INATIVAR = 180;
const MAX_LISTA = 50;

const num = (v) => Number(v || 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;
const round1 = (v) => Math.round(num(v) * 10) / 10;
const pct = (a, b) => (num(b) > 0 ? round2(((num(a) - num(b)) / num(b)) * 100) : null);
const pad2 = (n) => String(n).padStart(2, '0');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const diaSP = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
const ddmm = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : '');
const brl = (v) => `R$ ${num(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
/** Plural PT-BR: pl(1,'dia') -> '1 dia'; pl(0,'cliente') -> '0 clientes'; pl(2,'mês','meses') -> '2 meses'. */
const pl = (n, sing, plur) => `${n} ${Math.abs(Number(n)) === 1 ? sing : (plur || `${sing}s`)}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const nomeMes = (ym) => MESES[Number(ym.slice(5, 7)) - 1];

// ───────────────────────── funções PURAS (testáveis) ─────────────────────────

/** Janelas de comparação ancoradas em HOJE. */
function periodos(hoje, tipo) {
    if (tipo === 'mes') {
        const ym = hoje.slice(0, 7);
        const prev = somaMesesYM(ym, -1);
        const dPrev = Math.min(Number(hoje.slice(8, 10)), diasNoMes(prev));
        return { atual: { de: `${ym}-01`, ate: hoje }, anterior: { de: `${prev}-01`, ate: `${prev}-${pad2(dPrev)}` } };
    }
    const seg = segundaDaSemana(hoje);
    return {
        atual: { de: seg, ate: hoje },
        anterior: { de: somaDiasISO(seg, -7), ate: somaDiasISO(hoje, -7) }
    };
}

/** Ritmo (dias) = max(ciclo do cadastro, média dos intervalos dos últimos 6 dias de pedido). */
function calcularRitmo(diasDistintos, cicloCadastro) {
    const ciclo = cicloCadastro || 7;
    if (diasDistintos.length >= 3) {
        const ult = diasDistintos.slice(-6);
        let soma = 0;
        for (let i = 1; i < ult.length; i++) soma += diffDias(ult[i - 1], ult[i]);
        const media = soma / (ult.length - 1);
        return { ritmo: round1(Math.max(ciclo, media)), origem: media > ciclo ? 'INTERVALO_REAL' : 'CICLO_CADASTRO', intervaloMedio: round1(media) };
    }
    return { ritmo: ciclo, origem: 'CICLO_CADASTRO', intervaloMedio: null };
}

/**
 * Estado do cliente numa data. `dias` = dias distintos com pedido (ASC, já cortados em asOf).
 * Estados: SEM_PEDIDO | SAZONAL | INATIVAR | NOVO | NO_RITMO | ATRASO_LEVE | PARADO
 */
function classificar({ dias, ciclo, asOf, sazonal }) {
    const n = dias.length;
    if (n === 0) return { estado: 'SEM_PEDIDO', ritmo: ciclo || 7, origem: 'CICLO_CADASTRO', diasSemComprar: null };
    const r = calcularRitmo(dias, ciclo);
    const diasSem = diffDias(dias[n - 1], asOf);
    const base = { ritmo: r.ritmo, origem: r.origem, diasSemComprar: diasSem };
    if (sazonal) return { ...base, estado: 'SAZONAL' };
    if (diasSem > DIAS_INATIVAR) return { ...base, estado: 'INATIVAR' };
    if (n <= 2) return { ...base, estado: 'NOVO' };
    if (diasSem <= 1.5 * r.ritmo) return { ...base, estado: 'NO_RITMO' };
    if (diasSem >= DIAS_PARADO_MIN && diasSem >= 2 * r.ritmo) return { ...base, estado: 'PARADO' };
    return { ...base, estado: 'ATRASO_LEVE' };
}

const ehSazonal = (nome) => semAcento(nome).includes('kit festa');
const ehFora = (nome) => semAcento(nome).startsWith('funcionarios');

const MOTIVOS_REGRAS = [
    ['Semana que vem', /semana que vem|semana q vem|proxima semana|semana seguinte|pra proxima|para a proxima/],
    ['Não precisa agora', /nao precisa|nao precisou|nao quer|sem necessidade|nao vai precisar/],
    ['Estoque cheio', /estoque/],
    ['Devendo', /devend|inadimpl|boleto em atraso|em atraso|atrasad/],
    ['Movimento fraco', /movimento|fraco|fraca|vendas? (baixa|caiu)/],
    ['Fechou', /fechou|fechado|encerr|faliu/],
    ['Preço', /preco|caro|concorr|mais barato/]
];
const classificarMotivo = (obs) => {
    const t = semAcento(obs);
    if (!t.trim()) return 'Sem motivo claro';
    for (const [nome, re] of MOTIVOS_REGRAS) if (re.test(t)) return nome;
    return 'Sem motivo claro';
};
// Registros sem pedido, classificados pelo TIPO do atendimento (FINANCEIRO fica de fora).
// outros = TELEFONE/LIGACAO/OUTROS e qualquer tipo desconhecido. As contagens por acaoLabel
// (atendidoSemPedido, semResposta) são INDEPENDENTES do tipo.
const semPedidoVazio = () => ({ whatsapp: 0, presencial: 0, semVisita: 0, outros: 0, total: 0, atendidoSemPedido: 0, semResposta: 0 });
function somarSemPedido(x, a) {
    const t = String(a.tipo || '').toUpperCase();
    if (t === 'SEM_VISITA') x.semVisita++;
    else if (t === 'PRESENCIAL' || t === 'VISITA' || t === 'AMOSTRA') x.presencial++;
    else if (t === 'WHATSAPP') x.whatsapp++;
    else x.outros++;
    x.total++;
    const lb = semAcento(a.acaoLabel);
    if (/atendido sem pedido/.test(lb)) x.atendidoSemPedido++;
    if (/sem resposta|ausente/.test(lb)) x.semResposta++;
}
// Aviso só para ENCERRAMENTO do negócio. "fechado" sozinho (fechamento temporário) NÃO dispara.
const REGEX_FECHOU = /\b(fechou|encerrou( as atividades| o negocio)?|faliu|nao existe mais|vendeu o ponto|fechou as portas)\b/;
const REGEX_FECHOU_FALSO = /fechou\s+(o\s+|um\s+|outro\s+|este\s+|esse\s+|\d+\s+)?(pedido|venda|negocio com|compra)|(pedido|venda|compra) fechad/;
const anotouFechou = (obs) => { const t = semAcento(obs); return REGEX_FECHOU.test(t) && !REGEX_FECHOU_FALSO.test(t); };

// ───────────────────────── carga (2 ondas, sem N+1) ─────────────────────────

let cache = null; // { ts, promise, base, memo: Map }
const invalidar = () => { cache = null; };

async function carregarBase(hojeForcado) {
    const hoje = hojeForcado || isoNowTZ(); // hojeForcado: só para testes com dado antigo
    const ym = hoje.slice(0, 7);
    const inicio = inicioDiaSP(somaDiasISO(hoje, -730));
    const fimMes = fimDiaSP(`${ym}-${pad2(diasNoMes(ym))}`);
    const desdeGrupo = inicioDiaSP(somaDiasISO(hoje, -70));
    const desdeAtend = inicioDiaSP(somaDiasISO(hoje, -70));
    const diaSql = Prisma.sql`to_char((p.data_venda AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`;
    const gruposSql = Prisma.sql`COALESCE(cp.nome, pr.categoria, 'Sem grupo')`;

    const [clientes, categorias, vendedores, pedidos, devs, atend, pausas, whats, vinculos, silencios, insights, metas, itensGrupo, devGrupo] = await Promise.all([
        prisma.cliente.findMany({
            select: {
                UUID: true, Nome: true, NomeFantasia: true, Ativo: true, idVendedor: true, Dia_de_venda: true,
                categoriaClienteId: true, cicloCompraPersonalizadoDias: true, Telefone_Celular: true,
                End_Logradouro: true, End_Numero: true, End_CEP: true, End_Cidade: true
            }
        }),
        prisma.categoriaCliente.findMany({ select: { id: true, nome: true, cicloPadraoDias: true } }),
        prisma.vendedor.findMany({ select: { id: true, nome: true, ativo: true, acessoExterno: true } }),
        prisma.$queryRaw`
            SELECT p.id, p.cliente_id, p.vendedor_id, ${diaSql} AS dia,
                   COALESCE(SUM(i.valor * i.quantidade), 0)::float AS valor
            FROM pedidos p
            LEFT JOIN pedido_itens i ON i.pedido_id = p.id
            WHERE p.bonificacao = false AND p.cancelado = false
              AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
              AND p.data_venda >= ${inicio} AND p.data_venda <= ${fimMes}
            GROUP BY p.id`,
        prisma.devolucao.findMany({
            where: { status: 'ATIVA', dataDevolucao: { gte: inicio, lte: fimMes } },
            select: { valorTotal: true, dataDevolucao: true, pedidoOriginal: { select: { clienteId: true, vendedorId: true } } }
        }),
        prisma.atendimento.findMany({
            where: { criadoEm: { gte: desdeAtend }, clienteId: { not: null } },
            select: { clienteId: true, idVendedor: true, tipo: true, acaoKey: true, acaoLabel: true, observacao: true, pedidoId: true, criadoEm: true }
        }),
        prisma.clientePausa.findMany({ select: { clienteUuid: true, pausadoAte: true } }),
        prisma.clienteWhatsapp.findMany({ select: { clienteUuid: true, numeros: true } }),
        prisma.clienteMesmoQue.findMany(),
        prisma.clienteSilencio.findMany(),
        prisma.clienteInsight.findMany({
            where: { variacaoTicketPct: { lte: -15 } },
            select: { clienteId: true, variacaoTicketPct: true, produtoAusenteId: true }
        }),
        prisma.metaMensalVendedor.findMany({ where: { mesReferencia: ym }, select: { vendedorId: true, valorMensal: true, diasTrabalho: true } }),
        prisma.$queryRaw`
            SELECT ${gruposSql} AS grupo, p.cliente_id, ${diaSql} AS dia,
                   SUM(i.valor * i.quantidade)::float AS valor
            FROM pedido_itens i
            JOIN pedidos p ON p.id = i.pedido_id
            JOIN produtos pr ON pr.id = i.produto_id
            LEFT JOIN categorias_produto cp ON cp.id = pr.categoria_produto_id
            WHERE p.bonificacao = false AND p.cancelado = false
              AND (p.situacao_ca = 'FATURADO' OR p.especial = true)
              AND p.data_venda >= ${desdeGrupo} AND p.data_venda <= ${fimDiaSP(hoje)}
            GROUP BY 1, 2, 3`,
        prisma.$queryRaw`
            SELECT ${gruposSql} AS grupo, d.cliente_id,
                   to_char((d.data_devolucao AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
                   SUM(di.valor_total)::float AS valor
            FROM devolucao_itens di
            JOIN devolucoes d ON d.id = di.devolucao_id
            JOIN produtos pr ON pr.id = di.produto_id
            LEFT JOIN categorias_produto cp ON cp.id = pr.categoria_produto_id
            WHERE d.status = 'ATIVA' AND d.data_devolucao >= ${desdeGrupo} AND d.data_devolucao <= ${fimDiaSP(hoje)}
            GROUP BY 1, 2, 3`
    ]);

    // 2ª onda: projeção (serviço da comissão) e nomes dos produtos ausentes
    const idsProd = [...new Set(insights.map((i) => i.produtoAusenteId).filter(Boolean))];
    const [projVend, produtos] = await Promise.all([
        projecaoVendasService.projecoesMes(ym).catch((e) => { console.error('[Carteira] projeção falhou:', e.message); return null; }),
        idsProd.length ? prisma.produto.findMany({ where: { id: { in: idsProd } }, select: { id: true, nome: true } }) : Promise.resolve([])
    ]);

    return {
        hoje, ym, geradoEm: new Date().toISOString(),
        clientes, categorias, vendedores, pedidos, devs, atend, pausas, whats, vinculos, silencios, insights, metas,
        itensGrupo, devGrupo, projVend, produtos
    };
}

async function obterBase(fresh) {
    if (!fresh && cache && Date.now() - cache.ts < TTL_MS) return cache.promise;
    const entrada = { ts: Date.now(), memo: new Map() };
    entrada.promise = carregarBase().then((b) => { entrada.base = b; return entrada; });
    entrada.promise.catch(() => { if (cache === entrada) cache = null; });
    cache = entrada;
    return entrada.promise;
}

// ───────────────────────── cálculo do painel ─────────────────────────

function bloco(nome, fn) {
    try { return fn(); } catch (e) { console.error(`[Carteira] bloco ${nome} falhou:`, e); return null; }
}

function celularUtil(raw) {
    try { return require('./whatsappClienteService').numeroValido(raw); } catch {
        const d = String(raw || '').replace(/\D/g, '');
        return d.length === 10 || d.length === 11;
    }
}
const digitos = (s) => String(s || '').replace(/\D/g, '');
const chaveCelular = (raw) => {
    let d = digitos(raw);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? d : null;
};

function montarEntidades(base) {
    const { hoje } = base;
    const cliPorId = new Map(base.clientes.map((c) => [c.UUID, c]));
    const catPorId = new Map(base.categorias.map((c) => [c.id, c]));
    const vendPorId = new Map(base.vendedores.map((v) => [v.id, v]));
    const paraAtual = new Map(base.vinculos.filter((v) => !v.ignorado).map((v) => [v.antigoId, v.atualId]));
    const canon = (id) => { let x = id; for (let i = 0; i < 5 && paraAtual.has(x); i++) x = paraAtual.get(x); return x; };
    const agora = Date.now();
    const silenc = new Map(base.silencios.filter((s) => new Date(s.silenciarAte).getTime() > agora).map((s) => [s.clienteUuid, diaSP(s.silenciarAte)]));
    const pausa = new Map(base.pausas.filter((p) => new Date(p.pausadoAte).getTime() > agora).map((p) => [p.clienteUuid, diaSP(p.pausadoAte)]));
    const whats = new Map(base.whats.map((w) => [w.clienteUuid, w.numeros || []]));
    const insPorCli = new Map(base.insights.map((i) => [i.clienteId, i]));
    const nomeProd = new Map(base.produtos.map((p) => [p.id, p.nome]));

    // entidade = cadastro canônico + todos os cadastros ligados a ele
    const ents = new Map();
    const get = (id) => {
        const cid = canon(id);
        let e = ents.get(cid);
        if (!e) {
            const cad = cliPorId.get(cid);
            if (!cad) return null;
            const cat = cad.categoriaClienteId ? catPorId.get(cad.categoriaClienteId) : null;
            e = { id: cid, cad, ids: new Set([cid]), pedidos: [], devs: [], cat,
                nome: cad.NomeFantasia || cad.Nome || 'Cliente',
                ciclo: cad.cicloCompraPersonalizadoDias || cat?.cicloPadraoDias || 7,
                sazonal: ehSazonal(cat?.nome), fora: ehFora(cat?.nome) };
            ents.set(cid, e);
        }
        e.ids.add(id);
        return e;
    };
    for (const c of base.clientes) get(c.UUID);
    for (const p of base.pedidos) { const e = get(p.cliente_id); if (e) e.pedidos.push({ dia: p.dia, valor: num(p.valor), vendedorId: p.vendedor_id }); }
    for (const d of base.devs) {
        const cid = d.pedidoOriginal?.clienteId; const e = cid ? get(cid) : null;
        if (e) e.devs.push({ dia: diaSP(d.dataDevolucao), valor: num(d.valorTotal), vendedorId: d.pedidoOriginal?.vendedorId || null });
    }

    // atendimentos por entidade
    const atPorEnt = new Map();
    for (const a of base.atend) {
        const cid = canon(a.clienteId);
        if (!atPorEnt.has(cid)) atPorEnt.set(cid, []);
        atPorEnt.get(cid).push({ ...a, dia: diaSP(a.criadoEm) });
    }

    const lim30 = somaDiasISO(hoje, -30);
    const lim60 = somaDiasISO(hoje, -60);
    for (const e of ents.values()) {
        e.pedidos.sort((a, b) => (a.dia < b.dia ? -1 : 1));
        e.validos = e.pedidos.filter((p) => p.dia <= hoje);
        e.diasDistintos = [...new Set(e.validos.map((p) => p.dia))];
        const k = classificar({ dias: e.diasDistintos, ciclo: e.ciclo, asOf: hoje, sazonal: e.sazonal });
        Object.assign(e, { estado: k.estado, ritmo: k.ritmo, origemRitmo: k.origem, diasSem: k.diasSemComprar });
        e.ultimo = e.diasDistintos.length ? e.diasDistintos[e.diasDistintos.length - 1] : null;
        e.primeiro = e.diasDistintos.length ? e.diasDistintos[0] : null;
        const ult6 = e.validos.slice(-6);
        e.ticket = ult6.length ? round2(ult6.reduce((s, p) => s + p.valor, 0) / ult6.length) : 0;
        e.vendedorId = e.cad.idVendedor || null;
        e.vendedorNome = e.vendedorId ? (vendPorId.get(e.vendedorId)?.nome || 'Vendedor') : 'Sem vendedor';
        e.silenciadoAte = silenc.get(e.id) || null;
        e.pausadoAte = pausa.get(e.id) || null;
        e.noCarteira = !e.fora && (e.cad.Ativo || (e.diasSem != null && e.diasSem <= DIAS_INATIVAR));
        const ats = (atPorEnt.get(e.id) || []).sort((a, b) => (a.dia < b.dia ? 1 : -1));
        e.atendimentos = ats;
        e.ultimoAtend = ats[0] || null;
        e.semRespostaWpp30 = ats.filter((a) => a.tipo === 'WHATSAPP' && a.dia >= lim30 && /sem resposta|ausente/i.test(a.acaoLabel || '')).length;
        e.fechouObs = ats.some((a) => a.dia >= lim60 && a.tipo !== 'FINANCEIRO' && anotouFechou(a.observacao));
        const temCel = [...e.ids].some((id) => celularUtil(cliPorId.get(id)?.Telefone_Celular) || (whats.get(id) || []).some((n) => celularUtil(n)));
        e.temCelular = temCel;
        // destino
        if (e.estado === 'PARADO') e.destino = (temCel && e.semRespostaWpp30 < 2) ? 'ANA' : 'VISITA';
        else if (e.estado === 'ATRASO_LEVE') e.destino = 'ATRASO_LEVE';
        else if (e.estado === 'INATIVAR') e.destino = 'INATIVAR';
        else e.destino = null;
        // "fechou" nas anotações NÃO muda o bucket (dava falso positivo): vira só um aviso no cliente
        e.avisos = e.fechouObs ? ['VENDEDOR_ANOTOU_FECHOU'] : [];
        e.cadastrosUnidos = [...e.ids].filter((id) => id !== e.id).map((id) => cliPorId.get(id)?.NomeFantasia || cliPorId.get(id)?.Nome).filter(Boolean);
        e.valorEmRiscoMes = round2(e.ticket * (30 / Math.max(1, e.ritmo)));
        e.insight = insPorCli.get(e.id) || null;
    }
    return { ents, canon, cliPorId, vendPorId, nomeProd, paraAtual };
}

function textoGerente(e, hoje) {
    const p = [];
    if (e.estado === 'PARADO' || e.estado === 'ATRASO_LEVE') {
        p.push(`Costuma pedir a cada ${pl(Math.round(e.ritmo), 'dia')} e está há ${pl(e.diasSem, 'dia')} sem pedir. Último pedido em ${ddmm(e.ultimo)}, ticket médio ${brl(e.ticket)}.`);
    } else if (e.estado === 'INATIVAR') {
        p.push(`Está há ${pl(e.diasSem, 'dia')} sem pedir. Último pedido em ${ddmm(e.ultimo)}.`);
    } else {
        p.push(`Pede a cada ${pl(Math.round(e.ritmo), 'dia')} e está há ${pl(e.diasSem, 'dia')} sem pedir.`);
    }
    if (e.estado === 'PARADO') p.push(e.destino === 'ANA' ? 'Tem celular utilizável: a Ana pode chamar.' : 'Sem celular utilizável ou sem resposta no WhatsApp: pede visita presencial.');
    if (e.cad.Dia_de_venda) p.push(`Dia de venda: ${e.cad.Dia_de_venda}.`);
    if (e.ultimoAtend) p.push(`Último registro: ${String(e.ultimoAtend.tipo || '').toLowerCase()} em ${ddmm(e.ultimoAtend.dia)}${e.ultimoAtend.acaoLabel ? ` (${e.ultimoAtend.acaoLabel})` : ''}.`);
    if (e.avisos?.includes('VENDEDOR_ANOTOU_FECHOU')) p.push('Atenção: uma anotação recente de vendedor diz que o cliente fechou.');
    if (e.pausadoAte) p.push(`Visitas pausadas até ${ddmm(e.pausadoAte)}.`);
    if (e.cadastrosUnidos.length) p.push(`Soma os cadastros: ${e.cadastrosUnidos.join(', ')}.`);
    return p.join(' ');
}

function itemAtencao(e, hoje) {
    return {
        clienteId: e.id, nome: e.nome, cidade: e.cad.End_Cidade || null,
        vendedor: e.vendedorId ? e.vendedorNome : null, vendedorId: e.vendedorId,
        tipo: e.cat?.nome?.trim() || null,
        ritmoDias: e.ritmo, origemRitmo: e.origemRitmo, diasSemComprar: e.diasSem,
        pedidosValidos: e.validos.length, ultimoPedido: e.ultimo, ticketMedio: e.ticket,
        valorEmRiscoMes: e.valorEmRiscoMes, destino: e.destino,
        textoGerente: textoGerente(e, hoje), cadastrosUnidos: e.cadastrosUnidos,
        silenciadoAte: e.silenciadoAte, pausadoAte: e.pausadoAte, avisos: e.avisos || []
    };
}

function calcular(base, periodoTipo, vendedorFiltro) {
    const { hoje } = base;
    const M = montarEntidades(base);
    const { ents, canon, cliPorId, vendPorId } = M;
    const win = periodos(hoje, periodoTipo);
    const vf = (vendedorFiltro && vendedorFiltro !== 'todos') ? vendedorFiltro : null;
    const noFiltro = (e) => !vf || (vf === 'sem-vendedor' ? !e.vendedorId : e.vendedorId === vf);
    const universo = [...ents.values()].filter(noFiltro);
    const universoCarteira = universo.filter((e) => e.noCarteira);
    const dentro = (dia, w) => dia >= w.de && dia <= w.ate;

    // eventos de dinheiro do universo (pedidos válidos até hoje; devolução no dia registrado)
    const eventos = [];
    for (const e of universo) {
        for (const p of e.validos) eventos.push({ dia: p.dia, v: p.valor, e, ped: 1 });
        for (const d of e.devs) if (d.dia <= hoje) eventos.push({ dia: d.dia, v: -d.valor, e, ped: 0 });
    }
    const somaJanela = (w, fn) => eventos.reduce((s, ev) => (dentro(ev.dia, w) && (!fn || fn(ev)) ? s + ev.v : s), 0);
    const porEntJanela = (w) => { const m = new Map(); for (const ev of eventos) if (dentro(ev.dia, w)) m.set(ev.e, (m.get(ev.e) || 0) + ev.v); return m; };

    const out = { hoje, periodo: periodoTipo, janela: win, vendedorId: vf || 'todos' };
    const ctx = {};

    out.vendedores = bloco('vendedores', () => {
        const comCarteira = new Set([...ents.values()].filter((e) => e.noCarteira && e.vendedorId).map((e) => e.vendedorId));
        return base.vendedores.filter((v) => comCarteira.has(v.id) && v.ativo !== false && !v.acessoExterno).map((v) => ({ id: v.id, nome: v.nome })).sort((a, b) => a.nome.localeCompare(b.nome));
    }) || [];

    // ── 6 números ──
    out.numeros = bloco('numeros', () => {
        const medir = (w) => {
            const porEnt = porEntJanela(w);
            const comPed = new Set(); let qtdPed = 0;
            for (const e of universo) for (const p of e.validos) if (dentro(p.dia, w)) { comPed.add(e); qtdPed++; }
            const reais = round2(somaJanela(w));
            let novos = 0, voltaram = 0, pararam = 0;
            for (const e of universo) {
                if (e.fora) continue;
                const dias = e.diasDistintos;
                const f = dias.find((d) => dentro(d, w));
                if (f) {
                    const idx = dias.indexOf(f);
                    if (idx === 0) novos++;
                    else if (diffDias(dias[idx - 1], f) >= 35) voltaram++;
                }
                if (!e.sazonal && e.noCarteira) {
                    const estadoEm = (asOf) => classificar({ dias: dias.filter((d) => d <= asOf), ciclo: e.ciclo, asOf, sazonal: false }).estado;
                    if (estadoEm(w.ate) === 'PARADO' && estadoEm(somaDiasISO(w.de, -1)) !== 'PARADO') pararam++;
                }
            }
            return { reais, clientes: comPed.size, qtdPed, ticket: qtdPed ? round2(reais / qtdPed) : 0, novos, voltaram, pararam, porEnt };
        };
        const a = medir(win.atual), b = medir(win.anterior);
        ctx.a = a; ctx.b = b;
        return {
            pedidosReais: { atual: a.reais, anterior: b.reais, variacaoPct: pct(a.reais, b.reais) },
            qtdPedidos: { atual: a.qtdPed, anterior: b.qtdPed, variacaoPct: pct(a.qtdPed, b.qtdPed) },
            clientesCompraram: { atual: a.clientes, anterior: b.clientes, variacaoPct: pct(a.clientes, b.clientes) },
            ticket: { atual: a.ticket, anterior: b.ticket, variacaoPct: pct(a.ticket, b.ticket) },
            novos: { atual: a.novos, anterior: b.novos },
            voltaram: { atual: a.voltaram, anterior: b.voltaram },
            pararam: { atual: a.pararam, anterior: b.pararam }
        };
    });

    // ── gráfico ──
    out.grafico = bloco('grafico', () => {
        if (periodoTipo === 'mes') {
            const itens = [];
            for (let i = 5; i >= 0; i--) {
                const ym = somaMesesYM(hoje.slice(0, 7), -i);
                const w = { de: `${ym}-01`, ate: i === 0 ? hoje : `${ym}-${pad2(diasNoMes(ym))}` };
                itens.push({ rotulo: nomeMes(ym), de: w.de, valor: round2(somaJanela(w)), parcial: i === 0 });
            }
            return { tipo: 'mensal', titulo: 'Últimos 6 meses', itens };
        }
        const seg0 = segundaDaSemana(hoje);
        const itens = [];
        for (let i = 8; i >= 0; i--) {
            const de = somaDiasISO(seg0, -7 * i);
            const w = { de, ate: i === 0 ? hoje : somaDiasISO(de, 6) };
            itens.push({ rotulo: ddmm(de), de, valor: round2(somaJanela(w)), parcial: i === 0 });
        }
        return { tipo: 'semanal', titulo: 'Últimas 9 semanas', itens };
    });

    // ── projeção do mês × meta ──
    out.projecao = vf === 'sem-vendedor' ? null : bloco('projecao', () => {
        const ym = hoje.slice(0, 7);
        const totDias = diasNoMes(ym);
        const diaAtual = Number(hoje.slice(8, 10));
        const prev = somaMesesYM(ym, -1);
        const mesW = { de: `${ym}-01`, ate: `${ym}-${pad2(totDias)}` };
        const prevW = { de: `${prev}-01`, ate: `${prev}-${pad2(diasNoMes(prev))}` };
        const metasSel = base.metas.filter((m) => !vf || m.vendedorId === vf);
        const realPorVend = new Map();
        for (const p of base.pedidos) if (dentro(p.dia, mesW)) realPorVend.set(p.vendedor_id, (realPorVend.get(p.vendedor_id) || 0) + num(p.valor));
        for (const d of base.devs) { const dia = diaSP(d.dataDevolucao); if (dentro(dia, mesW)) { const v = d.pedidoOriginal?.vendedorId; realPorVend.set(v, (realPorVend.get(v) || 0) - num(d.valorTotal)); } }
        const idsSel = vf ? [vf] : [...new Set([...base.metas.map((m) => m.vendedorId), ...realPorVend.keys()].filter(Boolean))];
        const jaEntrou = round2(vf ? (realPorVend.get(vf) || 0) : [...realPorVend.values()].reduce((s, v) => s + v, 0));
        const proj = base.projVend;
        let fecha;
        if (proj && proj.size > 0) {
            let restanteComMeta = 0, baseComMeta = 0;
            for (const [vid, p] of proj.entries()) { if (vf && vid !== vf) continue; restanteComMeta += p.projecaoRestante; baseComMeta += p.totalVendidoMes; }
            const baseSemMeta = Math.max(0, jaEntrou - baseComMeta);
            fecha = round2(jaEntrou + restanteComMeta + (diaAtual > 0 ? (baseSemMeta / diaAtual) * (totDias - diaAtual) : 0));
        } else fecha = diaAtual > 0 ? round2((jaEntrou / diaAtual) * totDias) : 0;
        const meta = round2(metasSel.reduce((s, m) => s + num(m.valorMensal), 0));
        const diasSet = new Set(); const parse = (v) => (Array.isArray(v) ? v : []);
        for (const m of metasSel) parse(m.diasTrabalho).forEach((d) => diasSet.add(d));
        const diasTrab = [...diasSet];
        const passados = diasTrab.filter((d) => d <= hoje).length;
        const restantes = diasTrab.length - passados;
        const mesAnt = round2(base.pedidos.reduce((s, p) => (dentro(p.dia, prevW) && (!vf || p.vendedor_id === vf) ? s + num(p.valor) : s), 0)
            - base.devs.reduce((s, d) => (dentro(diaSP(d.dataDevolucao), prevW) && (!vf || d.pedidoOriginal?.vendedorId === vf) ? s + num(d.valorTotal) : s), 0));
        const falta = meta > 0 ? Math.max(0, round2(meta - jaEntrou)) : 0;
        const porDiaNec = restantes > 0 ? round2(falta / restantes) : null;
        const porDiaAte = passados > 0 ? round2(jaEntrou / passados) : null;
        const varMes = pct(fecha, mesAnt);
        const pctMeta = meta > 0 ? round2((fecha / meta) * 100) : null;
        let frase = `No ritmo atual ${nomeMes(ym)} fecha em ${brl(fecha)}`;
        if (varMes != null) frase += `, ${Math.abs(Math.round(varMes))}% ${varMes >= 0 ? 'acima' : 'abaixo'} de ${nomeMes(prev)} (${brl(mesAnt)})`;
        if (pctMeta != null) frase += ` e em ${Math.round(pctMeta)}% da meta`;
        frase += '.';
        if (meta > 0 && falta > 0 && restantes > 0) frase += ` Para bater a meta faltam ${brl(falta)} em ${pl(restantes, 'dia')} de trabalho: ${brl(porDiaNec)} por dia${porDiaAte != null ? `, contra ${brl(porDiaAte)} por dia até agora` : ''}.`;
        else if (meta > 0 && falta === 0) frase += ' A meta do mês já foi batida.';
        const porVendedor = idsSel.map((vid) => {
            const mt = base.metas.find((m) => m.vendedorId === vid);
            const metaV = round2(num(mt?.valorMensal));
            const real = round2(realPorVend.get(vid) || 0);
            const pv = proj?.get(vid);
            const pj = pv ? round2(real + pv.projecaoRestante) : (diaAtual > 0 ? round2((real / diaAtual) * totDias) : 0);
            return { vendedorId: vid, nome: vendPorId.get(vid)?.nome || 'Sem vendedor', meta: metaV, realizado: real, projecao: pj,
                pctMeta: metaV > 0 ? round2((pj / metaV) * 100) : null, pctRealizado: metaV > 0 ? round2((real / metaV) * 100) : null,
                metodo: pv ? 'dias_trabalho' : 'ritmo_linear' };
        }).filter((v) => v.meta > 0 || v.realizado > 0).sort((a, b) => b.realizado - a.realizado);
        ctx.projecao = { fecha, pctMeta };
        return {
            mes: ym, mesRotulo: nomeMes(ym), diaHoje: diaAtual, jaEntrou, fechaNoRitmo: fecha, meta,
            pctMeta, pctRealizado: meta > 0 ? round2((jaEntrou / meta) * 100) : null,
            mesAnteriorTotal: mesAnt, variacaoVsMesAnteriorPct: varMes,
            diasTrabalho: { total: diasTrab.length, passados, restantes },
            faltaParaMeta: falta, porDiaNecessario: porDiaNec, porDiaAteAgora: porDiaAte,
            metodo: proj && proj.size > 0 ? 'dias_trabalho' : 'ritmo_linear', frase, porVendedor
        };
    });

    // ── carteira por vendedor + listas de atenção ──
    const itensPorBucket = { paradoAna: [], paradoVisita: [], atrasoLeve: [], inativar: [], enfraquecendo: [] };
    const linhasVend = new Map();
    bloco('carteira', () => {
        for (const e of universoCarteira) {
            const key = e.vendedorId || 'sem-vendedor';
            if (!linhasVend.has(key)) linhasVend.set(key, { vendedorId: e.vendedorId, nome: e.vendedorNome, total: 0, noRitmo: 0, atrasoLeve: 0, paradoAna: 0, paradoVisita: 0, inativar: 0, novos: 0, sazonal: 0, silenciados: 0, valorEmRiscoMes: 0 });
            const l = linhasVend.get(key);
            l.total++;
            if (e.estado === 'SAZONAL') { l.sazonal++; continue; }
            if (e.estado === 'NOVO') { l.novos++; continue; }
            if (e.estado === 'SEM_PEDIDO') continue;
            if (e.estado === 'NO_RITMO') l.noRitmo++;
            if (e.silenciadoAte && ['ATRASO_LEVE', 'PARADO', 'INATIVAR'].includes(e.estado)) { l.silenciados++; continue; }
            if (e.estado === 'ATRASO_LEVE') { l.atrasoLeve++; itensPorBucket.atrasoLeve.push(e); }
            if (e.estado === 'PARADO') { l.valorEmRiscoMes += e.valorEmRiscoMes; if (e.destino === 'ANA') { l.paradoAna++; itensPorBucket.paradoAna.push(e); } else { l.paradoVisita++; itensPorBucket.paradoVisita.push(e); } }
            if (e.estado === 'ATRASO_LEVE') l.valorEmRiscoMes += e.valorEmRiscoMes;
            if (e.estado === 'INATIVAR') { l.inativar++; itensPorBucket.inativar.push(e); }
            if (['NO_RITMO', 'ATRASO_LEVE'].includes(e.estado) && e.insight && num(e.insight.variacaoTicketPct) <= -15 && !e.silenciadoAte) itensPorBucket.enfraquecendo.push(e);
        }
    });

    out.atencao = bloco('atencao', () => {
        const mk = (lista, extra) => {
            const ord = [...lista].sort((a, b) => b.valorEmRiscoMes - a.valorEmRiscoMes);
            return { total: ord.length, itens: ord.slice(0, MAX_LISTA).map((e) => ({ ...itemAtencao(e, hoje), ...(extra ? extra(e) : {}) })) };
        };
        const enf = [...itensPorBucket.enfraquecendo].sort((a, b) => num(a.insight.variacaoTicketPct) - num(b.insight.variacaoTicketPct));
        return {
            paradoAna: mk(itensPorBucket.paradoAna), paradoVisita: mk(itensPorBucket.paradoVisita),
            atrasoLeve: mk(itensPorBucket.atrasoLeve), inativar: mk(itensPorBucket.inativar),
            enfraquecendo: { total: enf.length, itens: enf.slice(0, MAX_LISTA).map((e) => ({ ...itemAtencao(e, hoje), variacaoTicketPct: num(e.insight.variacaoTicketPct), produtoAusente: e.insight.produtoAusenteId ? (M.nomeProd.get(e.insight.produtoAusenteId) || null) : null })) }
        };
    });

    // ── equipe (pedidos, R$, clientes + registros sem pedido) ──
    out.equipe = bloco('equipe', () => {
        const medirV = (w) => {
            const m = new Map();
            const g = (vid) => { if (!m.has(vid)) m.set(vid, { pedidos: 0, reais: 0, clientes: new Set(), semPedido: semPedidoVazio() }); return m.get(vid); };
            for (const p of base.pedidos) if (dentro(p.dia, w) && p.dia <= hoje && (!vf || p.vendedor_id === vf)) { const x = g(p.vendedor_id); x.pedidos++; x.reais += num(p.valor); x.clientes.add(canon(p.cliente_id)); }
            for (const d of base.devs) { const dia = diaSP(d.dataDevolucao); const vid = d.pedidoOriginal?.vendedorId; if (dentro(dia, w) && dia <= hoje && (!vf || vid === vf)) g(vid).reais -= num(d.valorTotal); }
            for (const a of base.atend) {
                const dia = diaSP(a.criadoEm);
                if (!dentro(dia, w) || a.pedidoId || a.tipo === 'FINANCEIRO' || (vf && a.idVendedor !== vf)) continue;
                somarSemPedido(g(a.idVendedor).semPedido, a);
            }
            return m;
        };
        const A = medirV(win.atual), B = medirV(win.anterior);
        const ids = new Set([...A.keys(), ...B.keys()]);
        const fmt = (x) => x ? { pedidos: x.pedidos, reais: round2(x.reais), clientes: x.clientes.size, semPedido: x.semPedido } : { pedidos: 0, reais: 0, clientes: 0, semPedido: semPedidoVazio() };
        const porVendedor = [...ids].map((vid) => ({ vendedorId: vid, nome: vendPorId.get(vid)?.nome || 'Sem vendedor', atual: fmt(A.get(vid)), anterior: fmt(B.get(vid)) }))
            .filter((v) => v.atual.pedidos || v.anterior.pedidos || v.atual.semPedido.total || v.anterior.semPedido.total)
            .sort((a, b) => b.atual.reais - a.atual.reais);
        for (const v of porVendedor) { const l = linhasVend.get(v.vendedorId || 'sem-vendedor'); if (l) l.registrosSemPedido = v.atual.semPedido; }
        return { janela: win, porVendedor,
            nota: 'Registros sem pedido classificados pelo TIPO: SEM_VISITA = sem visita; PRESENCIAL/VISITA/AMOSTRA = presencial; WHATSAPP = WhatsApp; demais = outros. Financeiro fica de fora. atendidoSemPedido e semResposta vêm do rótulo da ação, independente do tipo.' };
    });

    out.carteiraPorVendedor = bloco('carteiraPorVendedor', () => [...linhasVend.values()].map((l) => ({
        ...l, valorEmRiscoMes: round2(l.valorEmRiscoMes), registrosSemPedido: l.registrosSemPedido || semPedidoVazio()
    })).sort((a, b) => b.total - a.total));

    // ── 20 maiores ──
    out.top20 = bloco('top20', () => {
        const w90 = { de: somaDiasISO(hoje, -89), ate: hoje };
        const porEnt = porEntJanela(w90);
        const totalVenda = [...porEnt.values()].reduce((s, v) => s + v, 0);
        const rank = [...porEnt.entries()].filter(([e, v]) => v > 0 && !e.fora).sort((a, b) => b[1] - a[1]).slice(0, 20);
        const soma = rank.reduce((s, [, v]) => s + v, 0);
        let faltando = 0;
        const itens = rank.map(([e, v]) => {
            const f = e.diasSem != null && e.diasSem > 1.5 * Math.max(e.ritmo, 3) && e.estado !== 'SAZONAL' && e.diasDistintos.length >= 3 && !e.silenciadoAte;
            if (f) faltando++;
            return { clienteId: e.id, nome: e.nome, vendedor: e.vendedorId ? e.vendedorNome : null, vendedorId: e.vendedorId, reais90d: round2(v),
                ritmoDias: e.ritmo, diasSemComprar: e.diasSem, status: f ? 'FALTANDO' : 'EM_DIA', silenciadoAte: e.silenciadoAte, cadastrosUnidos: e.cadastrosUnidos,
                textoGerente: f ? textoGerente(e, hoje) : null };
        });
        ctx.top20 = { faltando, itens };
        return { janela: w90, somaReais: round2(soma), pctDaVenda90d: totalVenda > 0 ? round2((soma / totalVenda) * 100) : null, faltando, itens };
    });

    // ── quem mudou ──
    out.quemMudou = bloco('quemMudou', () => {
        const A = ctx.a.porEnt, B = ctx.b.porEnt;
        const todos = new Set([...A.keys(), ...B.keys()]);
        const linhas = [...todos].map((e) => ({ clienteId: e.id, nome: e.nome, vendedor: e.vendedorId ? e.vendedorNome : null, tipo: e.cat?.nome?.trim() || null,
            atual: round2(A.get(e) || 0), anterior: round2(B.get(e) || 0), diferenca: round2((A.get(e) || 0) - (B.get(e) || 0)), cadastrosUnidos: e.cadastrosUnidos }));
        return { cairam: linhas.filter((l) => l.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca).slice(0, 5),
            subiram: linhas.filter((l) => l.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca).slice(0, 5) };
    });

    const topComOutros = (mapa, max) => {
        const linhas = [...mapa.entries()].map(([k, v]) => ({ k, atual: round2(v.a), anterior: round2(v.b) })).sort((x, y) => y.atual - x.atual);
        const top = linhas.slice(0, max); const resto = linhas.slice(max);
        if (resto.length) top.push({ k: 'Outros', atual: round2(resto.reduce((s, r) => s + r.atual, 0)), anterior: round2(resto.reduce((s, r) => s + r.anterior, 0)) });
        return top;
    };

    out.porTipoCliente = bloco('porTipoCliente', () => {
        const m = new Map(); const add = (e, v, k) => { const t = e.cat?.nome?.trim() || 'Sem tipo'; if (!m.has(t)) m.set(t, { a: 0, b: 0 }); m.get(t)[k] += v; };
        for (const [e, v] of ctx.a.porEnt) add(e, v, 'a');
        for (const [e, v] of ctx.b.porEnt) add(e, v, 'b');
        return topComOutros(m, 6).map((l) => ({ tipo: l.k, atual: l.atual, anterior: l.anterior, diferenca: round2(l.atual - l.anterior) }));
    });

    out.porGrupoProduto = bloco('porGrupoProduto', () => {
        const m = new Map();
        const add = (r, sinal) => {
            const e = ents.get(canon(r.cliente_id)); if (!e || !noFiltro(e) || r.dia > hoje) return;
            const k = dentro(r.dia, win.atual) ? 'a' : dentro(r.dia, win.anterior) ? 'b' : null; if (!k) return;
            if (!m.has(r.grupo)) m.set(r.grupo, { a: 0, b: 0 }); m.get(r.grupo)[k] += sinal * num(r.valor);
        };
        base.itensGrupo.forEach((r) => add(r, 1)); base.devGrupo.forEach((r) => add(r, -1));
        return topComOutros(m, 8).map((l) => ({ grupo: l.k, atual: l.atual, anterior: l.anterior, diferenca: round2(l.atual - l.anterior) }));
    });

    // ── motivos (últimos 30 dias, registros sem pedido) ──
    out.motivos = bloco('motivos', () => {
        const de = somaDiasISO(hoje, -29);
        const cont = new Map(); const acoes = new Map(); let total = 0;
        for (const a of base.atend) {
            const dia = diaSP(a.criadoEm);
            if (dia < de || dia > hoje || a.pedidoId || a.tipo === 'FINANCEIRO' || (vf && a.idVendedor !== vf)) continue;
            total++;
            const mot = classificarMotivo(a.observacao); cont.set(mot, (cont.get(mot) || 0) + 1);
            if (a.acaoLabel) acoes.set(a.acaoLabel, (acoes.get(a.acaoLabel) || 0) + 1);
        }
        const itens = [...cont.entries()].filter(([k]) => k !== 'Sem motivo claro').map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd);
        itens.push({ motivo: 'Sem motivo claro', qtd: cont.get('Sem motivo claro') || 0, semMotivo: true });
        return { janela: { de, ate: hoje }, totalRegistros: total, aproximado: true,
            aviso: 'Lido das anotações dos vendedores por palavra: é aproximado enquanto o motivo for texto livre.',
            itens, porAcao: [...acoes.entries()].map(([label, qtd]) => ({ label, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 8) };
    });

    // ── decisões ──
    out.decisoes = bloco('decisoes', () => {
        const dec = [];
        const t20 = ctx.top20?.itens?.filter((i) => i.status === 'FALTANDO') || [];
        dec.push({ tipo: 'GRANDE_FALTOU', titulo: 'Cliente grande com pedido faltando', qtd: t20.length, total: t20.length,
            itens: t20.slice(0, MAX_LISTA).map((i) => ({ clienteId: i.clienteId, nome: i.nome, detalhe: `${pl(i.diasSemComprar, 'dia')} sem pedir e costuma pedir a cada ${pl(Math.round(i.ritmoDias), 'dia')}` })) });
        // parece o mesmo cliente
        const sug = [];
        if (!vf) {
            const ignorados = new Set(); base.vinculos.filter((v) => v.ignorado).forEach((v) => { ignorados.add(`${v.antigoId}|${v.atualId}`); ignorados.add(`${v.atualId}|${v.antigoId}`); });
            const porCad = new Map();
            for (const p of base.pedidos) { if (p.dia > hoje) continue; const x = porCad.get(p.cliente_id) || { first: p.dia, last: p.dia, v: 0 }; if (p.dia < x.first) x.first = p.dia; if (p.dia > x.last) x.last = p.dia; if (p.dia >= somaDiasISO(hoje, -89)) x.v += num(p.valor); porCad.set(p.cliente_id, x); }
            const chaves = new Map();
            const push = (k, id, tipo) => { if (!k) return; const kk = `${tipo}:${k}`; if (!chaves.has(kk)) chaves.set(kk, new Set()); chaves.get(kk).add(id); };
            for (const c of base.clientes) {
                if (!porCad.has(c.UUID)) continue;
                push(chaveCelular(c.Telefone_Celular), c.UUID, 'cel');
                const cep = digitos(c.End_CEP), lg = semAcento(c.End_Logradouro).replace(/\s+/g, ' ').trim(), nr = semAcento(c.End_Numero).trim();
                if (cep.length === 8 && lg && nr) push(`${lg}|${nr}|${cep}`, c.UUID, 'end');
            }
            const pares = new Map();
            for (const [kk, set] of chaves) {
                if (set.size < 2 || set.size > 4) continue;
                const ids = [...set];
                for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
                    let a = ids[i], b = ids[j];
                    if (canon(a) === canon(b) || ignorados.has(`${a}|${b}`)) continue;
                    if (porCad.get(a).last > porCad.get(b).last) [a, b] = [b, a];
                    if (porCad.get(b).first < somaDiasISO(porCad.get(a).last, -14)) continue;
                    const key = `${a}|${b}`; const p = pares.get(key) || { a, b, motivos: new Set() };
                    p.motivos.add(kk.startsWith('cel') ? 'mesmo celular' : 'mesmo endereço'); pares.set(key, p);
                }
            }
            for (const p of pares.values()) {
                const A = cliPorId.get(p.a), B = cliPorId.get(p.b);
                sug.push({ sugestaoId: `${p.a}:${p.b}`, antigoId: p.a, antigoNome: A.NomeFantasia || A.Nome, atualId: p.b, atualNome: B.NomeFantasia || B.Nome,
                    motivo: [...p.motivos].join(' e '), antigoUltimoPedido: porCad.get(p.a).last, atualPrimeiroPedido: porCad.get(p.b).first,
                    reais90d: round2(porCad.get(p.a).v + porCad.get(p.b).v) });
            }
            sug.sort((x, y) => y.reais90d - x.reais90d);
        }
        dec.push({ tipo: 'MESMO_CLIENTE', titulo: 'Parece o mesmo cliente', qtd: sug.length, total: sug.length, itens: sug.slice(0, MAX_LISTA) });
        const semV = vf ? [] : [...ents.values()].filter((e) => e.cad.Ativo && !e.fora && !e.vendedorId);
        semV.sort((a, b) => b.validos.length - a.validos.length || a.nome.localeCompare(b.nome));
        // "Sem vendedor" é um backlog (centenas): no cabeçalho conta no máximo 5 (quem já pediu primeiro).
        const semVItens = semV.slice(0, 5).map((e) => ({ clienteId: e.id, nome: e.nome, pedidosNoApp: e.validos.length }));
        ctx.semVendedor = { total: semV.length, hoje: semVItens };
        dec.push({ tipo: 'SEM_VENDEDOR', titulo: 'Clientes sem vendedor', qtd: semVItens.length, total: semV.length, itens: semVItens });
        const ina = itensPorBucket.inativar.sort((a, b) => b.diasSem - a.diasSem);
        dec.push({ tipo: 'INATIVAR', titulo: 'Para inativar', qtd: ina.length, total: ina.length,
            itens: ina.slice(0, MAX_LISTA).map((e) => ({ clienteId: e.id, nome: e.nome, diasSemComprar: e.diasSem, motivo: `Mais de ${DIAS_INATIVAR} dias sem comprar`, avisos: e.avisos || [] })) });
        for (const d of dec) if (d.tipo !== 'MESMO_CLIENTE') for (const i of d.itens) i.link = `/clientes/${i.clienteId}`;
        return dec;
    });
    out.semVendedor = ctx.semVendedor || { total: 0, hoje: [] };
    out.decisoesPendentes = (out.decisoes || []).reduce((s, d) => s + d.qtd, 0);
    out.resultadoDecisoes = { aprovados: 0, responderam: 0, voltaram: 0, reais: 0 };

    // ── movimento da carteira (herdado da Recorrência) ──
    out.movimento = bloco('movimento', () => ({
        semCompra90d: universoCarteira.filter((e) => e.diasSem != null && e.diasSem > 90 && e.cad.Ativo).length,
        primeiraCompraSemRecompra: universoCarteira.filter((e) => e.diasDistintos.length === 1 && e.diasSem >= 10 && e.diasSem <= 90).length,
        totalAtivos: universoCarteira.length
    }));
    out.valorEmRiscoMes = bloco('valorEmRisco', () => round2([...linhasVend.values()].reduce((s, l) => s + l.valorEmRiscoMes, 0)));

    // ── resumo do topo (template, sem IA) ──
    out.resumo = bloco('resumo', () => {
        const n = out.numeros; const frases = [];
        const rot = periodoTipo === 'mes' ? `${nomeMes(hoje.slice(0, 7))} até o dia ${Number(hoje.slice(8, 10))}` : `a semana de ${ddmm(win.atual.de)} a ${ddmm(hoje)}`;
        const emRot = periodoTipo === 'mes' ? `Em ${rot}` : `Na ${rot.slice(2)}`;
        const antes = periodoTipo === 'mes' ? `de ${nomeMes(win.anterior.de.slice(0, 7))} no mesmo período` : 'da semana anterior no mesmo período';
        if (n) {
            const v = n.pedidosReais.variacaoPct;
            const cc = n.clientesCompraram.atual;
            frases.push(`${emRot} as vendas somam ${brl(n.pedidosReais.atual)}${v != null ? `, ${Math.abs(Math.round(v))}% ${v >= 0 ? 'acima' : 'abaixo'} ${antes} (${brl(n.pedidosReais.anterior)})` : ''}, com ${cc} ${cc === 1 ? 'cliente comprando' : 'clientes comprando'} (contra ${n.clientesCompraram.anterior}).`);
            const nv = n.novos.atual, vo = n.voltaram.atual, pa = n.pararam.atual;
            frases.push(`${nv === 1 ? 'Entrou 1 cliente novo' : `Entraram ${nv} clientes novos`}, ${vo === 1 ? '1 voltou' : `${vo} voltaram`} depois de mais de um mês e ${pa === 1 ? '1 passou' : `${pa} passaram`} a contar como ${pa === 1 ? 'parado' : 'parados'}.`);
        }
        const lv = [...linhasVend.values()];
        const parados = lv.reduce((s, l) => s + l.paradoAna + l.paradoVisita, 0), atraso = lv.reduce((s, l) => s + l.atrasoLeve, 0);
        let f3 = `Hoje ${parados === 1 ? 'há 1 cliente parado' : `há ${parados} clientes parados`} e ${atraso} em atraso leve`;
        if (ctx.top20) f3 += ctx.top20.faltando ? `; dos 20 maiores, ${ctx.top20.faltando === 1 ? '1 está' : `${ctx.top20.faltando} estão`} com pedido faltando` : '; nenhum dos 20 maiores está com pedido faltando';
        frases.push(`${f3}.`);
        if (out.projecao) frases.push(out.projecao.frase);
        const ant = periodoTipo === 'mes' ? ctx.b.reais : ctx.b.reais;
        return { frases, rotulo: rot, parcial: n ? `${rot}: ${brl(n.pedidosReais.atual)}, contra ${brl(ant)} no mesmo período anterior.` : null,
            projecao: out.projecao ? { valorProjetado: out.projecao.fechaNoRitmo, meta: out.projecao.meta, pctMeta: out.projecao.pctMeta } : null };
    });

    out.atalhos = { vendas: 'Vendas & Pedidos', atendimentos: 'Atendimentos' };
    out.geradoEm = base.geradoEm;
    return out;
}

async function obterPainel({ periodo = 'semana', vendedorId = 'todos', fresh = false } = {}) {
    const per = periodo === 'mes' ? 'mes' : 'semana';
    const entrada = await obterBase(fresh);
    const vid = vendedorId || 'todos';
    if (vid !== 'todos' && vid !== 'sem-vendedor' && !entrada.base.vendedores.some((v) => v.id === vid)) throw erro(400, 'Vendedor inválido.');
    const chave = `${per}|${vendedorId || 'todos'}`;
    if (!entrada.memo.has(chave)) entrada.memo.set(chave, calcular(entrada.base, per, vendedorId));
    const r = entrada.memo.get(chave);
    return { ...r, cacheIdadeSegundos: Math.round((Date.now() - entrada.ts) / 1000) };
}

// ───────────────────────── "Já sei" (escritas) ─────────────────────────

const erro = (status, msg) => Object.assign(new Error(msg), { status });
const existe = async (id) => !!(id && await prisma.cliente.findUnique({ where: { UUID: id }, select: { UUID: true } }));

async function resolverAtual(id) {
    let x = id;
    for (let i = 0; i < 5; i++) {
        const v = await prisma.clienteMesmoQue.findUnique({ where: { antigoId: x } });
        if (!v || v.ignorado) break;
        x = v.atualId;
    }
    return x;
}

async function criarVinculo({ antigoId, atualId, origem, usuarioId }) {
    if (!antigoId || !atualId) throw erro(400, 'Informe antigoId e atualId.');
    if (antigoId === atualId) throw erro(400, 'Os dois cadastros são o mesmo.');
    if (!(await existe(antigoId)) || !(await existe(atualId))) throw erro(404, 'Cadastro não encontrado.');
    const final = await resolverAtual(atualId);
    if (final === antigoId) throw erro(400, 'Esse vínculo criaria um ciclo (o outro cadastro já aponta para este).');
    const org = origem === 'SUGESTAO' ? 'SUGESTAO' : 'MANUAL';
    const atual = await prisma.clienteMesmoQue.findUnique({ where: { antigoId } });
    if (atual && !atual.ignorado) {
        if (atual.atualId === final) return { ok: true, id: atual.id, duplicado: true };
        throw erro(409, 'Este cadastro já está ligado a outro cliente. Desfaça o vínculo antes.');
    }
    let reg;
    try {
        reg = atual
            ? await prisma.clienteMesmoQue.update({ where: { antigoId }, data: { atualId: final, origem: org, ignorado: false, criadoPorId: usuarioId || null } })
            : await prisma.clienteMesmoQue.create({ data: { antigoId, atualId: final, origem: org, criadoPorId: usuarioId || null } });
    } catch (e) {
        if (e.code === 'P2002') { const r = await prisma.clienteMesmoQue.findUnique({ where: { antigoId } }); return { ok: true, id: r?.id, duplicado: true }; }
        throw e;
    }
    invalidar();
    return { ok: true, id: reg.id, atualFinalId: final };
}

async function desfazerVinculo(id) {
    const r = await prisma.clienteMesmoQue.findUnique({ where: { id } });
    if (!r) throw erro(404, 'Vínculo não encontrado.');
    await prisma.clienteMesmoQue.delete({ where: { id } });
    invalidar();
    return { ok: true, antigoId: r.antigoId, atualId: r.atualId, ignorado: r.ignorado };
}

async function dispensarSugestao({ antigoId, atualId, usuarioId }) {
    if (!antigoId || !atualId || antigoId === atualId) throw erro(400, 'Informe antigoId e atualId diferentes.');
    if (!(await existe(antigoId)) || !(await existe(atualId))) throw erro(404, 'Cadastro não encontrado.');
    const atual = await prisma.clienteMesmoQue.findUnique({ where: { antigoId } });
    if (atual && !atual.ignorado) throw erro(409, 'Este cadastro já está ligado a outro cliente; desfaça antes.');
    const reg = atual
        ? await prisma.clienteMesmoQue.update({ where: { antigoId }, data: { atualId, ignorado: true, origem: 'SUGESTAO', criadoPorId: usuarioId || null } })
        : await prisma.clienteMesmoQue.create({ data: { antigoId, atualId, ignorado: true, origem: 'SUGESTAO', criadoPorId: usuarioId || null } });
    invalidar();
    return { ok: true, id: reg.id };
}

async function silenciar({ clienteId, dias, usuarioId }) {
    const d = Number(dias);
    if (![30, 90].includes(d)) throw erro(400, 'dias deve ser 30 ou 90.');
    if (!(await existe(clienteId))) throw erro(404, 'Cliente não encontrado.');
    const ate = somaDiasISO(isoNowTZ(), d);
    const silenciarAte = fimDiaSP(ate);
    await prisma.clienteSilencio.upsert({
        where: { clienteUuid: clienteId },
        create: { clienteUuid: clienteId, silenciarAte, criadoPorId: usuarioId || null },
        update: { silenciarAte, criadoPorId: usuarioId || null }
    });
    invalidar();
    return { ok: true, ate };
}

async function desfazerSilencio(clienteId) {
    const r = await prisma.clienteSilencio.deleteMany({ where: { clienteUuid: clienteId } });
    invalidar();
    return { ok: true, removidos: r.count };
}

/** Busca de cadastros para o "mesmo cliente": nome, fantasia ou documento; NÃO filtra Ativo. */
async function buscarClientes(q) {
    const termo = String(q || '').trim();
    if (termo.length < 3) throw erro(400, 'Digite ao menos 3 caracteres.');
    const dig = termo.replace(/\D/g, '');
    const OR = [
        { Nome: { contains: termo, mode: 'insensitive' } },
        { NomeFantasia: { contains: termo, mode: 'insensitive' } }
    ];
    if (dig.length >= 3) OR.push({ Documento: { contains: dig } });
    const rows = await prisma.cliente.findMany({
        where: { OR }, take: 20, orderBy: [{ Ativo: 'desc' }, { Nome: 'asc' }],
        select: { UUID: true, Nome: true, NomeFantasia: true, End_Cidade: true, Ativo: true }
    });
    return { data: rows.map((c) => ({ id: c.UUID, nome: c.Nome, fantasia: c.NomeFantasia || null, cidade: c.End_Cidade || null, ativo: !!c.Ativo })) };
}

async function auditar(acao, entidadeId, detalhes, user) {
    try {
        await prisma.auditLog.create({ data: { acao, entidade: 'CarteiraJaSei', entidadeId: String(entidadeId || '-'), detalhes: JSON.stringify(detalhes), usuarioId: user?.id || '-', usuarioNome: user?.nome || user?.login || '-' } });
    } catch (e) { console.error('[Carteira] falha ao gravar AuditLog (operação já efetivada):', e.message); }
}

module.exports = {
    obterPainel, invalidar,
    buscarClientes, criarVinculo, desfazerVinculo, dispensarSugestao, silenciar, desfazerSilencio, auditar,
    // puras (testes)
    periodos, calcularRitmo, classificar, classificarMotivo,
    _teste: { carregarBase, calcular, anotouFechou }
};
