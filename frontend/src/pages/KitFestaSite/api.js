import axios from 'axios';
import { API_URL } from '../../services/api';

// Axios DEDICADO do site público — não usa o interceptor global (que redireciona pro /login).
const kf = axios.create({ baseURL: `${API_URL}/api/kitfesta-publico` });

const TOKEN_KEY = '@KitFesta:token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

kf.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const publicApi = {
  // Auth
  checkCpf: (cpf) => kf.post('/auth/check-cpf', { cpf }).then(r => r.data),
  criarSenha: (dados) => kf.post('/auth/criar-senha', dados).then(r => r.data),
  login: (cpf, senha) => kf.post('/auth/login', { cpf, senha }).then(r => r.data),
  esqueciSenha: (cpf) => kf.post('/auth/esqueci-senha', { cpf }).then(r => r.data),
  resetSenha: (dados) => kf.post('/auth/reset-senha', dados).then(r => r.data),
  // Vitrine
  catalogo: () => kf.get('/catalogo').then(r => r.data),
  categorias: () => kf.get('/categorias').then(r => r.data),
  avaliacoes: () => kf.get('/avaliacoes').then(r => r.data),
  bairros: () => kf.get('/bairros').then(r => r.data),
  config: () => kf.get('/config').then(r => r.data),
  agenda: (inicio, fim) => kf.get('/agenda', { params: { inicio, fim } }).then(r => r.data),
  slots: (data, modo) => kf.get('/slots', { params: { data, modo } }).then(r => r.data),
  validarCupom: (codigo, totalCaixas) => kf.post('/validar-cupom', { codigo, totalCaixas }).then(r => r.data),
  // Pedido
  criarPedido: (dados) => kf.post('/pedido', dados).then(r => r.data),
  // Cliente
  perfil: () => kf.get('/perfil').then(r => r.data),
  meusPedidos: () => kf.get('/meus-pedidos').then(r => r.data),
};

export default publicApi;
