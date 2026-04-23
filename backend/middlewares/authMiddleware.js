const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido ou inválido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Busca permissões atualizadas do banco para garantir que mudanças de admin
        // tenham efeito imediato, sem precisar de novo login
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: decoded.id },
            select: { permissoes: true, ativo: true, maxDescontoFlex: true }
        });

        if (!vendedor || vendedor.ativo === false) {
            return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
        }

        const permissoesAtuais = typeof vendedor.permissoes === 'string'
            ? JSON.parse(vendedor.permissoes)
            : vendedor.permissoes || {};

        req.user = {
            ...decoded,
            permissoes: permissoesAtuais,
            maxDescontoFlex: vendedor.maxDescontoFlex
        };
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado ou inválido.' });
        }
        return res.status(500).json({ error: 'Erro interno de autenticação.' });
    }
};

module.exports = authMiddleware;
