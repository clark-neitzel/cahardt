import axios from 'axios';
import api, { API_URL } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente HTTP ÚNICO do módulo "Como Fazer".
//  - Tablet (sem login do app): token de 2 min em sessionStorage → axios PRÓPRIO.
//    NUNCA passa pelo interceptor do `api` global (ele desloga e manda p/ /login).
//  - App (usuário logado): usa o `api` normal.
// ─────────────────────────────────────────────────────────────────────────────

const CHAVE_SESSAO = 'cf_tablet';
const prefixoAparelho = 'cf_aparelho_';
const chaveDoSlug = (slug) => `${prefixoAparelho}${String(slug || '').toLowerCase()}`;

// ---------- sessão do tablet ----------
export function lerSessaoTablet() {
    try {
        const raw = sessionStorage.getItem(CHAVE_SESSAO);
        if (!raw) return null;
        const s = JSON.parse(raw);
        return s && s.token ? s : null;
    } catch { return null; }
}

function avisarSessao() {
    try { window.dispatchEvent(new Event('cf:sessao')); } catch { /* sem window */ }
}

export function gravarSessaoTablet(sessao) {
    try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch { /* storage bloqueado */ }
    avisarSessao();
}

export function limparSessaoTablet() {
    try { sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* ignora */ }
    avisarSessao();
}

// ---------- chave do aparelho (pareamento) ----------
export function lerChaveAparelho(slug) {
    try { return localStorage.getItem(chaveDoSlug(slug)) || ''; } catch { return ''; }
}
export function gravarChaveAparelho(slug, chave) {
    try { localStorage.setItem(chaveDoSlug(slug), chave); } catch { /* ignora */ }
}
export function limparChaveAparelho(slug) {
    try { localStorage.removeItem(chaveDoSlug(slug)); } catch { /* ignora */ }
}

// ---------- axios ----------
const publico = axios.create({ baseURL: `${API_URL}/api` });          // sem interceptor
const tablet = axios.create({ baseURL: `${API_URL}/api` });           // com token do tablet
// Cliente do APP sem o interceptor que desloga em 401: usado onde o 401 é "senha errada" (PIN do encarregado),
// não "token do app inválido". Lê o token do mesmo lugar que o api.js/AuthContext.
const apiSemLogout = axios.create({ baseURL: `${API_URL}/api` });
apiSemLogout.interceptors.request.use((config) => {
    try { const t = localStorage.getItem('@HardtApp:token'); if (t) config.headers.Authorization = `Bearer ${t}`; } catch { /* sem storage */ }
    return config;
});

tablet.interceptors.request.use((config) => {
    const s = lerSessaoTablet();
    if (s?.token) config.headers.Authorization = `Bearer ${s.token}`;
    return config;
});

tablet.interceptors.response.use(
    (r) => r,
    (error) => {
        const status = error.response?.status;
        const codigo = error.response?.data?.codigo;
        // 401 PIN_INCORRETO é só senha errada do encarregado: a sessão do tablet continua.
        if (status === 401 && codigo !== 'PIN_INCORRETO') {
            // Qualquer OUTRO 401 com token de tablet = a sessão acabou (expirou, foi trocada, aparelho revogado).
            // Volta à grade de fotos. Nunca mexe no login do app.
            const s = lerSessaoTablet();
            if (codigo === 'APARELHO_NAO_AUTORIZADO' && s?.slug) limparChaveAparelho(s.slug);
            limparSessaoTablet();
        }
        return Promise.reject(error);
    }
);

// O cliente vem do CONTEXTO DA ROTA, não do storage: em /setor/* é sempre o do tablet (mesmo que o
// aparelho tenha login do app); fora dela é sempre o do app (mesmo com sessão de tablet sobrando).
export const naRotaTablet = () => typeof window !== 'undefined' && window.location.pathname.startsWith('/setor/');
const http = () => (naRotaTablet() ? tablet : api);

/** Mensagem em português simples a partir de um erro de rede/servidor. */
export function mensagemErro(e, padrao = 'Não deu certo. Tente de novo.') {
    if (!e?.response) return 'Sem conexão com o servidor.';
    const d = e.response.data || {};
    return d.erro || d.error || d.message || padrao;
}
export const codigoErro = (e) => e?.response?.data?.codigo || '';
export const semResposta = (e) => !e?.response; // falha de rede (backend parado, sem internet)

// ---------- mídia ----------
/** Caminho relativo vindo do backend → URL da imagem/vídeo. Vazio se não houver. */
export function urlMidia(rel) {
    if (!rel || typeof rel !== 'string') return '';
    if (/^https?:\/\//i.test(rel)) return rel;
    return `${API_URL}/uploads/${rel.replace(/^\/+/, '')}`;
}

// ---------- status de treinamento: dicionário ÚNICO (Home, Fim e Painel usam este) ----------
export const STATUS_VISUAL = {
    PENDENTE: { emoji: '🟡', rotulo: 'Falta aprender', badge: 'bg-yellow-100 text-yellow-800', borda: 'border-yellow-400', pendente: true },
    AGUARDANDO_CONFIRMACAO: { emoji: '🟡', rotulo: 'Falta o encarregado confirmar', badge: 'bg-yellow-100 text-yellow-800', borda: 'border-yellow-400', pendente: true },
    VENCIDO: { emoji: '🟡', rotulo: 'Precisa refazer', badge: 'bg-yellow-100 text-yellow-800', borda: 'border-yellow-400', pendente: true },
    VENCENDO: { emoji: '⏳', rotulo: 'Vai vencer', badge: 'bg-amber-100 text-amber-700', borda: 'border-amber-300', pendente: false },
    OK: { emoji: '✅', rotulo: 'Já sei fazer', badge: 'bg-green-100 text-green-800', borda: 'border-gray-200', pendente: false },
    NAO_SE_APLICA: { emoji: '—', rotulo: 'Não se aplica', badge: 'bg-gray-100 text-gray-700', borda: 'border-gray-200', pendente: false },
};
export const statusVisual = (s) => STATUS_VISUAL[s] || STATUS_VISUAL.PENDENTE; // desconhecido = pendente

export const TIPOS = {
    ROTINA: { rotulo: 'Rotina', icone: '📋' },
    MAQUINA: { rotulo: 'Máquina', icone: '⚙️' },
    REGRA: { rotulo: 'Regra', icone: '📜' },
    DOSAGEM: { rotulo: 'Dosagem', icone: '🥄' },
};
export const SETORES = [
    { slug: 'COZINHA', nome: 'Cozinha', emoji: '🍳' },
    { slug: 'ESTOQUE', nome: 'Estoque', emoji: '📦' },
    { slug: 'EXPEDICAO', nome: 'Expedição', emoji: '🚚' },
    { slug: 'MOTORISTA', nome: 'Motorista', emoji: '🛵' },
];

/** uuid para a `chave` de idempotência (fallback p/ iOS antigo sem crypto.randomUUID) */
export function novoUuid() {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* cai no fallback */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// ---------- serviço ----------
const comoFazerService = {
    // — entrar no tablet (públicas, com a chave do aparelho) —
    grade: async (slug) => (await publico.get(`/como-fazer/tablet/${slug}/funcionarios`, {
        headers: { 'x-cf-aparelho': lerChaveAparelho(slug) },
    })).data,
    entrar: async (slug, funcionarioId, pin) => (await publico.post(`/como-fazer/tablet/${slug}/entrar`,
        { funcionarioId, pin },
        { headers: { 'x-cf-aparelho': lerChaveAparelho(slug) } })).data,
    renovar: async () => (await tablet.post('/como-fazer/sessao/renovar')).data,

    // — equipe (tablet ou app) —
    me: async () => (await http().get('/como-fazer/me')).data,
    home: async (setor) => (await http().get('/como-fazer/home', { params: setor ? { setor } : {} })).data,
    conteudo: async (id, previa = false) => (await http().get(`/como-fazer/conteudos/${id}`, { params: previa ? { previa: 1 } : {} })).data,
    aprendi: async (id) => (await http().post(`/como-fazer/conteudos/${id}/aprendi`)).data,
    encarregados: async (setor) => (await http().get('/como-fazer/encarregados', { params: setor ? { setor } : {} })).data,
    confirmar: async (id, dados) => (await (naRotaTablet() ? tablet : apiSemLogout).post(`/como-fazer/conteudos/${id}/confirmar`, dados)).data,
    executar: async (id, dados) => (await http().post(`/como-fazer/conteudos/${id}/execucoes`, dados)).data,
    execucoesHoje: async (id) => (await http().get(`/como-fazer/conteudos/${id}/execucoes/hoje`)).data,
    chamarEncarregado: async (id, dados = {}) => (await http().post(`/como-fazer/conteudos/${id}/chamar-encarregado`, dados)).data,
    upload: async (arquivo, contexto = 'execucao', conteudoId = '') => {
        const form = new FormData();
        form.append('contexto', contexto);
        if (conteudoId) form.append('conteudoId', conteudoId);
        form.append('arquivo', arquivo);
        // o `api` do app tem Content-Type JSON por padrão: sem isto o arquivo não chega como multipart
        return (await http().post('/como-fazer/upload', form, { timeout: 120000, headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },

    // — painel (app) —
    painelResumo: async (params) => (await api.get('/como-fazer/painel/resumo', { params })).data,
    painelTreinamentos: async (setor) => (await api.get('/como-fazer/painel/treinamentos', { params: { setor } })).data,
    lembrar: async (funcionarioId, conteudoId) => (await api.post('/como-fazer/painel/treinamentos/lembrar', { funcionarioId, conteudoId })).data,
    painelExecucoes: async (params) => (await api.get('/como-fazer/painel/execucoes', { params })).data,
    painelRelatorio: async (params) => (await api.get('/como-fazer/painel/relatorio', { params })).data,

    // — editor (app) —
    listarAdmin: async (params) => (await api.get('/como-fazer/admin/conteudos', { params })).data,
    criar: async (dados) => (await api.post('/como-fazer/admin/conteudos', dados)).data,
    detalharAdmin: async (id) => (await api.get(`/como-fazer/admin/conteudos/${id}`)).data,
    atualizar: async (id, dados) => (await api.put(`/como-fazer/admin/conteudos/${id}`, dados)).data,
    salvarRascunho: async (id, doc) => (await api.put(`/como-fazer/admin/conteudos/${id}/rascunho`, { doc })).data,
    publicar: async (id, zeraTreinamento) => (await api.post(`/como-fazer/admin/conteudos/${id}/publicar`, { zeraTreinamento })).data,
    arquivar: async (id) => (await api.post(`/como-fazer/admin/conteudos/${id}/arquivar`)).data,
    sincronizarAgenda: async (id) => (await api.post(`/como-fazer/admin/conteudos/${id}/sincronizar-agenda`)).data,
    parear: async (setor) => (await api.post(`/como-fazer/admin/tablet/${setor}/parear`)).data,
};

export default comoFazerService;
