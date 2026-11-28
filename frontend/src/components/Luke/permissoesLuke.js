// Quem vê o quê no Luke. ESPELHA o backend (backend/routes/copiloto.js e backend/services/chatLukeService.js):
// permissão é valor EXATO, nunca `!!perms.x`.
const objeto = (p) => (p && typeof p === 'object' ? p : {});

/** Novidades + "Tirar dúvida": ausente = ligado; só `=== false` desliga (vale também para administrador). */
export const podeVerAjuda = (p) => objeto(p).Pode_Ver_Clippy !== false;
/** Aba "Pedir ao Luke": admin ou Pode_Usar_Chat_Luke === true. */
export const podeUsarChat = (p) => objeto(p).admin === true || objeto(p).Pode_Usar_Chat_Luke === true;
/** Aba "Autorizações": só administrador (as rotas /api/agentes/solicitacoes exigem admin humano). */
export const ehAdmin = (p) => objeto(p).admin === true;
/**
 * Rotas SEM o cachorro: as públicas (sem menu) do App.jsx — candidatura, bater ponto, tablet do setor, sites
 * Kit Festa/Início/Congelados, lista personalizada e login. Mesmo que a pessoa esteja logada, o Luke não aparece ali.
 * (Fonte única: se uma rota pública nova nascer no App.jsx, entra aqui.)
 */
const ROTAS_SEM_ASSISTENTE = [/^\/candidatura(\/|$)/, /^\/ponto(\/|$)/, /^\/setor(\/|$)/, /^\/kit-festa(\/|$)/, /^\/inicio(\/|$)/, /^\/congelados(\/|$)/, /^\/lista(\/|$)/, /^\/login(\/|$)/];
export const rotaSemAssistente = (pathname) => ROTAS_SEM_ASSISTENTE.some((re) => re.test(String(pathname || '')));

/** O cachorro aparece? Qualquer uma das funções ligadas. Mesma expressão no App.jsx e no PainelEstoque. */
export const lukeVisivel = (p) => podeVerAjuda(p) || podeUsarChat(p);
