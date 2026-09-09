// ============================================================================
// Permissão de ESCRITA das categorias comerciais de produto — usada pelas rotas
// POST / PUT / DELETE de /api/categorias-produto.
//
// ⚠️ POR QUE ISTO EXISTE (09/2026):
// A rota estava montada só com `authMiddleware` — QUALQUER usuário logado
// (motorista, vendedor, PCP) podia criar, renomear e APAGAR categoria comercial.
// Agravante: a FK `produtos_categoria_produto_id_fkey` é ON DELETE SET NULL, ou
// seja, apagar uma categoria NÃO dá erro: ela some e zera o
// `categoria_produto_id` de todos os produtos ligados a ela, em silêncio, sem
// desfazer. Isso destrói a classificação comercial usada em filtro, catálogo,
// restrição de categoria por vendedor e recomendação.
//
// Decisão do dono: escrita só para admin OU para quem receber a permissão
// própria `Pode_Editar_Categorias_Produto` (nasce DESLIGADA para todo mundo e
// se concede no painel de permissões — seção Configurações).
//
// A LEITURA (GET) continua liberada para qualquer autenticado: a lista de
// categorias alimenta filtros, catálogo e a tela de produto do time todo.
//
// ⚠️ PERMISSÕES SÃO OBJETO, NÃO BOOLEANO em vários blocos (`produtos`,
// `configuracoes`, `pcp`...). `Pode_Editar_Categorias_Produto` é booleano de
// primeiro nível, como `Pode_Dar_Desconto_Baixa` — por isso a checagem usa
// `ligado()` (aceita true e a string "true"), nunca `!!permissoes.x` sobre um
// objeto.
// ============================================================================
const ligado = (v) => v === true || v === 'true';

const MSG_SEM_PERMISSAO = 'Sem permissão para alterar categorias de produto. Peça a um administrador a permissão «Configurações → Categorias de Produto (criar, editar e excluir)».';

const exigeEdicaoCategoriasProduto = (req, res, next) => {
    const permissoes = req.user?.permissoes || {};
    if (ligado(permissoes.admin) || ligado(permissoes.Pode_Editar_Categorias_Produto)) return next();
    return res.status(403).json({ error: MSG_SEM_PERMISSAO });
};

module.exports = { exigeEdicaoCategoriasProduto, ligado, MSG_SEM_PERMISSAO };
