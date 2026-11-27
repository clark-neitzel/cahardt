const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const prisma = require('../config/database'); // singleton compartilhado (pool único)
const JWT_SECRET = require('../config/jwtSecret');
const agenteTokens = require('../services/agenteTokenService');
const politica = require('../services/agentePoliticaService');
const auditoriaAgente = require('../services/agenteAuditoriaService');
const solicitacoes = require('../services/agenteSolicitacaoService');
const { rodarComoAgente } = require('../utils/agenteContexto');
const { mascararUrlLog, decodificarParaBusca } = require('../utils/mascararUrlLog');

// Usuário externo (contador): só alcança o que está nesta lista. Nega por padrão.
// ESPELHA `ROTAS_EXTERNO` do frontend (frontend/src/utils/usuarioExterno.js) — mexeu aqui, mexa lá.
// `/api/auth/midia-token` fica FORA de propósito. `/auth/me` NUNCA pode sair daqui (403 ali desloga).
const CAMINHOS_EXTERNO = /^\/api\/(auth\/(me|menu-favoritos)|contabilidade)(\/|$)/;

function externoPodeAcessar(urlOriginal) {
    const bruto = String(urlOriginal || '').split('?')[0].split('#')[0].toLowerCase();
    // sem truque de caminho: '..', '//', barra invertida ou separador/ponto codificado
    if (bruto.includes('..') || bruto.includes('//') || bruto.includes('\\') || /%(2e|2f|5c|00)/.test(bruto)) return false;
    return CAMINHOS_EXTERNO.test(bruto);
}

// Header sem risco: o `res` que chega aqui pode ser um proxy/mock (ex.: comoFazerAuthService) que só tem status/json.
// Nunca lança; sem set/setHeader simplesmente não seta.
function setHeaderSeguro(res, nome, valor) {
    try {
        if (res && typeof res.set === 'function') res.set(nome, valor);
        else if (res && typeof res.setHeader === 'function') res.setHeader(nome, valor);
    } catch (_) { /* header é cortesia: nunca derruba a autenticação */ }
}

const LIMITE_FALHAS_POR_IP = 30; // tokens cah_ag_ inválidos por IP por minuto

// Token de agente na URL (caminho OU query) vai parar no log do servidor: recusa (400) sem repetir o valor.
function tokenAgenteNaUrl(urlOriginal) {
    // decodifica em laço e de forma tolerante: pega `cah%255Fag%255F` e `%zz&t=%63ah_ag_...`
    const url = decodificarParaBusca(String(urlOriginal || ''));
    // `cah_%0Aag_`: tirando os caracteres de controle também não pode aparecer um token
    return url.toLowerCase().includes(agenteTokens.PREFIXO_TOKEN)
        || url.replace(/[\u0000-\u001f\u007f]/g, '').toLowerCase().includes(agenteTokens.PREFIXO_TOKEN);
}

const ORIENTACAO_BLOQUEIO = 'Esta função não está liberada para o agente. O dono pode liberar leituras em /api/agentes/:id/politicas; bloqueios fixos não mudam.';

// PEDE: o sistema NÃO executa a rota. Guarda o pedido na fila de solicitações e responde 202 (o dono decide na aba
// Solicitações). Pedido com arquivo/corpo grande -> 422; teto de pendentes por agente -> 429. Nunca chama `next`.
async function pedirAutorizacao(req, res, r, decisao) {
    const pedido = solicitacoes.lerPedido(req);
    if (!pedido.ok) {
        return res.status(422).json({
            error: pedido.motivo, codigo: 'AGENTE_SOLICITACAO_INVALIDA', nivel: 'PEDE', chave: decisao.chave,
            orientacao: 'Este pedido não pôde entrar na fila de autorização e NADA foi executado.',
        });
    }
    let criada;
    try {
        criada = await solicitacoes.criarOuReaproveitar({ pedido, decisao, vendedor: r.vendedor, tokenPrefixo: r.token.prefixo });
    } catch (e) {
        if (e && e.codigo === 'AGENTE_SOLICITACOES_EXCESSO') return res.status(429).json({ error: e.message, codigo: e.codigo });
        throw e;
    }
    if (!criada.duplicada) {
        // fora do caminho crítico: falha de log nunca derruba nem atrasa a resposta
        solicitacoes.auditar('AGENTE_SOLICITACAO_CRIADA', criada.solicitacao, { id: r.vendedor.id, nome: r.vendedor.nome }, { tokenPrefixo: r.token.prefixo || null });
    }
    return res.status(202).json(solicitacoes.resposta202(criada.solicitacao, criada.duplicada));
}

// Chamada LOCAL de execução de uma solicitação autorizada (Bearer cah_ag_exec_...): o ticket de uso único É a
// autorização do dono. Vale só para o método+caminho+query guardados, uma vez, em até 2 min e só de dentro da máquina.
// Bloqueio fixo, BLOQUEADO, permissões vivas do vendedor-agente e assertNaoAgente CONTINUAM valendo; só o PEDE passa.
async function autenticarTicket(req, res, next, ticket) {
    setHeaderSeguro(res, 'Cache-Control', 'no-store');
    const hash = solicitacoes.sha256(ticket);
    // o mesmo request pode passar por mais de um authMiddleware (mount + rota): o ticket já consumido vale p/ ele mesmo
    if (req._agenteTicketHash && req._agenteTicketHash === hash && req.user && req.user.agenteSolicitacaoId) {
        return rodarComoAgente({ vendedorId: req.user.id, solicitacaoId: req.user.agenteSolicitacaoId }, () => next());
    }
    const ip = req.ip || 'sem-ip';
    const local = solicitacoes.ehLoopback(req);
    if (!local && agenteTokens.excedeu(`falha:${ip}`, LIMITE_FALHAS_POR_IP)) {
        return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em instantes.', codigo: 'LIMITE' });
    }
    const t = await solicitacoes.consumirTicket(req, ticket);
    if (!t.ok) {
        if (!local && t.status === 401 && agenteTokens.conta(`falha:${ip}`, LIMITE_FALHAS_POR_IP).estourou) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em instantes.', codigo: 'LIMITE' });
        }
        return res.status(t.status).json({ error: t.error, codigo: t.codigo });
    }
    const reqId = crypto.randomUUID();
    setHeaderSeguro(res, 'X-Request-Id', reqId);
    let decisao;
    try {
        decisao = await politica.avaliar(req.app, t.vendedor.id, req.method, req.originalUrl);
    } catch (e) {
        if (e && e.codigo === 'AGENTE_POLITICA_INDISPONIVEL') return res.status(503).json({ error: e.message, codigo: e.codigo });
        throw e;
    }
    if (decisao.nivel === 'BLOQUEADO') {
        auditoriaAgente.registrarNegacao(req, res, { reqId, vendedor: t.vendedor, tokenPrefixo: null, ip, decisao, inicio: Date.now() });
        return res.status(403).json({
            error: 'Rota não liberada para o agente.', codigo: 'AGENTE_BLOQUEADO', nivel: 'BLOQUEADO', chave: decisao.chave, fixo: decisao.fixo === true,
            orientacao: ORIENTACAO_BLOQUEIO,
        });
    }
    req.user = {
        id: t.vendedor.id, login: null, nome: t.vendedor.nome, permissoes: t.permissoes, maxDescontoFlex: t.vendedor.maxDescontoFlex,
        agente: true, agenteTokenId: null, agenteSolicitacaoId: t.solicitacao.id,
    };
    req._agenteTicketHash = hash;
    return rodarComoAgente({ vendedorId: t.vendedor.id, solicitacaoId: t.solicitacao.id }, () => next());
}

// Autenticação do usuário-agente (Bearer cah_ag_...). Nega por padrão: a POLÍTICA do agente
// (config/agentePoliticaPadrao.js + exceções do dono em agente_politicas) decide LIBERADO / PEDE / BLOQUEADO
// → 403 AGENTE_BLOQUEADO / AGENTE_PEDE_AUTORIZACAO. Revogação/expiração valem na hora.
async function autenticarAgente(req, res, next, token) {
    const inicio = Date.now();
    setHeaderSeguro(res, 'Cache-Control', 'no-store'); // o index.js já faz para /api; aqui cobre rotas montadas fora dele
    const ip = req.ip || 'sem-ip';
    // IP que já errou token demais: recusa ANTES de consultar o banco. Só conta quem manda cah_ag_ inválido
    // (JWT nunca passa por aqui; token que já autenticou há pouco também não é barrado pelo freio).
    if (agenteTokens.excedeu(`falha:${ip}`, LIMITE_FALHAS_POR_IP) && !agenteTokens.foiValidoRecentemente(agenteTokens.hashToken(token))) {
        return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em instantes.', codigo: 'LIMITE' });
    }
    const r = await agenteTokens.validarToken(token);
    if (!r.ok) {
        if (r.status === 401 && agenteTokens.conta(`falha:${ip}`, LIMITE_FALHAS_POR_IP).estourou) {
            return res.status(429).json({ error: 'Muitas tentativas. Tente de novo em instantes.', codigo: 'LIMITE' });
        }
        return res.status(r.status).json({ error: r.error, codigo: r.codigo });
    }
    const lim = agenteTokens.conta(`tok:${r.token.id}`, r.token.limitePorMinuto || 120);
    if (lim.estourou) {
        setHeaderSeguro(res, 'Retry-After', String(lim.retryAfterSeg));
        return res.status(429).json({ error: 'Limite de requisições por minuto excedido.', codigo: 'LIMITE', retryAfterSeg: lim.retryAfterSeg });
    }
    const reqId = crypto.randomUUID();
    setHeaderSeguro(res, 'X-Request-Id', reqId);
    let decisao;
    try {
        decisao = await politica.avaliar(req.app, r.vendedor.id, req.method, req.originalUrl);
    } catch (e) {
        if (e && e.codigo === 'AGENTE_POLITICA_INDISPONIVEL') {
            return res.status(503).json({ error: e.message, codigo: e.codigo });
        }
        throw e;
    }
    if (decisao.nivel !== 'LIBERADO') {
        console.warn('[Agente]', decisao.nivel === 'PEDE' ? 'pediu autorização' : 'bloqueado', r.vendedor.id, req.method, mascararUrlLog(String(req.originalUrl || '').split('?')[0]), decisao.nivel);
        auditoriaAgente.registrarNegacao(req, res, { reqId, vendedor: r.vendedor, tokenPrefixo: r.token.prefixo, ip, decisao, inicio });
        if (decisao.nivel === 'PEDE') return pedirAutorizacao(req, res, r, decisao);
        return res.status(403).json({
            error: 'Rota não liberada para o agente.',
            codigo: 'AGENTE_BLOQUEADO', nivel: 'BLOQUEADO', chave: decisao.chave, fixo: decisao.fixo === true,
            orientacao: ORIENTACAO_BLOQUEIO,
        });
    }
    agenteTokens.registrarUso(r.token.id, ip);
    req.user = {
        id: r.vendedor.id,
        login: null,
        nome: r.vendedor.nome,
        permissoes: r.permissoes,
        maxDescontoFlex: r.vendedor.maxDescontoFlex,
        agente: true,
        agenteTokenId: r.token.id,
    };
    // Defesa em profundidade: tudo que esta requisição dispara fica marcado como "de agente"
    // (envio de WhatsApp, emissão de NF-e e SEFAZ recusam — ver utils/agenteContexto.js).
    return rodarComoAgente({ vendedorId: r.vendedor.id }, () => next());
}

const authMiddleware = async (req, res, next) => {
    if (tokenAgenteNaUrl(req.originalUrl)) {
        return res.status(400).json({ error: 'O token do agente vai no header Authorization (Bearer), nunca na URL.', codigo: 'TOKEN_NA_URL' });
    }
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido ou inválido.' });
    }

    const token = authHeader.split(' ')[1];

    // Ticket de execução (cah_ag_exec_...): vem ANTES do token de agente comum (tem o mesmo prefixo cah_ag_)
    if (solicitacoes.ehTicket(token)) {
        try {
            return await autenticarTicket(req, res, next, token);
        } catch (error) {
            console.error('[Agente] erro na autenticação do ticket de execução:', error && error.message);
            return res.status(500).json({ error: 'Erro interno de autenticação.' });
        }
    }

    if (agenteTokens.pareceTokenAgente(token)) {
        try {
            return await autenticarAgente(req, res, next, token);
        } catch (error) {
            console.error('[Agente] erro na autenticação do token:', error);
            return res.status(500).json({ error: 'Erro interno de autenticação.' });
        }
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Token de mídia (só para ler arquivos via ?mt=) nunca vale como login
        if (decoded.tipo === 'midia') {
            return res.status(401).json({ error: 'Token expirado ou inválido.' });
        }

        // Busca permissões atualizadas do banco para garantir que mudanças de admin
        // tenham efeito imediato, sem precisar de novo login
        const vendedor = await prisma.vendedor.findUnique({
            where: { id: decoded.id },
            select: { permissoes: true, ativo: true, maxDescontoFlex: true, agente: true }
        });

        if (!vendedor || vendedor.ativo === false) {
            return res.status(401).json({ error: 'Usuário inativo ou não encontrado.' });
        }

        // Agente só entra por token cah_ag_: um JWT de vendedor-agente nunca vale.
        if (vendedor.agente === true) {
            return res.status(401).json({ error: 'Token expirado ou inválido.' });
        }

        const permissoesAtuais = typeof vendedor.permissoes === 'string'
            ? JSON.parse(vendedor.permissoes)
            : vendedor.permissoes || {};

        // Usuário externo (contador): permissões já estão em mãos, zero consulta extra.
        if (!permissoesAtuais.admin && permissoesAtuais.Usuario_Externo === true && !externoPodeAcessar(req.originalUrl)) {
            return res.status(403).json({ error: 'Usuário externo: acesso restrito à Contabilidade.', codigo: 'USUARIO_EXTERNO' });
        }

        req.user = {
            ...decoded,
            permissoes: permissoesAtuais,
            maxDescontoFlex: vendedor.maxDescontoFlex
        };
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado ou inválido.' });
        }
        return res.status(500).json({ error: 'Erro interno de autenticação.' });
    }
};

module.exports = authMiddleware;
module.exports.tokenAgenteNaUrl = tokenAgenteNaUrl;
module.exports.setHeaderSeguro = setHeaderSeguro;
module.exports.externoPodeAcessar = externoPodeAcessar;
module.exports.CAMINHOS_EXTERNO = CAMINHOS_EXTERNO;
