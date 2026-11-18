// Separação de Carga — contas PURAS (sem React, sem rede). Mesma lógica do mock aprovado
// (docs/propostas/proposta-separacao-carga.html): conta, classe, ordenados, proximo.
//
// Formato dos dados (contrato: docs/separacao-carga/PLANO.md, seção 2):
//   carga  = { pedidos:[{id, etiqueta, cliente, cidade, ordemCarga, itens:[{produtoId, nome, unidade, quantidade}]}],
//              produtos:[{produtoId, nome, unidade, quantidadePorCaixa, total}] }
//   estado = { ordem:{regra, manual:[], c}, linhas:{ [chave]:{q,t,m,c,por} }, pedidos:{ [pedidoId]:{b,c} }, conclusao }
//   chave  = "c:<produtoId>" (carga inteira)  |  "p:<pedidoId>:<produtoId>" (por pedido)

export const MOTIVO_DEPOIS = 'VEM_DEPOIS';
export const MOTIVO_NAO_TEM = 'NAO_TEM';

export const chaveCarga = (produtoId) => `c:${produtoId}`;
export const chavePedido = (pedidoId, produtoId) => `p:${pedidoId}:${produtoId}`;

export const estadoVazio = () => ({ ordem: { regra: 'CARGA', manual: [], c: null }, linhas: {}, pedidos: {}, conclusao: null });

/** Índices para consultar rápido a quantidade pedida de cada chave. */
export function indexarCarga(carga) {
    const pedir = new Map();
    const nomes = new Map();      // chave -> nome do produto
    const unidades = new Map();   // chave -> unidade
    const porPedido = new Map();  // pedidoId -> [chaves]
    const pedidos = new Map();
    (carga?.produtos || []).forEach((p) => {
        const k = chaveCarga(p.produtoId);
        pedir.set(k, Number(p.total) || 0);
        nomes.set(k, p.nome);
        unidades.set(k, p.unidade);
    });
    (carga?.pedidos || []).forEach((ped) => {
        pedidos.set(ped.id, ped);
        const ks = [];
        (ped.itens || []).forEach((i) => {
            const k = chavePedido(ped.id, i.produtoId);
            pedir.set(k, Number(i.quantidade) || 0);
            nomes.set(k, i.nome);
            unidades.set(k, i.unidade);
            ks.push(k);
        });
        porPedido.set(ped.id, ks);
    });
    return { pedir, nomes, unidades, porPedido, pedidos };
}

export const chavesDaCarga = (carga) => (carga?.produtos || []).map((p) => chaveCarga(p.produtoId));

export const celula = (estado, k) => estado?.linhas?.[k] || { q: 0, t: false, m: null, c: null, por: null };

const arred = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Quanto já separou, limitado ao pedido (a carga pode ter diminuído). */
export function separado(estado, idx, k) {
    const c = celula(estado, k);
    return Math.min(arred(c.q), idx.pedir.get(k) ?? 0);
}

/** '' (não tocada) | 'ok' | 'par' (falta, vem depois / sem motivo) | 'nao' (falta, não tem) */
export function classe(estado, idx, k) {
    const c = celula(estado, k);
    const q = idx.pedir.get(k) ?? 0;
    if (arred(c.q) >= q && c.t && q > 0) return 'ok';
    if (!c.t) return '';
    return c.m === MOTIVO_NAO_TEM ? 'nao' : 'par';
}

/** Resumo de um conjunto de chaves: quantas prontas, quanto falta (só nas linhas tocadas), %. */
export function conta(estado, idx, ks) {
    const ok = ks.filter((k) => classe(estado, idx, k) === 'ok').length;
    let fal = 0;
    ks.forEach((k) => {
        const c = celula(estado, k);
        if (c.t && classe(estado, idx, k) !== 'ok') fal += (idx.pedir.get(k) ?? 0) - separado(estado, idx, k);
    });
    return { ok, fal: arred(fal), total: ks.length, pct: ks.length ? Math.round((ok / ks.length) * 100) : 0 };
}

export const pedidoPronto = (estado, idx, ped) => {
    const ks = idx.porPedido.get(ped.id) || [];
    return ks.length > 0 && ks.every((k) => classe(estado, idx, k) === 'ok');
};

/** Selo do pedido na lista: { cor:'g'|'a'|'b'|'c', texto } */
export function statusPedido(estado, idx, ped) {
    const ks = idx.porPedido.get(ped.id) || [];
    const ok = ks.filter((k) => classe(estado, idx, k) === 'ok').length;
    const toc = ks.filter((k) => celula(estado, k).t).length;
    const b = estado?.pedidos?.[ped.id]?.b || 0;
    if (ks.length && ok === ks.length) return { cor: 'g', texto: `Separado${b ? ` · ${b} bolsa${b > 1 ? 's' : ''}` : ''}` };
    if (ks.length && toc === ks.length) return { cor: 'a', texto: 'Com falta' };
    if (toc) return { cor: 'b', texto: 'Separando' };
    return { cor: 'c', texto: 'A separar' };
}

const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR');

/** Ordem dos pedidos conforme a regra guardada NA CARGA (servidor). */
export function ordenarPedidos(carga, ordem) {
    const lista = [...(carga?.pedidos || [])].sort((a, b) => (a.ordemCarga ?? 0) - (b.ordemCarga ?? 0));
    const regra = ordem?.regra || 'CARGA';
    if (regra === 'CIDADE') {
        return lista.map((p, i) => ({ p, i })).sort((a, b) => cmp(a.p.cidade, b.p.cidade) || a.i - b.i).map((x) => x.p);
    }
    if (regra === 'MANUAL') {
        const man = (ordem?.manual || []).map((id) => lista.find((p) => p.id === id)).filter(Boolean);
        const usados = new Set(man.map((p) => p.id));
        return man.concat(lista.filter((p) => !usados.has(p.id)));
    }
    return lista;
}

/** Próximo pedido depois do atual, na ordem, pulando os prontos (dá a volta). */
export function proximoPedido(estado, idx, ordenados, atualId) {
    const n = ordenados.length;
    const i0 = ordenados.findIndex((p) => p.id === atualId);
    for (let d = 1; d < n; d++) {
        const x = ordenados[(i0 + d) % n];
        if (!pedidoPronto(estado, idx, x)) return x;
    }
    return null;
}

/** Linhas tocadas que ainda têm falta — alimenta "Ficou faltando". */
export function faltas(estado, idx, ks) {
    return ks
        .filter((k) => celula(estado, k).t && classe(estado, idx, k) !== 'ok')
        .map((k) => ({
            chave: k,
            nome: idx.nomes.get(k),
            unidade: idx.unidades.get(k),
            falta: arred((idx.pedir.get(k) ?? 0) - separado(estado, idx, k)),
            motivo: celula(estado, k).m || null,
        }));
}

/** Toda chave de linha que existe na carga (carga inteira + por pedido). */
export const todasChaves = (idx) => [...idx.pedir.keys()];

/** Linhas que o usuário ainda não tocou (para o aviso ao concluir). */
export function naoTocadas(estado, idx, ks) {
    return ks.filter((k) => !celula(estado, k).t).length;
}

/**
 * Junta o estado local com o do servidor, linha a linha: vence o carimbo `c` MAIOR.
 * `sujo` = chaves que ainda não foram enviadas: se o toque local é mais novo, o local fica.
 * Empate (c igual) → servidor (já normalizado por ele).
 */
export function mesclarEstado(local, servidor) {
    const srv = servidor || estadoVazio();
    const loc = local || estadoVazio();
    const maior = (a, b) => {
        // true quando `a` (servidor) deve valer
        if (!b) return true;
        if (!a) return false;
        return String(a) >= String(b);
    };
    const linhas = { ...loc.linhas };
    Object.entries(srv.linhas || {}).forEach(([k, s]) => {
        const l = linhas[k];
        if (!l || maior(s.c, l.c)) linhas[k] = s;
    });
    const pedidos = { ...loc.pedidos };
    Object.entries(srv.pedidos || {}).forEach(([k, s]) => {
        const l = pedidos[k];
        if (!l || maior(s.c, l.c)) pedidos[k] = s;
    });
    const ordem = (!loc.ordem?.c || maior(srv.ordem?.c, loc.ordem?.c)) && srv.ordem?.c ? srv.ordem : loc.ordem;
    const conclusao = srv.conclusao || loc.conclusao || null;
    return { ordem: ordem || estadoVazio().ordem, linhas, pedidos, conclusao };
}

/** Diferença entre a carga baixada antes e a nova (aviso "A carga mudou"). */
export function diffCarga(antiga, nova) {
    const pA = new Map((antiga?.pedidos || []).map((p) => [p.id, p]));
    const pN = new Map((nova?.pedidos || []).map((p) => [p.id, p]));
    const entraram = (nova?.pedidos || []).filter((p) => !pA.has(p.id));
    const sairam = (antiga?.pedidos || []).filter((p) => !pN.has(p.id));
    const prodA = new Map((antiga?.produtos || []).map((p) => [p.produtoId, p]));
    const alterados = [];
    (nova?.produtos || []).forEach((p) => {
        const a = prodA.get(p.produtoId);
        if (!a) alterados.push({ nome: p.nome, de: 0, para: Number(p.total) || 0 });
        else if (Number(a.total) !== Number(p.total)) alterados.push({ nome: p.nome, de: Number(a.total) || 0, para: Number(p.total) || 0 });
    });
    const novosIds = new Set((nova?.produtos || []).map((p) => p.produtoId));
    (antiga?.produtos || []).forEach((p) => {
        if (!novosIds.has(p.produtoId)) alterados.push({ nome: p.nome, de: Number(p.total) || 0, para: 0 });
    });
    // por pedido: o total do produto pode não mudar (pedido A -2, pedido B +2) e ainda assim o que cada cliente leva mudou
    const porPedido = [];
    (nova?.pedidos || []).forEach((pn) => {
        const pa = pA.get(pn.id);
        if (!pa) return;
        const qa = new Map((pa.itens || []).map((i) => [i.produtoId, i]));
        const qn = new Map((pn.itens || []).map((i) => [i.produtoId, i]));
        const itens = [];
        qn.forEach((i, id) => {
            const a = qa.get(id);
            const de = a ? Number(a.quantidade) || 0 : 0;
            const para = Number(i.quantidade) || 0;
            if (de !== para) itens.push({ nome: i.nome, de, para });
        });
        qa.forEach((i, id) => { if (!qn.has(id)) itens.push({ nome: i.nome, de: Number(i.quantidade) || 0, para: 0 }); });
        if (itens.length) porPedido.push({ id: pn.id, cliente: pn.cliente, etiqueta: pn.etiqueta, itens });
    });
    return { entraram, sairam, alterados, porPedido, mudou: !!(entraram.length || sairam.length || alterados.length || porPedido.length) };
}

export const fmtQtd = (n) => {
    const v = Number(n);
    if (!isFinite(v)) return '0';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
};

/** "2 cx fechadas + 4 pct" — só na carga inteira, quando há quantidade por caixa. */
export function textoCaixas(q, porCaixa) {
    const pc = Number(porCaixa) || 0;
    const t = Number(q) || 0;
    if (pc <= 0 || t < pc) return '';
    const cx = Math.floor(t / pc);
    const resto = arred(t - cx * pc);
    return `${cx} cx fechada${cx > 1 ? 's' : ''}${resto ? ` + ${fmtQtd(resto)} pct` : ''}`;
}
