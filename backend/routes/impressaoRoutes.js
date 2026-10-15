// Impressão direta — rotas do APP (usuário logado, JWT). Plano: docs/etiquetas-cozinha/PLANO-ARQUITETO.md 2.3.
// Montada em index.js como: app.use('/api/impressao', authMiddleware, impressaoRoutes)
// Gestão (agentes, impressoras, testes, fila) é ADMIN-ONLY. Quem tem pcp.etiquetas só lista impressoras ativas
// e acompanha os próprios trabalhos.
const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const svc = require('../services/impressaoService');
const render = require('../services/etiquetaCozinhaRender');

function permsDe(req) {
    const p = req.user?.permissoes;
    return typeof p === 'string' ? JSON.parse(p) : (p || {});
}
const ehAdmin = (req) => !!permsDe(req).admin;
// pcp.etiquetas é OBJETO de permissões: checa a flag, nunca !!perms.pcp
const podeEtiquetar = (req) => { const p = permsDe(req); return !!p.admin || !!p.pcp?.etiquetas; };

function soAdmin(req, res, next) {
    if (!ehAdmin(req)) return res.status(403).json({ error: 'Apenas administradores.' });
    next();
}

async function auditar(req, acao, agente, extra) {
    try {
        await prisma.auditLog.create({
            data: {
                acao, entidade: 'ImpressaoAgente', entidadeId: agente.id,
                detalhes: `Agente "${agente.nome}"${extra ? ' - ' + extra : ''}`.slice(0, 500),
                usuarioId: String(req.user?.id || 'desconhecido'),
                usuarioNome: String(req.user?.nome || req.user?.login || 'desconhecido'),
            },
        });
    } catch (e) { console.error('[Impressao] falha no audit log (operação já efetivada):', e.message); }
}

const LINGUAGENS = ['EPL2', 'ZPL'];
const TAMANHOS = ['40x25', '100x120'];
const TIPOS_TESTE = ['TEXTO_EPL2', 'TEXTO_ZPL', 'ETIQUETA_EXEMPLO'];
const STATUS_FILA = ['PENDENTE', 'ENVIANDO', 'IMPRESSO', 'ERRO', 'EXPIRADO', 'CANCELADO'];

// ---------- agentes ----------

router.get('/agentes', soAdmin, async (req, res) => {
    try {
        const agentes = await prisma.impressaoAgente.findMany({ orderBy: { createdAt: 'asc' } });
        res.json(agentes.map(svc.agentePublico));
    } catch (e) { console.error('[Impressao] GET /agentes', e); res.status(500).json({ error: 'Erro ao listar agentes.' }); }
});

async function respostaComToken(base, agente, token) {
    return {
        agente: svc.agentePublico(agente),
        token, // UMA vez — nunca mais é devolvido
        instaladorBat: svc.gerarInstaladorBat(base, token),
        desinstaladorBat: svc.gerarDesinstaladorBat(),
    };
}

router.post('/agentes', soAdmin, async (req, res) => {
    try {
        const nome = String(req.body?.nome || '').trim();
        if (!nome || nome.length > 80) return res.status(400).json({ error: 'Informe o nome do agente (até 80 letras).' });
        let base;
        try { base = svc.baseUrlPublica(req); } catch (e) { return res.status(500).json({ error: e.message }); }
        const { token, hash, prefixo } = svc.gerarToken();
        const agente = await prisma.impressaoAgente.create({
            data: { nome, tokenHash: hash, tokenPrefixo: prefixo, criadoPor: String(req.user?.id || '') },
        });
        await auditar(req, 'IMPRESSAO_AGENTE_CRIAR', agente);
        res.status(201).json(await respostaComToken(base, agente, token));
    } catch (e) { console.error('[Impressao] POST /agentes', e.message); res.status(500).json({ error: 'Erro ao criar agente.' }); }
});

router.post('/agentes/:id/rotacionar-token', soAdmin, async (req, res) => {
    try {
        const atual = await prisma.impressaoAgente.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Agente não encontrado.' });
        let base;
        try { base = svc.baseUrlPublica(req); } catch (e) { return res.status(500).json({ error: e.message }); }
        const { token, hash, prefixo } = svc.gerarToken();
        const agente = await prisma.impressaoAgente.update({
            where: { id: atual.id }, data: { tokenHash: hash, tokenPrefixo: prefixo, ativo: true },
        });
        await auditar(req, 'IMPRESSAO_AGENTE_ROTACIONAR_TOKEN', agente);
        res.json(await respostaComToken(base, agente, token));
    } catch (e) { console.error('[Impressao] rotacionar-token', e.message); res.status(500).json({ error: 'Erro ao trocar o token.' }); }
});

router.post('/agentes/:id/revogar', soAdmin, async (req, res) => {
    try {
        const atual = await prisma.impressaoAgente.findUnique({ where: { id: req.params.id } });
        if (!atual) return res.status(404).json({ error: 'Agente não encontrado.' });
        await prisma.impressaoAgente.update({ where: { id: atual.id }, data: { ativo: false } });
        await auditar(req, 'IMPRESSAO_AGENTE_REVOGAR', atual);
        res.json({ ok: true });
    } catch (e) { console.error('[Impressao] revogar', e.message); res.status(500).json({ error: 'Erro ao revogar.' }); }
});

router.post('/agentes/:id/atualizar-impressoras', soAdmin, async (req, res) => {
    try {
        const r = await prisma.impressaoAgente.updateMany({ where: { id: req.params.id }, data: { pedirImpressoras: true } });
        if (!r.count) return res.status(404).json({ error: 'Agente não encontrado.' });
        res.json({ ok: true });
    } catch (e) { console.error('[Impressao] atualizar-impressoras', e.message); res.status(500).json({ error: 'Erro ao pedir a lista.' }); }
});

// ---------- impressoras ----------

function estadoWindowsDe(agente, nomeWindows) {
    const lista = Array.isArray(agente?.impressorasWindows) ? agente.impressorasWindows : [];
    const p = lista.find((x) => x?.nome === nomeWindows);
    return p ? (p.status || 'desconhecido') : 'nao_listada';
}

router.get('/impressoras', async (req, res) => {
    try {
        const admin = ehAdmin(req);
        if (!admin && !podeEtiquetar(req)) return res.status(403).json({ error: 'Sem permissão.' });
        const lista = await prisma.impressora.findMany({
            where: admin ? {} : { ativa: true },
            include: { agente: true },
            orderBy: [{ ativa: 'desc' }, { nome: 'asc' }],
        });
        res.json(lista.map((i) => {
            const estadoAgente = svc.estadoAgente(i.agente);
            const estadoWindows = estadoWindowsDe(i.agente, i.nomeWindows);
            if (!admin) return { id: i.id, nome: i.nome, tamanho: i.tamanho, colunas: i.colunas, estadoAgente, estadoWindows };
            const { agente, ...resto } = i;
            return { ...resto, agente: { id: agente.id, nome: agente.nome, ativo: agente.ativo }, estadoAgente, estadoWindows };
        }));
    } catch (e) { console.error('[Impressao] GET /impressoras', e); res.status(500).json({ error: 'Erro ao listar impressoras.' }); }
});

function intEntre(v, min, max) {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Valida o corpo e devolve { dados } ou { erro }. `parcial` = PUT (só valida o que veio).
function validarImpressora(b, parcial) {
    const d = {};
    const tem = (k) => b[k] !== undefined;
    if (!parcial || tem('nome')) { const v = String(b.nome || '').trim(); if (!v || v.length > 80) return { erro: 'Informe o nome (até 80 letras).' }; d.nome = v; }
    if (!parcial || tem('agenteId')) { if (!b.agenteId) return { erro: 'Escolha o agente (PC).' }; d.agenteId = String(b.agenteId); }
    if (!parcial || tem('nomeWindows')) { const v = String(b.nomeWindows || '').trim(); if (!v || v.length > 200) return { erro: 'Escolha a impressora da lista do Windows.' }; d.nomeWindows = v; }
    if (!parcial || tem('linguagem')) { if (!LINGUAGENS.includes(b.linguagem)) return { erro: 'Linguagem deve ser EPL2 ou ZPL.' }; d.linguagem = b.linguagem; }
    if (!parcial || tem('tamanho')) { if (!TAMANHOS.includes(b.tamanho)) return { erro: 'Tamanho deve ser 40x25 ou 100x120.' }; d.tamanho = b.tamanho; }
    if (tem('dpi')) { const v = intEntre(b.dpi, 150, 600); if (v == null) return { erro: 'DPI inválido.' }; d.dpi = v; }
    if (tem('colunas')) { const v = intEntre(b.colunas, 1, 4); if (v == null) return { erro: 'Colunas deve ser de 1 a 4.' }; d.colunas = v; }
    if (tem('larguraRoloMm')) {
        if (b.larguraRoloMm === null || b.larguraRoloMm === '') d.larguraRoloMm = null;
        else { const v = intEntre(b.larguraRoloMm, 20, 200); if (v == null) return { erro: 'Largura do rolo inválida (20 a 200 mm).' }; d.larguraRoloMm = v; }
    }
    if (tem('gapDots')) { const v = intEntre(b.gapDots, 0, 200); if (v == null) return { erro: 'Gap inválido (0 a 200).' }; d.gapDots = v; }
    if (tem('rotacao')) { if (![0, 90, 180, 270].includes(Number(b.rotacao))) return { erro: 'Rotação deve ser 0, 90, 180 ou 270.' }; d.rotacao = Number(b.rotacao); }
    if (tem('removerAcentos')) d.removerAcentos = !!b.removerAcentos;
    if (tem('ativa')) d.ativa = !!b.ativa;
    if (tem('ajustes')) {
        if (b.ajustes === null) d.ajustes = null;
        else if (typeof b.ajustes !== 'object' || Array.isArray(b.ajustes)) return { erro: 'Ajustes inválidos.' };
        else {
            const aj = {};
            for (const k of ['densidade', 'velocidade', 'col1X', 'col2X', 'offsetX', 'offsetY']) {
                if (b.ajustes[k] === undefined || b.ajustes[k] === null || b.ajustes[k] === '') continue;
                const n = Number(b.ajustes[k]);
                if (!Number.isFinite(n) || Math.abs(n) > 2000) return { erro: `Ajuste "${k}" inválido.` };
                aj[k] = n;
            }
            d.ajustes = aj;
        }
    }
    return { dados: d };
}

router.post('/impressoras', soAdmin, async (req, res) => {
    try {
        const { dados, erro } = validarImpressora(req.body || {}, false);
        if (erro) return res.status(400).json({ error: erro });
        const ag = await prisma.impressaoAgente.findUnique({ where: { id: dados.agenteId }, select: { id: true } });
        if (!ag) return res.status(400).json({ error: 'Agente não encontrado.' });
        // Nasce INATIVA por padrão: só entra em uso depois do teste de impressão aprovado (plano, risco 5).
        if (dados.ativa === undefined) dados.ativa = false;
        const imp = await prisma.impressora.create({ data: dados });
        res.status(201).json(imp);
    } catch (e) { console.error('[Impressao] POST /impressoras', e.message); res.status(500).json({ error: 'Erro ao cadastrar impressora.' }); }
});

router.put('/impressoras/:id', soAdmin, async (req, res) => {
    try {
        const { dados, erro } = validarImpressora(req.body || {}, true);
        if (erro) return res.status(400).json({ error: erro });
        if (dados.agenteId) {
            const ag = await prisma.impressaoAgente.findUnique({ where: { id: dados.agenteId }, select: { id: true } });
            if (!ag) return res.status(400).json({ error: 'Agente não encontrado.' });
        }
        const existe = await prisma.impressora.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!existe) return res.status(404).json({ error: 'Impressora não encontrada.' });
        res.json(await prisma.impressora.update({ where: { id: req.params.id }, data: dados }));
    } catch (e) { console.error('[Impressao] PUT /impressoras', e.message); res.status(500).json({ error: 'Erro ao salvar impressora.' }); }
});

router.delete('/impressoras/:id', soAdmin, async (req, res) => {
    try {
        const r = await prisma.impressora.updateMany({ where: { id: req.params.id }, data: { ativa: false } }); // soft: tem histórico
        if (!r.count) return res.status(404).json({ error: 'Impressora não encontrada.' });
        res.json({ ok: true });
    } catch (e) { console.error('[Impressao] DELETE /impressoras', e.message); res.status(500).json({ error: 'Erro ao desativar.' }); }
});

router.post('/impressoras/:id/teste', soAdmin, async (req, res) => {
    try {
        const tipo = String(req.body?.tipo || '');
        if (!TIPOS_TESTE.includes(tipo)) return res.status(400).json({ error: `tipo deve ser um de: ${TIPOS_TESTE.join(', ')}.` });
        const imp = await prisma.impressora.findUnique({ where: { id: req.params.id } });
        if (!imp) return res.status(404).json({ error: 'Impressora não encontrada.' });
        let conteudo;
        try { conteudo = render.renderTeste(tipo, imp); } catch (e) { return res.status(400).json({ error: e.message }); }
        const t = await svc.enfileirar({
            impressoraId: imp.id, tipo: 'TESTE', conteudo, copias: tipo === 'ETIQUETA_EXEMPLO' ? 2 : 1,
            usuario: { id: String(req.user?.id || ''), nome: req.user?.nome || null },
        });
        res.status(201).json({ trabalhoId: t.id });
    } catch (e) { console.error('[Impressao] teste', e.message); res.status(500).json({ error: 'Erro ao enviar o teste.' }); }
});

// ---------- fila ----------

const SEM_CONTEUDO = {
    id: true, impressoraId: true, tipo: true, status: true, conteudoBytes: true, copias: true, tentativas: true,
    maxTentativas: true, erro: true, loteId: true, solicitadoPorNome: true, pedidoEm: true, expiraEm: true,
    enviadoAoAgenteEm: true, impressoEm: true,
};

router.get('/fila', soAdmin, async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const where = {};
        if (req.query.status) {
            if (!STATUS_FILA.includes(String(req.query.status))) return res.status(400).json({ error: 'status inválido.' });
            where.status = String(req.query.status);
        }
        const itens = await prisma.impressaoTrabalho.findMany({
            where, orderBy: { pedidoEm: 'desc' }, take: limit,
            select: { ...SEM_CONTEUDO, impressora: { select: { nome: true } } },
        });
        res.json(itens);
    } catch (e) { console.error('[Impressao] GET /fila', e); res.status(500).json({ error: 'Erro ao listar a fila.' }); }
});

router.get('/trabalhos/:id', async (req, res) => {
    try {
        const admin = ehAdmin(req);
        if (!admin && !podeEtiquetar(req)) return res.status(403).json({ error: 'Sem permissão.' });
        const t = await prisma.impressaoTrabalho.findUnique({
            where: { id: req.params.id },
            select: { id: true, status: true, erro: true, tentativas: true, solicitadoPorId: true, impressora: { select: { agente: { select: { id: true, ativo: true, ultimoContato: true } } } } },
        });
        if (!t || (!admin && t.solicitadoPorId !== String(req.user?.id))) return res.status(404).json({ error: 'Trabalho não encontrado.' });
        res.json({
            id: t.id, status: t.status, erro: t.erro, tentativas: t.tentativas,
            agenteOnline: svc.estadoAgente(t.impressora.agente) === 'ONLINE',
        });
    } catch (e) { console.error('[Impressao] GET /trabalhos/:id', e.message); res.status(500).json({ error: 'Erro ao consultar o trabalho.' }); }
});

router.post('/trabalhos/:id/reenviar', soAdmin, async (req, res) => {
    try {
        const t = await prisma.impressaoTrabalho.findUnique({ where: { id: req.params.id } });
        if (!t) return res.status(404).json({ error: 'Trabalho não encontrado.' });
        if (!t.conteudo) return res.status(410).json({ error: 'O conteúdo deste trabalho já foi apagado (mais de 7 dias). Gere de novo.' });
        // Idempotência: o front manda `requisicaoId` (uuid); sem ele, usa janela de 5 s por trabalho.
        const reqId = req.body?.requisicaoId;
        if (reqId !== undefined && !/^[A-Za-z0-9-]{8,80}$/.test(String(reqId))) return res.status(400).json({ error: 'requisicaoId inválido.' });
        const sufixo = reqId ? String(reqId) : `w${Math.floor(Date.now() / 5000)}`;
        const novo = await svc.enfileirar({
            impressoraId: t.impressoraId, tipo: t.tipo, conteudo: Buffer.from(t.conteudo), copias: t.copias, loteId: t.loteId,
            chaveIdempotencia: `reenvio-${t.id}-${sufixo}`,
            usuario: { id: String(req.user?.id || ''), nome: req.user?.nome || null },
        });
        res.status(novo.reaproveitado ? 200 : 201).json({ trabalhoId: novo.id });
    } catch (e) { console.error('[Impressao] reenviar', e.message); res.status(500).json({ error: 'Erro ao reenviar.' }); }
});

router.post('/trabalhos/:id/cancelar', soAdmin, async (req, res) => {
    try {
        const r = await prisma.impressaoTrabalho.updateMany({
            where: { id: req.params.id, status: 'PENDENTE' }, data: { status: 'CANCELADO', erro: 'Cancelado por um administrador.' },
        });
        if (!r.count) return res.status(409).json({ error: 'Só dá para cancelar trabalho que ainda está pendente.' });
        res.json({ ok: true });
    } catch (e) { console.error('[Impressao] cancelar', e.message); res.status(500).json({ error: 'Erro ao cancelar.' }); }
});

module.exports = router;
