// Como Fazer — PDF: regras de PÁGINA e MEDIDA (funções puras, sem banco e sem pdfkit).
// O `medidor` vem de fora: m.h(texto, 'R'|'B', pontos, larguraMm) -> altura em mm. Assim o mesmo
// cálculo vale para validar o arranjo (prévia / 422) e para desenhar (comoFazerPdfService).
// Plano: docs/pop/plano-impressao-pdf-etapa1.md (§4 contrato, §5 algoritmo).
const crypto = require('crypto');

// ───────── texto seguro para Helvetica (WinAnsi) ─────────
const TROCAS = [
    [/[−‐‑‒]/g, '-'], [/[→⇒➜➔←]/g, ''], [/×/g, 'x'], [/≥/g, '>='], [/≤/g, '<='],
    [/[✓✔☑]/g, ''], [/[‘’‚]/g, "'"], [/[“”„]/g, '"'], [/[\u00A0\t]/g, ' '],
];
/**
 * Remove o que a Helvetica embutida não desenha (emoji, símbolos) e troca o que tem equivalente.
 * Regras: '−' (menos) vira '-'; setas (→ ⇒ ← ...) são REMOVIDAS (ficando um espaço só): trocar por '>'
 * ou 'para' deixava a frase sem sentido; tab e NBSP viram espaço; emoji e ✓ somem.
 */
function limparTextoPdf(s, { multilinha = false } = {}) {
    let t = String(s ?? '').normalize('NFC');
    for (const [re, por] of TROCAS) t = t.replace(re, por);
    // fica: ASCII imprimível, Latin-1 (acentos), e a pontuação que o WinAnsi tem: – — • … € ™
    t = t.replace(/[^\n\x20-\x7E¡-ÿ–—•…€™]/g, '');
    t = multilinha ? t.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
    return t.trim();
}

// ───────── passos ─────────
/** GANCHO da etapa 2 (várias fotos): hoje 0 ou 1 foto por passo */
function fotosDoPasso(p) {
    if (Array.isArray(p?.fotos) && p.fotos.length) return p.fotos.map(f => (typeof f === 'string' ? f : f?.url)).filter(Boolean);
    return p?.foto ? [p.foto] : [];
}

/** documento -> lista plana de passos na ordem do manual (numeração do manual, contínua) */
function achatar(doc) {
    const out = [];
    let n = 0;
    const secoes = Array.isArray(doc?.secoes) ? doc.secoes : [];
    for (const s of secoes) {
        for (const p of (s.passos || [])) {
            n += 1;
            out.push({
                id: p.id, n, secaoId: s.id, secaoTitulo: limparTextoPdf(s.titulo), bloco: s.bloco,
                texto: limparTextoPdf(p.texto), detalhe: limparTextoPdf(p.detalhe || ''),
                perigo: p.perigo === true, fotos: fotosDoPasso(p), dica: limparTextoPdf(p.fotoSugerida || ''),
            });
        }
    }
    return out;
}

const LIM = { CARTAZ: 6, CARTAZ_COMPACTO: 8, FICHARIO: 12 };
const MAX_PAGINAS = { CARTAZ: 8, FICHARIO: 6 };
const MAX_IDS_PAGINA = 40;
const MAX_TITULO = 40;

const limitePagina = (formato, compacto) => (formato === 'FICHARIO' ? LIM.FICHARIO : (compacto ? LIM.CARTAZ_COMPACTO : LIM.CARTAZ));

/** peso do passo na página: 1; (etapa 2) 3-4 fotos = 2; cartaz com perigo e texto longo ocupa a linha dupla = 2 */
function pesoDoPasso(p, formato) {
    if (fotosDoPasso(p).length >= 3) return 2;
    if (formato !== 'FICHARIO' && p.perigo && (p.texto || '').length > 90) return 2;
    return 1;
}

// ───────── arranjo vindo do cliente ─────────
class ErroArranjo extends Error {
    constructor(mensagem) { super(mensagem); this.codigo = 'ARRANJO_MALFORMADO'; }
}

/** normaliza o arranjo recebido; lança ErroArranjo se a forma for inválida (400) */
function normalizarArranjoEntrada(a) {
    if (!a || typeof a !== 'object' || !Array.isArray(a.paginas)) throw new ErroArranjo('Arranjo de páginas inválido.');
    if (a.paginas.length > 12) throw new ErroArranjo('Páginas demais.');
    const paginas = a.paginas.map((p, i) => {
        if (!p || typeof p !== 'object') throw new ErroArranjo(`A página ${i + 1} está inválida.`);
        const titulo = limparTextoPdf(typeof p.titulo === 'string' ? p.titulo : '');
        if (titulo.length > MAX_TITULO) throw new ErroArranjo(`O nome da página ${i + 1} passa de ${MAX_TITULO} letras.`);
        if (!Array.isArray(p.passoIds)) throw new ErroArranjo(`A página ${i + 1} está sem a lista de passos.`);
        if (p.passoIds.length > MAX_IDS_PAGINA) throw new ErroArranjo(`A página ${i + 1} tem passos demais.`);
        if (p.passoIds.some(id => typeof id !== 'string' || !id || id.length > 80)) throw new ErroArranjo(`A página ${i + 1} tem um passo inválido.`);
        return { titulo, passoIds: p.passoIds.slice() };
    });
    return { paginas, compacto: a.compacto === true };
}

/** hash estável (chaves ordenadas) para a chave do cache */
function hashArranjo(a) {
    const s = JSON.stringify({ c: !!a.compacto, p: (a.paginas || []).map(p => [p.titulo || '', p.passoIds || []]) });
    return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16);
}

// ───────── reconciliação com a versão em vigor ─────────
/**
 * guardado = layout salvo { paginas, compacto, conhecidos[] } | null. Mantém páginas e títulos;
 * ids que sumiram saem em silêncio; ids novos (não conhecidos na hora de guardar) vão para "fora".
 */
function reconciliar(guardado, flat) {
    const existentes = new Set(flat.map(p => p.id));
    const passosRemovidos = [];
    const vistos = new Set();
    const paginas = (guardado?.paginas || []).map(p => ({
        titulo: p.titulo || '',
        passoIds: (p.passoIds || []).filter(id => {
            if (!existentes.has(id)) { passosRemovidos.push(id); return false; }
            if (vistos.has(id)) return false; // duplicado guardado: mantém a 1ª ocorrência
            vistos.add(id);
            return true;
        }),
    }));
    const conhecidos = new Set(guardado?.conhecidos || flat.map(p => p.id));
    const foraDasPaginas = flat.filter(p => !vistos.has(p.id)).map(p => p.id);
    const passosNovos = flat.filter(p => !vistos.has(p.id) && !conhecidos.has(p.id)).map(p => p.id);
    return { arranjo: { paginas, compacto: guardado?.compacto === true }, foraDasPaginas, passosNovos, passosRemovidos };
}

// ───────── geometria e medição: CARTAZ ─────────
const CZ = { ML: 9, W: 192, HEAD: 34, ROD: 10, COLGAP: 4, ROWGAP: 4, PAD: 3, NUM: 11 };
const A4H = 297;

/** alturas fixas do cartaz (iguais nas N páginas) */
function geometriaCartaz(m, { naoFazer, avisoPerigo }) {
    const nao = naoFazer ? limparTextoPdf(naoFazer.replace(/\n+/g, ' · '), {}) : '';
    let naoH = 0;
    if (nao) {
        const h = m.h(nao, 'B', 11, CZ.W - 10 - 38);
        naoH = Math.max(14, Math.min(22, h + 8));
    }
    const aviso = avisoPerigo ? limparTextoPdf(avisoPerigo) : '';
    let avisoH = 0;
    if (aviso) avisoH = Math.min(12, m.h(aviso, 'B', 10, CZ.W - 8) + 4);
    const topo = CZ.HEAD + 3 + (avisoH ? avisoH + 2 : 0);
    const fundo = A4H - CZ.ROD - 1 - (naoH ? naoH + 3 : 0);
    return { nao, naoH, aviso, avisoH, topo, fundo, corpoH: fundo - topo - 2 };
}

/** linhas de cartões de uma página do cartaz (com a altura mínima de cada uma) */
function linhasCartaz(passos, m, compacto) {
    const um = passos.length <= 2; // 1-2 cartões: uma coluna larga
    const colW = (CZ.W - CZ.COLGAP) / 2;
    const celulas = passos.map(p => {
        const largo = um || (p.perigo && (p.texto || '').length > 90);
        const w = largo ? CZ.W : colW;
        const textW = w - 2 * CZ.PAD - CZ.NUM - 3;
        let fs = compacto ? 13 : 15;
        let tH = m.h(p.texto, 'B', fs, textW);
        if (tH > fs * 1.2 * 5 / 2.835) { fs = 12; tH = m.h(p.texto, 'B', fs, textW); }
        const top = Math.max(CZ.NUM, tH);
        const fotoMin = compacto ? 14 : 18;
        const detH = p.detalhe ? m.h(p.detalhe, 'R', 9, w - 2 * CZ.PAD) + 1 : 0;
        return { passo: p, w, largo, fs, textW, top, fotoMin, detH, need: CZ.PAD + top + 2 + fotoMin + CZ.PAD };
    });
    const linhas = [];
    let atual = null;
    for (const c of celulas) {
        if (c.largo) { linhas.push({ celulas: [c] }); atual = null; continue; }
        if (!atual) { atual = { celulas: [] }; linhas.push(atual); }
        atual.celulas.push(c);
        if (atual.celulas.length === 2) atual = null;
    }
    for (const l of linhas) l.need = Math.max(...l.celulas.map(c => c.need));
    return linhas;
}

/** distribui a sobra da página (foto cresce, detalhe entra, respiro) — usado na medição e no desenho */
function expandirCartaz(linhas, corpoH) {
    const R = linhas.length;
    const soma = linhas.reduce((a, l) => a + l.need, 0);
    const gaps = CZ.ROWGAP * Math.max(0, R - 1);
    let sobra = corpoH - soma - gaps;
    let comDetalhe = false;
    const detTotal = linhas.reduce((a, l) => a + Math.max(0, ...l.celulas.map(c => c.detH)), 0);
    if (sobra > 0 && detTotal > 0 && detTotal <= sobra * 0.6) { comDetalhe = true; sobra -= detTotal; }
    const alturas = linhas.map(l => l.need + (comDetalhe ? Math.max(0, ...l.celulas.map(c => c.detH)) : 0));
    let gap = CZ.ROWGAP;
    if (sobra > 0) {
        const ganho = Math.min(sobra / R, 85 - 18);
        for (let i = 0; i < R; i++) alturas[i] += ganho;
        sobra -= ganho * R;
        if (sobra > 0 && R > 1) { const g = Math.min(2, sobra / (R - 1)); gap += g; }
    }
    return { alturas, gap, comDetalhe, sobraFinal: Math.max(0, sobra) };
}

// ───────── geometria e medição: FICHÁRIO ─────────
const FI = { ML: 28, MR: 10, MT: 12, W: 172, YMAX: 268, CAB1: 34, CAB2: 16, SEC_GAP: 3.5, SEC_H: 5.5, THEAD: 6, PAD: 1.5, NUMW: 10, LIN: 7.5 };

const PRE_TIT = { objetivo: 'OBJETIVO', executa: 'QUEM EXECUTA / QUEM SUPERVISIONA', materiais: 'MATERIAIS E EPI' };

/** seções de texto antes do procedimento (omitidas quando vazias) + numeração dinâmica */
function secoesFicharioTexto(ficha) {
    const pre = [];
    if (ficha.objetivo) pre.push({ k: 'objetivo', texto: ficha.objetivo });
    pre.push({ k: 'executa', texto: ficha.executa || '-' });
    if (ficha.materiais) pre.push({ k: 'materiais', texto: ficha.materiais });
    return pre;
}

const alturaTexto9 = (m, txt, w) => m.h(txt, 'R', 9, w);

/** altura das linhas do procedimento para a escala s */
function alturasProcedimento(passos, m, s) {
    const thumb = 13 * s;
    const textW = FI.W - FI.NUMW - (thumb + 5) - 2 * 2;
    const fs = 9 * s;
    return passos.map(p => {
        const hb = m.h(p.texto, 'B', fs, textW);
        const hd = p.detalhe ? m.h(p.detalhe, 'R', fs - 0.5, textW) + 0.5 : 0;
        return Math.max(2 * FI.PAD + hb + hd, thumb + 2 * FI.PAD);
    });
}

const SCALES = [1.35, 1.3, 1.25, 1.2, 1.15, 1.1, 1.05, 1.0];

/** fluxo de blocos (título / cabeçalho de tabela / linhas) com quebra de página; linha nunca é cortada */
function fluxo(blocos, yInicio, yMax, yTopoNova) {
    const pos = [];
    let pag = 0, y = yInicio;
    for (let i = 0; i < blocos.length; i++) {
        const b = blocos[i];
        const preciso = b.tipo === 'titulo' ? b.h + (blocos[i + 1]?.h || 0) + (blocos[i + 2]?.h || 0) : b.h;
        if (y + preciso > yMax && !(y === yTopoNova && pag > 0)) {
            pag += 1; y = yTopoNova;
            if (b.tipo === 'linha' && b.cab) { pos.push({ pag, y, bloco: b.cab, repetido: true }); y += b.cab.h; }
        }
        pos.push({ pag, y, bloco: b });
        y += b.h;
    }
    return { pos, paginas: pag, yFim: y };
}

/** blocos do fechamento (não fazer, se der errado, revisões, treinamento) */
function blocosFechamento(ficha, m, brancas) {
    const blocos = [];
    let n = ficha.numeroProximo;
    const titulo = (txt) => ({ tipo: 'titulo', h: FI.SEC_GAP + FI.SEC_H + 1.5, texto: `${n++}. ${txt}` });
    if (ficha.naoFazer) {
        const h = m.h(ficha.naoFazer, 'R', 9, FI.W - 6) + 4;
        blocos.push(titulo('O QUE NÃO FAZER'), { tipo: 'nao', h, texto: ficha.naoFazer });
    }
    if (ficha.seDerErrado?.length) {
        blocos.push(titulo('SE DER ERRADO'));
        const cab = { tipo: 'cab', h: FI.THEAD, colunas: [['Se...', 0.4], ['Então...', 0.6]] };
        blocos.push(cab);
        for (const r of ficha.seDerErrado) {
            const h = Math.max(7, 2 * FI.PAD + Math.max(m.h(r.se, 'R', 9, FI.W * 0.4 - 4), m.h(r.entao, 'R', 9, FI.W * 0.6 - 4)));
            blocos.push({ tipo: 'linha', h, cab, celulas: [r.se, r.entao], pesos: [0.4, 0.6] });
        }
    }
    blocos.push(titulo('CONTROLE DE REVISÕES'));
    const cabR = { tipo: 'cab', h: FI.THEAD, colunas: [['Versão', 0.12], ['Data', 0.18], ['O que mudou', 0.46], ['Aprovado por', 0.24]] };
    blocos.push(cabR);
    for (const r of ficha.revisoes) blocos.push({ tipo: 'linha', h: 7, cab: cabR, celulas: [String(r.numero), r.data, '', r.aprovadoPor], pesos: [0.12, 0.18, 0.46, 0.24] });
    blocos.push(titulo('TREINAMENTO - QUEM APRENDEU ESTA VERSÃO'));
    const cabT = { tipo: 'cab', h: FI.THEAD, colunas: [['Nome', 0.34], ['Data', 0.14], ['Assinatura do funcionário', 0.26], ['Visto do encarregado', 0.26]] };
    blocos.push(cabT);
    for (const t of ficha.treinados) blocos.push({ tipo: 'linha', h: FI.LIN, cab: cabT, celulas: [t.nome, t.data, '', ''], pesos: [0.34, 0.14, 0.26, 0.26] });
    for (let i = 0; i < brancas; i++) blocos.push({ tipo: 'linha', h: FI.LIN, cab: cabT, celulas: ['', '', '', ''], pesos: [0.34, 0.14, 0.26, 0.26] });
    return blocos;
}

/**
 * Plano completo do fichário para um arranjo. Devolve, por página do arranjo, a escala e as alturas
 * das linhas (e se estoura), mais o fechamento (com folhas extras, se precisar).
 * `ficha` = { objetivo, executa, materiais, naoFazer, seDerErrado[], revisoes[], treinados[] }
 */
function planoFichario(paginasPassos, ficha, m) {
    const pre = secoesFicharioTexto(ficha);
    let yRows1 = FI.MT + FI.CAB1;
    for (const s of pre) yRows1 += FI.SEC_GAP + FI.SEC_H + 1.5 + alturaTexto9(m, s.texto, FI.W) + 1;
    yRows1 += FI.SEC_GAP + FI.SEC_H + 1.5 + FI.THEAD; // "N. PROCEDIMENTO" + cabeçalho da tabela
    const yRowsN = FI.MT + FI.CAB2 + FI.SEC_GAP + FI.SEC_H + 1.5 + FI.THEAD;
    const numeroProximo = pre.length + 2;
    const fichaF = { ...ficha, numeroProximo };

    const paginas = paginasPassos.map((passos, k) => {
        const y0 = k === 0 ? yRows1 : yRowsN;
        const avail = FI.YMAX - y0;
        const base = alturasProcedimento(passos, m, 1);
        const somaBase = base.reduce((a, b) => a + b, 0);
        return { passos, y0, avail, somaBase, base, ok: somaBase <= avail, excesso: 0, s: 1, alturas: base };
    });
    for (const pg of paginas) {
        if (pg.ok) continue;
        const media = pg.somaBase / Math.max(1, pg.passos.length);
        pg.excesso = Math.max(1, Math.ceil((pg.somaBase - pg.avail) / media));
    }

    // escala: maior s que cabe na página (a última reserva espaço para o fechamento, se couber junto)
    const escolher = (pg, reserva) => {
        for (const s of SCALES) {
            const al = alturasProcedimento(pg.passos, m, s);
            if (al.reduce((a, b) => a + b, 0) + reserva <= pg.avail) return { s, al };
        }
        return null;
    };
    const ultimo = paginas[paginas.length - 1];
    let fech = null, extras = 0;
    if (ultimo) {
        const blocosMin = blocosFechamento(fichaF, m, 5);
        const hMin = blocosMin.reduce((a, b) => a + b.h, 0);
        const cabecaFecha = (ultimo.ok ? 0 : 0);
        const junto = ultimo.ok ? escolher(ultimo, hMin + cabecaFecha) : null;
        if (junto) {
            ultimo.s = junto.s; ultimo.alturas = junto.al;
            const yIni = ultimo.y0 + junto.al.reduce((a, b) => a + b, 0);
            fech = { yIni, pagBase: paginas.length - 1 };
        }
        for (const pg of paginas) {
            if (!pg.ok || pg === ultimo && junto) continue;
            const e = escolher(pg, 0);
            if (e) { pg.s = e.s; pg.alturas = e.al; }
        }
        if (!fech) {
            // o fechamento vai para folha(s) extra(s) logo depois da última página do arranjo
            fech = { yIni: FI.MT + FI.CAB2 + 2, pagBase: paginas.length, novaFolha: true };
        }
        // linhas em branco para assinar: completa o que sobra da última folha do fechamento
        const montar = (brancas) => fluxo(blocosFechamento(fichaF, m, brancas), fech.yIni, FI.YMAX, FI.MT + FI.CAB2 + 2);
        let brancas = 5;
        let r = montar(brancas);
        while (brancas < 14) {
            const r2 = montar(brancas + 1);
            if (r2.paginas > r.paginas) break;
            brancas += 1; r = r2;
        }
        extras = (fech.novaFolha ? 1 : 0) + r.paginas;
        fech.brancas = brancas; fech.resultado = r; fech.blocos = blocosFechamento(fichaF, m, brancas);
        fech.numeroProximo = numeroProximo;
    }
    return { paginas, fechamento: fech, extras, total: paginas.length + extras, yRows1, yRowsN, pre, numeroProximo };
}

// ───────── validação do arranjo (prévia e POST) ─────────
/**
 * Valida o arranjo contra o documento publicado (ids), os limites por página e a MEDIDA real.
 * `ctx` = { flat, formato, m, geoCartaz?, ficha? }. Devolve o que a prévia mostra.
 */
function validarArranjo(arranjo, ctx) {
    const { flat, formato, m } = ctx;
    const porId = new Map(flat.map(p => [p.id, p]));
    const bloqueios = [];
    const avisos = [];
    const compacto = formato === 'CARTAZ' && arranjo.compacto === true;
    const lim = limitePagina(formato, compacto);
    const maxP = MAX_PAGINAS[formato];

    if (arranjo.paginas.length < 1 || arranjo.paginas.length > maxP) {
        bloqueios.push({ tipo: 'PAGINAS_FORA_DO_LIMITE', mensagem: `Use de 1 a ${maxP} páginas (agora são ${arranjo.paginas.length}).` });
    }
    const vistos = new Set();
    const inexistentes = [];
    const duplicados = [];
    for (const p of arranjo.paginas) for (const id of p.passoIds) {
        if (!porId.has(id)) inexistentes.push(id);
        else if (vistos.has(id)) duplicados.push(id);
        else vistos.add(id);
    }
    if (inexistentes.length) bloqueios.push({ tipo: 'PASSO_INEXISTENTE', passoIds: inexistentes, mensagem: 'Há passo que não existe mais nesta versão do manual.' });
    if (duplicados.length) bloqueios.push({ tipo: 'PASSO_DUPLICADO', passoIds: duplicados, mensagem: 'Um mesmo passo está em mais de uma página.' });

    const foraDasPaginas = flat.filter(p => !vistos.has(p.id)).map(p => p.id);
    const passosPorPagina = arranjo.paginas.map(p => p.passoIds.map(id => porId.get(id)).filter(Boolean));

    let planoF = null;
    if (formato === 'FICHARIO') planoF = planoFichario(passosPorPagina, ctx.ficha, m);

    const paginasResumo = arranjo.paginas.map((pg, i) => {
        const passos = passosPorPagina[i];
        const peso = passos.reduce((a, p) => a + pesoDoPasso(p, formato), 0);
        const indice = i + 1;
        const base = { indice, titulo: pg.titulo || '', passos: passos.length, peso, limite: lim };
        if (!passos.length) {
            bloqueios.push({ tipo: 'PAGINA_VAZIA', pagina: indice, mensagem: `A página ${indice} está vazia: tire-a ou coloque passos.` });
            return { ...base, situacao: 'VAZIA', mensagem: 'Página vazia' };
        }
        let excesso = Math.max(0, peso - lim);
        let porMedida = false;
        // rede de segurança: o peso cabe, mas o texto é tão longo que a folha não comporta
        if (!excesso) {
            if (formato === 'CARTAZ') {
                const linhas = linhasCartaz(passos, m, compacto);
                const total = linhas.reduce((a, l) => a + l.need, 0) + CZ.ROWGAP * Math.max(0, linhas.length - 1);
                if (total > ctx.geoCartaz.corpoH) {
                    const media = total / passos.length;
                    excesso = Math.max(1, Math.ceil((total - ctx.geoCartaz.corpoH) / media));
                    porMedida = true;
                }
            } else if (planoF && !planoF.paginas[i].ok) {
                excesso = planoF.paginas[i].excesso;
                porMedida = true;
            }
        }
        if (excesso > 0) {
            const n = passos.length;
            const mover = `Mova ${excesso} passo${excesso > 1 ? 's' : ''} para outra página.`;
            const msg = porMedida
                ? `Esta página tem texto demais para caber (passos longos). ${mover}`
                : `${n} passo${n > 1 ? 's' : ''} · não cabe (máximo ${lim}). ${mover}`;
            bloqueios.push({ tipo: 'PAGINA_ESTOURADA', pagina: indice, excesso, motivo: porMedida ? 'TEXTO' : 'NUMERO', mensagem: `Página ${indice}: ${msg}` });
            return { ...base, situacao: 'ESTOURADA', excesso, motivo: porMedida ? 'TEXTO' : 'NUMERO', mensagem: msg };
        }
        const cheia = peso >= lim;
        return { ...base, situacao: cheia ? 'CHEIA' : 'OK', mensagem: `${passos.length} passo${passos.length > 1 ? 's' : ''} · ${cheia ? 'página cheia' : 'cabe bem'}` };
    });

    if (foraDasPaginas.length) {
        const desc = foraDasPaginas.slice(0, 3).map(id => `o passo ${porId.get(id).n} "${porId.get(id).texto.slice(0, 40)}"`).join(', ');
        avisos.push({
            tipo: 'PASSOS_FORA', passoIds: foraDasPaginas,
            mensagem: `${foraDasPaginas.length} passo${foraDasPaginas.length > 1 ? 's ficaram' : ' ficou'} fora das páginas: ${desc}${foraDasPaginas.length > 3 ? '...' : ''}.`,
        });
    }
    if (planoF && planoF.extras > 0 && planoF.fechamento?.novaFolha) {
        avisos.push({ tipo: 'FOLHA_EXTRA', mensagem: `Mais ${planoF.fechamento.resultado.paginas + 1} página${planoF.fechamento.resultado.paginas + 1 > 1 ? 's' : ''} só com Revisões e Treinamento (total ${planoF.total}).` });
    }
    const totalPaginas = formato === 'FICHARIO' && planoF ? planoF.total : arranjo.paginas.length;
    return {
        arranjo: { paginas: arranjo.paginas, foraDasPaginas, compacto },
        foraDasPaginas, paginasResumo, bloqueios, avisos, totalPaginas, planoFichario: planoF,
    };
}

// ───────── sugestões ─────────
/** fatias contíguas o mais iguais possível: 13 em 3 -> 5/4/4 */
function fatiar(ids, n) {
    const out = [];
    const base = Math.floor(ids.length / n), resto = ids.length % n;
    let i = 0;
    for (let k = 0; k < n; k++) { const t = base + (k < resto ? 1 : 0); out.push(ids.slice(i, i + t)); i += t; }
    return out;
}

/** devolve { arranjo } | { indisponivel, motivo } | lança { codigo, mensagem } via objeto de erro */
function sugerir(modo, { flat, formato, compacto, k }, validar) {
    const lim = limitePagina(formato, compacto);
    const ids = flat.map(p => p.id);
    const T = ids.length;
    const mk = (fatias, titulos) => ({ paginas: fatias.map((f, i) => ({ titulo: titulos?.[i] || `Página ${i + 1}`, passoIds: f })), compacto: !!compacto });
    if (modo === 'passosPorPagina') {
        if (!(k >= 1)) return { erro: { codigo: 'PASSOS_POR_PAGINA_INVALIDO', mensagem: 'Escolha quantos passos por página.' } };
        if (k > lim) return { erro: { codigo: 'PASSOS_POR_PAGINA_ALTO', mensagem: `${formato === 'CARTAZ' ? 'No cartaz' : 'No fichário'} cabem ${lim} passos por página.` } };
        const n = Math.ceil(T / k);
        return { arranjo: mk(fatiar(ids, n)) };
    }
    if (modo === 'umProcessoPorPagina') {
        const secoes = [];
        for (const p of flat) {
            const ult = secoes[secoes.length - 1];
            if (ult && ult.secaoId === p.secaoId) ult.ids.push(p.id);
            else secoes.push({ secaoId: p.secaoId, titulo: p.secaoTitulo, ids: [p.id] });
        }
        if (secoes.length <= 1) {
            return { indisponivel: true, motivo: 'Este manual tem uma seção só: use "Passos por página" e dê um nome a cada página.' };
        }
        const fatias = [], titulos = [];
        for (const s of secoes) {
            if (s.ids.length <= lim) { fatias.push(s.ids); titulos.push(s.titulo || `Página ${fatias.length}`); continue; }
            const partes = Math.ceil(s.ids.length / lim);
            fatiar(s.ids, partes).forEach((f, i) => { fatias.push(f); titulos.push(`${s.titulo || 'Página'} (${i + 1}/${partes})`.slice(0, MAX_TITULO)); });
        }
        return { arranjo: mk(fatias, titulos) };
    }
    // automático: menor número de páginas que cabe (peso e medida), equilibrado
    let n = Math.max(1, Math.ceil(T / lim));
    const maxP = MAX_PAGINAS[formato];
    let arr = mk(fatiar(ids, n));
    while (n < maxP && n < T) {
        const v = validar(arr);
        if (!v.bloqueios.some(b => b.tipo === 'PAGINA_ESTOURADA')) break;
        n += 1; arr = mk(fatiar(ids, n));
    }
    return { arranjo: arr };
}

module.exports = {
    limparTextoPdf, fotosDoPasso, achatar, pesoDoPasso, limitePagina, LIM, MAX_PAGINAS, MAX_TITULO,
    ErroArranjo, normalizarArranjoEntrada, hashArranjo, reconciliar,
    CZ, FI, A4H, geometriaCartaz, linhasCartaz, expandirCartaz,
    alturasProcedimento, secoesFicharioTexto, blocosFechamento, fluxo, planoFichario,
    validarArranjo, sugerir, fatiar,
};
