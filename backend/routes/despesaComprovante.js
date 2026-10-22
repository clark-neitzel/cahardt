/**
 * F2 — Comprovante da despesa do motorista. Montado em /api/despesas (index.js), ANTES de routes/despesas.js.
 *
 *   POST /api/despesas/comprovante/analisar   foto -> rascunho + leitura da IA (+ comprovanteRef)
 *   GET  /api/despesas/:id/comprovante        comprovante + anexos da despesa
 *   POST /api/despesas/:id/aceitar            escritório aceita com motivo (idempotente)
 *   POST /api/despesas/:id/comprovante        anexar/substituir depois (multipart "arquivo")
 *
 * Só MARCA e AVISA: nada aqui trava a despesa nem o Caixa (modo teste; a trava é a F5).
 * Cada rota faz o próprio authMiddleware (este router não segura as rotas de despesas.js).
 */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const anexoService = require('../services/anexoService');
const cupomService = require('../services/cupomDespesaService');
const confService = require('../services/caixaConferenciaService');
const { AnexoErro } = anexoService;

const erro = (res, status, mensagem, codigo) => res.status(status).json({ error: mensagem, codigo });
const permsDe = (req) => req.user?.permissoes || {};
const ehEditor = (req) => !!(permsDe(req).admin || permsDe(req).Pode_Editar_Caixa);
const temAcessoCaixa = (req) => !!(permsDe(req).admin || permsDe(req).Pode_Acessar_Caixa || permsDe(req).Pode_Editar_Caixa);

async function usuarioDe(req) {
    let nome = req.user?.nome || null;
    if (!nome) {
        try { nome = (await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } }))?.nome || null; } catch (_) { /* informativo */ }
    }
    return { id: req.user.id, nome, admin: !!permsDe(req).admin };
}

/** Chave de trava (default false). F2 nunca a usa para bloquear; só informa ao front. */
async function travaLigada() {
    try {
        const c = await prisma.appConfig.findUnique({ where: { key: 'despesa_comprovante_trava' } });
        return c?.value === true || c?.value === 'true';
    } catch (_) { return false; }
}

// limite simples contra abuso do custo de IA: 40 análises/hora por usuário (memória do processo)
const janela = new Map();
function dentroDoLimite(userId) {
    const agora = Date.now();
    const lista = (janela.get(userId) || []).filter((t) => agora - t < 3600 * 1000);
    if (lista.length >= 40) { janela.set(userId, lista); return false; }
    lista.push(agora); janela.set(userId, lista);
    return true;
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            try { fs.mkdirSync(anexoService.TMP_DIR, { recursive: true }); cb(null, anexoService.TMP_DIR); } catch (e) { cb(e); }
        },
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.tmp`),
    }),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
function receberArquivo(req, res, next) {
    upload.single('arquivo')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return erro(res, 413, 'O comprovante tem mais de 10 MB. Tire a foto de novo.', 'ARQUIVO_GRANDE');
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') return erro(res, 400, 'Envie um arquivo por vez (campo "arquivo").', 'LIMITE_ARQUIVOS');
        console.error('[DespesaComprovante] upload:', err);
        return erro(res, 400, err.message || 'Erro no upload do comprovante.', 'UPLOAD_FALHOU');
    });
}
const limparTmp = (req) => { try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (_) { /* já movido */ } };

const ehDono = (req, d) => d.vendedorId === req.user.id || d.criadoPor === req.user.id;

/** Escritório (editor/admin) sempre; dono só antes do fechamento do caixa. Devolve null se pode, ou {status,msg,codigo}. */
async function checarEscrita(req, despesa) {
    if (ehEditor(req)) return null;
    if (!ehDono(req, despesa)) return { status: 403, msg: 'Sem permissão para alterar o comprovante desta despesa.', codigo: 'SEM_PERMISSAO' };
    const bloqueio = await confService.bloqueioPorCaixaFechado(despesa.vendedorId, despesa.dataReferencia);
    if (bloqueio) return { status: 400, msg: bloqueio, codigo: 'CAIXA_FECHADO' };
    return null;
}

// ── POST /comprovante/analisar ──
router.post('/comprovante/analisar', verificarAuth, (req, res, next) => {
    if (!temAcessoCaixa(req)) return erro(res, 403, 'Sem permissão para lançar despesas.', 'SEM_PERMISSAO');
    next();
}, receberArquivo, async (req, res) => {
    try {
        if (!req.file) return erro(res, 400, 'Nenhum arquivo enviado (campo "arquivo").', 'SEM_ARQUIVO');
        if (!dentroDoLimite(req.user.id)) { limparTmp(req); return erro(res, 429, 'Muitas fotos em pouco tempo. Aguarde alguns minutos.', 'LIMITE_ANALISES'); }
        const { categoria, valor, dataReferencia, litros, veiculoId } = req.body || {};
        const r = await cupomService.analisarRascunho({
            arquivo: req.file, vendedorId: req.user.id,
            digitado: { categoria: categoria || null, valor: valor ?? null, dataReferencia: dataReferencia || null, litros: litros ?? null, veiculoId: veiculoId || null },
        });
        r.trava = await travaLigada();
        res.json(r);
    } catch (e) {
        limparTmp(req);
        if (e instanceof AnexoErro) return erro(res, e.status, e.message, e.codigo);
        console.error('[DespesaComprovante] analisar:', e);
        erro(res, 500, 'Erro ao receber o comprovante.', 'ERRO_INTERNO');
    }
});

// ── GET /:id/comprovante ──
router.get('/:id/comprovante', verificarAuth, async (req, res) => {
    try {
        if (!temAcessoCaixa(req)) return erro(res, 403, 'Sem permissão para acessar Despesas.', 'SEM_PERMISSAO');
        const despesa = await prisma.despesa.findUnique({ where: { id: req.params.id } });
        if (!despesa) return erro(res, 404, 'Despesa não encontrada.', 'NAO_ENCONTRADO');
        if (!ehDono(req, despesa) && !ehEditor(req)) return erro(res, 403, 'Sem permissão para ver o comprovante desta despesa.', 'SEM_PERMISSAO');

        const usuario = await usuarioDe(req);
        const podeEscrever = !(await checarEscrita(req, despesa));
        const lista = await anexoService.listar('DESPESA', despesa.id);
        const anexos = lista.map((a) => ({
            ...anexoService.formatar(a, { usuario, podeEscrever }),
            podeRemover: podeEscrever, // despesa: dono (antes do fechamento) ou escritório; sem a regra "só o autor"
            arquivoDisponivel: anexoService.arquivoExiste(a),
        }));
        res.json({
            despesaId: despesa.id,
            comprovante: await cupomService.detalhe(despesa.id), // null = despesa antiga, sem registro
            anexos,
            podeAnexar: podeEscrever,
            podeAceitar: ehEditor(req),
            trava: await travaLigada(),
        });
    } catch (e) {
        console.error('[DespesaComprovante] GET:', e);
        erro(res, 500, 'Erro ao buscar o comprovante.', 'ERRO_INTERNO');
    }
});

// ── POST /:id/aceitar ──
router.post('/:id/aceitar', verificarAuth, async (req, res) => {
    try {
        if (!ehEditor(req)) return erro(res, 403, 'Só o escritório (Editar Caixa) ou o administrador pode aceitar um comprovante.', 'SEM_PERMISSAO');
        const despesa = await prisma.despesa.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!despesa) return erro(res, 404, 'Despesa não encontrada.', 'NAO_ENCONTRADO');
        const mot = String(req.body?.motivo || '').trim();
        if (mot.replace(/\s/g, '').length < 5) return erro(res, 400, 'Informe o motivo do aceite (mínimo 5 letras).', 'MOTIVO_OBRIGATORIO');
        const usuario = await usuarioDe(req);
        const r = await cupomService.aceitar({ despesaId: despesa.id, motivo: mot, usuario });
        res.json({ ok: true, jaAceita: r.jaAceita, comprovante: await cupomService.detalhe(despesa.id) });
    } catch (e) {
        console.error('[DespesaComprovante] aceitar:', e);
        erro(res, 500, 'Erro ao aceitar o comprovante.', 'ERRO_INTERNO');
    }
});

// ── POST /:id/comprovante — anexar/substituir depois ──
router.post('/:id/comprovante', verificarAuth, receberArquivo, async (req, res) => {
    try {
        if (!temAcessoCaixa(req)) { limparTmp(req); return erro(res, 403, 'Sem permissão para acessar Despesas.', 'SEM_PERMISSAO'); }
        const despesa = await prisma.despesa.findUnique({ where: { id: req.params.id }, include: { veiculo: { select: { placa: true, modelo: true } } } });
        if (!despesa) { limparTmp(req); return erro(res, 404, 'Despesa não encontrada.', 'NAO_ENCONTRADO'); }
        const bloq = await checarEscrita(req, despesa);
        if (bloq) { limparTmp(req); return erro(res, bloq.status, bloq.msg, bloq.codigo); }
        if (!req.file) return erro(res, 400, 'Nenhum arquivo enviado (campo "arquivo").', 'SEM_ARQUIVO');
        if (!dentroDoLimite(req.user.id)) { limparTmp(req); return erro(res, 429, 'Muitas fotos em pouco tempo. Aguarde alguns minutos.', 'LIMITE_ANALISES'); }

        const usuario = await usuarioDe(req);
        const rasc = await cupomService.analisarRascunho({
            arquivo: req.file, vendedorId: req.user.id,
            digitado: { categoria: despesa.categoria, valor: Number(despesa.valor), dataReferencia: despesa.dataReferencia, litros: despesa.litros != null ? Number(despesa.litros) : null, veiculoId: despesa.veiculoId },
        });
        const reg = await cupomService.registrarParaDespesa({ despesa, comprovanteRef: rasc.comprovanteRef, usuario, substituir: true });
        res.status(201).json({
            ok: !reg.comprovanteErro,
            comprovanteErro: reg.comprovanteErro || null,
            comprovante: await cupomService.detalhe(despesa.id),
            anexos: (await anexoService.listar('DESPESA', despesa.id)).map((a) => ({ ...anexoService.formatar(a, { usuario, podeEscrever: true }), arquivoDisponivel: anexoService.arquivoExiste(a) })),
        });
    } catch (e) {
        limparTmp(req);
        if (e instanceof AnexoErro) return erro(res, e.status, e.message, e.codigo);
        console.error('[DespesaComprovante] POST anexar:', e);
        erro(res, 500, 'Erro ao anexar o comprovante.', 'ERRO_INTERNO');
    }
});

module.exports = router;
