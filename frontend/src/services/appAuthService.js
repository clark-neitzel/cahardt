import api from './api';

const appAuthService = {
    login: async (loginSTR, senhaSTR) => {
        const response = await api.post('/auth/app-login', { login: loginSTR, senha: senhaSTR });
        return response.data; // { token, user: { id, nome, login, permissoes } }
    },

    // Timeout curto: essa chamada trava a abertura do app. Sem ele, uma conexão
    // pendurada (4G ruim) deixava o usuário no "Validando sessão..." para sempre.
    me: async () => {
        const response = await api.get('/auth/me', { timeout: 12000 });
        return response.data;
    }
};

export default appAuthService;
