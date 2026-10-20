const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Foto do funcionário (aparece na grade do tablet do Como Fazer).
// uploads/funcionarios/<id>/foto-<timestamp>.<ext> — de `middlewares/`, `../uploads` = volume persistente.
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/funcionarios', String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, ''));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.jpg';
        cb(null, `foto-${Date.now()}${ext}`);
    },
});

const uploadFotoFuncionario = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
        cb(new Error('Envie uma foto (JPG, PNG ou WebP).'), false);
    },
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// versão com erro em JSON (o multer puro devolveria a página de erro do Express)
uploadFotoFuncionario.receber = (req, res, next) => {
    uploadFotoFuncionario.fields([{ name: 'arquivo', maxCount: 1 }, { name: 'foto', maxCount: 1 }])(req, res, (err) => {
        if (!err) return next();
        const grande = err.code === 'LIMIT_FILE_SIZE';
        return res.status(grande ? 413 : 400).json({ erro: grande ? 'A foto passa de 10 MB.' : (err.message || 'Falha no envio da foto.') });
    });
};

module.exports = uploadFotoFuncionario;
