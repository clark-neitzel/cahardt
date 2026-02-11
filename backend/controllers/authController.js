const axios = require('axios');
const prisma = require('../config/database');

const CLIENT_ID = process.env.CONTA_AZUL_CLIENT_ID || '6f6gpe5la4bvg6oehqjh2ugp97';
const CLIENT_SECRET = process.env.CONTA_AZUL_CLIENT_SECRET || '1fvmga9ikj9dk4mkctoqvm2nfna7ht2t60p2qmg7kq04le0gb1ls';
const REDIRECT_URI = process.env.CONTA_AZUL_REDIRECT_URI || 'https://cahardt-github.xrqvlq.easypanel.host/api/auth/callback';

const authController = {
    // Retorna a URL para redirecionar o usuário
    getAuthUrl: (req, res) => {
        const state = 'ESTADO_SEGURANCA'; // Ideal ser aleatório
        // URL Oficial da Documentação (Scope sales para Vendas/Produtos/Clientes)
        const url = `https://api.contaazul.com/auth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=sales&state=${state}`;
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

            const response = await axios.post('https://api.contaazul.com/oauth2/token',
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

            // Salva no banco (Substitui ou cria o primeiro registro - Single Tenant)
            // Vamos deletar anteriores pra garantir apenas 1 config válida
            await prisma.contaAzulConfig.deleteMany({});

            await prisma.contaAzulConfig.create({
                data: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresIn: expires_in
                }
            });

            console.log('✅ Acesso Conta Azul obtido com sucesso!');

            // Redireciona de volta para uma página de sucesso do frontend
            // Ideal seria redirecionar para a URL do frontend
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
    }
};

module.exports = authController;
