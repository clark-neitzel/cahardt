import api from './api';

const appAuthService = {
    login: async (loginSTR, senhaSTR) => {
        const response = await api.post('/auth/app-login', { login: loginSTR, senha: senhaSTR });
        return response.data; // { token, user: { id, nome, login, permissoes } }
    },

    me: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    }
};

export default appAuthService;
