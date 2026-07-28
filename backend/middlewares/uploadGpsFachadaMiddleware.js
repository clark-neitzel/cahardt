const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Foto da fachada do cliente (prova do "estou na porta" do motorista).
// ../uploads a partir de backend/middlewares/ → backend/uploads (volume persistente).
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const clienteUuid = req.params.uuid;
        const uploadPath = path.join(__dirname, '../uploads/gps-fachada', clienteUuid);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + (path.extname(file.originalname) || '.jpg'));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens são permitidas!'), false);
    }
};

module.exports = multer({
    storage,
    fileFilter,
    limits: { fileSize: 8 * 1024 * 1024 }
});
