import axios from 'axios';
import { API_URL } from '../../services/api';

// Axios dedicado do site público de congelados — sem interceptor global (não redireciona p/ /login).
const cg = axios.create({ baseURL: `${API_URL}/api/congelados-publico` });

const TOKEN_KEY = '@Congelados:token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

cg.interceptors.request.use(cfg => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export const publicApi = {
  // Auth
  checkDoc: (documento) => cg.post('/auth/check-doc', { documento }).then(r => r.data),
  criarSenha: (dados) => cg.post('/auth/criar-senha', dados).then(r => r.data),
  login: (documento, senha) => cg.post('/auth/login', { documento, senha }).then(r => r.data),
  esqueciSenha: (documento) => cg.post('/auth/esqueci-senha', { documento }).then(r => r.data),
  resetSenha: (dados) => cg.post('/auth/reset-senha', dados).then(r => r.data),
  // Vitrine
  catalogo: () => cg.get('/catalogo').then(r => r.data),
  grupos: () => cg.get('/grupos').then(r => r.data),
  config: () => cg.get('/config').then(r => r.data),
  ficha: (id) => cg.get(`/produto/${id}/ficha`).then(r => r.data),
  // Cliente logado
  perfil: () => cg.get('/perfil').then(r => r.data),
  meuCatalogo: () => cg.get('/meu-catalogo').then(r => r.data),
  meusPedidos: () => cg.get('/meus-pedidos').then(r => r.data),
  // Pedido
  criarPedido: (dados) => cg.post('/pedido', dados).then(r => r.data),
};

export default publicApi;
