const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';
// CORREÇÃO: O Redirect deve apontar para o BACKEND, não para o Frontend
const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI || 'https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback';

const authController = {
    // Retorna a URL para redirecionar o usuário
    getAuthUrl: (req, res) => {
        const state = 'ESTADO_SEGURANCA';
        // CONFIGURAÇÃO HÍBRIDA (Modern Auth + Legacy Scope)
        // O redirect URI deve ser Exatamente: https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback
        const redirectUri = 'https://cahardt-hardt-backend.xrqvlq.easypanel.host/api/auth/callback';

        // TENTATIVA CRÍTICA: Modern Auth com Scope SALES
        const url = `https://auth.contaazul.com/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=openid+profile+sales`;
        res.json({ url });
    },

    // Callback que recebe o code
    callback: async (req, res) => {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).json({ error: 'Código de autorização não fornecido.' });
        }

        try {
            // Troca code por token (Basic Auth header com client_id:client_secret base64)
            const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

            // VOLTA PARA AUTH MODERNO (auth.contaazul.com)
            // Mas agora teremos o escopo 'sales' no token
            const response = await axios.post('https://auth.contaazul.com/oauth2/token',
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    redirect_uri: REDIRECT_URI,
                    code: code
                }).toString(),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const { access_token, refresh_token, expires_in } = response.data;

            // Salva no banco (Upsert - Single Tenant)
            const firstConfig = await prisma.contaAzulConfig.findFirst();
            if (firstConfig) {
                await prisma.contaAzulConfig.update({
                    where: { id: firstConfig.id },
                    data: {
                        accessToken: access_token,
                        refreshToken: refresh_token || firstConfig.refreshToken,
                        expiresIn: expires_in || 3600,
                        updatedAt: new Date()
                    }
                });
            } else {
                await prisma.contaAzulConfig.create({
                    data: {
                        accessToken: access_token,
                        refreshToken: refresh_token,
                        expiresIn: expires_in || 3600
                    }
                });
            }

            console.log('✅ Acesso Conta Azul obtido e salvo com sucesso!');

            // Redireciona de volta para a URL CORRETA do frontend
            res.redirect('https://cahardt-github.xrqvlq.easypanel.host/admin/sync?status=success');

        } catch (error) {
            console.error('Erro na autenticação Conta Azul:', error.response?.data || error.message);
            res.status(500).json({ error: 'Falha ao autenticar com Conta Azul.', details: error.response?.data });
        }
    },

    // Rota auxiliar para verificar status da conexão
    status: async (req, res) => {
        const config = await prisma.contaAzulConfig.findFirst();
        res.json({ connected: !!config });
    },

    // Rota de Debug para entender o que está acontecendo
    debug: async (req, res) => {
        try {
            const count = await prisma.contaAzulConfig.count();
            const first = await prisma.contaAzulConfig.findFirst();
            res.json({
                message: 'Debug Auth',
                count,
                hasToken: !!first,
                tokenStart: first ? first.accessToken.substring(0, 10) + '...' : 'N/A',
                updatedAt: first ? first.updatedAt : 'N/A'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = authController;
