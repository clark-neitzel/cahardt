// Contabilidade → Contas a Pagar → "Por categoria (DRE)" em árvore.
// Funções PURAS (sem React, sem rede): montam a árvore, os totais, as linhas de impressão e o CSV de 33 colunas.
// REGRA: todo total da tela sai da soma de `itens` em CENTAVOS INTEIROS — nunca de números do servidor.
// O `resumo` do servidor só serve de conferência (ver `conferirComServidor`).
import { formatarDoc } from '../../../utils/documento';

export const NIVEIS = [
    { v: 1, rot: 'Categoria' },
    { v: 2, rot: 'Fornecedor' },
    { v: 3, rot: 'Nota' },
    { v: 4, rot: 'Produto' },
];

export const GRUPO_FORA = 'Fora do resultado';
const SEM_GRUPO = 'Sem grupo';

export const cents = (v) => Math.round((Number(v) || 0) * 100);
const zero = () => ({ valor: 0, pago: 0, aberto: 0, desconto: 0, jurosMulta: 0 });
function somar(t, i) {
    t.valor += cents(i.valor); t.pago += cents(i.pago); t.aberto += cents(i.aberto);
    t.desconto += cents(i.desconto); t.jurosMulta += cents(i.jurosMulta);
}

// ── formatação (independente do comum.js para poder rodar fora do navegador) ──
export const reais = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = (parte, todo) => (todo ? `${((parte / todo) * 100).toFixed(1).replace('.', ',')}%` : '—');
const fmtDataIso = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const numBr = (v, casas = 4) => (v == null || v === '' || !Number.isFinite(Number(v)) ? '' : String(Number(Number(v).toFixed(casas))).replace('.', ','));
const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ROT_CLASSIF = { OPERACIONAL: 'Operacional', FINANCEIRO: 'Financeiro', FORA_DRE: 'Fora do resultado', A_CLASSIFICAR: 'A classificar' };
const ROT_NATUREZA = { VARIAVEL: 'Variável', FIXA: 'Fixa' };
export const rotClassif = (l) => {
    if (!l) return '';
    const c = ROT_CLASSIF[l.classificacao] || l.classificacao || '';
    const n = l.natureza && l.natureza !== 'A_DEFINIR' ? (ROT_NATUREZA[l.natureza] || l.natureza) : '';
    return n ? `${c} · ${n}` : c;
};

/** Texto de busca de uma linha (fornecedor, CNPJ, nota, descrição, produto, código, NCM). */
function textoBusca(it, c) {
    return semAcento([
        c?.fornecedor, c?.fornecedorDoc, c?.documento?.numero, c?.descricao, it.produto, it.codigoFornecedor, it.ncm,
    ].filter(Boolean).join(' '));
}

/** Itens visíveis depois da busca e do "ver só sem nota fiscal". */
export function filtrarItens(resp, { busca = '', soSemDoc = false } = {}) {
    const mapa = new Map((resp?.contas || []).map((c) => [c.id, c]));
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    return (resp?.itens || []).filter((it) => {
        const c = mapa.get(it.contaId);
        if (soSemDoc && c?.documento?.tipo !== 'SEM_DOC') return false;
        if (!termos.length) return true;
        const t = textoBusca(it, c);
        return termos.every((x) => t.includes(x));
    });
}

/** Totais gerais (centavos) a partir dos itens: total, dentro do resultado e fora do resultado. */
export function totais(resp, itens) {
    const fora = new Set((resp?.linhas || []).filter((l) => l.foraDre).map((l) => l.categoria));
    const geral = zero(); const dre = zero(); const foraT = zero();
    itens.forEach((i) => { somar(geral, i); somar(fora.has(i.categoria) ? foraT : dre, i); });
    return { geral, dre, fora: foraT };
}

/** Compara o que a tela somou com o `resumo` do servidor (centavos). Devolve true se bater. */
export function conferirComServidor(resp, geral) {
    const r = resp?.resumo;
    if (!r) return true;
    return cents(r.valorTotal) === geral.valor && cents(r.pagoTotal) === geral.pago && cents(r.abertoTotal) === geral.aberto;
}

/**
 * Árvore: grupo (DRE / Fora do resultado) → categoria → fornecedor → nota → linha (produto/ajuste/sem itens).
 * A ordem dos `itens` já vem final do servidor; aqui só se preserva a ordem de aparição.
 * Cada nó: { key, tipo, nome, tot, contas (nº de notas), filhos }.
 */
export function construirArvore(resp, itensVisiveis) {
    const mapaContas = new Map((resp?.contas || []).map((c) => [c.id, c]));
    const metaCat = new Map((resp?.linhas || []).map((l) => [l.categoria, l]));
    // em quantas categorias cada nota se divide (para o aviso "nota dividida"), olhando a resposta inteira
    const catsDaConta = new Map();
    (resp?.itens || []).forEach((i) => {
        if (!catsDaConta.has(i.contaId)) catsDaConta.set(i.contaId, new Set());
        catsDaConta.get(i.contaId).add(i.categoria);
    });

    const grupos = new Map();
    const pegar = (mapa, key, criar) => { if (!mapa.has(key)) mapa.set(key, criar()); return mapa.get(key); };
    itensVisiveis.forEach((it) => {
        const l = metaCat.get(it.categoria);
        const nomeGrupo = l?.foraDre ? GRUPO_FORA : (l?.grupoDre || SEM_GRUPO);
        const g = pegar(grupos, nomeGrupo, () => ({ key: `g:${nomeGrupo}`, tipo: 'grupo', nome: nomeGrupo, fora: nomeGrupo === GRUPO_FORA, tot: zero(), cats: new Map() }));
        const cat = pegar(g.cats, it.categoria, () => ({ key: `c:${it.categoria}`, tipo: 'cat', nome: it.categoria, meta: l || null, tot: zero(), forns: new Map(), contasSet: new Set() }));
        const c = mapaContas.get(it.contaId) || {};
        const fk = `${c.fornecedor || '—'}|${c.fornecedorDoc || ''}`;
        const f = pegar(cat.forns, fk, () => ({ key: `f:${cat.key}:${fk}`, tipo: 'forn', nome: c.fornecedor || '—', doc: c.fornecedorDoc || '', tot: zero(), docs: new Map() }));
        const d = pegar(f.docs, it.contaId, () => ({
            key: `d:${cat.key}:${it.contaId}`, tipo: 'doc', conta: c, tot: zero(), itens: [],
            nCats: catsDaConta.get(it.contaId)?.size || 1,
        }));
        [g.tot, cat.tot, f.tot, d.tot].forEach((t) => somar(t, it));
        cat.contasSet.add(it.contaId);
        d.itens.push(it);
    });

    const contarContas = (n) => n.contasSet.size;
    const lista = [...grupos.values()].map((g) => {
        const cats = [...g.cats.values()].map((cat) => ({
            ...cat, contas: contarContas(cat),
            forns: [...cat.forns.values()].map((f) => ({ ...f, contas: f.docs.size, docs: [...f.docs.values()] })),
        }));
        const contasGrupo = new Set();
        cats.forEach((c) => c.contasSet.forEach((x) => contasGrupo.add(x)));
        return { ...g, cats, contas: contasGrupo.size };
    });
    // "Fora do resultado" sempre por último
    lista.sort((a, b) => (a.fora ? 1 : 0) - (b.fora ? 1 : 0));
    return lista;
}

/** Texto curto da nota para a linha (tela e impressão): "emissão · venc. · pago em forma banco". Só o que existe. */
export function detalheNota(c) {
    if (!c) return '';
    const partes = [];
    if (c.emissao) partes.push(`emissão ${fmtDataIso(c.emissao)}`);
    if (c.referenteA) partes.push(`ref. ${c.referenteA}`);
    if (c.vencimentos) partes.push(`venc. ${c.vencimentos}`);
    if (c.datasPagamento) {
        const como = [c.formas, c.bancos].filter(Boolean).join(' · ');
        partes.push(`pago ${c.datasPagamento}${como ? ` (${como})` : ''}`);
    }
    return partes.join(' · ');
}
export const tituloNota = (c) => {
    if (!c) return 'Lançamento';
    const rot = c.documento?.rotulo || 'Lançamento';
    return c.documento?.numero ? `${rot} ${c.documento.numero}` : rot;
};
export const textoProduto = (it) => {
    if (it.tipoLinha === 'SEM_ITENS') return '';
    const q = it.quantidade != null && it.quantidade !== '' ? `${numBr(it.quantidade)}${it.unidade ? ` ${it.unidade}` : ''}` : '';
    const vu = it.valorUnitario != null && it.valorUnitario !== '' ? ` × ${reais(cents(it.valorUnitario))}` : '';
    return q ? `${q}${vu}` : '';
};

/** Linhas planas para impressão, cortadas no nível escolhido (1 categoria · 2 fornecedor · 3 nota · 4 produto). */
export function linhasImpressao(grupos, nivel, totalGeral) {
    const out = [];
    const cols = (t, contas, base) => [contas != null ? String(contas) : '', reais(t.valor), reais(t.pago), t.aberto ? reais(t.aberto) : '—', pct(t.valor, base)];
    grupos.forEach((g) => {
        out.push({ tipo: 'grupo', texto: g.nome, cols: cols(g.tot, g.contas, totalGeral) });
        g.cats.forEach((cat) => {
            out.push({ tipo: 'cat', texto: cat.nome, sub: rotClassif(cat.meta), cols: cols(cat.tot, cat.contas, totalGeral) });
            if (nivel < 2) return;
            cat.forns.forEach((f) => {
                out.push({ tipo: 'forn', texto: f.nome, sub: f.doc ? formatarDoc(f.doc) : '', cols: cols(f.tot, f.contas, cat.tot.valor) });
                if (nivel < 3) return;
                f.docs.forEach((d) => {
                    out.push({ tipo: 'doc', texto: `${tituloNota(d.conta)}${d.conta?.situacao ? ` — ${d.conta.situacao}` : ''}`, sub: detalheNota(d.conta), cols: cols(d.tot, null, f.tot.valor) });
                    if (nivel < 4) return;
                    d.itens.forEach((it) => {
                        const nome = it.tipoLinha === 'SEM_ITENS' ? (d.conta?.descricao || 'Sem produtos') : (it.produto || '—');
                        const extra = [textoProduto(it), it.ncm ? `NCM ${it.ncm}` : ''].filter(Boolean).join(' · ');
                        out.push({ tipo: 'prod', texto: nome, sub: extra, cols: ['', reais(cents(it.valor)), reais(cents(it.pago)), cents(it.aberto) ? reais(cents(it.aberto)) : '—', ''] });
                    });
                });
            });
        });
    });
    out.push({ tipo: 'total', texto: 'TOTAL', cols: cols(somaGrupos(grupos), null, totalGeral) });
    return out;
}
function somaGrupos(grupos) {
    const t = zero();
    grupos.forEach((g) => { t.valor += g.tot.valor; t.pago += g.tot.pago; t.aberto += g.tot.aberto; });
    return t;
}

// ───────────────────────── CSV (33 colunas, SEMPRE uma linha por produto) ─────────────────────────
export const CABECALHO_CSV = [
    'Categoria', 'Classificação', 'Grupo DRE', 'Fornecedor', 'CNPJ / CPF', 'Tipo de documento', 'Nº do documento', 'Chave de acesso',
    'Descrição do lançamento', 'Emissão', 'Referente a', 'Parcelas', 'Vencimento(s)', 'Situação', 'Data(s) de pagamento',
    'Forma de pagamento', 'Banco / conta', 'Juros e multa', 'Desconto', 'Conciliado com extrato', 'Baixado por',
    'Produto', 'Código no fornecedor', 'NCM', 'CFOP', 'Qtd', 'Un', 'Valor unitário',
    'Valor nesta categoria', 'Pago (até hoje)', 'Em aberto', 'Total da nota (não somar)', 'Anexo PDF',
];

// helpers de célula: recebem as funções do comum.js (injetadas) para este arquivo seguir puro
export function linhasCsv(resp, itens, h) {
    const { texto, forcado, num, numN } = h; // texto = csvTextoSeguro · forcado = csvTextoForcado · num = fmtNumCsv · numN = fmtNumCsvN
    const mapaContas = new Map((resp?.contas || []).map((c) => [c.id, c]));
    const metaCat = new Map((resp?.linhas || []).map((l) => [l.categoria, l]));
    const dinheiro = (v) => num(cents(v) / 100);
    return itens.map((it) => {
        const c = mapaContas.get(it.contaId) || {};
        const l = metaCat.get(it.categoria);
        const grupo = l?.foraDre ? GRUPO_FORA : (l?.grupoDre || '');
        return [
            texto(it.categoria), texto(rotClassif(l)), texto(grupo),
            texto(c.fornecedor || '—'), forcado(c.fornecedorDoc ? formatarDoc(c.fornecedorDoc) : ''),
            texto(c.documento?.rotulo || ''), forcado(c.documento?.numero || ''), forcado(c.documento?.chave || ''),
            texto(c.descricao || ''), c.emissao ? fmtDataIso(c.emissao) : '', forcado(c.referenteA || ''),
            forcado(c.parcelas || ''), texto(c.vencimentos || ''), texto(c.situacao || ''), texto(c.datasPagamento || ''),
            texto(c.formas || ''), texto(c.bancos || ''), dinheiro(it.jurosMulta), dinheiro(it.desconto),
            texto(c.conciliado || ''), texto(c.baixadoPor || ''),
            texto(it.produto || ''), forcado(it.codigoFornecedor || ''), forcado(it.ncm || ''), forcado(it.cfop || ''),
            numN(it.quantidade, 4), texto(it.unidade || ''), numN(it.valorUnitario, 6),
            dinheiro(it.valor), dinheiro(it.pago), dinheiro(it.aberto), c.valorNota != null ? dinheiro(c.valorNota) : '',
            c.temAnexo ? 'Sim' : '',
        ];
    });
}

/** "2026-08-01" → "01/08/2026" sem passar por Date (sem risco de fuso). */
export const isoParaBr = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : '');

// ───────────────────────── nós para a tela (ArvoreRelatorio) ─────────────────────────
export const COLUNAS_TELA = [
    { rotulo: 'Contas' }, { rotulo: 'Valor' }, { rotulo: 'Pago (até hoje)' }, { rotulo: 'Em aberto' }, { rotulo: '%' },
];
const BADGE_CLASSIF = {
    OPERACIONAL: 'bg-mint text-primaryDark', FINANCEIRO: 'bg-gray-100 text-gray-700',
    FORA_DRE: 'bg-purple-100 text-purple-700', A_CLASSIFICAR: 'bg-amber-100 text-amber-700',
};
// cores semânticas de status (as mesmas dos demais badges do sistema)
const BADGE_SITUACAO = {
    Pago: 'bg-green-100 text-green-800', Parcial: 'bg-yellow-100 text-yellow-800',
    Aberto: 'bg-gray-100 text-gray-700', Vencido: 'bg-red-100 text-red-700',
};
const colunasNo = (t, contas, base) => [
    { t: contas != null ? String(contas) : '', cls: 'text-gray-600' },
    { t: reais(t.valor), cls: 'font-semibold text-gray-900' },
    { t: reais(t.pago), cls: 'text-primaryDark' },
    { t: t.aberto ? reais(t.aberto) : '—', cls: t.aberto ? 'text-blue-700' : 'text-gray-500' },
    { t: pct(t.valor, base), cls: 'text-gray-600' },
];

export function nosParaTela(grupos, totalGeral) {
    return grupos.map((g) => ({
        key: g.key, estilo: 'grupo', fora: g.fora, titulo: g.nome,
        cols: colunasNo(g.tot, g.contas, totalGeral).map((c) => ({ t: c.t })),
        mobInfo: `pago ${reais(g.tot.pago)} · em aberto ${reais(g.tot.aberto)}`,
        filhos: g.cats.map((cat) => ({
            key: cat.key, estilo: 'cat', prof: 1, titulo: cat.nome,
            badge: cat.meta?.classificacao ? { texto: rotClassif(cat.meta), cls: BADGE_CLASSIF[cat.meta.classificacao] || 'bg-gray-100 text-gray-700' } : null,
            cols: colunasNo(cat.tot, cat.contas, totalGeral),
            mobInfo: `${cat.contas} ${cat.contas === 1 ? 'conta' : 'contas'} · ${pct(cat.tot.valor, totalGeral)} do total · pago ${reais(cat.tot.pago)} · aberto ${reais(cat.tot.aberto)}`,
            filhos: cat.forns.map((f) => ({
                key: f.key, estilo: 'forn', prof: 2, titulo: f.nome,
                detalhe: f.doc ? formatarDoc(f.doc) : '',
                cols: colunasNo(f.tot, f.contas, cat.tot.valor),
                mobInfo: `${f.contas} ${f.contas === 1 ? 'nota' : 'notas'} · ${pct(f.tot.valor, cat.tot.valor)} da categoria`,
                filhos: f.docs.map((d) => {
                    const c = d.conta || {};
                    const dividida = d.nCats > 1 && c.valorNota != null
                        ? `Nota dividida em ${d.nCats} categorias — total da nota ${reais(cents(c.valorNota))}` : '';
                    const desc = d.tot?.desconto || 0; const jm = d.tot?.jurosMulta || 0;
                    const ajustesPg = [desc ? `desconto ${reais(desc)}` : '', jm ? `juros e multa ${reais(jm)}` : ''].filter(Boolean).join(' · ');
                    const folhas = d.itens.map((it, k) => {
                        if (it.tipoLinha === 'SEM_ITENS') {
                            const motivo = (c.avisos || []).includes('NOTA_VINCULADA_SEM_PRODUTOS')
                                ? 'Nota vinculada, mas os produtos ainda não aparecem aqui' : 'Lançamento sem produtos';
                            return {
                                key: `${d.key}:${k}`, estilo: 'info', prof: 4, titulo: c.descricao || 'Lançamento sem descrição',
                                detalhe: `${motivo}${c.referenteA ? ` · referente a ${c.referenteA}` : ''}`,
                                cols: colunasNo(zeroDe(it), null, null).map((x, i) => (i === 4 || i === 0 ? { t: '' } : x)),
                            };
                        }
                        const ehAjuste = it.tipoLinha === 'AJUSTE';
                        const meta = [textoProduto(it), it.ncm ? `NCM ${it.ncm}` : '', it.cfop ? `CFOP ${it.cfop}` : '', it.codigoFornecedor ? `cód. ${it.codigoFornecedor}` : ''].filter(Boolean).join(' · ');
                        return {
                            key: `${d.key}:${k}`, estilo: 'folha', prof: 4,
                            titulo: it.produto || (ehAjuste ? 'Ajuste' : '—'),
                            detalhe: `${meta}${it.divergente ? `${meta ? ' · ' : ''}categoria estimada` : ''}`,
                            mobInfo: `pago ${reais(cents(it.pago))} · em aberto ${reais(cents(it.aberto))}`,
                            cols: colunasNo(zeroDe(it), null, null).map((x, i) => (i === 4 || i === 0 ? { t: '' } : x)),
                        };
                    });
                    return {
                        key: d.key, estilo: 'doc', prof: 3, titulo: tituloNota(c),
                        badge: c.situacao ? { texto: c.situacao, cls: BADGE_SITUACAO[c.situacao] || 'bg-gray-100 text-gray-700' } : null,
                        detalhe: [detalheNota(c), ajustesPg, dividida].filter(Boolean).join(' · '),
                        mobInfo: `pago ${reais(d.tot.pago)} · em aberto ${reais(d.tot.aberto)}`,
                        cols: colunasNo(d.tot, null, f.tot.valor).map((x, i) => (i === 0 ? { t: '' } : x)),
                        filhos: folhas,
                    };
                }),
            })),
        })),
    }));
}
function zeroDe(it) {
    return { valor: cents(it.valor), pago: cents(it.pago), aberto: cents(it.aberto) };
}
