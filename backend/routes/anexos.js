/**
 * Anexos (F1: Contas a Pagar). Montado em /api (index.js) — cada rota declara o caminho completo.
 *
 *   GET    /api/contas-pagar/:id/anexos      ver      → admin ou Pode_Acessar_Contas_Pagar
 *   POST   /api/contas-pagar/:id/anexos      escrever → admin ou Pode_Baixar_Contas_Pagar (multipart: arquivos[] até 10 + tipo)
 *   GET    /api/anexos/:id/arquivo           ver (permissão da entidade dona do anexo)
 *   PATCH  /api/anexos/:id                   escrever (troca o tipo)
 *   DELETE /api/anexos/:id                   escrever + (autor do anexo ou admin)
 *
 * Mesmos checks reais de routes/contasPagar.js (a chave "Pode_Editar_ContasPagar" NÃO existe).
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../config/database');
const verificarAuth = require('../middlewares/authMiddleware');
const anexoService = require('../services/anexoService');
const { AnexoErro } = anexoService;

// Permissões por tipo de entidade (F2 acrescenta DESPESA). Tipo sem regra = ninguém abre/escreve.
const REGRAS = {
    CONTA_PAGAR: { ver: 'Pode_Acessar_Contas_Pagar', escrever: 'Pode_Baixar_Contas_Pagar' }
};

const erro = (res, status, mensagem, codigo) => res.status(status).json({ error: mensagem, codigo });

const permissoesDe = (req) => req.user?.permissoes || {};
const pode = (req, tipoEntidade, acao) => {
    const perms = permissoesDe(req);
    if (perms.admin) return true;
    const regra = REGRAS[tipoEntidade];
    return !!(regra && perms[regra[acao]]);
};

// nome do usuário (o token nem sempre traz)
async function usuarioDe(req) {
    const perms = permissoesDe(req);
    let nome = req.user?.nome || null;
    if (!nome) {
        try {
            const v = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
            nome = v?.nome || null;
        } catch (_) { /* nome é só informativo */ }
    }
    return { id: req.user.id, nome, admin: !!perms.admin };
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            // Cria a pasta NA HORA do upload (não só no boot): deploy novo ou limpeza pode ter apagado uploads/anexos.
            try { require('fs').mkdirSync(anexoService.TMP_DIR, { recursive: true }); cb(null, anexoService.TMP_DIR); }
            catch (e) { cb(e); }
        },
        filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.tmp`)
    }),
    limits: { fileSize: anexoService.LIMITE_BYTES, files: 10 }
});

function receberArquivos(req, res, next) {
    upload.array('arquivos', 10)(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return erro(res, 413, 'Há arquivo com mais de 30 MB. Reduza o arquivo e tente de novo.', 'ARQUIVO_GRANDE');
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') return erro(res, 400, 'Envie no máximo 10 arquivos por vez (campo "arquivos").', 'LIMITE_ARQUIVOS');
        console.error('[Anexos] erro no upload:', err);
        return erro(res, 400, err.message || 'Erro no upload do arquivo.', 'UPLOAD_FALHOU');
    });
}

// ── GET /contas-pagar/:id/anexos ──
router.get('/contas-pagar/:id/anexos', verificarAuth, async (req, res) => {
    try {
        if (!pode(req, 'CONTA_PAGAR', 'ver')) return erro(res, 403, 'Sem permissão para acessar contas a pagar.', 'SEM_PERMISSAO');
        const conta = await prisma.contaPagar.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!conta) return erro(res, 404, 'Conta não encontrada.', 'NAO_ENCONTRADO');

        await anexoService.garantirEspelhoDaConta(conta.id); // PDF antigo aparece mesmo antes do backfill
        const usuario = await usuarioDe(req);
        const podeEscrever = pode(req, 'CONTA_PAGAR', 'escrever');
        const lista = await anexoService.listar('CONTA_PAGAR', conta.id);
        res.json({
            podeEscrever,
            anexos: lista.map((a) => ({ ...anexoService.formatar(a, { usuario, podeEscrever }), arquivoDisponivel: anexoService.arquivoExiste(a) }))
        });
    } catch (e) {
        console.error('[Anexos] listar:', e);
        erro(res, 500, 'Erro ao listar os anexos.', 'ERRO_INTERNO');
    }
});

// ── POST /contas-pagar/:id/anexos ──
router.post('/contas-pagar/:id/anexos', verificarAuth, (req, res, next) => {
    if (!pode(req, 'CONTA_PAGAR', 'escrever')) return erro(res, 403, 'Sem permissão para anexar arquivos em contas a pagar.', 'SEM_PERMISSAO');
    next();
}, receberArquivos, async (req, res) => {
    const arquivos = req.files || [];
    const limpar = () => arquivos.forEach((f) => { try { require('fs').unlinkSync(f.path); } catch (_) { /* já movido */ } });
    try {
        if (!arquivos.length) return erro(res, 400, 'Nenhum arquivo enviado (campo "arquivos").', 'SEM_ARQUIVO');
        const conta = await prisma.contaPagar.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!conta) { limpar(); return erro(res, 404, 'Conta não encontrada.', 'NAO_ENCONTRADO'); }

        const tipo = String(req.body?.tipo || 'OUTRO').toUpperCase();
        if (!anexoService.TIPOS.includes(tipo)) { limpar(); return erro(res, 400, `Tipo de anexo inválido. Use: ${anexoService.TIPOS.join(', ')}.`, 'TIPO_INVALIDO'); }

        const usuario = await usuarioDe(req);
        const podeEscrever = true;
        const criados = [];
        const recusados = [];
        const avisos = [];
        for (const f of arquivos) {
            try {
                const r = await anexoService.salvar({ entidadeTipo: 'CONTA_PAGAR', entidadeId: conta.id, tipo, arquivo: f, usuario });
                criados.push({ ...anexoService.formatar(r.anexo, { usuario, podeEscrever }), arquivoDisponivel: true });
                r.avisos.forEach((a) => avisos.push({ ...a, arquivo: anexoService.corrigirNome(f.originalname) }));
            } catch (e) {
                if (e instanceof AnexoErro) recusados.push({ arquivo: anexoService.corrigirNome(f.originalname), erro: e.message, codigo: e.codigo });
                else { console.error('[Anexos] salvar:', e); recusados.push({ arquivo: anexoService.corrigirNome(f.originalname), erro: 'Erro ao salvar o arquivo.', codigo: 'ERRO_INTERNO' }); }
            }
        }
        if (!criados.length) {
            const primeiro = recusados[0];
            return res.status(primeiro?.codigo === 'ARQUIVO_GRANDE' ? 413 : 400).json({ error: primeiro?.erro || 'Nenhum arquivo foi aceito.', codigo: primeiro?.codigo || 'ARQUIVO_INVALIDO', recusados });
        }
        res.status(201).json({ anexos: criados, recusados, avisos });
    } catch (e) {
        limpar();
        console.error('[Anexos] POST:', e);
        erro(res, 500, 'Erro ao salvar os anexos.', 'ERRO_INTERNO');
    }
});

// ── GET /anexos/:id/arquivo ──
router.get('/anexos/:id/arquivo', verificarAuth, async (req, res) => {
    try {
        const a = await anexoService.porId(req.params.id);
        if (!a || !a.ativo) return erro(res, 404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
        if (!pode(req, a.entidadeTipo, 'ver')) return erro(res, 403, 'Sem permissão para abrir este anexo.', 'SEM_PERMISSAO');
        const { stream } = anexoService.abrirStream(a);
        res.setHeader('Content-Type', a.mime);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nomeOriginal)}`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (a.mime.includes('xml')) res.setHeader('Content-Security-Policy', 'sandbox'); // XML nunca executa script
        stream.on('error', (err) => {
            console.error('[Anexos] leitura:', err.message);
            if (!res.headersSent) erro(res, 500, 'Erro ao ler o arquivo.', 'ERRO_INTERNO'); else res.destroy();
        });
        stream.pipe(res);
    } catch (e) {
        if (e instanceof AnexoErro) return erro(res, e.status, e.message, e.codigo);
        console.error('[Anexos] arquivo:', e);
        erro(res, 500, 'Erro ao abrir o anexo.', 'ERRO_INTERNO');
    }
});

// ── PATCH /anexos/:id — trocar o tipo ──
router.patch('/anexos/:id', verificarAuth, async (req, res) => {
    try {
        const a = await anexoService.porId(req.params.id);
        if (!a || !a.ativo) return erro(res, 404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
        if (!pode(req, a.entidadeTipo, 'escrever')) return erro(res, 403, 'Sem permissão para alterar anexos.', 'SEM_PERMISSAO');
        const novo = await anexoService.alterarTipo(a.id, String(req.body?.tipo || '').toUpperCase());
        const usuario = await usuarioDe(req);
        res.json({ anexo: anexoService.formatar(novo, { usuario, podeEscrever: true }) });
    } catch (e) {
        if (e instanceof AnexoErro) return erro(res, e.status, e.message, e.codigo);
        console.error('[Anexos] PATCH:', e);
        erro(res, 500, 'Erro ao alterar o anexo.', 'ERRO_INTERNO');
    }
});

// ── DELETE /anexos/:id — só o autor ou admin ──
router.delete('/anexos/:id', verificarAuth, async (req, res) => {
    try {
        const a = await anexoService.porId(req.params.id);
        if (!a || !a.ativo) return erro(res, 404, 'Anexo não encontrado.', 'NAO_ENCONTRADO');
        if (!pode(req, a.entidadeTipo, 'escrever')) return erro(res, 403, 'Sem permissão para remover anexos.', 'SEM_PERMISSAO');
        const usuario = await usuarioDe(req);
        if (!usuario.admin && !a.chaveLegado && a.criadoPorId !== usuario.id) {
            return erro(res, 403, 'Só quem anexou o arquivo (ou o administrador) pode removê-lo.', 'SO_AUTOR_OU_ADMIN');
        }
        let pdfPathZerado = false;
        // PDF antigo: o anexo é o espelho do pdfPath — limpa o campo antigo para não ficar "temPdf" sem arquivo.
        if (a.chaveLegado && a.chaveLegado.startsWith('pdf:') && a.entidadeTipo === 'CONTA_PAGAR') {
            try {
                await prisma.contaPagar.updateMany({ where: { id: a.entidadeId }, data: { pdfPath: null } });
                pdfPathZerado = true;
            } catch (e) {
                console.error('[Anexos] não limpou pdfPath legado:', e.message);
            }
        }
        const r = await anexoService.remover(a, usuario);
        res.json({ message: 'Anexo removido.', removido: true, arquivoApagado: r.arquivoApagado, pdfPathZerado });
    } catch (e) {
        console.error('[Anexos] DELETE:', e);
        erro(res, 500, 'Erro ao remover o anexo.', 'ERRO_INTERNO');
    }
});

module.exports = router;
