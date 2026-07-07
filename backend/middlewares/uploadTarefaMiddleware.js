const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload de material de ajuda das Tarefas da Equipe (imagem/PDF).
// Espelha o uploadFuncionarioMiddleware.
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const tarefaId = req.params.id;
        const uploadPath = path.join(__dirname, '../uploads/tarefas', tarefaId);
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Apenas imagens e PDFs são permitidos!'), false);
    }
};

const uploadTarefa = multer({
    storage,
    fileFilter,
    limits: { fileSize: 15 * 1024 * 1024 }
});

module.exports = uploadTarefa;
