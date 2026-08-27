// Rotas do módulo "WhatsApp do cliente obrigatório, verificado e com selo"
// (montado em /api/whatsapp-clientes, atrás do authMiddleware).
// Toda a regra mora em services/whatsappClienteService.js — aqui só entra/sai.
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const whats = require('../services/whatsappClienteService');

const getPerms = (req) => {
    const p = req.user?.permissoes;
    if (typeof p === 'string') { try { return JSON.parse(p) || {}; } catch { return {}; } }
    return p || {};
};

const getAutor = async (userId) => {
    if (!userId) return { id: null, nome: null };
    const v = await prisma.vendedor.findUnique({ where: { id: userId }, select: { id: true, nome: true } });
    return { id: userId, nome: v?.nome || null };
};

const trataErro = (res, error, contexto) => {
    console.error(`[WhatsappCliente] ${contexto}:`, error.message);
    res.status(error.status || 500).json({ error: error.message || 'Erro interno.' });
};

// Tela de escritório: config, relatório de pendências, selo e diagnóstico.
// O relatório expõe nome, CPF/CNPJ e cidade da base inteira + os nomes dos
// vendedores — nunca pode ficar atrás só de "token válido".
const podeAdministrar = (req, res, next) => {
    const perms = getPerms(req);
    if (!(perms.admin || perms.clientes?.edit)) {
        return res.status(403).json({ error: 'Sem permissão para esta ação.' });
    }
    next();
};

// Gate da dispensa: quem consegue ESBARRAR no bloqueio do ENVIAR — ou seja, quem
// CRIA E ENVIA pedido. É de propósito mais largo que `podeAdministrar` (o vendedor
// em campo precisa se desbloquear sozinho, sem depender de permissão de cadastro),
// e mais estreito que "tem a aba Pedidos".
//
// Repare que é `perms.pedidos?.edit === true`, NÃO `!!perms.pedidos`:
// `permissoes.pedidos` é um OBJETO (`{ view, edit, clientes }`), então `!!` daria
// true para quem só LÊ a aba — inclusive o perfil mais restrito ativo da base, que
// nenhuma tela leva até este modal. Gravar dispensa é ato com consequência: derruba
// a trava do ENVIAR naquele cliente por 60 dias, para TODO MUNDO, e carimba o autor.
const podeDispensar = (req, res, next) => {
    const perms = getPerms(req);
    if (!(perms.admin || perms.clientes?.edit || perms.pedidos?.edit === true)) {
        return res.status(403).json({ error: 'Sem permissão para justificar a falta do WhatsApp.' });
    }
    next();
};

// ── Config (dois interruptores independentes) ───────────────────────────────
// `ativo` = exigir WhatsApp no envio do pedido.
// `mostrarSeloNasListas` = mostrar o selo nas listas de campo (Rota, Atendimentos,
// Atendidos, Entregas, Entregues).
//
// O GET é DE PROPÓSITO sem gate de administração: é ele que o vendedor em campo e
// o motorista leem para saber se desenham o selo na linha da lista. Não acrescentar
// gate aqui — a resposta são dois booleanos e um número, nenhum dado de cliente.

router.get('/config', async (req, res) => {
    try { res.json(await whats.getConfig()); }
    catch (e) { trataErro(res, e, 'config'); }
});

// Os dois campos são OPCIONAIS e independentes: só entra no patch o que veio no
// corpo. `setConfig` mescla o patch sobre o valor atual, então mandar um campo
// sozinho NÃO apaga o outro (é o que a tela de Configurações faz: um toggle por vez).
router.post('/config', podeAdministrar, async (req, res) => {
    try {
        const body = req.body || {};
        const patch = {};
        if (body.ativo !== undefined) patch.ativo = body.ativo === true;
        if (body.mostrarSeloNasListas !== undefined) patch.mostrarSeloNasListas = body.mostrarSeloNasListas === true;
        res.json(await whats.setConfig(patch));
    } catch (e) { trataErro(res, e, 'set-config'); }
});

// ── Dispensa justificada (cliente ANTIGO, no ENVIAR do pedido) ──────────────
// É o escape do próprio vendedor na hora de enviar o pedido: gate largo (quem
// tem acesso a Pedidos), não o de cadastro. O autor fica gravado e o caso
// aparece no relatório do escritório.

router.post('/cliente/:uuid/dispensa', podeDispensar, async (req, res) => {
    try {
        const autor = await getAutor(req.user?.id);
        res.json(await whats.registrarDispensa(req.params.uuid, (req.body || {}).motivo, autor));
    } catch (e) { trataErro(res, e, 'dispensa'); }
});

// ── Relatório de pendências (tela do escritório) ────────────────────────────
// Devolve a base inteira (nome, documento, cidade) agrupada por vendedor — é
// dado de cadastro de TODOS os clientes, não só os da carteira de quem chama.
// Por isso exige a mesma permissão das outras telas de escritório.

router.get('/pendencias', podeAdministrar, async (req, res) => {
    try { res.json(await whats.pendencias()); }
    catch (e) { trataErro(res, e, 'pendencias'); }
});

// ── Recalcular o selo sob demanda (o normal é o job diário das 04:20) ───────
// Com trava de concorrência: a varredura passa por TODOS os clientes ativos em
// série; dois cliques no botão só duplicariam escrita no banco compartilhado.
// O 2º clique entra na MESMA rodada em vez de abrir outra.

router.post('/recalcular-selo', podeAdministrar, async (req, res) => {
    try {
        const selo = require('../services/whatsappSeloService');
        const jaRodava = selo.estaRodando();
        const r = await selo.recalcularComTrava();
        res.json({ ...r, jaEstavaRodando: jaRodava });
    } catch (e) { trataErro(res, e, 'recalcular-selo'); }
});

// ── Diagnóstico: os códigos de erro REAIS gravados pelo bot ─────────────────
// Somente leitura. É por aqui que descobrimos quais códigos o bot manda de
// verdade, para a regra do selo "Com problema" parar de depender de palpite.

router.get('/diag-codigos-erro', podeAdministrar, async (req, res) => {
    try {
        const selo = require('../services/whatsappSeloService');
        const dias = Number(req.query.dias);
        res.json(await selo.diagnosticoCodigos(Number.isFinite(dias) && dias > 0 ? { dias } : {}));
    } catch (e) { trataErro(res, e, 'diag-codigos-erro'); }
});

module.exports = router;
