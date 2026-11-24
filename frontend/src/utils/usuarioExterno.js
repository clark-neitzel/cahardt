// Usuário externo (contador): enxerga e alcança SÓ a Contabilidade.
// FONTE ÚNICA da regra no frontend. Espelha o authMiddleware do backend
// (backend/middlewares/authMiddleware.js): mesma regra, mesma lista de rotas.
// Ampliar o escopo = acrescentar o item aqui E na lista do servidor.
export const ROTAS_EXTERNO = ['/admin/contabilidade'];

// externo = !admin && Usuario_Externo === true (admin ignora o interruptor)
export const ehUsuarioExterno = (permissoes) =>
    !!permissoes && !permissoes.admin && permissoes.Usuario_Externo === true;

export const rotaPermitidaExterno = (pathname) =>
    ROTAS_EXTERNO.some(r => pathname === r || pathname.startsWith(r + '/'));

// Tela inicial do externo; null = não tem nenhuma tela liberada.
export const homeDoExterno = (permissoes) =>
    permissoes?.Pode_Acessar_Contabilidade === true ? ROTAS_EXTERNO[0] : null;
