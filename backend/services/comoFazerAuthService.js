// Como Fazer — autenticação do tablet e do app.
//  - Chave de APARELHO por setor (só o hash fica no banco, AppConfig `como_fazer_aparelhos`).
//  - Token de TABLET assinado com segredo DERIVADO (JWT_SECRET + ':como-fazer-tablet'): em qualquer
//    outra rota do sistema o jwt.verify falha (401) antes de tocar no banco.
//  - Freio de tentativas de PIN (em memória).
//  - Middleware `comoFazerAuth` (token de tablet OU login do app) e `exigirPermissao`.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const JWT_SECRET = require('../config/jwtSecret');
const authMiddleware = require('../middlewares/authMiddleware');
const { segredoConfere } = require('../utils/segredoConfere');

const SEGREDO_TABLET = JWT_SECRET + ':como-fazer-tablet';
const SESSAO_SEGUNDOS = 120;
const CONFIG_APARELHOS = 'como_fazer_aparelhos';

// Setores vêm do cadastro (tabela `setores`). ASSÍNCRONOS — todo chamador precisa de await.
// Resolvem também setor inativo; quem decide "só ativos" é o chamador.
const setoresService = require('./setoresService');
const setorPorSlug = (slug) => setoresService.porSlug(slug);
const setorPorCodigo = (cod) => setoresService.porCodigo(cod);

const erro = (res, status, codigo, mensagem, extra = {}) => res.status(status).json({ erro: mensagem, codigo, ...extra });

// ───────── chave de aparelho ─────────
const sha256 = (txt) => crypto.createHash('sha256').update(String(txt)).digest('hex');

async function lerAparelhos() {
    const cfg = await prisma.appConfig.findUnique({ where: { key: CONFIG_APARELHOS } });
    return (cfg && typeof cfg.value === 'object' && cfg.value) || {};
}

// gera uma chave nova (invalida a anterior). Devolve a chave em claro UMA vez.
async function gerarChaveAparelho(setorCodigo, geradaPor) {
    const chave = crypto.randomBytes(32).toString('hex');
    const atual = await lerAparelhos();
    atual[setorCodigo] = { hash: sha256(chave), geradaEm: new Date().toISOString(), geradaPor: geradaPor || null };
    await prisma.appConfig.upsert({
        where: { key: CONFIG_APARELHOS },
        create: { key: CONFIG_APARELHOS, value: atual },
        update: { value: atual },
    });
    return chave;
}

async function chaveConfere(setorCodigo, chave) {
    if (!chave || typeof chave !== 'string' || chave.length < 32) return false;
    const aparelhos = await lerAparelhos();
    const hash = aparelhos[setorCodigo]?.hash;
    if (!hash) return false;
    return segredoConfere(sha256(chave), hash);
}

// ───────── token de tablet ─────────
function emitirTokenTablet({ funcionarioId, setor }) {
    const token = jwt.sign(
        { escopo: 'como-fazer', tipo: 'como-fazer-tablet', funcionarioId, setor },
        SEGREDO_TABLET,
        { expiresIn: SESSAO_SEGUNDOS }
    ); // sem claim `id` de propósito
    return { token, expiraEm: new Date(Date.now() + SESSAO_SEGUNDOS * 1000).toISOString() };
}

// ───────── freio de PIN (em memória; reinício do backend zera — aceito) ─────────
// chave = 'func:<id>' | 'ip:<ip>' | 'conf:<id>' ...
const tentativas = new Map(); // chave -> { seq, falhas:[ts], bloqueadoAte }
const JANELA_MS = 15 * 60 * 1000;

function estadoFreio(chave) {
    let e = tentativas.get(chave);
    if (!e) { e = { seq: 0, falhas: [], bloqueadoAte: 0 }; tentativas.set(chave, e); }
    return e;
}

/** segundos de espera restantes (0 = liberado) considerando TODAS as chaves */
function segundosBloqueado(chaves) {
    const agora = Date.now();
    let max = 0;
    for (const c of chaves) {
        const e = tentativas.get(c);
        if (e && e.bloqueadoAte > agora) max = Math.max(max, Math.ceil((e.bloqueadoAte - agora) / 1000));
    }
    return max;
}

/** registra erro de PIN; devolve { bloqueado, segundos, tentativasRestantes } */
function registrarErroPin(chaves) {
    const agora = Date.now();
    let bloqueioMs = 0;
    let restantes = 3;
    for (const c of chaves) {
        const e = estadoFreio(c);
        e.seq++;
        e.falhas = e.falhas.filter(t => agora - t < JANELA_MS);
        e.falhas.push(agora);
        if (e.falhas.length >= 8) { e.bloqueadoAte = agora + 5 * 60 * 1000; bloqueioMs = Math.max(bloqueioMs, 5 * 60 * 1000); }
        // o IP (um tablet compartilhado por vários) só entra na regra das 8 em 15 min; os 3 seguidos valem por pessoa
        else if (e.seq >= 3 && !c.startsWith('ip:')) { e.bloqueadoAte = agora + 30 * 1000; bloqueioMs = Math.max(bloqueioMs, 30 * 1000); }
        if (!c.startsWith('ip:')) restantes = Math.min(restantes, Math.max(0, 3 - e.seq));
    }
    return { bloqueado: bloqueioMs > 0, segundos: Math.ceil(bloqueioMs / 1000), tentativasRestantes: restantes };
}

function limparErrosPin(chaves) {
    for (const c of chaves) tentativas.delete(c);
}

// limpeza preguiçosa para o Map não crescer sem fim
setInterval(() => {
    const agora = Date.now();
    for (const [c, e] of tentativas) {
        const ultima = e.falhas[e.falhas.length - 1] || 0;
        if (agora - ultima > JANELA_MS && e.bloqueadoAte < agora) tentativas.delete(c);
    }
}, 10 * 60 * 1000).unref();

// o app tem `trust proxy`: req.ip já é o IP do cliente (X-Forwarded-For cru pode ser forjado)
const ipDe = (req) => req.ip || 'ip?';

// ───────── middleware ─────────
const ehTokenTablet = (token) => {
    try { return jwt.decode(token)?.tipo === 'como-fazer-tablet'; } catch (_) { return false; }
};

// o authMiddleware responde `{error}`; aqui o formato do módulo é `{erro, codigo}`
function chamarAuthApp(req, res, next) {
    const proxy = {
        _status: 200,
        status(c) { this._status = c; return this; },
        json(corpo) { return res.status(this._status).json({ erro: corpo?.error || 'Não autenticado.', codigo: 'NAO_AUTENTICADO' }); },
    };
    return authMiddleware(req, proxy, next);
}

async function comoFazerAuth(req, res, next) {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) return erro(res, 401, 'NAO_AUTENTICADO', 'Entre para continuar.');
    const token = h.split(' ')[1];

    if (ehTokenTablet(token)) {
        try {
            const dec = jwt.verify(token, SEGREDO_TABLET);
            if (dec.escopo !== 'como-fazer' || !dec.funcionarioId) return erro(res, 401, 'SESSAO_EXPIROU', 'Sessão inválida. Escolha sua foto de novo.');
            req.cf = { origem: 'TABLET', funcionarioId: dec.funcionarioId, setor: dec.setor || null, vendedorId: null, permissoes: {} };
            return next();
        } catch (e) {
            return erro(res, 401, 'SESSAO_EXPIROU', 'Sua sessão terminou. Escolha sua foto de novo.');
        }
    }

    // login do app: delega ao authMiddleware existente e depois resolve o funcionário ligado
    return chamarAuthApp(req, res, async (err) => {
        if (err) return next(err);
        try {
            const func = await prisma.funcionario.findFirst({
                where: { vendedorId: req.user.id, ativo: true },
                select: { id: true, setor: true },
            });
            req.cf = {
                origem: 'APP',
                vendedorId: req.user.id,
                permissoes: req.user.permissoes || {},
                funcionarioId: func?.id || null,
                setor: func?.setor || null,
            };
            next();
        } catch (e) {
            console.error('[ComoFazer] auth app:', e.message);
            erro(res, 500, 'ERRO_INTERNO', 'Erro ao verificar o acesso.');
        }
    });
}

const temPermissao = (req, nome) => req.cf?.origem === 'APP'
    && (req.cf.permissoes?.admin === true || req.cf.permissoes?.[nome] === true);

/** rota A: tablet recebe 403; app precisa de admin ou de UMA das permissões */
const exigirPermissao = (...nomes) => (req, res, next) => {
    if (req.cf?.origem !== 'APP') return erro(res, 403, 'SEM_PERMISSAO', 'Você não tem permissão para isso.');
    if (req.cf.permissoes?.admin === true || nomes.some(n => req.cf.permissoes?.[n] === true)) return next();
    return erro(res, 403, 'SEM_PERMISSAO', 'Você não tem permissão para isso.');
};

module.exports = {
    setorPorSlug, setorPorCodigo, erro, ipDe,
    gerarChaveAparelho, chaveConfere,
    emitirTokenTablet, SESSAO_SEGUNDOS,
    segundosBloqueado, registrarErroPin, limparErrosPin,
    comoFazerAuth, exigirPermissao, temPermissao,
};
