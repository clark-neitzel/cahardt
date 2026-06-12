const svc = require('../services/kitFestaService');

const erro = (res, e, ctx) => {
    console.error(`[KitFesta] ${ctx}:`, e.message);
    res.status(400).json({ error: e.message });
};

const kitFestaController = {
    // ===================== PÚBLICO =====================
    checkCpf: async (req, res) => {
        try { res.json(await svc.checkCpf(req.body.cpf)); }
        catch (e) { erro(res, e, 'checkCpf'); }
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
        try { res.json(await svc.esqueciSenha(req.body.cpf)); }
        catch (e) { erro(res, e, 'esqueciSenha'); }
    },
    resetSenha: async (req, res) => {
        try { res.json(await svc.resetSenha(req.body)); }
        catch (e) { erro(res, e, 'resetSenha'); }
    },
    perfil: async (req, res) => {
        try { res.json(await svc.perfil(req.kitFesta.id)); }
        catch (e) { erro(res, e, 'perfil'); }
    },
    catalogo: async (req, res) => {
        try { res.json(await svc.catalogoPublico()); }
        catch (e) { erro(res, e, 'catalogo'); }
    },
    categorias: async (req, res) => {
        try { res.json(await svc.categoriasPublico()); }
        catch (e) { erro(res, e, 'categorias'); }
    },
    avaliacoes: async (req, res) => {
        try { res.json(await svc.avaliacoesPublico()); }
        catch (e) { erro(res, e, 'avaliacoes'); }
    },
    bairros: async (req, res) => {
        try { res.json(await svc.bairrosPublico()); }
        catch (e) { erro(res, e, 'bairros'); }
    },
    config: async (req, res) => {
        try { res.json(await svc.configPublico()); }
        catch (e) { erro(res, e, 'config'); }
    },
    agenda: async (req, res) => {
        try { res.json(await svc.agendaPublico({ inicio: req.query.inicio, fim: req.query.fim })); }
        catch (e) { erro(res, e, 'agenda'); }
    },
    slots: async (req, res) => {
        try { res.json(await svc.slotsPublico({ data: req.query.data, modo: req.query.modo })); }
        catch (e) { erro(res, e, 'slots'); }
    },
    validarCupom: async (req, res) => {
        try { res.json(await svc.validarCupom({ codigo: req.body.codigo, totalCaixas: req.body.totalCaixas })); }
        catch (e) { erro(res, e, 'validarCupom'); }
    },
    criarPedido: async (req, res) => {
        try {
            const clienteId = req.kitFesta?.id || null; // se autenticado
            res.json(await svc.criarPedidoSite({ ...req.body, clienteId }));
        } catch (e) { erro(res, e, 'criarPedido'); }
    },
    meusPedidos: async (req, res) => {
        try { res.json(await svc.meusPedidos(req.kitFesta.id)); }
        catch (e) { erro(res, e, 'meusPedidos'); }
    },

    // ===================== ADMIN =====================
    // Produtos
    adminProdutosApp: async (req, res) => {
        try { res.json(await svc.adminListarProdutosApp({ busca: req.query.busca, categoriaCA: req.query.categoriaCA, categoriaComercialId: req.query.categoriaComercialId })); }
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
    // Categorias
    adminCategorias: async (req, res) => {
        try { res.json(await svc.adminListarCategorias()); }
        catch (e) { erro(res, e, 'adminCategorias'); }
    },
    adminSalvarCategoria: async (req, res) => {
        try { res.json(await svc.adminSalvarCategoria(req.params.id || null, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarCategoria'); }
    },
    adminRemoverCategoria: async (req, res) => {
        try { res.json(await svc.adminRemoverCategoria(req.params.id)); }
        catch (e) { erro(res, e, 'adminRemoverCategoria'); }
    },
    // Agenda
    adminAgenda: async (req, res) => {
        try { res.json(await svc.adminListarAgenda({ inicio: req.query.inicio, fim: req.query.fim })); }
        catch (e) { erro(res, e, 'adminAgenda'); }
    },
    adminSetStatusDia: async (req, res) => {
        try { res.json(await svc.adminSetStatusDia(req.body)); }
        catch (e) { erro(res, e, 'adminSetStatusDia'); }
    },
    adminSetStatusLote: async (req, res) => {
        try { res.json(await svc.adminSetStatusLote(req.body)); }
        catch (e) { erro(res, e, 'adminSetStatusLote'); }
    },
    // Horários
    adminHorarios: async (req, res) => {
        try { res.json(await svc.adminListarHorarios()); }
        catch (e) { erro(res, e, 'adminHorarios'); }
    },
    adminSalvarHorario: async (req, res) => {
        try { res.json(await svc.adminSalvarHorario(req.params.id || null, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarHorario'); }
    },
    adminRemoverHorario: async (req, res) => {
        try { res.json(await svc.adminRemoverHorario(req.params.id)); }
        catch (e) { erro(res, e, 'adminRemoverHorario'); }
    },
    // Bairros
    adminBairros: async (req, res) => {
        try { res.json(await svc.adminListarBairros()); }
        catch (e) { erro(res, e, 'adminBairros'); }
    },
    adminSalvarBairro: async (req, res) => {
        try { res.json(await svc.adminSalvarBairro(req.params.id || null, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarBairro'); }
    },
    adminRemoverBairro: async (req, res) => {
        try { res.json(await svc.adminRemoverBairro(req.params.id)); }
        catch (e) { erro(res, e, 'adminRemoverBairro'); }
    },
    // Cupons
    adminCupons: async (req, res) => {
        try { res.json(await svc.adminListarCupons()); }
        catch (e) { erro(res, e, 'adminCupons'); }
    },
    adminSalvarCupom: async (req, res) => {
        try { res.json(await svc.adminSalvarCupom(req.params.id || null, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarCupom'); }
    },
    adminRemoverCupom: async (req, res) => {
        try { res.json(await svc.adminRemoverCupom(req.params.id)); }
        catch (e) { erro(res, e, 'adminRemoverCupom'); }
    },
    // Avaliações
    adminAvaliacoes: async (req, res) => {
        try { res.json(await svc.adminListarAvaliacoes()); }
        catch (e) { erro(res, e, 'adminAvaliacoes'); }
    },
    adminSalvarAvaliacao: async (req, res) => {
        try { res.json(await svc.adminSalvarAvaliacao(req.params.id || null, req.body)); }
        catch (e) { erro(res, e, 'adminSalvarAvaliacao'); }
    },
    adminRemoverAvaliacao: async (req, res) => {
        try { res.json(await svc.adminRemoverAvaliacao(req.params.id)); }
        catch (e) { erro(res, e, 'adminRemoverAvaliacao'); }
    },
    // Config
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
            const url = `/uploads/kitfesta/${req.file.filename}`;
            await svc.adminSetConfig('logoUrl', url);
            res.json({ logoUrl: url });
        } catch (e) { erro(res, e, 'adminUploadLogo'); }
    },
    // Pedidos
    adminPedidos: async (req, res) => {
        try { res.json(await svc.adminListarPedidos({ status: req.query.status, busca: req.query.busca, data: req.query.data })); }
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
};

module.exports = kitFestaController;
