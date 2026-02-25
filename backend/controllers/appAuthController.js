const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_hardt_app_123';

const appAuthController = {
    login: async (req, res) => {
        const { login, senha } = req.body;

        if (!login || !senha) {
            return res.status(400).json({ error: 'Usuário (login) e senha são obrigatórios.' });
        }

        try {
            // Verifica o usuário
            const vendedor = await prisma.vendedor.findUnique({
                where: { login: login }
            });

            if (!vendedor) {
                return res.status(401).json({ error: 'Usuário não encontrado ou credenciais inválidas.' });
            }

            // Verifica a senha
            if (!vendedor.senha) {
                return res.status(401).json({ error: 'Senha não configurada para este usuário.' });
            }

            const senhaValida = await bcrypt.compare(senha, vendedor.senha);
            if (!senhaValida) {
                return res.status(401).json({ error: 'Credenciais inválidas.' });
            }

            if (!vendedor.ativo) {
                return res.status(403).json({ error: 'Usuário inativo.' });
            }

            // Garante formato do JSON de permissões
            const permissoesObj = typeof vendedor.permissoes === 'string'
                ? JSON.parse(vendedor.permissoes)
                : vendedor.permissoes || {};

            // Gera o JWT
            const token = jwt.sign(
                {
                    id: vendedor.id,
                    login: vendedor.login,
                    nome: vendedor.nome,
                    permissoes: permissoesObj
                },
                JWT_SECRET,
                { expiresIn: '7d' } // 7 dias logado no app
            );

            res.json({
                token,
                user: {
                    id: vendedor.id,
                    nome: vendedor.nome,
                    login: vendedor.login,
                    permissoes: permissoesObj
                }
            });

        } catch (error) {
            console.error('Erro no app-login:', error);
            res.status(500).json({ error: 'Erro interno ao realizar login.' });
        }
    },

    me: async (req, res) => {
        try {
            const vendedor = await prisma.vendedor.findUnique({
                where: { id: req.user.id }
            });

            if (!vendedor) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            const permissoesObj = typeof vendedor.permissoes === 'string'
                ? JSON.parse(vendedor.permissoes)
                : vendedor.permissoes || {};

            res.json({
                id: vendedor.id,
                nome: vendedor.nome,
                login: vendedor.login,
                permissoes: permissoesObj
            });
        } catch (error) {
            console.error('Erro no /me:', error);
            res.status(500).json({ error: 'Erro interno ao buscar dados do usuário.' });
        }
    }
};

module.exports = appAuthController;
