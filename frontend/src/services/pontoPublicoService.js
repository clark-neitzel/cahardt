import axios from 'axios';
import { API_URL } from './api';

// Serviço PÚBLICO (sem login do app) — usado pela tela /ponto/:token.
const apiPublica = axios.create({ baseURL: `${API_URL}/api` });

const auth = (sessao) => ({ headers: { Authorization: `Bearer ${sessao}` } });

// Metadados públicos: nome, se tem senha, se está bloqueado
export async function obterMeta(token) {
    const { data } = await apiPublica.get(`/ponto-publico/${token}`);
    return data;
}

// Login com a senha do funcionário → devolve a sessão + estado
export async function loginPonto(token, senha) {
    const { data } = await apiPublica.post(`/ponto-publico/${token}/login`, { senha });
    return data;
}

// Estado + batidas do dia (requer sessão)
export async function obterEstado(token, sessao) {
    const { data } = await apiPublica.get(`/ponto-publico/${token}/estado`, auth(sessao));
    return data;
}

// Registrar batida (requer sessão)
export async function registrarPonto(token, sessao, latLng) {
    const { data } = await apiPublica.post(`/ponto-publico/${token}/registrar`, { latLng }, auth(sessao));
    return data;
}
