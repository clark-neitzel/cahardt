import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
    baseURL: `${API_URL}/api`, // Ajuste conforme a URL da VPS em produção
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
