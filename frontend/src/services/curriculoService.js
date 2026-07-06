import axios from 'axios';
import api, { API_URL } from './api';

// API pública (sem token) — usa o mesmo domínio de produção que api.js
const apiPublica = axios.create({ baseURL: `${API_URL}/api` });

// ─── Públicas ───────────────────────────────────────────────────────────────
// Passo 1: pede acesso. Se o CPF já existe, o backend envia um código ao WhatsApp
// cadastrado e devolve { existe:true, enviado, telefoneMascarado } — sem dado pessoal.
// Se não existe, devolve { existe:false } (cadastro novo).
export async function solicitarAcessoCurriculo(cpf) {
  const { data } = await apiPublica.post('/curriculos/solicitar-acesso', { cpf: cpf.replace(/\D/g, '') });
  return data;
}

// Passo 2: valida o código e recebe { curriculo, token } para editar.
export async function validarAcessoCurriculo(cpf, codigo) {
  const { data } = await apiPublica.post('/curriculos/validar-acesso', { cpf: cpf.replace(/\D/g, ''), codigo });
  return data;
}

const authHeader = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

export async function salvarCurriculo(dados, token) {
  const { data } = await apiPublica.post('/curriculos', dados, { headers: { ...authHeader(token) } });
  return data; // { curriculo, editado, token }
}

export async function uploadFotoCurriculo(cpf, arquivo, token) {
  const form = new FormData();
  form.append('cpf', cpf.replace(/\D/g, ''));
  form.append('foto', arquivo);
  const { data } = await apiPublica.post('/curriculos/foto', form, {
    headers: { 'Content-Type': 'multipart/form-data', ...authHeader(token) },
  });
  return data;
}

// ─── Painel RH (protegidas) ─────────────────────────────────────────────────
export async function listarCurriculos(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.status) {
    const s = Array.isArray(filtros.status) ? filtros.status.join(',') : filtros.status;
    if (s) params.set('status', s);
  }
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

export async function excluirCurriculo(id) {
  const { data } = await api.delete(`/rh/curriculos/${id}`);
  return data;
}

export async function obterContagens() {
  const { data } = await api.get('/rh/curriculos/contagens');
  return data;
}
