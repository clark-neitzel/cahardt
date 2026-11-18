// Separação de Carga (câmara fria) — regra toda aqui; a rota é fina.
// Plano: docs/separacao-carga/PLANO.md (seções 1 e 2). Só LÊ Embarque/Pedido; grava apenas nas 4 tabelas separacao_carga*.
// Sincronização sem $transaction: cada comando é atômico (createMany skipDuplicates + updateMany com carimbo menor),
// o que torna o envio idempotente e imune a corrida entre dois aparelhos.
const crypto = require('crypto');
const prisma = require('../config/database');
const { getDataReferencia } = require('../utils/dataReferenciaBrasilia');

const MAX_BOLSAS = 20;
const MAX_OPS = 300;
const MOTIVOS = ['VEM_DEPOIS', 'NAO_TEM'];
const REGRAS = ['CARGA', 'CIDADE', 'MANUAL'];
const MODOS = ['CARGA', 'PEDIDO'];
const REQ_ID = /^[A-Za-z0-9-]{8,80}$/;
const limpaLog = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').slice(0, 60);

class ErroSeparacao extends Error {
    constructor(status, codigo, mensagem) { super(mensagem); this.status = status; this.codigo = codigo; }
}

const num = (d) => Number(d ?? 0);
const arred3 = (n) => Math.round(n * 1000) / 1000;
const iso = (d) => (d ? new Date(d).toISOString() : null);

function etiquetaDe(p) {
    const n = p.numero ?? '';
    return p.bonificacao ? `BN#${n}` : p.especial ? `ZZ#${n}` : `#${n}`;
}

// ---------- cargas disponíveis ----------

async function listarCargas() {
    const ontem = getDataReferencia(new Date(Date.now() - 24 * 3600 * 1000));
    const inicio = new Date(`${ontem}T00:00:00.000Z`);
    const embarques = await prisma.embarque.findMany({
        where: { dataSaida: { gte: inicio }, conferenciaConcluidaEm: null },
        orderBy: [{ dataSaida: 'asc' }, { numero: 'asc' }],
        take: 40,
        select: {
            id: true, numero: true, dataSaida: true, versao: true,
            responsavel: { select: { nome: true } },
            pedidos: { where: { cancelado: false, devolucaoFinalizada: false }, select: { id: true } },
        },
    });
    const ids = embarques.map((e) => e.id);
    const seps = ids.length ? await prisma.separacaoCarga.findMany({
        where: { embarqueId: { in: ids } },
        select: {
            embarqueId: true,
            conclusoes: { orderBy: { concluidaEm: 'desc' }, take: 1, select: { concluidaEm: true, porNome: true } },
        },
    }) : [];
    const porEmb = new Map(seps.map((s) => [s.embarqueId, s]));
    return {
        agora: new Date().toISOString(),
        cargas: embarques.map((e) => {
            const s = porEmb.get(e.id);
            const c = s?.conclusoes?.[0];
            return {
                id: e.id, numero: e.numero, dataSaida: iso(e.dataSaida).slice(0, 10),
                motorista: e.responsavel?.nome || null, versao: e.versao, totalPedidos: e.pedidos.length,
                separacao: { iniciada: !!s, concluidaEm: c ? iso(c.concluidaEm) : null, concluidaPorNome: c?.porNome || null },
            };
        }),
    };
}

// ---------- carga (pedidos/itens/produtos/assinatura) ----------

async function montarCarga(embarqueId) {
    const emb = await prisma.embarque.findUnique({
        where: { id: embarqueId },
        select: {
            id: true, numero: true, dataSaida: true, versao: true,
            responsavel: { select: { nome: true } },
            amostras: { select: { id: true, status: true } },
            pedidos: {
                where: { cancelado: false, devolucaoFinalizada: false },
                orderBy: { cliente: { NomeFantasia: 'asc' } },
                select: {
                    id: true, numero: true, especial: true, bonificacao: true,
                    cliente: { select: { NomeFantasia: true, Nome: true, End_Cidade: true } },
                    itens: { select: { quantidade: true, produto: { select: { id: true, nome: true, unidade: true, quantidadePorCaixa: true } } } },
                },
            },
        },
    });
    if (!emb) return null;

    const prodMap = new Map();
    const pedidos = emb.pedidos.map((p, i) => {
        const soma = new Map();
        for (const it of p.itens) {
            const pr = it.produto;
            if (!pr) continue;
            const q = num(it.quantidade);
            const atual = soma.get(pr.id);
            if (atual) atual.quantidade = arred3(atual.quantidade + q);
            else soma.set(pr.id, { produtoId: pr.id, nome: pr.nome, unidade: pr.unidade, quantidade: arred3(q) });
            const pm = prodMap.get(pr.id);
            if (pm) pm.total = arred3(pm.total + q);
            else prodMap.set(pr.id, { produtoId: pr.id, nome: pr.nome, unidade: pr.unidade, quantidadePorCaixa: pr.quantidadePorCaixa ?? null, total: arred3(q) });
        }
        const itens = [...soma.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return {
            id: p.id, numero: p.numero, etiqueta: etiquetaDe(p),
            especial: !!p.especial, bonificacao: !!p.bonificacao,
            cliente: p.cliente?.NomeFantasia || p.cliente?.Nome || '—',
            cidade: p.cliente?.End_Cidade || '', ordemCarga: i, itens,
        };
    });
    const produtos = [...prodMap.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const canonico = pedidos
        .map((p) => ({ pedidoId: p.id, itens: p.itens.map((i) => `${i.produtoId}:${i.quantidade.toFixed(3)}`).sort() }))
        .sort((a, b) => (a.pedidoId < b.pedidoId ? -1 : a.pedidoId > b.pedidoId ? 1 : 0));
    const assinatura = crypto.createHash('sha1').update(JSON.stringify(canonico)).digest('hex');

    return {
        id: emb.id, numero: emb.numero, dataSaida: iso(emb.dataSaida).slice(0, 10),
        motorista: emb.responsavel?.nome || null, versao: emb.versao, assinatura,
        pedidos, produtos,
        amostras: { total: emb.amostras.filter((a) => a.status !== 'CANCELADA').length },
    };
}

// ---------- estado ----------

async function lerEstado(embarqueId) {
    const sep = await prisma.separacaoCarga.findUnique({
        where: { embarqueId },
        include: {
            linhas: true,
            pedidos: true,
            conclusoes: { orderBy: { concluidaEm: 'desc' }, take: 1 },
        },
    });
    return estadoDe(sep);
}

function estadoDe(sep) {
    if (!sep) return { ordem: { regra: 'CARGA', manual: [], c: null }, linhas: {}, pedidos: {}, conclusao: null };
    const linhas = {};
    for (const l of sep.linhas) {
        linhas[l.chave] = { q: num(l.quantidadeSeparada), t: !!l.tocada, m: l.motivoFalta || null, c: iso(l.carimboEm), por: l.atualizadoPorNome || null };
    }
    const pedidos = {};
    for (const p of sep.pedidos) pedidos[p.pedidoId] = { b: p.bolsas, c: iso(p.bolsasEm) };
    const c = sep.conclusoes?.[0];
    return {
        ordem: { regra: sep.ordemRegra, manual: Array.isArray(sep.ordemManual) ? sep.ordemManual : [], c: iso(sep.ordemEm) },
        linhas, pedidos,
        conclusao: c ? { id: c.id, modo: c.modo, em: iso(c.concluidaEm), porNome: c.porNome || null, resumo: c.resumo } : null,
    };
}

// ---------- sincronizar ----------

function carimboValido(c, agora) {
    const d = new Date(c);
    if (!c || Number.isNaN(d.getTime())) return null;
    return d.getTime() > agora.getTime() + 5 * 60 * 1000 ? agora : d;
}

function validarCorpo(b) {
    if (!b || typeof b !== 'object') throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'Corpo inválido.');
    if (!/^[A-Za-z0-9-]{8,80}$/.test(String(b.loteId ?? ''))) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'loteId inválido (8 a 80 caracteres: letras, números e hífen).');
    if (!Array.isArray(b.ops)) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'ops deve ser uma lista.');
    if (b.ops.length > MAX_OPS) throw new ErroSeparacao(400, 'CORPO_INVALIDO', `No máximo ${MAX_OPS} operações por envio.`);
    const agora = new Date();
    for (const op of b.ops) {
        if (!op || typeof op !== 'object' || !['L', 'P', 'O', 'X'].includes(op.t)) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'Operação com tipo inválido.');
        if (!carimboValido(op.c, agora)) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'Operação com carimbo (c) inválido.');
        if (op.t === 'X') {   // valida ANTES de gravar qualquer coisa
            if (!REQ_ID.test(String(op.requisicaoId ?? ''))) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'requisicaoId da conclusão inválido.');
            if (op.modo != null && !MODOS.includes(op.modo)) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'modo da conclusão inválido (CARGA ou PEDIDO).');
        }
    }
}

async function garantirSeparacao(embarqueId, user) {
    const achada = await prisma.separacaoCarga.findUnique({ where: { embarqueId }, select: { id: true } });
    if (achada) return achada.id;
    try {
        const nova = await prisma.separacaoCarga.create({
            data: { embarqueId, criadoPorId: user?.id || null, criadoPorNome: user?.nome || user?.name || null },
            select: { id: true },
        });
        return nova.id;
    } catch (e) {
        if (e.code === 'P2002') {   // corrida entre dois aparelhos
            const r = await prisma.separacaoCarga.findUnique({ where: { embarqueId }, select: { id: true } });
            if (r) return r.id;
        }
        throw e;
    }
}

function montarResumo(modo, carga, linhasDb) {
    const porChave = new Map(linhasDb.map((l) => [l.chave, l]));
    const esperadas = [];   // { chave, produto, pedido, pedir }
    if (modo === 'CARGA') {
        for (const pr of carga.produtos) esperadas.push({ chave: `c:${pr.produtoId}`, produto: pr.nome, pedido: null, pedir: pr.total });
    } else {
        for (const p of carga.pedidos) for (const it of p.itens) esperadas.push({ chave: `p:${p.id}:${it.produtoId}`, produto: it.nome, pedido: `${p.etiqueta} — ${p.cliente}`, pedir: it.quantidade });
    }
    let completas = 0, comFalta = 0, naoTocadas = 0;
    const faltas = [];
    for (const e of esperadas) {
        const l = porChave.get(e.chave);
        const tocada = !!l?.tocada;
        const sep = l ? num(l.quantidadeSeparada) : 0;
        if (!tocada) { naoTocadas++; continue; }
        if (sep >= e.pedir) completas++;
        else {
            comFalta++;
            faltas.push({ chave: e.chave, produto: e.produto, pedido: e.pedido, pedir: e.pedir, separado: sep, falta: arred3(e.pedir - sep), motivo: l.motivoFalta || null });
        }
    }
    return { linhasTotal: esperadas.length, completas, comFalta, naoTocadas, faltas };
}

async function sincronizar({ embarqueId, user, loteId, aparelho, ops }) {
    const carga = await montarCarga(embarqueId);
    if (!carga) throw new ErroSeparacao(404, 'CARGA_NAO_ENCONTRADA', 'Carga não encontrada.');
    const agora = new Date();
    const nomeUser = user?.nome || user?.name || null;
    const userId = user?.id || null;
    const separacaoId = await garantirSeparacao(embarqueId, user);

    // o que vale hoje na carga
    const maxPorChave = new Map();
    for (const pr of carga.produtos) maxPorChave.set(`c:${pr.produtoId}`, { escopo: 'CARGA', pedidoId: null, produtoId: pr.produtoId, max: pr.total });
    const pedidosValidos = new Set();
    for (const p of carga.pedidos) {
        pedidosValidos.add(p.id);
        for (const it of p.itens) maxPorChave.set(`p:${p.id}:${it.produtoId}`, { escopo: 'PEDIDO', pedidoId: p.id, produtoId: it.produtoId, max: it.quantidade });
    }

    const ignoradas = [];
    let aplicadas = 0;

    // ---- 1) decide tudo em memória; só 1 leitura de linhas e 1 de pedidos ----
    const linhasOps = new Map();    // chave -> { op, c, info, dados }  (vence o maior carimbo; empate = o primeiro)
    const pedidosOps = new Map();   // pedidoId -> { c, dados, b }
    const perdedoras = [];          // { tipo, ref, venc }  — repetidas dentro do lote
    const opsO = [];
    const opsX = [];
    for (const op of ops) {
        const c = carimboValido(op.c, agora);
        if (op.t === 'L') {
            if (!/^[cp]:/.test(String(op.k ?? ''))) { ignoradas.push({ ref: op.k ?? null, motivo: 'CHAVE_INVALIDA' }); continue; }
            const info = maxPorChave.get(String(op.k));
            if (!info) { ignoradas.push({ ref: op.k, motivo: 'FORA_DA_CARGA' }); continue; }
            const tocada = op.tocada === true;
            const q = tocada ? Math.min(Math.max(arred3(Number(op.q) || 0), 0), info.max) : 0;
            let m = tocada && MOTIVOS.includes(op.m) ? op.m : null;
            if (q >= info.max) m = null;
            const cand = { ref: op.k, c, info, q, tocada, m };
            const prev = linhasOps.get(op.k);
            if (!prev) linhasOps.set(op.k, cand);
            else if (c > prev.c) { perdedoras.push({ tipo: 'L', ref: op.k, perd: prev }); linhasOps.set(op.k, cand); }
            else perdedoras.push({ tipo: 'L', ref: op.k, perd: cand });
        } else if (op.t === 'P') {
            const pid = String(op.p ?? '');
            if (!pid) { ignoradas.push({ ref: null, motivo: 'CHAVE_INVALIDA' }); continue; }
            if (!pedidosValidos.has(pid)) { ignoradas.push({ ref: pid, motivo: 'FORA_DA_CARGA' }); continue; }
            const b = Math.min(Math.max(Math.trunc(Number(op.b) || 0), 0), MAX_BOLSAS);
            const cand = { ref: pid, c, b };
            const prev = pedidosOps.get(pid);
            if (!prev) pedidosOps.set(pid, cand);
            else if (c > prev.c) { perdedoras.push({ tipo: 'P', ref: pid, perd: prev }); pedidosOps.set(pid, cand); }
            else perdedoras.push({ tipo: 'P', ref: pid, perd: cand });
        } else if (op.t === 'O') {
            opsO.push({ op, c });
        } else if (op.t === 'X') {
            opsX.push({ op, c });
        }
    }

    const [linhasExist, pedidosExist] = await Promise.all([
        linhasOps.size ? prisma.separacaoCargaLinha.findMany({
            where: { separacaoId, chave: { in: [...linhasOps.keys()] } },
            select: { chave: true, quantidadeSeparada: true, tocada: true, motivoFalta: true, carimboEm: true },
        }) : [],
        pedidosOps.size ? prisma.separacaoCargaPedido.findMany({
            where: { separacaoId, pedidoId: { in: [...pedidosOps.keys()] } },
            select: { pedidoId: true, bolsas: true, bolsasEm: true },
        }) : [],
    ]);
    const exLinha = new Map(linhasExist.map((l) => [l.chave, l]));
    const exPed = new Map(pedidosExist.map((p) => [p.pedidoId, p]));

    const mesmaLinha = (l, x) => !!l && num(l.quantidadeSeparada) === x.q && l.tocada === x.tocada && (l.motivoFalta || null) === x.m;
    const dadosDe = (x) => ({ quantidadeSeparada: x.q, tocada: x.tocada, motivoFalta: x.m, carimboEm: x.c, atualizadoPorId: userId, atualizadoPorNome: nomeUser });

    const novasLinhas = [];
    const atualizarLinhas = [];
    for (const x of linhasOps.values()) {
        const ex = exLinha.get(x.ref);
        if (!ex) novasLinhas.push(x);
        else if (ex.carimboEm && ex.carimboEm.getTime() < x.c.getTime()) atualizarLinhas.push(x);
        else ignoradas.push({ ref: x.ref, motivo: mesmaLinha(ex, x) ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    }
    const novosPed = [];
    const atualizarPed = [];
    for (const x of pedidosOps.values()) {
        const ex = exPed.get(x.ref);
        if (!ex) novosPed.push(x);
        else if (!ex.bolsasEm || ex.bolsasEm.getTime() < x.c.getTime()) atualizarPed.push(x);
        else ignoradas.push({ ref: x.ref, motivo: ex.bolsas === x.b ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    }

    // ---- 2) grava: 1 createMany por tabela + updateMany protegido pelo carimbo, em blocos paralelos ----
    const emBlocos = async (lista, fn, n = 10) => {
        for (let i = 0; i < lista.length; i += n) await Promise.all(lista.slice(i, i + n).map(fn));
    };
    // perdeu a corrida (outro aparelho gravou entre a leitura e a escrita) ou outro lote criou a chave antes: reavalia contra o banco
    const reavaliarLinha = async (x) => {
        const atual = await prisma.separacaoCargaLinha.findUnique({ where: { separacaoId_chave: { separacaoId, chave: x.ref } } });
        ignoradas.push({ ref: x.ref, motivo: mesmaLinha(atual, x) ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    };
    const reavaliarPed = async (x) => {
        const atual = await prisma.separacaoCargaPedido.findUnique({ where: { separacaoId_pedidoId: { separacaoId, pedidoId: x.ref } } });
        ignoradas.push({ ref: x.ref, motivo: atual && atual.bolsas === x.b ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    };

    if (novasLinhas.length) {
        const r = await prisma.separacaoCargaLinha.createMany({
            data: novasLinhas.map((x) => ({ separacaoId, chave: x.ref, escopo: x.info.escopo, pedidoId: x.info.pedidoId, produtoId: x.info.produtoId, ...dadosDe(x) })),
            skipDuplicates: true,
        });
        aplicadas += r.count;
        if (r.count < novasLinhas.length) {   // raro: outro aparelho criou algumas no meio — tenta atualizar com a regra do carimbo
            const existentes = await prisma.separacaoCargaLinha.findMany({
                where: { separacaoId, chave: { in: novasLinhas.map((x) => x.ref) } }, select: { chave: true, carimboEm: true, quantidadeSeparada: true, tocada: true, motivoFalta: true, atualizadoPorId: true },
            });
            // as que ESTE comando criou têm atualizadoPorId == userId e carimbo == o nosso; as demais foram de outro aparelho
            for (const x of novasLinhas) {
                const e = existentes.find((l) => l.chave === x.ref);
                if (e && e.carimboEm.getTime() === x.c.getTime() && mesmaLinha(e, x) && e.atualizadoPorId === userId) continue;
                atualizarLinhas.push(x);
            }
            // aplicadas: o que não criamos entra no fluxo de update abaixo (que conta o que aplicar)
        }
    }
    await emBlocos(atualizarLinhas, async (x) => {
        const r = await prisma.separacaoCargaLinha.updateMany({ where: { separacaoId, chave: x.ref, carimboEm: { lt: x.c } }, data: dadosDe(x) });
        if (r.count > 0) aplicadas++; else await reavaliarLinha(x);
    });

    if (novosPed.length) {
        const r = await prisma.separacaoCargaPedido.createMany({
            data: novosPed.map((x) => ({ separacaoId, pedidoId: x.ref, bolsas: x.b, bolsasEm: x.c, atualizadoPorNome: nomeUser })),
            skipDuplicates: true,
        });
        aplicadas += r.count;
        if (r.count < novosPed.length) {
            const existentes = await prisma.separacaoCargaPedido.findMany({
                where: { separacaoId, pedidoId: { in: novosPed.map((x) => x.ref) } }, select: { pedidoId: true, bolsas: true, bolsasEm: true, atualizadoPorNome: true },
            });
            for (const x of novosPed) {
                const e = existentes.find((p) => p.pedidoId === x.ref);
                if (e && e.bolsasEm && e.bolsasEm.getTime() === x.c.getTime() && e.bolsas === x.b && e.atualizadoPorNome === nomeUser) continue;
                atualizarPed.push(x);
            }
        }
    }
    await emBlocos(atualizarPed, async (x) => {
        const r = await prisma.separacaoCargaPedido.updateMany({
            where: { separacaoId, pedidoId: x.ref, OR: [{ bolsasEm: null }, { bolsasEm: { lt: x.c } }] },
            data: { bolsas: x.b, bolsasEm: x.c, atualizadoPorNome: nomeUser },
        });
        if (r.count > 0) aplicadas++; else await reavaliarPed(x);
    });

    // repetidas dentro do mesmo lote: perderam para o carimbo maior (ou empate) — mesmo motivo que o servidor daria
    for (const { tipo, ref, perd } of perdedoras) {
        const venc = tipo === 'L' ? linhasOps.get(ref) : pedidosOps.get(ref);
        const igual = tipo === 'L' ? (perd.q === venc.q && perd.tocada === venc.tocada && perd.m === venc.m) : perd.b === venc.b;
        ignoradas.push({ ref, motivo: igual ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    }

    // ordem: raras (1 por lote na prática); mantém a lógica sequencial
    opsO.sort((a, b) => a.c - b.c);
    for (const { op, c } of opsO) {
        const regra = REGRAS.includes(op.regra) ? op.regra : null;
        if (!regra) { ignoradas.push({ ref: 'ordem', motivo: 'CHAVE_INVALIDA' }); continue; }
        const manual = regra === 'MANUAL' && Array.isArray(op.manual)
            ? [...new Set(op.manual.map(String).filter((id) => pedidosValidos.has(id)))] : [];
        const atu = await prisma.separacaoCarga.updateMany({
            where: { id: separacaoId, OR: [{ ordemEm: null }, { ordemEm: { lt: c } }] },
            data: { ordemRegra: regra, ordemManual: manual, ordemEm: c },
        });
        if (atu.count > 0) { aplicadas++; continue; }
        const atual = await prisma.separacaoCarga.findUnique({ where: { id: separacaoId }, select: { ordemRegra: true, ordemManual: true } });
        const igual = atual && atual.ordemRegra === regra && JSON.stringify(atual.ordemManual || []) === JSON.stringify(manual);
        ignoradas.push({ ref: 'ordem', motivo: igual ? 'IGUAL' : 'MAIS_NOVO_NO_SERVIDOR' });
    }

    // concluir: depois das linhas; TODOS os X em ordem de carimbo, cada um idempotente pelo seu requisicaoId
    let conclusaoRegistrada = null;
    opsX.sort((a, b) => a.c - b.c);
    for (const { op: opX, c: cX } of opsX) {
        const reqId = String(opX.requisicaoId);
        const modo = MODOS.includes(opX.modo) ? opX.modo : 'CARGA';
        let reg = await prisma.separacaoCargaConclusao.findUnique({ where: { requisicaoId: reqId } });
        if (!reg) {
            const linhasDb = await prisma.separacaoCargaLinha.findMany({
                where: { separacaoId, escopo: modo }, select: { chave: true, tocada: true, quantidadeSeparada: true, motivoFalta: true },
            });
            const resumo = montarResumo(modo, carga, linhasDb);
            try {
                reg = await prisma.separacaoCargaConclusao.create({
                    data: { separacaoId, requisicaoId: reqId, modo, carimboEm: cX, porId: userId, porNome: nomeUser, versaoEmbarque: carga.versao, resumo },
                });
                aplicadas++;
            } catch (e) {
                if (e.code !== 'P2002') throw e;
                reg = await prisma.separacaoCargaConclusao.findUnique({ where: { requisicaoId: reqId } });
            }
        }
        if (reg.separacaoId !== separacaoId) throw new ErroSeparacao(400, 'CORPO_INVALIDO', 'requisicaoId já usado em outra carga.');
        conclusaoRegistrada = { id: reg.id, em: iso(reg.concluidaEm) };
    }

    console.log(`[SeparacaoCarga] carga ${carga.numero} lote ${loteId} (${limpaLog(aparelho)}) por ${nomeUser || userId}: ${ops.length} ops, ${aplicadas} aplicadas, ${ignoradas.length} ignoradas`);

    // versao/assinatura vêm da leitura do início do lote (1× montarCarga); se a carga mudar nesse intervalo de ms,
    // a próxima sincronização/baixada do aparelho pega a diferença.
    const estado = await lerEstado(embarqueId);
    return {
        ok: true, agora: new Date().toISOString(),
        versao: carga.versao, assinatura: carga.assinatura,
        aplicadas, ignoradas, conclusaoRegistrada, estado,
    };
}

module.exports = { listarCargas, montarCarga, lerEstado, sincronizar, validarCorpo, ErroSeparacao };
