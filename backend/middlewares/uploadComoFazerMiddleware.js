// Upload do Como Fazer (foto de passo, vídeo curto, foto de checklist).
// Destino: uploads/como-fazer/<contexto>/... — de `middlewares/`, `../uploads` = /app/uploads (VOLUME persistente).
// Usa memória + gravação manual para decidir a pasta DEPOIS de ler os campos do formulário
// (o multer em disco decide o destino antes de ler `contexto`, que pode vir depois do arquivo).
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '../uploads/como-fazer');
const FOTO_MAX = 15 * 1024 * 1024;
const VIDEO_MAX = 45 * 1024 * 1024;
const TIPOS = {
    'image/jpeg': { ext: '.jpg', tipo: 'FOTO' },
    'image/png': { ext: '.png', tipo: 'FOTO' },
    'image/webp': { ext: '.webp', tipo: 'FOTO' },
    'video/mp4': { ext: '.mp4', tipo: 'VIDEO' },
    'video/quicktime': { ext: '.mov', tipo: 'VIDEO' },
    'video/webm': { ext: '.webm', tipo: 'VIDEO' },
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: VIDEO_MAX, files: 1 },
    fileFilter: (req, file, cb) => {
        if (TIPOS[file.mimetype]) return cb(null, true);
        const e = new Error('Tipo de arquivo não permitido. Use foto (JPG, PNG, WebP) ou vídeo (MP4, MOV, WebM).');
        e.codigoCF = 'TIPO_INVALIDO';
        cb(e, false);
    },
});

/** middleware: lê o arquivo (campo `arquivo`) e devolve erros no formato do módulo */
function receberArquivo(req, res, next) {
    upload.single('arquivo')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erro: 'Arquivo grande demais.', codigo: 'ARQUIVO_GRANDE' });
        return res.status(400).json({ erro: err.message || 'Falha no envio do arquivo.', codigo: err.codigoCF || 'UPLOAD_FALHOU' });
    });
}

const slugSeguro = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);

/**
 * grava o arquivo recebido. `contexto`: 'execucao' | 'conteudo'. `conteudoId` só no contexto conteudo.
 * Devolve { url: 'como-fazer/...' (relativo a /uploads), tipo, caminho }.
 */
function gravar(file, contexto, conteudoId, dataYYYYMM) {
    const info = TIPOS[file.mimetype];
    if (!info) { const e = new Error('Tipo de arquivo não permitido.'); e.codigoCF = 'TIPO_INVALIDO'; throw e; }
    if (info.tipo === 'FOTO' && file.size > FOTO_MAX) { const e = new Error('A foto passa de 15 MB.'); e.codigoCF = 'ARQUIVO_GRANDE'; e.http = 413; throw e; }
    const sub = contexto === 'conteudo'
        ? path.join('conteudos', slugSeguro(conteudoId) || 'geral')
        : path.join('execucoes', dataYYYYMM);
    const dir = path.join(RAIZ, sub);
    fs.mkdirSync(dir, { recursive: true });
    const nome = `${crypto.randomUUID()}${info.ext}`;
    fs.writeFileSync(path.join(dir, nome), file.buffer);
    return { url: `como-fazer/${sub.split(path.sep).join('/')}/${nome}`, tipo: info.tipo, caminho: path.join(dir, nome) };
}

module.exports = { receberArquivo, gravar, RAIZ };
