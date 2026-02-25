import api from './api';

const appAuthService = {
    login: async (loginSTR, senhaSTR) => {
        const response = await api.post('/app-login', { login: loginSTR, senha: senhaSTR });
        return response.data; // { token, user: { id, nome, login, permissoes } }
    },

    me: async () => {
        const response = await api.get('/me');
        return response.data;
    }
};

export default appAuthService;
