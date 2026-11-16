import { useSyncExternalStore } from 'react';
import { API_URL } from '../services/api';

// URL de arquivo em /uploads com o token de mídia (?mt=).
// Arquivos sensíveis (documentos de funcionário, currículos) só abrem com esse token na URL,
// porque <img> e <a target="_blank"> não mandam o header Authorization.
//
// O token fica em variável de módulo: o AuthContext define/limpa/renova. Sem token (ainda não
// buscou, ou backend sem a trava) a URL sai sem ?mt= e segue funcionando como antes.

let tokenMidia = '';
const ouvintes = new Set();

export function definirTokenMidia(t) {
    const novo = t ? String(t) : '';
    if (novo === tokenMidia) return;
    tokenMidia = novo;
    ouvintes.forEach((fn) => { try { fn(); } catch { /* ouvinte não pode derrubar os outros */ } });
}
export function limparTokenMidia() { definirTokenMidia(''); }
export function obterTokenMidia() { return tokenMidia; }

function assinar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }

/** Chame num componente que renderiza <img>/<video>: ele re-renderiza quando o token chega/renova. */
export function useTokenMidia() {
    return useSyncExternalStore(assinar, obterTokenMidia, obterTokenMidia);
}

/**
 * caminhoRelativo: o que vem do banco ('funcionarios/12/aso.pdf'), com ou sem '/' e 'uploads/' na frente.
 * token (opcional): usa este em vez do token de mídia (ex.: token de edição do candidato na página pública).
 * Link que abre em nova aba: chame no onClick/href calculado na hora do clique, não guarde a string.
 */
export function urlUpload(caminhoRelativo, token) {
    if (!caminhoRelativo || typeof caminhoRelativo !== 'string') return '';
    if (/^https?:\/\//i.test(caminhoRelativo)) return caminhoRelativo;
    const rel = caminhoRelativo.replace(/^\/+/, '').replace(/^uploads\//, '');
    const base = `${API_URL}/uploads/${rel}`;
    const mt = token === undefined ? tokenMidia : token;
    if (!mt) return base;
    return `${base}${base.includes('?') ? '&' : '?'}mt=${encodeURIComponent(mt)}`;
}

/**
 * Para <a href={urlUpload(x)} target="_blank" onClick={(e) => renovarHref(e, x)}>:
 * regrava o href com o token do MOMENTO do clique (pode ter renovado desde a renderização).
 * Mantém o <a> nativo (no iOS/PWA abre melhor que window.open).
 */
export function renovarHref(e, caminhoRelativo) {
    const a = e?.currentTarget;
    if (a && 'href' in a) a.href = urlUpload(caminhoRelativo);
}
