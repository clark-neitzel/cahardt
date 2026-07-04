const svc = require('../services/iaClienteService');

const erro = (res, e, ctx) => {
    console.error(`[IaCliente] ${ctx}:`, e.message);
    res.status(400).json({ error: e.message });
};

module.exports = {
    reconhecerTelefone: async (req, res) => {
        try { res.json(await svc.reconhecerPorTelefone(req.body.telefone)); }
        catch (e) { erro(res, e, 'reconhecerTelefone'); }
    },
    historicoPedidos: async (req, res) => {
        try { res.json(await svc.historicoPedidos(req.body.telefone, req.body.limite)); }
        catch (e) { erro(res, e, 'historicoPedidos'); }
    },
    criarLead: async (req, res) => {
        try { res.json(await svc.criarLead(req.body)); }
        catch (e) { erro(res, e, 'criarLead'); }
    },
};
