// Local de entrega (Entrega 2, 11/2026) — rotas NOVAS, todas atrás do authMiddleware (montadas em index.js).
// Regras e gravação: services/localEntregaService.js. Decisão de endereço: utils/enderecoEntrega.js.
//
//   /api/clientes/:uuid/local-entrega          GET | PUT | DELETE
//   /api/clientes/:uuid/local-entrega/ponto    PUT
//   /api/pedidos/:id/local-entrega             GET | PUT | DELETE
//   /api/local-entrega/config                  GET (autenticado) | POST (só admin)
//
// authMiddleware vai POR ROTA (não no mount): requisições que não casam aqui seguem para os routers antigos
// sem pagar autenticação em dobro.
// Usuário externo (contador) fica bloqueado pelo authMiddleware (nega por padrão — esta rota NÃO está em CAMINHOS_EXTERNO).
// As flags (editor/exibir/operacao/mapa) NÃO bloqueiam estas rotas: governam o que as telas/consumidores mostram.
const express = require('express');
const prisma = require('../config/database');
const auth = require('../middlewares/authMiddleware');
const svc = require('../services/localEntregaService');
const { pontoValido } = require('../utils/enderecoEntrega');

const clientes = express.Router();
const pedidos = express.Router();
const config = express.Router();

const permsDe = (req) => {
    const p = req.user && req.user.permissoes;
    try { return (typeof p === 'string' ? JSON.parse(p) : p) || {}; } catch { return {}; }
};

// Mesma régua do cadastro do cliente (PATCH /clientes/:uuid): admin, clientes.edit ou Pode_Editar_GPS
const podeEditarTexto = (perms) => !!(perms.admin || perms.Pode_Editar_GPS || perms.clientes?.edit);
// Mesma régua do ponto GPS (POST /gps-clientes/cliente/:uuid/ponto): + motorista (Pode_Executar_Entregas)
const podeEditarPonto = (perms) => !!(podeEditarTexto(perms) || perms.Pode_Executar_Entregas);

async function autorDe(req) {
    let nome = req.user && req.user.nome;
    if (!nome) {
        try {
            const v = await prisma.vendedor.findUnique({ where: { id: req.user.id }, select: { nome: true } });
            nome = v && v.nome;
        } catch { /* nome é só rótulo de auditoria */ }
    }
    return { id: req.user.id, nome: nome || null };
}

const trata = (res, e, contexto) => {
    if (!e.status) console.error(`[LocalEntrega] ${contexto}:`, e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erro interno.', codigo: e.codigo || undefined });
};

const nega = (res, msg) => res.status(403).json({ error: msg, codigo: 'SEM_PERMISSAO' });

const corpo = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

// posicaoAutor opcional ("lat,lng" de onde a pessoa estava); inválida é ignorada, não derruba a gravação
// motivo livre (vai só para o log): aparado, 500 caracteres, sem caractere nulo (o Postgres recusa \u0000)
const motivoDe = (b) => (typeof b.motivo === 'string' ? b.motivo.replace(/\u0000/g, '').trim().slice(0, 500) || null : null);

const posicaoDe = (req) => pontoValido(corpo(req).posicaoAutor);

// ── Cliente ──────────────────────────────────────────────────────────────────

clientes.get('/:uuid/local-entrega', auth, async (req, res) => {
    try {
        const c = await prisma.cliente.findUnique({ where: { UUID: req.params.uuid }, select: { UUID: true } });
        if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
        const localEntrega = await svc.obterDoCliente(req.params.uuid);
        const out = { localEntrega };
        if (req.query.historico === '1' || req.query.historico === 'true') {
            const hist = await svc.historicoDoCliente(req.params.uuid, req.query.limite);
            // onde a pessoa estava ao gravar (GPS dela) só aparece para quem edita (admin / Pode_Editar_GPS / clientes.edit)
            out.historico = podeEditarTexto(permsDe(req)) ? hist : hist.map((h) => ({ ...h, posicaoAutor: null }));
        }
        res.json(out);
    } catch (e) { trata(res, e, 'cliente-get'); }
});

clientes.put('/:uuid/local-entrega', auth, async (req, res) => {
    try {
        if (!podeEditarTexto(permsDe(req))) return nega(res, 'Sem permissão para editar o local de entrega do cliente.');
        const b = corpo(req);
        const r = await svc.gravarDoCliente({
            clienteUuid: req.params.uuid,
            // aceita { endereco: {...}, pontoGps? } ou os campos direto no corpo
            endereco: (b.endereco && typeof b.endereco === 'object' && !Array.isArray(b.endereco))
                ? (Object.prototype.hasOwnProperty.call(b, 'pontoGps') ? { ...b.endereco, pontoGps: b.pontoGps } : b.endereco)
                : b,
            origem: 'CADASTRO',
            autor: await autorDe(req),
            posicaoAutor: posicaoDe(req),
            motivo: motivoDe(b),
        });
        res.json(r);
    } catch (e) { trata(res, e, 'cliente-put'); }
});

clientes.delete('/:uuid/local-entrega', auth, async (req, res) => {
    try {
        if (!podeEditarTexto(permsDe(req))) return nega(res, 'Sem permissão para desativar o local de entrega do cliente.');
        const b = corpo(req);
        const r = await svc.desativar({
            clienteUuid: req.params.uuid,
            origem: 'CADASTRO',
            autor: await autorDe(req),
            posicaoAutor: posicaoDe(req),
            motivo: motivoDe(b),
        });
        res.json(r);
    } catch (e) { trata(res, e, 'cliente-delete'); }
});

clientes.put('/:uuid/local-entrega/ponto', auth, async (req, res) => {
    try {
        if (!podeEditarPonto(permsDe(req))) return nega(res, 'Sem permissão para editar o ponto GPS do local de entrega.');
        const b = corpo(req);
        if (!Object.prototype.hasOwnProperty.call(b, 'pontoGps')) {
            return res.status(400).json({ error: 'Informe pontoGps ("lat,lng") ou null para limpar.' });
        }
        const origem = ['CADASTRO', 'MOTORISTA'].includes(String(b.origem || '').toUpperCase()) ? String(b.origem).toUpperCase() : 'CADASTRO';
        const r = await svc.gravarPontoDoCliente({
            clienteUuid: req.params.uuid,
            pontoGps: b.pontoGps,
            origem,
            autor: await autorDe(req),
            posicaoAutor: posicaoDe(req),
            motivo: motivoDe(b),
        });
        res.json(r);
    } catch (e) { trata(res, e, 'cliente-ponto'); }
});

// ── Pedido ───────────────────────────────────────────────────────────────────

// Mesmo guard do deliveryService.setHoraEntrega (permissão de Delivery) + admin + o "dono" do pedido: o vendedor
// (vendedorId) ou quem lançou em nome dele (usuarioLancamentoId — o escritório lança pelo vendedor). Quem monta o pedido
// precisa conseguir informar onde entregar mesmo sem acesso ao Delivery, MAS só até o pedido entrar numa carga/embarque
// (409 PEDIDO_EM_CARGA): depois disso só admin ou quem tem Delivery.
async function podeMexerNoPedido(req, pedidoId) {
    const perms = permsDe(req);
    if (perms.admin) return true;
    const deliveryService = require('../services/deliveryService');
    const perm = await deliveryService.permissaoDoUsuario(req.user);
    if (perm.podeVer) return true;
    const p = await prisma.pedido.findUnique({
        where: { id: String(pedidoId || '') },
        select: { vendedorId: true, usuarioLancamentoId: true, embarqueId: true },
    });
    const dono = !!(p && req.user.id && (p.vendedorId === req.user.id || p.usuarioLancamentoId === req.user.id));
    if (!dono) return false;
    if (p.embarqueId) {
        throw Object.assign(new Error('O pedido já está numa carga. Peça ao Delivery ou ao administrador para alterar o local de entrega.'), { status: 409, codigo: 'PEDIDO_EM_CARGA' });
    }
    return true;
}

pedidos.get('/:id/local-entrega', auth, async (req, res) => {
    try {
        const p = await prisma.pedido.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!p) return res.status(404).json({ error: 'Pedido não encontrado.' });
        res.json({ localEntrega: await svc.obterDoPedido(req.params.id) });
    } catch (e) { trata(res, e, 'pedido-get'); }
});

pedidos.put('/:id/local-entrega', auth, async (req, res) => {
    try {
        if (!(await podeMexerNoPedido(req, req.params.id))) return nega(res, 'Sem permissão para alterar o local de entrega do pedido.');
        const b = corpo(req);
        const r = await svc.gravarDoPedido({
            pedidoId: req.params.id,
            modo: b.modo,
            endereco: b.endereco,
            autor: await autorDe(req),
        });
        res.json(r);
    } catch (e) { trata(res, e, 'pedido-put'); }
});

pedidos.delete('/:id/local-entrega', auth, async (req, res) => {
    try {
        if (!(await podeMexerNoPedido(req, req.params.id))) return nega(res, 'Sem permissão para alterar o local de entrega do pedido.');
        res.json(await svc.limparDoPedido({ pedidoId: req.params.id, autor: await autorDe(req) }));
    } catch (e) { trata(res, e, 'pedido-delete'); }
});

// ── Config (flags) ───────────────────────────────────────────────────────────

config.get('/config', auth, async (req, res) => {
    try { res.json(await svc.lerConfig()); }
    catch (e) { trata(res, e, 'config-get'); }
});

config.post('/config', auth, async (req, res) => {
    try {
        if (!permsDe(req).admin) return nega(res, 'Só administrador liga ou desliga o local de entrega.');
        res.json(await svc.gravarConfig(corpo(req), await autorDe(req)));
    } catch (e) { trata(res, e, 'config-post'); }
});

module.exports = { clientes, pedidos, config };
