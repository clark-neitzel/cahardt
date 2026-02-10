import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3000/api', // Ajuste conforme a URL da VPS em produção
    headers: {
        'Content-Type': 'application/json',
    },
});

export default api;
