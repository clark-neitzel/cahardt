import { API_URL } from '../../services/api';

// Utilitários compartilhados do site público (Home, Congelados, Kit Festa).
export const LOGO_PADRAO = '/cong/logo.png';

export const LOJA_PADRAO = {
  nome: 'Hardt Doces e Salgados',
  endereco: 'Rua XV de Outubro, 170 — Pirabeiraba, Joinville/SC',
  telefone: '(47) 98854-8476',
  whatsapp: '5547988548476',
  instagram: 'hardtsalgados',
};

export const imgUrl = (u) => (!u ? null : (String(u).startsWith('http') ? u : `${API_URL}${u}`));

// Dados da loja com os mesmos fallbacks de sempre.
export const lojaDe = (cfg) => ({ ...LOJA_PADRAO, ...((cfg && cfg.loja) || {}) });

export const logoDe = (cfg, logo) => logo || (cfg && cfg.logoUrl ? imgUrl(cfg.logoUrl) : LOGO_PADRAO);

export const socialUrl = (v, base) => (!v ? null : (String(v).startsWith('http') ? v : `${base}${String(v).replace(/^@/, '')}`));

export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
