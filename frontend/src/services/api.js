import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'https://cahardt-hardt-backend.xrqvlq.easypanel.host';

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
