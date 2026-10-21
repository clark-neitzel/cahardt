/**
 * Anexos genéricos (tabela `anexos`) — F1: Contas a Pagar.
 *
 * - Arquivos novos ficam em backend/uploads/anexos/<entidadeTipo>/<yyyy-mm>/<hex16>.<ext>
 *   (`../uploads` a partir de services/ = pasta PERSISTIDA entre deploys. Nunca `../../`).
 * - `caminho` no banco: relativo a backend/uploads quando está lá dentro (ex.: 'anexos/CONTA_PAGAR/2026-10/ab.pdf');
 *   absoluto só para PDF legado que ficou fora do volume (pasta antiga).
 * - Soft delete; o arquivo só sai do disco quando nenhum anexo ativo aponta para o mesmo `caminho`.
 * - sha256 NÃO é único: duplicidade vira AVISO, nunca bloqueio.
 * - Serve o arquivo só por rota autenticada (nunca por /uploads público).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const prisma = require('../config/database');

const UPLOADS_ROOT = path.join(__dirname, '../uploads');
const ANEXOS_DIR = path.join(UPLOADS_ROOT, 'anexos');
const TMP_DIR = path.join(ANEXOS_DIR, '_tmp');
const PDF_DIR = path.join(UPLOADS_ROOT, 'contas-pagar');
const PDF_DIR_LEGADO = path.join(__dirname, '../../uploads/contas-pagar'); // só LEITURA de arquivo antigo

const LIMITE_BYTES = 30 * 1024 * 1024;
const TIPOS = ['COMPROVANTE', 'NF', 'BOLETO', 'CONTRATO', 'OUTRO'];
const ENTIDADES = ['CONTA_PAGAR', 'DESPESA', 'NOTA_ENTRADA'];

try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (e) { console.warn('[Anexos] não criou pasta temp:', e.message); }

class AnexoErro extends Error {
    constructor(mensagem, codigo, status = 400) {
        super(mensagem);
        this.codigo = codigo;
        this.status = status;
    }
}

// ── detecção de tipo real pelo conteúdo (magic number) ──────────────────────────
const MIMES_DECLARADOS = {
    pdf: ['application/pdf'],
    jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
    png: ['image/png'],
    webp: ['image/webp'],
    xml: ['text/xml', 'application/xml', 'application/x-xml']
};
const CANONICO = {
    pdf: { mime: 'application/pdf', ext: 'pdf' },
    jpeg: { mime: 'image/jpeg', ext: 'jpg' },
    png: { mime: 'image/png', ext: 'png' },
    webp: { mime: 'image/webp', ext: 'webp' },
    xml: { mime: 'application/xml', ext: 'xml' }
};

function detectarPeloConteudo(head) {
    if (head.length >= 5 && head.slice(0, 5).toString('latin1') === '%PDF-') return 'pdf';
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
    if (head.length >= 8 && head.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (head.length >= 12 && head.slice(0, 4).toString('latin1') === 'RIFF' && head.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
    // XML: só XML "de documento fiscal": declaração <?xml ou raiz de NF-e/CT-e/evento.
    // HTML e SVG (podem executar script) nunca passam, mesmo com mime de xml.
    let txt = head;
    if (txt.length >= 3 && txt[0] === 0xef && txt[1] === 0xbb && txt[2] === 0xbf) txt = txt.slice(3);
    if (txt.length > 0 && !txt.includes(0x00)) {
        const ini = txt.toString('utf8').trimStart();
        const baixo = ini.toLowerCase();
        const raizOk = baixo.startsWith('<?xml') || /^<(nfeproc|nfe|proceventonfe|cte|cteproc|procinutnfe)[\s>]/.test(baixo);
        const perigoso = /<!doctype\s+html|<html[\s>]|<svg[\s>]|<script[\s>]|<!entity|\bsystem\s+["']|<!doctype[^>]*\[/.test(baixo); // inclui XXE
        if (raizOk && !perigoso) return 'xml';
    }
    return null;
}

function lerCabecalho(arquivo, n = 4096) {
    const fd = fs.openSync(arquivo, 'r');
    try {
        const buf = Buffer.alloc(n);
        const lidos = fs.readSync(fd, buf, 0, n, 0);
        return buf.slice(0, lidos);
    } finally {
        fs.closeSync(fd);
    }
}

function sha256DoArquivo(arquivo) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('sha256');
        const s = fs.createReadStream(arquivo);
        s.on('error', reject);
        s.on('data', (d) => h.update(d));
        s.on('end', () => resolve(h.digest('hex')));
    });
}

/** multer 1.x entrega originalname em latin1; "JoÃ£o" -> "João". Só converte se o resultado for UTF-8 válido. */
function corrigirNome(nome) {
    const n = String(nome || '');
    try {
        const conv = Buffer.from(n, 'latin1').toString('utf8');
        return conv.includes('\uFFFD') ? n : conv;
    } catch (_) { return n; }
}

const apagarSilencioso = (p) => { try { if (p) fs.unlinkSync(p); } catch (_) { /* já não existe */ } };

// ── caminhos ────────────────────────────────────────────────────────────────────
function paraCaminhoGravado(abs) {
    const rel = path.relative(UPLOADS_ROOT, abs);
    return (!rel.startsWith('..') && !path.isAbsolute(rel)) ? rel.split(path.sep).join('/') : abs;
}

/** Resolve o caminho gravado no banco para um arquivo existente (ou null se sumiu). */
function resolverCaminho(caminho) {
    if (!caminho) return null;
    const abs = path.isAbsolute(caminho) ? caminho : path.join(UPLOADS_ROOT, caminho);
    if (fs.existsSync(abs)) return abs;
    // PDF legado: pode estar na pasta nova ou na antiga (mesma lógica de contasPagar.localizarPdf)
    const nome = path.basename(caminho);
    for (const dir of [PDF_DIR, PDF_DIR_LEGADO]) {
        const alt = path.join(dir, nome);
        if (fs.existsSync(alt)) return alt;
    }
    return null;
}

// ── formatação p/ a API (nunca expõe o caminho) ────────────────────────────────
function formatar(a, { usuario, podeEscrever } = {}) {
    const ehAdmin = !!usuario?.admin;
    return {
        id: a.id,
        entidadeTipo: a.entidadeTipo,
        entidadeId: a.entidadeId,
        tipo: a.tipo,
        nomeOriginal: a.nomeOriginal,
        mime: a.mime,
        tamanho: a.tamanho,
        sha256: a.sha256,
        ehImagem: a.mime.startsWith('image/'),
        ehPdf: a.mime === 'application/pdf',
        ehXml: a.mime.includes('xml'),
        legado: !!a.chaveLegado,
        criadoEm: a.criadoEm,
        criadoPorId: a.criadoPorId,
        criadoPorNome: a.criadoPorNome,
        urlArquivo: `/api/anexos/${a.id}/arquivo`,
        // anexo do PDF antigo (legado) não tem autor: quem tem escrita remove (como antes da F1)
        podeRemover: !!podeEscrever && (ehAdmin || !!a.chaveLegado || (!!usuario?.id && usuario.id === a.criadoPorId))
    };
}

// ── salvar ──────────────────────────────────────────────────────────────────────
/**
 * @param arquivo  { path (temporário do multer), originalname, mimetype, size }
 * @returns { anexo, avisos: [{codigo, mensagem, ...}] }
 * Move o temporário para a pasta definitiva. Em erro, apaga o temporário e lança AnexoErro.
 */
async function salvar({ entidadeTipo, entidadeId, tipo = 'OUTRO', arquivo, usuario }) {
    try {
        if (!ENTIDADES.includes(entidadeTipo)) throw new AnexoErro('Tipo de entidade inválido.', 'ENTIDADE_INVALIDA');
        if (!TIPOS.includes(tipo)) throw new AnexoErro(`Tipo de anexo inválido. Use: ${TIPOS.join(', ')}.`, 'TIPO_INVALIDO');
        const nome = corrigirNome(arquivo.originalname) || 'arquivo';
        const stat = fs.statSync(arquivo.path);
        if (stat.size === 0) throw new AnexoErro(`"${nome}" está vazio.`, 'ARQUIVO_INVALIDO');
        if (stat.size > LIMITE_BYTES) throw new AnexoErro(`"${nome}" tem mais de 30 MB. Reduza o arquivo e tente de novo.`, 'ARQUIVO_GRANDE', 413);

        const real = detectarPeloConteudo(lerCabecalho(arquivo.path));
        if (!real) throw new AnexoErro(`"${nome}" não é um arquivo aceito. Envie PDF, foto (JPG, PNG, WebP) ou XML.`, 'ARQUIVO_INVALIDO');
        const declarado = String(arquivo.mimetype || '').toLowerCase();
        if (!MIMES_DECLARADOS[real].includes(declarado)) {
            throw new AnexoErro(`"${nome}" não confere: o conteúdo é ${CANONICO[real].ext.toUpperCase()}, mas veio como "${declarado || 'desconhecido'}". Arquivo recusado.`, 'ARQUIVO_INVALIDO');
        }
        const canon = CANONICO[real];

        const sha256 = await sha256DoArquivo(arquivo.path);

        const agora = new Date();
        const ym = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        const dir = path.join(__dirname, '../uploads/anexos', entidadeTipo, ym);
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, `${crypto.randomBytes(8).toString('hex')}.${canon.ext}`);
        try {
            fs.renameSync(arquivo.path, destino);
        } catch (e) {
            fs.copyFileSync(arquivo.path, destino);
            apagarSilencioso(arquivo.path);
        }

        let criado;
        try {
            criado = await prisma.anexo.create({
                data: {
                    entidadeTipo, entidadeId, tipo,
                    nomeOriginal: nome.slice(0, 255),
                    mime: canon.mime,
                    tamanho: stat.size,
                    sha256,
                    caminho: paraCaminhoGravado(destino),
                    criadoPorId: usuario?.id || null,
                    criadoPorNome: usuario?.nome || null
                }
            });
        } catch (e) {
            apagarSilencioso(destino); // não deixa arquivo órfão se o banco falhou
            throw e;
        }

        const avisos = [];
        try {
            const iguais = await prisma.anexo.findMany({
                where: { sha256, ativo: true, NOT: { id: criado.id } },
                select: { id: true, entidadeTipo: true, entidadeId: true, nomeOriginal: true, criadoEm: true },
                take: 5
            });
            if (iguais.length) {
                avisos.push({
                    codigo: 'DUPLICADO',
                    mensagem: `Este arquivo já foi anexado ${iguais.length > 1 ? 'outras vezes' : 'antes'} no sistema.`,
                    iguais
                });
            }
        } catch (e) {
            console.warn('[Anexos] aviso de duplicidade falhou (anexo já salvo):', e.message);
        }
        return { anexo: criado, avisos };
    } catch (e) {
        apagarSilencioso(arquivo?.path); // se já foi movido, não existe mais (silencioso)
        throw e;
    }
}

// ── listar ──────────────────────────────────────────────────────────────────────
async function listar(entidadeTipo, entidadeId) {
    return prisma.anexo.findMany({
        where: { entidadeTipo, entidadeId, ativo: true },
        orderBy: { criadoEm: 'asc' }
    });
}

async function porId(id) {
    return prisma.anexo.findUnique({ where: { id } });
}

// ── abrir ───────────────────────────────────────────────────────────────────────
function abrirStream(anexo) {
    const abs = resolverCaminho(anexo.caminho);
    if (!abs) {
        throw new AnexoErro('O arquivo deste anexo não está mais no servidor (perdido numa atualização). Anexe o documento novamente.', 'ARQUIVO_PERDIDO', 404);
    }
    return { stream: fs.createReadStream(abs), caminhoAbs: abs };
}

function arquivoExiste(anexo) {
    return !!resolverCaminho(anexo.caminho);
}

// ── remover (soft) ──────────────────────────────────────────────────────────────
async function remover(anexo, usuario) {
    await prisma.anexo.update({
        where: { id: anexo.id },
        data: { ativo: false, removidoEm: new Date(), removidoPorId: usuario?.id || null }
    });
    let arquivoApagado = false;
    try {
        const outras = await prisma.anexo.count({ where: { caminho: anexo.caminho, ativo: true } });
        if (outras === 0) {
            const abs = resolverCaminho(anexo.caminho);
            if (abs) { apagarSilencioso(abs); arquivoApagado = true; }
        }
    } catch (e) {
        console.error('[Anexos] anexo removido, mas falhou ao apagar o arquivo:', e.message);
    }
    return { arquivoApagado };
}

async function alterarTipo(id, tipo) {
    if (!TIPOS.includes(tipo)) throw new AnexoErro(`Tipo de anexo inválido. Use: ${TIPOS.join(', ')}.`, 'TIPO_INVALIDO');
    return prisma.anexo.update({ where: { id }, data: { tipo } });
}

// ── dupla escrita com o pdfPath legado ──────────────────────────────────────────
/** abs = arquivo achado no disco, ou null (arquivo sumiu): o espelho nasce mesmo assim (tamanho 0, sha256 vazio)
 *  para lista, selo e modal concordarem; abrir devolve 404 ARQUIVO_PERDIDO. */
function dadosEspelhoPdf(contaId, abs, usuario, pdfPathGravado) {
    if (!abs) {
        return {
            entidadeTipo: 'CONTA_PAGAR',
            entidadeId: contaId,
            tipo: 'OUTRO',
            nomeOriginal: path.basename(pdfPathGravado || 'arquivo.pdf'),
            mime: 'application/pdf',
            tamanho: 0,
            sha256: '',
            caminho: pdfPathGravado,
            chaveLegado: `pdf:${contaId}`,
            criadoPorId: usuario?.id || null,
            criadoPorNome: usuario?.nome || 'Migração PDF legado'
        };
    }
    const st = fs.statSync(abs);
    return {
        entidadeTipo: 'CONTA_PAGAR',
        entidadeId: contaId,
        tipo: 'OUTRO',
        nomeOriginal: path.basename(abs),
        mime: 'application/pdf',
        tamanho: st.size,
        caminho: paraCaminhoGravado(abs),
        chaveLegado: `pdf:${contaId}`,
        criadoPorId: usuario?.id || null,
        criadoPorNome: usuario?.nome || 'Migração PDF legado'
    };
}

/** POST /:id/pdf gravou pdfPath → reflete em `anexos`. Nunca lança (o pdfPath é a fonte antiga). */
async function espelharPdfLegado(contaId, absPath, usuario) {
    try {
        const base = dadosEspelhoPdf(contaId, absPath, usuario);
        const sha256 = await sha256DoArquivo(absPath);
        await prisma.anexo.upsert({
            where: { chaveLegado: base.chaveLegado },
            create: { ...base, sha256 },
            update: { ...base, sha256, ativo: true, removidoEm: null, removidoPorId: null }
        });
    } catch (e) {
        console.error('[Anexos] falha ao espelhar PDF legado (pdfPath já gravado):', e.message);
    }
}

/** DELETE /:id/pdf → desativa o espelho. Não apaga arquivo (a rota antiga já cuida). Nunca lança. */
async function desativarEspelhoPdfLegado(contaId, usuario) {
    try {
        await prisma.anexo.updateMany({
            where: { chaveLegado: `pdf:${contaId}`, ativo: true },
            data: { ativo: false, removidoEm: new Date(), removidoPorId: usuario?.id || null }
        });
    } catch (e) {
        console.error('[Anexos] falha ao desativar espelho do PDF legado:', e.message);
    }
}

/** Garante o espelho de UMA conta (uso na listagem, caso o backfill ainda não tenha rodado). Nunca lança. */
async function garantirEspelhoDaConta(contaId) {
    try {
        const conta = await prisma.contaPagar.findUnique({ where: { id: contaId }, select: { pdfPath: true } });
        if (!conta?.pdfPath) return;
        const ja = await prisma.anexo.findUnique({ where: { chaveLegado: `pdf:${contaId}` }, select: { id: true } });
        if (ja) return;
        const abs = resolverCaminho(conta.pdfPath);
        const base = dadosEspelhoPdf(contaId, abs, null, conta.pdfPath);
        const sha256 = abs ? await sha256DoArquivo(abs) : '';
        await prisma.anexo.createMany({ data: [{ ...base, sha256 }], skipDuplicates: true });
    } catch (e) {
        console.error('[Anexos] garantirEspelhoDaConta:', e.message);
    }
}

/** Backfill idempotente de todos os pdfPath. dry=true só relata. */
async function migrarPdfLegado({ dry = true, limite = 200 } = {}) {
    limite = Math.max(1, Math.min(Number(limite) || 200, 5000));
    const contas = await prisma.contaPagar.findMany({
        where: { pdfPath: { not: null } },
        select: { id: true, pdfPath: true }
    });
    const chaves = contas.map((c) => `pdf:${c.id}`);
    const existentes = new Set();
    for (let i = 0; i < chaves.length; i += 2000) {
        const rows = await prisma.anexo.findMany({
            where: { chaveLegado: { in: chaves.slice(i, i + 2000) } },
            select: { chaveLegado: true }
        });
        rows.forEach((r) => existentes.add(r.chaveLegado));
    }

    const sumiram = [];
    const erros = [];
    const pendentes = [];
    let naPastaAntiga = 0;
    for (const c of contas) {
        if (existentes.has(`pdf:${c.id}`)) continue;
        const abs = resolverCaminho(c.pdfPath);
        if (!abs) sumiram.push({ contaId: c.id, pdfPath: c.pdfPath }); // continua relatado, mas ganha espelho "perdido"
        else if (abs.startsWith(PDF_DIR_LEGADO)) naPastaAntiga++;
        pendentes.push({ conta: c, abs });
    }

    let migrados = 0;
    const doLote = pendentes.slice(0, limite);
    if (!dry) {
        for (let i = 0; i < doLote.length; i += 20) {
            const lote = doLote.slice(i, i + 20);
            const linhas = (await Promise.all(lote.map(async ({ conta, abs }) => {
                try {
                    const base = dadosEspelhoPdf(conta.id, abs, null, conta.pdfPath);
                    if (!abs) return base;
                    const st = fs.statSync(abs);
                    return { ...base, sha256: await sha256DoArquivo(abs), criadoEm: st.mtime };
                } catch (e) {
                    erros.push({ contaId: conta.id, pdfPath: conta.pdfPath, erro: e.message });
                    return null;
                }
            }))).filter(Boolean);
            if (linhas.length) {
                const r = await prisma.anexo.createMany({ data: linhas, skipDuplicates: true });
                migrados += r.count;
            }
        }
    }
    return {
        dry,
        contasComPdf: contas.length,
        jaMigradas: existentes.size,
        aMigrar: pendentes.length,
        migradas: migrados,
        limite,
        restantes: dry ? pendentes.length : Math.max(0, pendentes.length - doLote.length),
        arquivosNaPastaAntigaForaDoVolume: naPastaAntiga,
        sumiram: sumiram.length,
        contasComArquivoSumido: sumiram.slice(0, 200),
        erros: erros.slice(0, 50)
    };
}

// ── apoio a listagens (sem N+1) ─────────────────────────────────────────────────
/** Map contaId → { qtd, temEspelho } dos anexos ativos de CONTA_PAGAR. */
async function resumoPorContas(contaIds) {
    const mapa = new Map();
    const ids = [...new Set((contaIds || []).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 2000) {
        const rows = await prisma.anexo.findMany({
            where: { entidadeTipo: 'CONTA_PAGAR', ativo: true, entidadeId: { in: ids.slice(i, i + 2000) } },
            select: { entidadeId: true, chaveLegado: true }
        });
        for (const r of rows) {
            const m = mapa.get(r.entidadeId) || { qtd: 0, temEspelho: false };
            m.qtd += 1;
            if (r.chaveLegado) m.temEspelho = true;
            mapa.set(r.entidadeId, m);
        }
    }
    return mapa;
}

/** Set de contaIds com algum anexo ativo (contabilidade). */
async function idsContasComAnexo(contaIds) {
    const mapa = await resumoPorContas(contaIds);
    return new Set(mapa.keys());
}

module.exports = {
    AnexoErro, corrigirNome, TIPOS, ENTIDADES, LIMITE_BYTES, TMP_DIR,
    salvar, listar, porId, abrirStream, arquivoExiste, remover, alterarTipo, formatar,
    espelharPdfLegado, desativarEspelhoPdfLegado, garantirEspelhoDaConta, migrarPdfLegado,
    resumoPorContas, idsContasComAnexo
};
