import axios from 'axios';
import api from './api';

const API_URL = import.meta.env.VITE_API_URL || '';

// API pública (sem token)
const apiPublica = axios.create({ baseURL: `${API_URL}/api` });

// ─── Públicas ───────────────────────────────────────────────────────────────
export async function buscarCurriculoPorCpf(cpf) {
  const { data } = await apiPublica.get(`/curriculos/buscar?cpf=${cpf.replace(/\D/g, '')}`);
  return data;
}

export async function salvarCurriculo(dados) {
  const { data } = await apiPublica.post('/curriculos', dados);
  return data;
}

export async function uploadFotoCurriculo(cpf, arquivo) {
  const form = new FormData();
  form.append('cpf', cpf.replace(/\D/g, ''));
  form.append('foto', arquivo);
  const { data } = await apiPublica.post('/curriculos/foto', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ─── Painel RH (protegidas) ─────────────────────────────────────────────────
export async function listarCurriculos(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.areaInteresse) params.set('areaInteresse', filtros.areaInteresse);
  if (filtros.busca) params.set('busca', filtros.busca);
  if (filtros.pagina) params.set('pagina', filtros.pagina);
  if (filtros.limite) params.set('limite', filtros.limite);
  const { data } = await api.get(`/rh/curriculos?${params}`);
  return data;
}

export async function obterCurriculo(id) {
  const { data } = await api.get(`/rh/curriculos/${id}`);
  return data;
}

export async function atualizarCurriculo(id, dados) {
  const { data } = await api.put(`/rh/curriculos/${id}`, dados);
  return data;
}

export async function gerarLinkWhatsapp(id) {
  const { data } = await api.get(`/rh/curriculos/${id}/whatsapp`);
  return data;
}

export async function obterContagens() {
  const { data } = await api.get('/rh/curriculos/contagens');
  return data;
}
