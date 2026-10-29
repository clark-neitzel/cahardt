// Impressão direta das ETIQUETAS ATUAIS como IMAGEM (E3) — produto (ZPL 100x120) e caixas Kit Festa/Delivery (EPL2 40x25).
// Plano: docs/etiquetas-cozinha/PLANO-E3-ETIQUETAS-ATUAIS.md 3.5/3.6. Contrato: docs/etiquetas-cozinha/CONTRATO-E3.md.
// Montada em index.js ANTES do express.json() global, com parser próprio de 4 MB:
//   app.use('/api/impressao/etiquetas', authMiddleware, express.json({ limit: '4mb' }), rotas)
// Permissão POR ORIGEM (resolvida aqui, nunca pela UI). Nada é gravado em disco: o bitmap vive no `conteudo` da fila.
// Sem $transaction: enfileirar() é um create único idempotente (chaveIdempotencia @unique).
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const svc = require('../services/impressaoService');
const bmp = require('../services/etiquetaBitmapRender');
const deliveryService = require('../services/deliveryService');

function permsDe(req) {
    const p = req.user?.permissoes;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
}

// origem -> { tamanho da impressora, linguagem, tipo gravado na fila, quem pode }
const ORIGENS = {
    PRODUTO: { tamanho: '100x120', linguagem: 'ZPL', tipo: 'ETIQUETA_PRODUTO', usaCopias: true },
    KIT_FESTA: { tamanho: '40x25', linguagem: 'EPL2', tipo: 'CAIXA_KIT_FESTA', usaCopias: false },
    DELIVERY: { tamanho: '40x25', linguagem: 'EPL2', tipo: 'CAIXA_KIT_FESTA', usaCopias: false },
    FUNCIONARIO_PASTA: { tamanho: '100x120', linguagem: 'ZPL', tipo: 'ETIQUETA_FUNCIONARIO', usaCopias: true },
    FUNCIONARIO_ARQUIVO: { tamanho: '40x25', linguagem: 'EPL2', tipo: 'ETIQUETA_FUNCIONARIO', usaCopias: false },
};
const TIPOS_REFERENCIA = ['ETIQUETA_PRODUTO', 'PEDIDO', 'FUNCIONARIO'];
const MAX_BITMAPS = 60;
const MAX_COPIAS = 999;

// pcp.etiquetas / kitFesta são flags de OBJETO de permissões: checa a flag, nunca !!perms.pcp
async function podeOrigem(req, origem) {
    const p = permsDe(req);
    if (p.admin) return true;
    if (origem === 'PRODUTO') return !!p.pcp?.etiquetas;
    if (origem === 'KIT_FESTA') return !!p.kitFesta;
    if (origem === 'FUNCIONARIO_PASTA' || origem === 'FUNCIONARIO_ARQUIVO') return !!p.Pode_Ver_Ponto || !!p.Pode_Editar_Ponto;
    if (origem === 'DELIVERY') {
        const perm = await deliveryService.permissaoDoUsuario({ ...req.user, permissoes: p });
        return !!perm.podeVer;
    }
    return false;
}

async function exigirOrigem(req, res) {
    const origem = String(req.query?.origem ?? req.body?.origem ?? '');
    if (!ORIGENS[origem]) { res.status(400).json({ error: `origem deve ser uma de: ${Object.keys(ORIGENS).join(', ')}.` }); return null; }
    if (!(await podeOrigem(req, origem))) { res.status(403).json({ error: 'Sem permissão para imprimir etiquetas desta área.' }); return null; }
    return origem;
}

// ---------- GET /impressoras?origem= ----------

router.get('/impressoras', async (req, res) => {
    try {
        const origem = await exigirOrigem(req, res);
        if (!origem) return;
        const cfg = ORIGENS[origem];
        const lista = await prisma.impressora.findMany({
            where: { ativa: true, tamanho: cfg.tamanho }, include: { agente: true }, orderBy: { nome: 'asc' },
        });
        res.json(lista.map((i) => ({
            id: i.id, nome: i.nome, tamanho: i.tamanho, colunas: i.colunas,
            estadoAgente: svc.estadoAgente(i.agente), estadoWindows: svc.estadoWindowsDe(i.agente, i.nomeWindows),
        })));
    } catch (e) { console.error('[ImpressaoEtiquetas] GET /impressoras', e.message); res.status(500).json({ error: 'Erro ao listar impressoras.' }); }
});

// ---------- POST / ----------

function validarCorpo(b, origem, cfg) {
    const requisicaoId = String(b.requisicaoId ?? '');
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requisicaoId)) return { erro: 'requisicaoId inválido (8 a 80 caracteres: letras, números e hífen).' };
    let referencia = null;
    if (b.referencia !== undefined && b.referencia !== null) {
        const r = b.referencia;
        if (typeof r !== 'object' || Array.isArray(r)) return { erro: 'referencia inválida.' };
        if (!TIPOS_REFERENCIA.includes(String(r.tipo))) return { erro: `referencia.tipo deve ser um de: ${TIPOS_REFERENCIA.join(', ')}.` };
        const id = String(r.id ?? '').slice(0, 80);
        const rotulo = String(r.rotulo ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
        referencia = `${rotulo ? rotulo + ' ' : ''}[${r.tipo}:${id}]`.slice(0, 200);
    }
    if (!Array.isArray(b.bitmaps) || b.bitmaps.length < 1) return { erro: 'Envie ao menos 1 imagem em "bitmaps".' };
    if (b.bitmaps.length > MAX_BITMAPS) return { erro: `No máximo ${MAX_BITMAPS} imagens diferentes por pedido.` };

    let copias = 1;
    let sequencia = null;
    if (cfg.usaCopias) {
        if (b.bitmaps.length !== 1) return { erro: 'Etiqueta de produto leva exatamente 1 imagem em "bitmaps".' };
        if (b.sequencia !== undefined && b.sequencia !== null) return { erro: 'Etiqueta de produto não usa "sequencia"; use "copias".' };
        if (b.copias !== undefined) {
            copias = Number(b.copias);
            if (!Number.isInteger(copias) || copias < 1 || copias > MAX_COPIAS) return { erro: `copias deve ser de 1 a ${MAX_COPIAS}.` };
        }
    } else {
        if (b.copias !== undefined && Number(b.copias) !== 1) return { erro: 'Caixas não usam "copias"; repita os índices em "sequencia".' };
        if (!Array.isArray(b.sequencia) || b.sequencia.length < 1) return { erro: '"sequencia" é obrigatória (ordem de impressão, índices de "bitmaps").' };
        if (b.sequencia.length > 2 * bmp.MAX_FORMULARIOS_POR_TRABALHO * bmp.MAX_TRABALHOS) return { erro: 'Etiquetas demais de uma vez. Divida em lotes menores.' };
        sequencia = b.sequencia.map(Number);
        if (!sequencia.every((i) => Number.isInteger(i) && i >= 0 && i < b.bitmaps.length)) return { erro: '"sequencia" tem índice que não existe em "bitmaps".' };
    }
    return { requisicaoId, referencia, copias, sequencia };
}

router.post('/', async (req, res) => {
    try {
        const origem = await exigirOrigem(req, res);
        if (!origem) return;
        const cfg = ORIGENS[origem];
        const v = validarCorpo(req.body || {}, origem, cfg);
        if (v.erro) return res.status(400).json({ error: v.erro });

        // impressora: ativa, do tamanho da origem, linguagem certa
        const idPedido = req.body.impressoraId ? String(req.body.impressoraId) : null;
        const candidatas = await prisma.impressora.findMany({
            where: { ativa: true, tamanho: cfg.tamanho, ...(idPedido ? { id: idPedido } : {}) }, include: { agente: true },
        });
        if (!candidatas.length) return res.status(409).json({ error: `Nenhuma impressora ativa de etiqueta ${cfg.tamanho} cadastrada${idPedido ? ' com esse id' : ''}.` });
        if (candidatas.length > 1) return res.status(400).json({ error: 'Há mais de uma impressora ativa desse tamanho: informe "impressoraId".' });
        const imp = candidatas[0];
        if (imp.linguagem !== cfg.linguagem) return res.status(409).json({ error: `A impressora "${imp.nome}" está como ${imp.linguagem}; etiqueta em imagem desta área exige ${cfg.linguagem}.` });
        if (Number(imp.dpi) !== 203) return res.status(409).json({ error: `Impressora com ${imp.dpi} dpi: etiqueta em imagem só é suportada em 203 dpi.` });
        if (Number(imp.rotacao) !== 0) return res.status(409).json({ error: 'Impressora com rotação não suportada para etiqueta em imagem.' });

        // valida e desempacota (nunca confia no cliente)
        const dim = bmp.dimensaoDe(imp);
        let raws;
        try { raws = req.body.bitmaps.map((b) => bmp.desempacotar(b, dim)); }
        catch (e) { if (e instanceof bmp.ErroBitmap) return res.status(e.status).json({ error: e.message }); throw e; }

        // monta os conteúdos (1..3 trabalhos)
        let conteudos; // [{ conteudo, copias, etiquetas }]
        try {
            if (cfg.usaCopias) {
                const compressao = await svc.compressaoGf(imp);
                conteudos = [{
                    conteudo: bmp.renderZplImagem({ raw: raws[0], larguraDots: dim.w, alturaDots: dim.h, copias: v.copias, impressora: imp, compressao }),
                    copias: v.copias, etiquetas: v.copias,
                }];
            } else {
                conteudos = bmp.dividirEmTrabalhos(v.sequencia, imp.colunas).map((parte) => ({
                    conteudo: bmp.renderEpl2Imagem({ raws, sequencia: parte, impressora: imp }), copias: 1, etiquetas: parte.length,
                }));
            }
        } catch (e) { if (e instanceof bmp.ErroBitmap) return res.status(e.status).json({ error: e.message }); throw e; }

        // enfileira em sequência (chaves ...-0/-1/-2 idempotentes; sem transação longa)
        const usuario = { id: String(req.user?.id || ''), nome: req.user?.nome || null };
        const trabalhos = [];
        let reaproveitados = 0;
        for (let n = 0; n < conteudos.length; n++) {
            const t = await svc.enfileirar({
                impressoraId: imp.id, tipo: cfg.tipo, conteudo: conteudos[n].conteudo, copias: conteudos[n].copias,
                chaveIdempotencia: `etq-${origem}-${v.requisicaoId}-${n}`, usuario, referencia: v.referencia,
            });
            if (t.reaproveitado) {
                if (t.solicitadoPorId && usuario.id && t.solicitadoPorId !== usuario.id) {
                    return res.status(409).json({ error: 'Esse requisicaoId já foi usado por outra pessoa. Gere um novo.' });
                }
                reaproveitados++;
            }
            trabalhos.push({ id: t.id, status: t.status });
        }
        const repetido = reaproveitados === conteudos.length;
        const estado = svc.estadoAgente(imp.agente);
        const resp = {
            trabalhos, totalEtiquetas: conteudos.reduce((s, c) => s + c.etiquetas, 0),
            agente: { estado }, ...(repetido ? { repetido: true } : {}),
        };
        if (estado === 'OFFLINE' && !repetido) resp.aviso = 'O computador da cozinha parece desligado. A etiqueta fica na fila por 15 minutos.';
        res.status(repetido ? 200 : 201).json(resp);
    } catch (e) {
        console.error('[ImpressaoEtiquetas] POST /', e);
        res.status(500).json({ error: 'Erro ao enviar a etiqueta para a impressora.' });
    }
});

// ---------- POST /trabalhos/:id/cancelar ----------
// Dono do trabalho (ou admin), só se ainda PENDENTE e só de etiqueta (E3). Serve ao "Cancelar e imprimir pelo navegador".

router.post('/trabalhos/:id/cancelar', async (req, res) => {
    try {
        const admin = !!permsDe(req).admin;
        const t = await prisma.impressaoTrabalho.findUnique({ where: { id: req.params.id }, select: { id: true, tipo: true, solicitadoPorId: true } });
        if (!t || !['ETIQUETA_PRODUTO', 'CAIXA_KIT_FESTA', 'ETIQUETA_FUNCIONARIO'].includes(t.tipo) || (!admin && t.solicitadoPorId !== String(req.user?.id))) {
            return res.status(404).json({ error: 'Trabalho não encontrado.' });
        }
        const r = await prisma.impressaoTrabalho.updateMany({
            where: { id: t.id, status: 'PENDENTE' }, data: { status: 'CANCELADO', erro: 'Cancelado por quem pediu.' },
        });
        if (!r.count) return res.status(409).json({ error: 'Só dá para cancelar trabalho que ainda está pendente.' });
        res.json({ ok: true });
    } catch (e) { console.error('[ImpressaoEtiquetas] cancelar', e.message); res.status(500).json({ error: 'Erro ao cancelar.' }); }
});

// Erros do parser (corpo grande demais / JSON quebrado) em português.
// Precisa ser montado DEPOIS do router no app.use (o erro do express.json nasce antes do router).
// eslint-disable-next-line no-unused-vars
function tratarErro(err, req, res, next) {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Etiqueta grande demais (limite de 4 MB). Envie menos etiquetas por vez.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Corpo da requisição inválido.' });
    console.error('[ImpressaoEtiquetas] erro', err);
    res.status(500).json({ error: 'Erro ao processar a etiqueta.' });
}

module.exports = router;
module.exports.tratarErro = tratarErro;
