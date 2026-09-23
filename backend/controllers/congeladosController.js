const svc = require('../services/congeladosService');

// `code` (v1.6.0, aditivo): quando a regra de negócio dá um código fechado (VISITANTE_SEM_CPF,
// PROMOCAO_INVALIDA, PROMOCAO_NAO_LIBERADA) ele vai junto — antes ficava só no `e.code` e o bot
// nunca recebia.
// `itensSemEstoque` (09/2026, aditivo): erro SEM_ESTOQUE da aprovação leva a lista de itens
// em falta junto, para a tela montar o alerta sem precisar de uma segunda chamada.
const erro = (res, e, ctx) => {
    console.error(`[Congelados] ${ctx}:`, e.message);
    const body = { error: e.message };
    if (e.code) body.code = e.code;
    if (e.itensSemEstoque) body.itensSemEstoque = e.itensSemEstoque;
    res.status(400).json(body);
};

const congeladosController = {
    // ===================== PÚBLICO =====================
    checkDoc: async (req, res) => {
        try { res.json(await svc.checkDoc(req.body.documento)); }
        catch (e) { erro(res, e, 'checkDoc'); }
    },
    criarSenha: async (req, res) => {
        try { res.json(await svc.criarSenha(req.body)); }
        catch (e) { erro(res, e, 'criarSenha'); }
    },
    login: async (req, res) => {
        try { res.json(await svc.login(req.body)); }
        catch (e) { erro(res, e, 'login'); }
    },
    esqueciSenha: async (req, res) => {
        try { res.json(await svc.esqueciSenha(req.body.documento)); }
        catch (e) { erro(res, e, 'esqueciSenha'); }
    },
    resetSenha: async (req, res) => {
        try { res.json(await svc.resetSenha(req.body)); }
        catch (e) { erro(res, e, 'resetSenha'); }
    },
    perfil: async (req, res) => {
        try { res.json(await svc.perfil(req.congelados.id)); }
        catch (e) { erro(res, e, 'perfil'); }
    },
    catalogo: async (req, res) => {
        try { res.json(await svc.catalogoVisitante()); }
        catch (e) { erro(res, e, 'catalogo'); }
    },
    grupos: async (req, res) => {
        try { res.json(await svc.gruposPublico()); }
        catch (e) { erro(res, e, 'grupos'); }
    },
    meuCatalogo: async (req, res) => {
        try { res.json(await svc.meuCatalogo(req.congelados.id)); }
        catch (e) { erro(res, e, 'meuCatalogo'); }
    },
    // ── v1.6.0 — caminhos da IA (mesmas URLs da /v1; resposta = antiga + objeto único de produto).
    // O site público continua chamando `catalogo`/`meuCatalogo` sem enriquecimento.
    catalogoIA: async (req, res) => {
        try { res.json(await svc.catalogoVisitante({ paraIA: true })); }
        catch (e) { erro(res, e, 'catalogoIA'); }
    },
    meuCatalogoIA: async (req, res) => {
        try { res.json(await svc.meuCatalogo(req.congelados.id, { paraIA: true })); }
        catch (e) { erro(res, e, 'meuCatalogoIA'); }
    },
    promocoes: async (req, res) => {
        try { res.json(await svc.promocoesVigentes()); }
        catch (e) { erro(res, e, 'promocoes'); }
    },
    indisponiveis: async (req, res) => {
        try { res.json(await svc.indisponiveis()); }
        catch (e) { erro(res, e, 'indisponiveis'); }
    },
    catalogoPorTelefone: async (req, res) => {
        try { res.json(await svc.catalogoPorTelefone(req.body.telefone)); }
        catch (e) { erro(res, e, 'catalogoPorTelefone'); }
    },
    criarSenhaPorTelefone: async (req, res) => {
        try { res.json(await svc.criarSenhaPorTelefone(req.body)); }
        catch (e) { erro(res, e, 'criarSenhaPorTelefone'); }
    },
    ficha: async (req, res) => {
        try { res.json(await svc.fichaPublico(req.params.id)); }
        catch (e) { erro(res, e, 'ficha'); }
    },
    config: async (req, res) => {
        try { res.json(await svc.configPublico()); }
        catch (e) { erro(res, e, 'config'); }
    },
    // Lista oficial do Bot Hardt de quem está autorizado a receber conversa vinda do site
    // (proxy autenticado com cache de 5 min — o front nunca fala com o bot direto).
    // O site usa isto SÓ para conferir se o vendedor do próprio cliente está autorizado;
    // a lista NUNCA é exibida ao cliente (não existe mais escolha de vendedor no site).
    vendedoresSite: async (req, res) => {
        try {
            const { listarVendedoresSite } = require('../services/botSiteVendedoresService');
            res.json({ vendedores: await listarVendedoresSite() });
        } catch (e) { erro(res, e, 'vendedoresSite'); }
    },
    criarPedido: async (req, res) => {
        try {
            const clienteId = req.congelados?.id || null;
            res.json(await svc.criarPedidoSite({ ...req.body, clienteId }));
        } catch (e) { erro(res, e, 'criarPedido'); }
    },
    // Criação de pedido pela IA de WhatsApp (identifica por telefone; ver ia-consulta-api.md).
    criarPedidoIA: async (req, res) => {
        try { res.json(await svc.criarPedidoIA(req.body)); }
        catch (e) { erro(res, e, 'criarPedidoIA'); }
    },
    meusPedidos: async (req, res) => {
        try { res.json(await svc.meusPedidos(req.congelados.id)); }
        catch (e) { erro(res, e, 'meusPedidos'); }
    },

    // ===================== ADMIN =====================
    adminProdutosApp: async (req, res) => {
        try { res.json(await svc.adminListarProdutosApp({ busca: req.query.busca, categoriaComercialId: req.query.categoriaComercialId })); }
        catch (e) { erro(res, e, 'adminProdutosApp'); }
    },
    adminSalvarProdutoSite: async (req, res) => {
        try { res.json(await svc.adminSalvarProdutoSite(req.params.produtoId, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarProdutoSite'); }
    },
    adminRemoverProdutoSite: async (req, res) => {
        try { res.json(await svc.adminRemoverProdutoSite(req.params.produtoId)); }
        catch (e) { erro(res, e, 'adminRemoverProdutoSite'); }
    },
    adminGetConfig: async (req, res) => {
        try { res.json(await svc.adminGetConfig()); }
        catch (e) { erro(res, e, 'adminGetConfig'); }
    },
    adminSetConfig: async (req, res) => {
        try { res.json(await svc.adminSetConfig(req.params.chave, req.body.valor)); }
        catch (e) { erro(res, e, 'adminSetConfig'); }
    },
    adminUploadLogo: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
            const url = `/uploads/congelados/${req.file.filename}`;
            await svc.adminSetConfig('logoUrl', url);
            res.json({ logoUrl: url });
        } catch (e) { erro(res, e, 'adminUploadLogo'); }
    },
    adminUploadImagem: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
            res.json({ url: `/uploads/congelados/${req.file.filename}` });
        } catch (e) { erro(res, e, 'adminUploadImagem'); }
    },
    adminPedidos: async (req, res) => {
        try { res.json(await svc.adminListarPedidos({ status: req.query.status, busca: req.query.busca })); }
        catch (e) { erro(res, e, 'adminPedidos'); }
    },
    pedidosNovosSite: async (req, res) => {
        try { res.json(await svc.pedidosNovosSite()); }
        catch (e) { erro(res, e, 'pedidosNovosSite'); }
    },
    adminAprovarPedido: async (req, res) => {
        try { res.json(await svc.adminAprovarPedido(req.params.id, { ...req.body, aprovadoPorId: req.user?.id })); }
        catch (e) { erro(res, e, 'adminAprovarPedido'); }
    },
    adminRecusarPedido: async (req, res) => {
        try { res.json(await svc.adminRecusarPedido(req.params.id, req.body.motivo)); }
        catch (e) { erro(res, e, 'adminRecusarPedido'); }
    },
    adminVincularCliente: async (req, res) => {
        try { res.json(await svc.adminVincularCliente(req.params.id, req.body.clienteUuid)); }
        catch (e) { erro(res, e, 'adminVincularCliente'); }
    },
    adminExcluirPedido: async (req, res) => {
        try {
            if (!req.user?.permissoes?.admin) return res.status(403).json({ error: 'Apenas administradores podem excluir pedidos.' });
            res.json(await svc.adminExcluirPedido(req.params.id));
        } catch (e) { erro(res, e, 'adminExcluirPedido'); }
    },
};

module.exports = congeladosController;
