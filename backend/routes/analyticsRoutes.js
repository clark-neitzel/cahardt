// API de máquina dos agentes comerciais. Chave própria (x-analytics-key).
// Não usa o JWT do app. Não envia WhatsApp. Não grava pedido nem financeiro.
const express = require('express');
const { verificarChaveAnalytics } = require('../middlewares/analyticsAuth');
const consulta = require('../services/analyticsConsultaService');
const registro = require('../services/analyticsRegistroService');

const router = express.Router();

router.use(verificarChaveAnalytics);

function asyncRoute(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((err) => {
            const status = Number(err?.status) || 500;
            if (status >= 500) console.error('[Analytics]', err?.message || err);
            if (res.headersSent) return;
            const body = { error: status >= 500 ? 'Erro interno.' : (err?.message || 'Erro.') };
            if (err?.codigo && status < 500) body.codigo = err.codigo;
            res.status(status).json(body);
        });
    };
}

function agente(req) {
    return req.headers['x-analytics-agent'];
}

router.get('/v1/status', (req, res) => {
    res.json({
        ok: true,
        versao: '1',
        whatsapp: false,
        escreve: ['atendimentos', 'leads', 'sugestoes'],
    });
});

router.get('/v1/carteira', asyncRoute(async (req, res) => {
    res.json(await consulta.painel(req.query));
}));

router.get('/v1/clientes', asyncRoute(async (req, res) => {
    res.json(await consulta.clientes(req.query));
}));

router.get('/v1/clientes/:id/financeiro', asyncRoute(async (req, res) => {
    res.json(await consulta.financeiroCliente(req.params.id));
}));

router.get('/v1/vendas', asyncRoute(async (req, res) => {
    res.json(await consulta.vendas(req.query));
}));

router.get('/v1/vendas/itens', asyncRoute(async (req, res) => {
    res.json(await consulta.vendasItens(req.query));
}));

router.get('/v1/produtos', asyncRoute(async (req, res) => {
    res.json(await consulta.produtos(req.query));
}));

router.get('/v1/tabelas-preco', asyncRoute(async (req, res) => {
    res.json(await consulta.tabelasPreco(req.query));
}));

router.get('/v1/promocoes', asyncRoute(async (req, res) => {
    res.json(await consulta.promocoes(req.query));
}));

router.get('/v1/vendedores', asyncRoute(async (req, res) => {
    res.json(await consulta.vendedores(req.query));
}));

router.get('/v1/atendimentos', asyncRoute(async (req, res) => {
    res.json(await consulta.atendimentos(req.query));
}));

router.post('/v1/atendimentos', asyncRoute(async (req, res) => {
    const r = await registro.registrarAtendimento(agente(req), req.body);
    res.status(r.duplicado ? 200 : 201).json(r);
}));

router.get('/v1/diarios', asyncRoute(async (req, res) => {
    res.json(await consulta.diarios(req.query));
}));

router.get('/v1/receber', asyncRoute(async (req, res) => {
    res.json(await consulta.receber(req.query));
}));

router.get('/v1/leads', asyncRoute(async (req, res) => {
    res.json(await consulta.leads(req.query));
}));

router.post('/v1/leads', asyncRoute(async (req, res) => {
    res.status(201).json(await registro.criarLead(agente(req), req.body));
}));

router.patch('/v1/leads/:id', asyncRoute(async (req, res) => {
    res.json(await registro.atualizarLead(agente(req), req.params.id, req.body));
}));

router.get('/v1/sugestoes', asyncRoute(async (req, res) => {
    res.json(await registro.listarSugestoes(req.query));
}));

router.post('/v1/sugestoes', asyncRoute(async (req, res) => {
    const r = await registro.criarSugestao(agente(req), req.body);
    res.status(r.duplicado ? 200 : 201).json(r);
}));

router.patch('/v1/sugestoes/:sugestaoId', asyncRoute(async (req, res) => {
    res.json(await registro.atualizarSugestao(agente(req), req.params.sugestaoId, req.body));
}));

router.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada nesta API.', codigo: 'ROTA_DESCONHECIDA' });
});

module.exports = router;
