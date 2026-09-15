const svc = require('../services/iaClienteService');

// Erros seguem no formato simples { error } (+ `code` quando a regra de negócio dá um código
// fechado, v1.6.0 — ex.: PROMOCAO_INVALIDA nos pedidos; aqui hoje nenhum, mas o padrão é o mesmo).
const erro = (res, e, ctx) => {
    console.error(`[IaCliente] ${ctx}:`, e.message);
    res.status(400).json(e.code ? { error: e.message, code: e.code } : { error: e.message });
};

module.exports = {
    reconhecerTelefone: async (req, res) => {
        try { res.json(await svc.reconhecerPorTelefone(req.body.telefone)); }
        catch (e) { erro(res, e, 'reconhecerTelefone'); }
    },
    historicoPedidos: async (req, res) => {
        try { res.json(await svc.historicoPedidos(req.body.telefone, req.body.limite, req.body.comItens === true)); }
        catch (e) { erro(res, e, 'historicoPedidos'); }
    },
    criarLead: async (req, res) => {
        try { res.json(await svc.criarLead(req.body)); }
        catch (e) { erro(res, e, 'criarLead'); }
    },
    buscar: async (req, res) => {
        try { res.json(await svc.buscarClientes(req.body.busca, req.body.limite)); }
        catch (e) { erro(res, e, 'buscar'); }
    },
    ficha: async (req, res) => {
        try { res.json(await svc.fichaPorDocumento(req.body.documento)); }
        catch (e) { erro(res, e, 'ficha'); }
    },
    // ── v1.6.0 ──
    produtosComprados: async (req, res) => {
        try { res.json(await svc.produtosComprados(req.body.telefone, { meses: req.body.meses })); }
        catch (e) { erro(res, e, 'produtosComprados'); }
    },
    // 🔒 SÓ PAINEL da equipe do bot — nunca tool da IA (ver iaConsultaRoutes.js).
    situacao: async (req, res) => {
        try { res.json(await svc.situacaoFinanceira(req.body.telefone)); }
        catch (e) { erro(res, e, 'situacao'); }
    },
    // GET /cliente/pedido/:numero?telefone=...&fonte=PEDIDO|FILA — exige o telefone (mesma regra).
    pedidoPorNumero: async (req, res) => {
        try {
            const telefone = String(req.query.telefone || '').trim();
            if (!telefone) return res.status(400).json({ error: 'Informe o telefone do cliente (?telefone=).' });
            const numero = parseInt(req.params.numero, 10);
            if (!Number.isInteger(numero) || numero <= 0) return res.status(400).json({ error: 'Número do pedido inválido.' });
            res.json(await svc.pedidoPorNumero(telefone, numero, req.query.fonte || null));
        } catch (e) { erro(res, e, 'pedidoPorNumero'); }
    },
};
