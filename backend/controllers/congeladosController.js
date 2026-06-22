const svc = require('../services/congeladosService');

const erro = (res, e, ctx) => {
    console.error(`[Congelados] ${ctx}:`, e.message);
    res.status(400).json({ error: e.message });
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
    ficha: async (req, res) => {
        try { res.json(await svc.fichaPublico(req.params.id)); }
        catch (e) { erro(res, e, 'ficha'); }
    },
    config: async (req, res) => {
        try { res.json(await svc.configPublico()); }
        catch (e) { erro(res, e, 'config'); }
    },
    criarPedido: async (req, res) => {
        try {
            const clienteId = req.congelados?.id || null;
            res.json(await svc.criarPedidoSite({ ...req.body, clienteId }));
        } catch (e) { erro(res, e, 'criarPedido'); }
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
