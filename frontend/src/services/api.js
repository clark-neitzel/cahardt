import axios from 'axios';

// Em produção a API é sempre a MESMA origem do app ('' = domínio atual): o nginx
// do frontend repassa /api e /uploads ao backend. Assim o app funciona em qualquer
// domínio (hardtsalgados.com.br ou easypanel.host) — em 07/2026 o DNS do
// easypanel.host caiu no mundo todo e o endereço absoluto derrubou o app inteiro.
// VITE_API_URL fica só para desenvolvimento local (.env.local → localhost:3000).
export const API_URL = import.meta.env.DEV
    ? (import.meta.env.VITE_API_URL || 'http://localhost:3000')
    : '';

const api = axios.create({
    baseURL: `${API_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor: limpa sessão e redireciona ao login em caso de 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Não tratar 401 do próprio login
            const url = error.config?.url || '';
            if (!url.includes('/auth/app-login')) {
                localStorage.removeItem('@HardtApp:token');
                delete api.defaults.headers.common['Authorization'];
                // Redireciona para login se não estiver lá
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;
