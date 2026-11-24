const jwt = require('jsonwebtoken');

const prisma = require('../config/database'); // singleton compartilhado (pool único)
const JWT_SECRET = require('../config/jwtSecret');

// Usuário externo (contador): só alcança o que está nesta lista. Nega por padrão.
// ESPELHA `ROTAS_EXTERNO` do frontend (frontend/src/utils/usuarioExterno.js) — mexeu aqui, mexa lá.
// `/api/auth/midia-token` fica FORA de propósito. `/auth/me` NUNCA pode sair daqui (403 ali desloga).
const CAMINHOS_EXTERNO = /^\/api\/(auth\/(me|menu-favoritos)|contabilidade)(\/|$)/;

function externoPodeAcessar(urlOriginal) {
    const bruto = String(urlOriginal || '').split('?')[0].split('#')[0].toLowerCase();
    // sem truque de caminho: '..', '//', barra invertida ou separador/ponto codificado
    if (bruto.includes('..') || bruto.includes('//') || bruto.includes('\\') || /%(2e|2f|5c|00)/.test(bruto)) return false;
    return CAMINHOS_EXTERNO.test(bruto);
}

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido ou inválido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Token de mídia (só para ler arquivos via ?mt=) nunca vale como login
        if (decoded.tipo === 'midia') {
            return res.status(401).json({ error: 'Token expirado ou inválido.' });
        }

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

        // Usuário externo (contador): permissões já estão em mãos, zero consulta extra.
        if (!permissoesAtuais.admin && permissoesAtuais.Usuario_Externo === true && !externoPodeAcessar(req.originalUrl)) {
            return res.status(403).json({ error: 'Usuário externo: acesso restrito à Contabilidade.', codigo: 'USUARIO_EXTERNO' });
        }

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
module.exports.externoPodeAcessar = externoPodeAcessar;
module.exports.CAMINHOS_EXTERNO = CAMINHOS_EXTERNO;
