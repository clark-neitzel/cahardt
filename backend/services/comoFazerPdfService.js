// Como Fazer — PDF do conteúdo (cartaz de parede / folha de fichário), gerado no SERVIDOR (pdfkit, A4 real).
// Sem Chromium e sem gravar nada em disco: o PDF nasce em memória e vai direto na resposta.
// Só a versão PUBLICADA imprime. O ARRANJO (quais passos em cada página) é validado aqui, no servidor,
// com os mesmos limites da tela — o front só desenha o resultado. Plano: docs/pop/plano-impressao-pdf-etapa1.md
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const prisma = require('../config/database');
const schema = require('./comoFazerSchema');
const svc = require('./comoFazerService');
const setoresService = require('./setoresService');
const L = require('./comoFazerPdfLayout');

const { ErroCF } = svc;
const MM = 72 / 25.4;
const REG = 'Helvetica';
const NEG = 'Helvetica-Bold';
const VERDE = '#1E3932';
const VERMELHO = '#b91c1c';
const CINZA = '#374151';
const RAIZ_COMO_FAZER = path.resolve(path.join(__dirname, '../uploads/como-fazer'));
const RAIZ_UPLOADS = path.resolve(path.join(__dirname, '../uploads'));
const FORMATOS = ['CARTAZ', 'FICHARIO'];
const NOME_FORMATO = { CARTAZ: 'cartaz', FICHARIO: 'fichario' };

const p = (mm) => mm * MM;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');
const maisMeses = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

// ───────── medidor (pdfkit só para medir texto) ─────────
let _scratch = null;
const medidor = {
    h(texto, fonte, pt, larguraMm) {
        if (!_scratch) _scratch = new PDFDocument({ size: 'A4', margin: 0 });
        _scratch.font(fonte === 'B' ? NEG : REG).fontSize(pt);
        return _scratch.heightOfString(texto && String(texto).length ? String(texto) : ' ', { width: Math.max(1, larguraMm) * MM, lineGap: 0 }) / MM;
    },
};

// ───────── fotos (sharp: webp/png/EXIF/foto enorme -> JPEG 1200 px) ─────────
let _sharp;
function getSharp() {
    if (_sharp === undefined) {
        try { _sharp = require('sharp'); _sharp.cache(false); _sharp.concurrency(1); }
        catch (e) { console.error('[ComoFazer][pdf] sharp indisponível:', e.message); _sharp = null; }
    }
    return _sharp;
}

/** caminho absoluto SÓ dentro de uploads/como-fazer (anti-traversal), ou null */
function caminhoFoto(rel) {
    if (!schema.midiaValida(rel)) return null;
    const abs = path.resolve(RAIZ_UPLOADS, rel);
    if (!abs.startsWith(RAIZ_COMO_FAZER + path.sep)) return null;
    return abs;
}
const fotoExiste = (rel) => { const c = caminhoFoto(rel); return !!c && fs.existsSync(c); };
const sharpDisponivel = () => !!getSharp();

/** Buffer JPEG pronto para o pdfkit, ou null (ausente / corrompida / sem sharp) */
async function prepararFoto(rel) {
    const abs = caminhoFoto(rel);
    if (!abs || !fs.existsSync(abs)) return null;
    const sharp = getSharp();
    if (!sharp) return null;
    try {
        return await sharp(abs).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
    } catch (e) {
        console.warn('[ComoFazer][pdf] foto ilegível', rel, e.message);
        return null;
    }
}

// ───────── dados do conteúdo publicado ─────────
const HOST_FIXO = 'https://cahardt-github.xrqvlq.easypanel.host';
const bancoLocal = () => /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/i.test(process.env.DATABASE_URL || '') || /hardt_local\b/i.test(process.env.DATABASE_URL || '');
/** host do QR: SÓ do env (APP_PUBLIC_URL) ou o fixo. O header Origin do cliente NUNCA define o host. */
function baseUrl() {
    const env = String(process.env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(env)) return env;
    if (bancoLocal() && /^http:\/\/localhost(:\d+)?$/i.test(env)) return env;
    return HOST_FIXO;
}

function parseFormato(f) {
    const v = String(f || '').toUpperCase();
    if (v === 'REGISTRO') throw new ErroCF(422, 'FORMATO_INDISPONIVEL', 'A folha de registro ainda não está disponível.');
    if (!FORMATOS.includes(v)) throw new ErroCF(400, 'FORMATO_INVALIDO', 'Escolha cartaz ou folha de fichário.');
    return v;
}

async function nomesDeVendedores(ids) {
    const lim = [...new Set(ids.filter(Boolean))];
    if (!lim.length) return new Map();
    const l = await prisma.vendedor.findMany({ where: { id: { in: lim } }, select: { id: true, nome: true } });
    return new Map(l.map(v => [v.id, v.nome]));
}

async function carregar(id, formato) {
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    if (c.status !== 'PUBLICADO' || !c.versaoPublicadaId) throw new ErroCF(409, 'SEM_VERSAO_PUBLICADA', 'Publique o conteúdo antes de gerar o PDF: rascunho não imprime.');
    const versao = await prisma.comoFazerVersao.findUnique({ where: { id: c.versaoPublicadaId } });
    if (!versao || versao.status !== 'PUBLICADA') throw new ErroCF(409, 'SEM_VERSAO_PUBLICADA', 'Publique o conteúdo antes de gerar o PDF: rascunho não imprime.');
    // lê o documento direto da versão (o docParaLeitura apagaria a dica de foto)
    const doc = schema.normalizarDoc(versao.passos, c.tipo);
    const flat = L.achatar(doc);
    if (!flat.length) throw new ErroCF(409, 'CONTEUDO_VAZIO', 'Este conteúdo não tem passos.');

    const [setoresLista, encarregados] = await Promise.all([
        setoresService.listar({ incluirInativos: true }).catch(() => []),
        svc.resolverEncarregados(c.responsaveisIds),
    ]);
    const setoresNomes = (c.setores || []).map(cod => setoresLista.find(s => s.codigo === cod)?.nome || cod).map(s => L.limparTextoPdf(s));
    const publicadaPor = await svc.resolverPublicadaPor(versao.publicadaPorId);
    const d = {
        c, versao, doc, flat, setoresNomes, encarregados: encarregados.map(e => L.limparTextoPdf(e.nome)),
        publicadaPor: publicadaPor ? L.limparTextoPdf(publicadaPor.nome) : '',
        publicadaEm: versao.publicadaEm || versao.updatedAt,
        codigo: L.limparTextoPdf(c.codigo || ''), titulo: L.limparTextoPdf(c.titulo),
    };
    if (formato === 'FICHARIO') {
        const [versoes, trein] = await Promise.all([
            prisma.comoFazerVersao.findMany({
                where: { conteudoId: id, status: { in: ['PUBLICADA', 'SUBSTITUIDA'] } },
                orderBy: { numero: 'desc' }, take: 8,
                select: { numero: true, publicadaEm: true, publicadaPorId: true },
            }),
            prisma.comoFazerTreinamento.findMany({
                where: { conteudoId: id, versaoTreinoNumero: c.versaoTreinoNumero, ciclo: 1 },
                orderBy: { aprendeuEm: 'asc' }, select: { funcionarioId: true, aprendeuEm: true },
            }),
        ]);
        const funcs = trein.length
            ? await prisma.funcionario.findMany({ where: { id: { in: trein.map(t => t.funcionarioId) } }, select: { id: true, nome: true } })
            : [];
        const nomesV = await nomesDeVendedores(versoes.map(v => v.publicadaPorId));
        d.revisoes = versoes.map(v => ({ numero: v.numero, data: fmtData(v.publicadaEm), aprovadoPor: L.limparTextoPdf(nomesV.get(v.publicadaPorId) || '') }));
        d.treinados = trein.map(t => ({ nome: L.limparTextoPdf(funcs.find(f => f.id === t.funcionarioId)?.nome || ''), data: fmtData(t.aprendeuEm) })).filter(t => t.nome);
    }
    return d;
}

/** textos do fichário que a medida e o desenho compartilham */
function fichaDe(d) {
    const nao = d.doc.naoFazer ? L.limparTextoPdf(d.doc.naoFazer, { multilinha: true }) : '';
    const executa = [
        d.setoresNomes.length ? `Executa: ${d.setoresNomes.join(', ')}${d.c.cargos?.length ? ` (${d.c.cargos.map(x => L.limparTextoPdf(x)).join(', ')})` : ' (todos os cargos)'}.` : '',
        d.encarregados.length ? `Supervisiona: ${d.encarregados.join(', ')}.` : '',
    ].filter(Boolean).join(' ');
    return {
        objetivo: d.doc.objetivo ? L.limparTextoPdf(d.doc.objetivo, { multilinha: true }) : '',
        executa,
        materiais: d.doc.materiais ? L.limparTextoPdf(d.doc.materiais, { multilinha: true }) : '',
        naoFazer: nao,
        seDerErrado: (d.doc.seDerErrado || []).map(r => ({ se: L.limparTextoPdf(r.se), entao: L.limparTextoPdf(r.entao) })),
        revisoes: d.revisoes || [], treinados: d.treinados || [],
    };
}

function montarCtx(d, formato) {
    const ctx = { flat: d.flat, formato, m: medidor };
    if (formato === 'CARTAZ') ctx.geoCartaz = L.geometriaCartaz(medidor, { naoFazer: d.doc.naoFazer, avisoPerigo: d.doc.avisoPerigo });
    else ctx.ficha = fichaDe(d);
    return ctx;
}

// ───────── arranjo guardado ─────────
async function layoutGuardado(conteudoId, formato) {
    return prisma.comoFazerLayoutImpressao.findUnique({ where: { conteudoId_formato: { conteudoId, formato } } });
}

const nomeArquivo = (d, formato) => {
    const base = (d.codigo || d.titulo || 'como-fazer').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'como-fazer';
    return `${base}-v${d.versao.numero}-${NOME_FORMATO[formato]}.pdf`;
};

function entradaArranjo(a) {
    try { return L.normalizarArranjoEntrada(a); }
    catch (e) { if (e instanceof L.ErroArranjo) throw new ErroCF(400, 'ARRANJO_MALFORMADO', e.message); throw e; }
}

/** arranjo a usar na prévia: o que veio > modo pedido > guardado reconciliado > automático */
function resolverArranjo(body, d, formato, ctx, guardado) {
    const rec = guardado ? L.reconciliar(guardado.layout, d.flat) : null;
    const validar = (arr) => L.validarArranjo(arr, ctx);
    let indisponivel = null;
    let arranjo;
    if (body.arranjo) {
        arranjo = entradaArranjo(body.arranjo);
        if (formato !== 'CARTAZ') arranjo.compacto = false;
    } else if (body.modo) {
        const compacto = formato === 'CARTAZ' && (body.compacto === true || guardado?.layout?.compacto === true);
        const s = L.sugerir(String(body.modo), { flat: d.flat, formato, compacto, k: Number(body.passosPorPagina) }, validar);
        if (s.erro) throw new ErroCF(422, s.erro.codigo, s.erro.mensagem);
        if (s.indisponivel) {
            indisponivel = { modo: body.modo, motivo: s.motivo };
            arranjo = rec ? rec.arranjo : L.sugerir('automatico', { flat: d.flat, formato, compacto, k: 0 }, validar).arranjo;
        } else arranjo = s.arranjo;
    } else if (rec) arranjo = rec.arranjo;
    else arranjo = L.sugerir('automatico', { flat: d.flat, formato, compacto: false, k: 0 }, validar).arranjo;
    if (formato !== 'CARTAZ') arranjo.compacto = false;
    return { arranjo, rec, indisponivel };
}

// ───────── prévia ─────────
async function previa(id, body = {}, cf) {
    freio(`previa:${cf?.vendedorId || 'anon'}`, 120);
    const formato = parseFormato(body.formato);
    const d = await carregar(id, formato);
    const ctx = montarCtx(d, formato);
    const guardado = await layoutGuardado(id, formato);
    const { arranjo, rec, indisponivel } = resolverArranjo(body, d, formato, ctx, guardado);
    const v = L.validarArranjo(arranjo, ctx);

    const noPapel = v.arranjo.paginas.flatMap(pg => pg.passoIds).map(pid => d.flat.find(x => x.id === pid)).filter(Boolean);
    const semFoto = noPapel.filter(x => !x.fotos.length).length;
    const comFoto = noPapel.filter(x => x.fotos.length);
    const semSharp = comFoto.length > 0 && !sharpDisponivel();
    const perdidas = semSharp ? 0 : comFoto.filter(x => !x.fotos.every(fotoExiste)).length;
    const avisos = [...v.avisos];
    if (noPapel.length && semFoto === noPapel.length) avisos.push({ tipo: 'NENHUMA_FOTO', mensagem: 'Nenhum passo tem foto: a folha sai com quadros tracejados.' });
    else if (semFoto) avisos.push({ tipo: 'SEM_FOTO', mensagem: `${semFoto} passo${semFoto > 1 ? 's' : ''} sem foto (sai um quadro tracejado no lugar).` });
    if (semSharp) {
        console.error('[ComoFazer][pdf] SHARP_INDISPONIVEL: fotos sairão como quadro tracejado');
        avisos.push({ tipo: 'SHARP_INDISPONIVEL', mensagem: 'O servidor não conseguiu preparar as fotos agora: o PDF sai com quadros tracejados no lugar. Avise o suporte.' });
    }
    if (perdidas) avisos.push({ tipo: 'FOTO_PERDIDA', mensagem: `${perdidas} foto${perdidas > 1 ? 's' : ''} não foi encontrada no servidor (sai um quadro tracejado). Anexe de novo no editor.` });

    const confirmar = body.confirmarOmitidos === true;
    const podeGerar = !v.bloqueios.length && (!v.foraDasPaginas.length || confirmar);
    const lim = L.limitePagina(formato, arranjo.compacto);
    let atualizadoPor = null;
    if (guardado?.atualizadoPorId) atualizadoPor = (await nomesDeVendedores([guardado.atualizadoPorId])).get(guardado.atualizadoPorId) || null;
    return {
        formato, versao: d.versao.numero, codigo: d.c.codigo || null, titulo: d.c.titulo,
        publicadaEm: d.versao.publicadaEm, totalPassos: d.flat.length, totalPaginas: v.totalPaginas,
        limite: { porPagina: lim, compactoAte: L.LIM.CARTAZ_COMPACTO, pesoFoto34: 2 },
        arranjo: v.arranjo, paginasResumo: v.paginasResumo, podeGerar, bloqueios: v.bloqueios, avisos,
        modoIndisponivel: indisponivel,
        passos: d.flat.map(x => ({ id: x.id, n: x.n, texto: x.texto, perigo: x.perigo, fotos: x.fotos.length, secao: x.secaoTitulo, peso: L.pesoDoPasso(x, formato) })),
        layoutGuardado: {
            existe: !!guardado, atualizadoEm: guardado?.updatedAt || null, atualizadoPor,
            passosNovos: rec?.passosNovos || [], passosRemovidos: rec?.passosRemovidos || [],
        },
        nomeArquivo: nomeArquivo(d, formato),
    };
}

// ───────── cache, fila e freio ─────────
const CACHE_MAX = 12, CACHE_BYTES = 30 * 1024 * 1024, CACHE_TTL = 10 * 60 * 1000;
const cache = new Map(); // chave -> { buf, em }
function cacheGet(k) {
    const e = cache.get(k);
    if (!e) return null;
    if (Date.now() - e.em > CACHE_TTL) { cache.delete(k); return null; }
    cache.delete(k); cache.set(k, e); // LRU: renova
    return e.buf;
}
function cacheSet(k, buf) {
    cache.set(k, { buf, em: Date.now() });
    let total = 0;
    for (const e of cache.values()) total += e.buf.length;
    while (cache.size > CACHE_MAX || total > CACHE_BYTES) {
        const velho = cache.keys().next().value;
        total -= cache.get(velho).buf.length;
        cache.delete(velho);
        if (!cache.size) break;
    }
}

let ativos = 0;
const fila = [];
async function comVaga(fn) {
    if (ativos >= 2) {
        await new Promise((resolve, reject) => {
            const item = { resolve: null };
            const t = setTimeout(() => {
                const i = fila.indexOf(item);
                if (i >= 0) fila.splice(i, 1);
                reject(new ErroCF(503, 'PDF_OCUPADO', 'Estamos montando outros PDFs agora. Tente de novo em alguns segundos.'));
            }, 15000);
            item.resolve = () => { clearTimeout(t); resolve(); };
            fila.push(item);
        });
    }
    else ativos += 1; // com vaga livre: ocupa já; quem esperou recebe a vaga passada adiante (ativos não cai)
    try { return await fn(); }
    finally {
        const prox = fila.shift();
        if (prox) prox.resolve(); // a vaga passa direto para o próximo (ativos continua contado)
        else ativos -= 1;
    }
}

const usos = new Map(); // vendedorId -> [timestamps]
setInterval(() => { const ag = Date.now(); for (const [k, l] of usos) if (!l.some(t => ag - t < 60000)) usos.delete(k); }, 60000).unref();
function freio(vendedorId, max = 20) {
    const agora = Date.now();
    const lista = (usos.get(vendedorId) || []).filter(t => agora - t < 60000);
    if (!lista.length) usos.delete(vendedorId);
    if (lista.length >= max) throw new ErroCF(429, 'MUITOS_PDFS', 'Muitos PDFs em pouco tempo. Espere um minuto.');
    lista.push(agora);
    usos.set(vendedorId, lista);
}

// ───────── desenho: peças comuns ─────────
function qrVetorial(doc, url, xMm, yMm, tamMm, fundoBranco = true) {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const quiet = 1;
    const mod = tamMm / (n + 2 * quiet);
    if (fundoBranco) doc.roundedRect(p(xMm), p(yMm), p(tamMm), p(tamMm), p(1.5)).fill('#ffffff');
    doc.fillColor('#000000');
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) doc.rect(p(xMm + (c + quiet) * mod), p(yMm + (r + quiet) * mod), p(mod) + 0.15, p(mod) + 0.15).fill();
    }
}

function texto(doc, t, x, y, w, { fonte = REG, pt = 9, cor = '#111111', align = 'left', altura } = {}) {
    doc.font(fonte).fontSize(pt).fillColor(cor);
    const op = { width: p(w), lineGap: 0, align };
    if (altura) { op.height = p(altura); op.ellipsis = true; }
    doc.text(t, p(x), p(y), op);
}

function quadroFoto(doc, x, y, w, h, dica, cinza = true) {
    doc.save();
    doc.roundedRect(p(x), p(y), p(w), p(h), p(1)).fill('#f3f4f6');
    doc.roundedRect(p(x), p(y), p(w), p(h), p(1)).dash(p(1.2), { space: p(1.2) }).lineWidth(0.8).strokeColor('#94a3b8').stroke().undash();
    doc.restore();
    if (dica && w > 12 && h > 7) {
        const pt = Math.min(9, Math.max(6, h / 3.2));
        const hh = Math.min(h - 2, medidor.h(dica, 'B', pt, w - 4));
        texto(doc, dica, x + 2, y + (h - hh) / 2, w - 4, { fonte: NEG, pt, cor: cinza ? '#64748b' : '#111', align: 'center', altura: h - 2 });
    }
}

function desenharFoto(doc, buf, x, y, w, h, dicaVazia) {
    if (!buf) { quadroFoto(doc, x, y, w, h, dicaVazia); return; }
    try {
        // FOTO INTEIRA ("contain"), centralizada no quadro, sobre fundo cinza-claro: nenhuma borda é cortada
        doc.roundedRect(p(x), p(y), p(w), p(h), p(1)).fill('#F3F4F6');
        const folga = 0.6;
        doc.image(buf, p(x + folga), p(y + folga), { fit: [p(w - 2 * folga), p(h - 2 * folga)], align: 'center', valign: 'center' });
        doc.roundedRect(p(x), p(y), p(w), p(h), p(1)).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
    } catch (e) {
        quadroFoto(doc, x, y, w, h, 'foto ilegível');
    }
}

/** carrega (em série) a primeira foto de cada passo usado: Map passoId -> Buffer|null */
async function carregarFotos(passos) {
    const mapa = new Map();
    for (const ps of passos) {
        const rel = ps.fotos[0];
        mapa.set(ps.id, rel ? await prepararFoto(rel) : null);
    }
    return mapa;
}

const dicaDoQuadro = (ps) => (ps.fotos.length ? (sharpDisponivel() ? 'foto não encontrada' : 'foto indisponível') : (ps.dica || 'sem foto'));

// ───────── CARTAZ ─────────
function desenharCartaz(doc, d, v, ctx, fotos, meta) {
    const geo = ctx.geoCartaz;
    const { N, url, impressoEm, por } = meta;
    const compacto = v.arranjo.compacto;
    const rev = fmtData(maisMeses(d.publicadaEm, 12));
    v.arranjo.paginas.forEach((pg, i) => {
        const passos = pg.passoIds.map(id => d.flat.find(x => x.id === id));
        doc.addPage({ size: 'A4', margin: 0 });
        // cabeçalho verde (sangra até a borda)
        doc.rect(0, 0, p(210), p(L.CZ.HEAD)).fill(VERDE);
        const tituloPag = pg.titulo && !/^P[aá]gina \d+$/i.test(pg.titulo) ? ` · ${pg.titulo}` : '';
        let sub = `Página ${i + 1} de ${N}${tituloPag}`;
        if (N === 1 && !tituloPag && d.doc.objetivo) sub = L.limparTextoPdf(d.doc.objetivo).split(/(?<=[.!?])\s/)[0].slice(0, 90);
        let fs = 26; const tw = 105;
        const tit = d.titulo.toUpperCase();
        while (fs > 14 && medidor.h(tit, 'B', fs, tw) > 2 * fs * 1.15 / 2.835) fs -= 2;
        texto(doc, tit, 9, 6, tw, { fonte: NEG, pt: fs, cor: '#ffffff' });
        const hTit = medidor.h(tit, 'B', fs, tw);
        texto(doc, sub, 9, Math.min(6 + hTit + 1.5, 26), tw, { pt: 11, cor: '#d4e9e2', altura: 6 });
        const info = [[d.codigo ? `${d.codigo} · versão ${d.versao.numero}` : `versão ${d.versao.numero}`, NEG], [d.setoresNomes.join(' · '), REG], [`Aprovada em ${fmtData(d.publicadaEm)}`, REG]].filter(x => x[0]);
        let yi = 6;
        for (const [t, f] of info) { texto(doc, t, 118, yi, 54, { fonte: f, pt: 8.5, cor: '#d4e9e2', align: 'right', altura: 9 }); yi += Math.min(9, medidor.h(t, f === NEG ? 'B' : 'R', 8.5, 54)) + 1; }
        qrVetorial(doc, url, 177, 4, 26);

        let y = L.CZ.HEAD + 3;
        if (geo.avisoH) {
            doc.roundedRect(p(L.CZ.ML), p(y), p(L.CZ.W), p(geo.avisoH), p(1.5)).fill(VERMELHO);
            texto(doc, geo.aviso, L.CZ.ML + 4, y + 2, L.CZ.W - 8, { fonte: NEG, pt: 10, cor: '#ffffff', altura: geo.avisoH - 3 });
            y += geo.avisoH + 2;
        }
        // cartões
        const linhas = L.linhasCartaz(passos, medidor, compacto);
        const ex = L.expandirCartaz(linhas, geo.corpoH);
        let yy = y;
        linhas.forEach((ln, li) => {
            const rowH = ex.alturas[li];
            let xx = L.CZ.ML;
            ln.celulas.forEach((c) => {
                const ps = c.passo;
                const cor = ps.perigo ? VERMELHO : VERDE;
                doc.roundedRect(p(xx), p(yy), p(c.w), p(rowH), p(3)).lineWidth(p(0.6)).strokeColor(cor).stroke();
                doc.circle(p(xx + L.CZ.PAD + L.CZ.NUM / 2), p(yy + L.CZ.PAD + L.CZ.NUM / 2), p(L.CZ.NUM / 2)).fill(cor);
                texto(doc, String(ps.n), xx + L.CZ.PAD, yy + L.CZ.PAD + (L.CZ.NUM - 19 * 0.3528) / 2 - 0.2, L.CZ.NUM, { fonte: NEG, pt: 19 * (ps.n > 9 ? 0.78 : 1), cor: '#ffffff', align: 'center' });
                const ty = yy + L.CZ.PAD + Math.max(0, (c.top - medidor.h(ps.texto, 'B', c.fs, c.textW)) / 2);
                texto(doc, ps.texto, xx + L.CZ.PAD + L.CZ.NUM + 3, ty, c.textW, { fonte: NEG, pt: c.fs, cor: '#111111' });
                const detH = ex.comDetalhe ? c.detH : 0;
                const fy = yy + L.CZ.PAD + c.top + 2;
                const fh = rowH - (fy - yy) - L.CZ.PAD - detH;
                desenharFoto(doc, fotos.get(ps.id), xx + L.CZ.PAD, fy, c.w - 2 * L.CZ.PAD, Math.max(8, fh), dicaDoQuadro(ps));
                if (detH) texto(doc, ps.detalhe, xx + L.CZ.PAD, yy + rowH - L.CZ.PAD - detH + 0.6, c.w - 2 * L.CZ.PAD, { pt: 9, cor: CINZA });
                xx += c.w + L.CZ.COLGAP;
            });
            yy += rowH + ex.gap;
        });
        // faixa NÃO FAZER (em todas as páginas: cada folha pode ir sozinha para a parede)
        if (geo.naoH) {
            const ny = L.A4H - L.CZ.ROD - 1 - geo.naoH;
            doc.roundedRect(p(L.CZ.ML), p(ny), p(L.CZ.W), p(geo.naoH), p(3)).fill(VERMELHO);
            texto(doc, 'NÃO FAZER', L.CZ.ML + 5, ny + (geo.naoH - 5.5) / 2, 34, { fonte: NEG, pt: 15, cor: '#ffffff' });
            const th = Math.min(geo.naoH - 4, medidor.h(geo.nao, 'B', 11, L.CZ.W - 48));
            texto(doc, geo.nao, L.CZ.ML + 42, ny + (geo.naoH - th) / 2, L.CZ.W - 48, { fonte: NEG, pt: 11, cor: '#ffffff', altura: geo.naoH - 3 });
        }
        // rodapé
        const ry = L.A4H - L.CZ.ROD;
        doc.moveTo(p(L.CZ.ML), p(ry)).lineTo(p(210 - L.CZ.ML), p(ry)).lineWidth(0.4).strokeColor('#cbd5e1').stroke();
        const enc = d.encarregados.length ? `${d.encarregados.length > 1 ? 'Encarregados' : 'Encarregado(a)'}: ${d.encarregados.join(', ')} · ` : '';
        texto(doc, `${enc}Revisar até ${rev}`, L.CZ.ML, ry + 1.2, 120, { pt: 7.5, cor: CINZA, altura: 4 });
        texto(doc, `Impresso em ${impressoEm}${por ? ` por ${por}` : ''}`, L.CZ.ML, ry + 4.6, 120, { pt: 7, cor: '#6b7280', altura: 4 });
        texto(doc, `Hardt Salgados · Como Fazer · pág. ${i + 1}/${N}`, 120, ry + 1.2, 81, { pt: 7.5, cor: CINZA, align: 'right' });
    });
}

// ───────── FICHÁRIO ─────────
function celulaBorda(doc, x, y, w, h, fill) {
    if (fill) doc.rect(p(x), p(y), p(w), p(h)).fill(fill);
    doc.rect(p(x), p(y), p(w), p(h)).lineWidth(0.8).strokeColor('#475569').stroke();
}
function barraSecao(doc, y, titulo) {
    doc.rect(p(L.FI.ML), p(y), p(L.FI.W), p(L.FI.SEC_H)).fill(VERDE);
    texto(doc, titulo, L.FI.ML + 2, y + 1.15, L.FI.W - 4, { fonte: NEG, pt: 9, cor: '#ffffff' });
}
function cabTabela(doc, y, colunas) {
    let x = L.FI.ML;
    for (const [nome, peso] of colunas) {
        const w = L.FI.W * peso;
        celulaBorda(doc, x, y, w, L.FI.THEAD, '#e5e7eb');
        texto(doc, nome, x + 1.5, y + 1.5, w - 3, { fonte: NEG, pt: 8, altura: L.FI.THEAD - 1 });
        x += w;
    }
}

function desenharCabecalho1(doc, d, meta) {
    const { ML, MT, W } = L.FI;
    const wl = 28, wm = 40, wt = W - wl - wm;
    celulaBorda(doc, ML, MT, wl, 26);
    texto(doc, 'Hardt\nSalgados', ML, MT + 8, wl, { fonte: NEG, pt: 11, align: 'center' });
    celulaBorda(doc, ML + wl, MT, wt, 26);
    texto(doc, 'PROCEDIMENTO OPERACIONAL PADRÃO', ML + wl + 2, MT + 3, wt - 4, { fonte: NEG, pt: 9, align: 'center', cor: CINZA });
    let fs = 15; const tit = d.titulo.toUpperCase();
    while (fs > 9 && medidor.h(tit, 'B', fs, wt - 4) > 15) fs -= 1;
    const th = medidor.h(tit, 'B', fs, wt - 4);
    texto(doc, tit, ML + wl + 2, MT + 8 + Math.max(0, (16 - th) / 2), wt - 4, { fonte: NEG, pt: fs, align: 'center', altura: 17 });
    const xm = ML + wl + wt;
    [['Código: ', d.codigo || '-'], ['Versão: ', String(d.versao.numero)], ['Página: ', `1 de ${meta.N}`]].forEach(([r, val], i) => {
        const h = i === 0 ? 10 : 8; const y = MT + (i === 0 ? 0 : 10 + (i - 1) * 8);
        celulaBorda(doc, xm, y, wm, h);
        doc.font(REG).fontSize(8.5).fillColor('#111');
        doc.text(r, p(xm + 1.5), p(y + h / 2 - 1.6), { continued: true, lineGap: 0 });
        doc.font(NEG).text(val, { width: p(wm - 3), lineGap: 0 });
    });
    const y4 = MT + 26, w1 = 70, w2 = 62, w3 = W - w1 - w2;
    const celulas4 = [
        ['Setor: ', d.setoresNomes.join(' · ') || '-', w1], ['Aprovado por: ', `${d.publicadaPor || '-'} em ${fmtData(d.publicadaEm)}`, w2], ['Revisar até: ', fmtData(maisMeses(d.publicadaEm, 12)), w3],
    ];
    let x4 = ML;
    for (const [r, val, w] of celulas4) {
        celulaBorda(doc, x4, y4, w, 8);
        const t = `${r}${val}`;
        texto(doc, t, x4 + 1.5, y4 + 1.6, w - 3, { pt: 7.5, altura: 6 });
        x4 += w;
    }
}
function desenharCabecalho2(doc, d, titulo, pagina, N) {
    const { ML, MT, W } = L.FI;
    const wl = 28, wm = 40, wt = W - wl - wm;
    celulaBorda(doc, ML, MT, wl, 16);
    texto(doc, 'Hardt\nSalgados', ML, MT + 3.5, wl, { fonte: NEG, pt: 10, align: 'center' });
    celulaBorda(doc, ML + wl, MT, wt, 16);
    texto(doc, d.titulo.toUpperCase(), ML + wl + 2, MT + 2.5, wt - 4, { fonte: NEG, pt: 11, align: 'center', altura: 7 });
    if (titulo) texto(doc, titulo, ML + wl + 2, MT + 10, wt - 4, { pt: 8.5, align: 'center', cor: CINZA, altura: 4.5 });
    celulaBorda(doc, ML + wl + wt, MT, wm, 8);
    texto(doc, `${d.codigo ? `${d.codigo} · ` : ''}v${d.versao.numero}`, ML + wl + wt + 1.5, MT + 2, wm - 3, { fonte: NEG, pt: 8.5, altura: 5 });
    celulaBorda(doc, ML + wl + wt, MT + 8, wm, 8);
    texto(doc, `Página ${pagina} de ${N}`, ML + wl + wt + 1.5, MT + 10, wm - 3, { fonte: NEG, pt: 8.5, altura: 5 });
}

function desenharRodapeFichario(doc, d, meta, pagina) {
    const { ML, W } = L.FI;
    const y = 270;
    doc.moveTo(p(ML), p(y)).lineTo(p(ML + W - 18), p(y)).lineWidth(0.4).strokeColor('#475569').stroke();
    texto(doc, `${d.codigo ? `${d.codigo} · ` : ''}v${d.versao.numero} · Impresso em ${meta.impressoEm}${meta.por ? ` por ${meta.por}` : ''}`, ML, y + 1.6, W - 20, { pt: 7.5, altura: 4 });
    texto(doc, `Página ${pagina} de ${meta.N}`, ML, y + 5.6, W - 20, { pt: 7.5, cor: '#6b7280' });
    qrVetorial(doc, meta.url, ML + W - 14, y + 1, 14, false);
}

function desenharLinhaTabela(doc, y, h, colunas, celulas, { negritoPrimeira = false } = {}) {
    let x = L.FI.ML;
    colunas.forEach((peso, i) => {
        const w = L.FI.W * peso;
        celulaBorda(doc, x, y, w, h);
        if (celulas[i]) texto(doc, celulas[i], x + 1.5, y + L.FI.PAD, w - 3, { fonte: negritoPrimeira && i === 0 ? NEG : REG, pt: 9, altura: h - 1 });
        x += w;
    });
}

function desenharFichario(doc, d, v, ctx, fotos, meta) {
    const plano = v.planoFichario;
    const ficha = ctx.ficha;
    const { ML, W } = L.FI;
    const nArr = v.arranjo.paginas.length;
    const fech = plano.fechamento;
    for (let i = 0; i < plano.total; i++) {
        doc.addPage({ size: 'A4', margin: 0 });
        const pgArr = i < nArr ? v.arranjo.paginas[i] : null;
        const tituloPag = pgArr && pgArr.titulo && !/^P[aá]gina \d+$/i.test(pgArr.titulo) ? pgArr.titulo : (pgArr ? '' : 'Revisões e treinamento');
        if (i === 0) {
            desenharCabecalho1(doc, d, meta);
            let y = L.FI.MT + L.FI.CAB1;
            plano.pre.forEach((s, idx) => {
                y += L.FI.SEC_GAP; barraSecao(doc, y, `${idx + 1}. ${{ objetivo: 'OBJETIVO', executa: 'QUEM EXECUTA / QUEM SUPERVISIONA', materiais: 'MATERIAIS E EPI' }[s.k]}`);
                y += L.FI.SEC_H + 1.5;
                const h = medidor.h(s.texto, 'R', 9, W);
                texto(doc, s.texto, ML, y, W, { pt: 9 });
                y += h + 1;
            });
            y += L.FI.SEC_GAP; barraSecao(doc, y, `${plano.pre.length + 1}. PROCEDIMENTO`);
        } else {
            desenharCabecalho2(doc, d, tituloPag, i + 1, meta.N);
            if (pgArr) barraSecao(doc, L.FI.MT + L.FI.CAB2 + L.FI.SEC_GAP, `${plano.pre.length + 1}. PROCEDIMENTO (continuação)`);
        }
        if (pgArr) {
            const pg = plano.paginas[i];
            const cab = [['Nº', L.FI.NUMW / W], ['O que fazer', 0], ['Fotos', 0]];
            const thumb = 13 * pg.s;
            const wFoto = thumb + 5, wTxt = W - L.FI.NUMW - wFoto;
            let y = pg.y0 - L.FI.THEAD;
            let x = ML;
            [['Nº', L.FI.NUMW], ['O que fazer', wTxt], ['Fotos', wFoto]].forEach(([nome, w]) => { celulaBorda(doc, x, y, w, L.FI.THEAD, '#e5e7eb'); texto(doc, nome, x + 1.5, y + 1.5, w - 3, { fonte: NEG, pt: 8 }); x += w; });
            y = pg.y0;
            pg.passos.forEach((ps, ri) => {
                const h = pg.alturas[ri];
                celulaBorda(doc, ML, y, L.FI.NUMW, h);
                texto(doc, String(ps.n), ML, y + h / 2 - 2, L.FI.NUMW, { fonte: NEG, pt: 11, align: 'center' });
                celulaBorda(doc, ML + L.FI.NUMW, y, wTxt, h);
                const tw = wTxt - 4;
                texto(doc, ps.texto, ML + L.FI.NUMW + 2, y + L.FI.PAD, tw, { fonte: NEG, pt: 9 * pg.s, cor: ps.perigo ? VERMELHO : '#111111' });
                if (ps.detalhe) texto(doc, ps.detalhe, ML + L.FI.NUMW + 2, y + L.FI.PAD + medidor.h(ps.texto, 'B', 9 * pg.s, tw) + 0.5, tw, { pt: 9 * pg.s - 0.5, cor: CINZA });
                celulaBorda(doc, ML + L.FI.NUMW + wTxt, y, wFoto, h);
                desenharFoto(doc, fotos.get(ps.id), ML + L.FI.NUMW + wTxt + 2.5, y + (h - thumb) / 2, thumb, thumb, ps.fotos.length ? 'perdida' : 'foto');
                y += h;
            });
        }
        // fechamento desta folha
        if (fech) {
            let numero = fech.numeroProximo;
            for (const pos of fech.resultado.pos) {
                if (fech.pagBase + pos.pag !== i) continue;
                const b = pos.bloco;
                if (b.tipo === 'titulo') { barraSecao(doc, pos.y + L.FI.SEC_GAP, b.texto); }
                else if (b.tipo === 'nao') {
                    doc.rect(p(ML), p(pos.y), p(W), p(b.h)).lineWidth(1.4).fillAndStroke('#fef2f2', VERMELHO);
                    texto(doc, b.texto, ML + 3, pos.y + 2, W - 6, { pt: 9 });
                } else if (b.tipo === 'cab') cabTabela(doc, pos.y, b.colunas);
                else if (b.tipo === 'linha') desenharLinhaTabela(doc, pos.y, b.h, b.pesos, b.celulas);
            }
        }
        desenharRodapeFichario(doc, d, meta, i + 1);
    }
}

// ───────── geração ─────────
function renderizar(fn) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: '', Creator: 'Hardt Salgados - Como Fazer' } });
        const partes = [];
        doc.on('data', (b) => partes.push(b));
        doc.on('end', () => resolve(Buffer.concat(partes)));
        doc.on('error', reject);
        Promise.resolve().then(() => fn(doc)).then(() => doc.end()).catch((e) => { try { doc.end(); } catch (_) { /* já fechado */ } reject(e); });
    });
}

async function gerar(id, body = {}, cf, req) {
    const t0 = Date.now();
    freio(cf?.vendedorId || 'anon');
    const formato = parseFormato(body.formato);
    if (!body.arranjo) throw new ErroCF(400, 'ARRANJO_MALFORMADO', 'Envie as páginas montadas (arranjo).');
    const arranjoIn = entradaArranjo(body.arranjo);
    if (formato !== 'CARTAZ') arranjoIn.compacto = false;
    const d = await carregar(id, formato);
    const ctx = montarCtx(d, formato);
    const v = L.validarArranjo(arranjoIn, ctx);
    if (v.bloqueios.length) {
        const prim = v.bloqueios.find(b => b.tipo === 'PAGINA_ESTOURADA');
        throw new ErroCF(422, 'ARRANJO_INVALIDO', v.bloqueios[0].mensagem, { bloqueios: v.bloqueios, ...(prim ? { pagina: prim.pagina, excesso: prim.excesso } : {}) });
    }
    if (v.foraDasPaginas.length && body.confirmarOmitidos !== true) {
        throw new ErroCF(422, 'PASSOS_FORA_SEM_CONFIRMACAO', 'Há passos fora das páginas. Confirme que quer imprimir sem eles.', { passoIds: v.foraDasPaginas });
    }
    const nomes = await nomesDeVendedores([cf?.vendedorId]);
    const por = L.limparTextoPdf(nomes.get(cf?.vendedorId) || '');
    const hoje = fmtData(new Date());
    const meta = { N: v.totalPaginas, url: `${baseUrl()}/como-fazer/c/${d.c.id}`, impressoEm: hoje, por };
    const trein = formato === 'FICHARIO' ? JSON.stringify([d.treinados, d.revisoes]) : '';
    const chave = [d.c.id, d.versao.id, formato, L.hashArranjo(v.arranjo), hoje, por, meta.url, trein, d.c.updatedAt?.getTime?.() || ''].join('|');
    let buf = cacheGet(chave);
    let doCache = true;
    if (!buf) {
        doCache = false;
        buf = await comVaga(async () => {
            const usados = v.arranjo.paginas.flatMap(pg => pg.passoIds).map(pid => d.flat.find(x => x.id === pid));
            const fotos = await carregarFotos(usados);
            return renderizar((doc) => (formato === 'CARTAZ' ? desenharCartaz(doc, d, v, ctx, fotos, meta) : desenharFichario(doc, d, v, ctx, fotos, meta)));
        });
        cacheSet(chave, buf);
    }
    console.log(`[ComoFazer][pdf] conteudo=${d.c.id} formato=${formato} paginas=${meta.N} bytes=${buf.length} cache=${doCache} vendedor=${cf?.vendedorId} ${Date.now() - t0}ms`);
    return { buffer: buf, nomeArquivo: nomeArquivo(d, formato) };
}

// ───────── arranjo guardado (rotas GET/PUT/DELETE) ─────────
async function arranjoObter(id, query) {
    const formato = parseFormato(query?.formato);
    const d = await carregar(id, formato);
    const g = await layoutGuardado(id, formato);
    if (!g) return { existe: false, arranjo: null, atualizadoEm: null, atualizadoPor: null, passosNovos: [], passosRemovidos: [] };
    const rec = L.reconciliar(g.layout, d.flat);
    const por = g.atualizadoPorId ? (await nomesDeVendedores([g.atualizadoPorId])).get(g.atualizadoPorId) : null;
    return {
        existe: true, arranjo: { ...rec.arranjo, foraDasPaginas: rec.foraDasPaginas }, atualizadoEm: g.updatedAt, atualizadoPor: por || null,
        passosNovos: rec.passosNovos, passosRemovidos: rec.passosRemovidos,
    };
}

async function arranjoSalvar(id, body = {}, cf) {
    const formato = parseFormato(body.formato);
    const a = entradaArranjo(body.arranjo);
    if (formato !== 'CARTAZ') a.compacto = false;
    const d = await carregar(id, formato);
    const conhecidos = d.flat.map(x => x.id);
    const layout = { paginas: a.paginas, compacto: a.compacto, conhecidos };
    const g = await prisma.comoFazerLayoutImpressao.upsert({
        where: { conteudoId_formato: { conteudoId: id, formato } },
        create: { conteudoId: id, formato, layout, atualizadoPorId: cf?.vendedorId || null },
        update: { layout, atualizadoPorId: cf?.vendedorId || null },
    });
    const por = cf?.vendedorId ? (await nomesDeVendedores([cf.vendedorId])).get(cf.vendedorId) : null;
    const rec = L.reconciliar(layout, d.flat);
    return { existe: true, arranjo: { ...rec.arranjo, foraDasPaginas: rec.foraDasPaginas }, atualizadoEm: g.updatedAt, atualizadoPor: por || null, passosNovos: [], passosRemovidos: rec.passosRemovidos };
}

async function arranjoApagar(id, query) {
    const formato = parseFormato(query?.formato);
    const c = await prisma.comoFazerConteudo.findUnique({ where: { id }, select: { id: true } });
    if (!c) throw new ErroCF(404, 'NAO_ENCONTRADO', 'Conteúdo não encontrado.');
    await prisma.comoFazerLayoutImpressao.deleteMany({ where: { conteudoId: id, formato } });
    return { existe: false };
}

module.exports = { previa, gerar, arranjoObter, arranjoSalvar, arranjoApagar };
