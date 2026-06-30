import axios from 'axios';
import { API_URL } from './api';

// Serviço PÚBLICO (sem login) — usado pela tela /ponto/:token.
const apiPublica = axios.create({ baseURL: `${API_URL}/api` });

export async function obterPonto(token) {
    const { data } = await apiPublica.get(`/ponto-publico/${token}`);
    return data;
}

export async function registrarPonto(token, latLng) {
    const { data } = await apiPublica.post(`/ponto-publico/${token}/registrar`, { latLng });
    return data;
}
