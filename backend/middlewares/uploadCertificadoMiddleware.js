const multer = require('multer');
const path = require('path');

// Certificado digital A1 (.pfx/.p12): fica em MEMÓRIA — o arquivo NUNCA é salvo
// em claro no disco. O certificadoService valida com a senha, criptografa
// (AES-256-GCM) e só então grava em uploads/certificado/.
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.pfx' || ext === '.p12') {
        cb(null, true);
    } else {
        cb(new Error('Envie um arquivo de certificado .pfx ou .p12.'), false);
    }
};

const uploadCertificado = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // certificados A1 têm poucos KB
});

module.exports = uploadCertificado;
