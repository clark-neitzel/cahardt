// ============================================================================
// Permissão de EDIÇÃO do cadastro de produtos — usada pelas rotas de escrita de
// /api/produtos e /api/promocoes.
//
// ⚠️ PERMISSÕES SÃO OBJETO, NÃO BOOLEANO. Até 09/2026 as rotas de produto
// testavam `permissoes.produtos`, e um objeto é SEMPRE verdadeiro em JavaScript
// — mesmo `{ edit: false, view: false }`. Resultado: quem tinha acesso só de
// leitura (ou nem isso) conseguia criar/editar/inativar produto, trocar imagem,
// mexer no PREÇO de venda e criar PROMOÇÃO (que vira o preço-base do pedido em
// NovoPedido.jsx). A checagem correta olha DENTRO do objeto: `produtos.edit`.
//
// Vive num arquivo só para não haver duas versões da mesma regra: se um dia a
// permissão mudar, muda aqui e vale para as duas famílias de rota.
// ============================================================================
const ligado = (v) => v === true || v === 'true';

const exigeEdicaoProdutos = (req, res, next) => {
    const permissoes = req.user?.permissoes || {};
    if (ligado(permissoes.admin) || ligado(permissoes.produtos?.edit)) return next();
    return res.status(403).json({ error: 'Sem permissão para editar produtos. Peça a um administrador a permissão "Produtos → editar".' });
};

module.exports = { exigeEdicaoProdutos, ligado };
