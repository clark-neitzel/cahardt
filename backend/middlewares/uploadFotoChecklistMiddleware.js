// Recebe UMA foto (campo `arquivo`) em MEMÓRIA — a gravação em disco é feita pelo service
// (que decide a pasta depois de validar ângulo/dono). Erros no formato { error, codigo }.
const multer = require('multer');

const FOTO_MAX = 6 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: FOTO_MAX, files: 1 },
});

function receberFoto(req, res, next) {
    upload.single('arquivo')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'A foto passa de 6 MB. Tire de novo ou reduza o tamanho.', codigo: 'ARQUIVO_GRANDE' });
        }
        return res.status(400).json({ error: 'Falha ao receber a foto. Tente de novo.', codigo: 'ARQUIVO_INVALIDO' });
    });
}

module.exports = { receberFoto, FOTO_MAX };
