// Usuário-agente (Vendedor.agente = true) + tokens de API (tabela agente_tokens).
// O token (cah_ag_ + 32 bytes base64url) só existe em claro na resposta da criação;
// no banco fica só o SHA-256 (token aleatório de alta entropia: SHA-256 basta, bcrypt não).
const crypto = require('crypto');
const prisma = require('../config/database');

const PREFIXO_TOKEN = 'cah_ag_';
const VALIDADE_PADRAO_DIAS = 90;
const LIMITE_PADRAO_POR_MINUTO = 120;
const JANELA_MS = 60 * 1000;
const INTERVALO_USO_MS = 60 * 1000; // ultimoUsoEm/totalUsos no máximo 1x por minuto por token

function hashToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function gerarToken() {
    const segredo = crypto.randomBytes(32).toString('base64url');
    const token = PREFIXO_TOKEN + segredo;
    return { token, prefixo: segredo.slice(0, 8), hash: hashToken(token) };
}

function pareceTokenAgente(valor) {
    return typeof valor === 'string' && valor.startsWith(PREFIXO_TOKEN);
}

// ---- limite de requisições por minuto (em memória, por token) ----
const contadores = new Map();
function conta(chave, limite) {
    const agora = Date.now();
    const atual = contadores.get(chave);
    if (!atual || agora >= atual.resetAt) {
        contadores.set(chave, { count: 1, resetAt: agora + JANELA_MS });
        return { estourou: false };
    }
    atual.count += 1;
    if (atual.count > limite) return { estourou: true, retryAfterSeg: Math.max(1, Math.ceil((atual.resetAt - agora) / 1000)) };
    return { estourou: false };
}
// Consulta SEM incrementar: já estourou o limite nesta janela? (usado antes de ir ao banco)
function excedeu(chave, limite) {
    const atual = contadores.get(chave);
    return !!atual && Date.now() < atual.resetAt && atual.count >= limite;
}
function limparContadores() { contadores.clear(); ultimoToque.clear(); validosRecentes.clear(); }

// Tokens que JÁ autenticaram há pouco (só hash em memória): servem APENAS para não serem pegos pelo
// freio de falhas por IP. NÃO autenticam nada — todo token continua indo ao banco a cada chamada
// (revogação imediata). Assim um IP barulhento não derruba o agente legítimo que já estava em uso.
const VALIDOS_TTL_MS = 5 * 60 * 1000;
const validosRecentes = new Map();
function marcarValido(hash) { validosRecentes.set(hash, Date.now()); }
function foiValidoRecentemente(hash) {
    const t = validosRecentes.get(hash);
    return !!t && Date.now() - t < VALIDOS_TTL_MS;
}

// Varredura: sem isso os Maps crescem para sempre (1 entrada por IP/token já visto).
function varrer() {
    const agora = Date.now();
    for (const [k, v] of contadores) if (agora >= v.resetAt) contadores.delete(k);
    for (const [k, t] of ultimoToque) if (agora - t >= INTERVALO_USO_MS) ultimoToque.delete(k);
    for (const [k, t] of validosRecentes) if (agora - t >= VALIDOS_TTL_MS) validosRecentes.delete(k);
}
setInterval(varrer, 3 * 60 * 1000).unref();

// ---- registro de uso (no máximo 1x por minuto por token, fora do caminho crítico) ----
const ultimoToque = new Map();
function registrarUso(tokenId, ip) {
    const agora = Date.now();
    if (agora - (ultimoToque.get(tokenId) || 0) < INTERVALO_USO_MS) return;
    ultimoToque.set(tokenId, agora);
    prisma.agenteToken.update({
        where: { id: tokenId },
        data: { ultimoUsoEm: new Date(), ultimoUsoIp: ip ? String(ip).slice(0, 64) : null, totalUsos: { increment: 1 } },
    }).catch((e) => console.error('[Agente] falha ao registrar uso do token:', e.message));
}

/**
 * Valida um token cah_ag_. Devolve { ok: true, token, vendedor } ou { ok: false, status, error, codigo }.
 * Revogação/expiração/ativo/agente valem na hora: 1 consulta indexada por chamada, sem cache.
 */
async function validarToken(tokenEmClaro) {
    const invalido = { ok: false, status: 401, error: 'Token de agente inválido ou expirado.', codigo: 'AGENTE_TOKEN_INVALIDO' };
    if (!pareceTokenAgente(tokenEmClaro) || tokenEmClaro.length > 200) return invalido;
    const registro = await prisma.agenteToken.findUnique({
        where: { hash: hashToken(tokenEmClaro) },
        include: { vendedor: { select: { id: true, nome: true, ativo: true, agente: true, permissoes: true, maxDescontoFlex: true } } },
    });
    if (!registro || registro.revogadoEm) return invalido;
    if (registro.expiraEm && registro.expiraEm.getTime() <= Date.now()) return invalido;
    const v = registro.vendedor;
    if (!v || v.ativo === false || v.agente !== true) return invalido;
    const permissoes = typeof v.permissoes === 'string' ? JSON.parse(v.permissoes) : (v.permissoes || {});
    // Agente NUNCA é admin — mesmo que alguém dê `admin` por rota de usuários, o token deixa de valer.
    if (permissoes.admin === true) {
        return { ok: false, status: 403, error: 'Agente não pode ter permissão de administrador.', codigo: 'AGENTE_ADMIN_PROIBIDO' };
    }
    marcarValido(registro.hash);
    return { ok: true, token: registro, vendedor: v, permissoes };
}

// ---- gestão (rotas só admin) ----
async function criarAgente({ nome }) {
    const limpo = String(nome || '').trim();
    if (!limpo) { const e = new Error('Informe o nome do agente.'); e.status = 400; throw e; }
    // login/senha ficam null: agente não entra pelo login do app. `login` é @unique,
    // e o Postgres aceita vários NULL — por isso nunca gravar '' aqui.
    return prisma.vendedor.create({
        data: { id: crypto.randomUUID(), nome: limpo, login: null, senha: null, permissoes: {}, acessoExterno: true, agente: true, ativo: true },
        select: { id: true, nome: true, ativo: true, agente: true, createdAt: true },
    });
}

const SELECT_TOKEN_PUBLICO = { id: true, nome: true, prefixo: true, criadoEm: true, expiraEm: true, revogadoEm: true, ultimoUsoEm: true, ultimoUsoIp: true, totalUsos: true, limitePorMinuto: true, criadoPorId: true }; // sem `hash`

async function listarAgentes() {
    return prisma.vendedor.findMany({
        where: { agente: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, ativo: true, permissoes: true, createdAt: true, agenteTokens: { orderBy: { criadoEm: 'desc' }, select: SELECT_TOKEN_PUBLICO } },
    });
}

async function agentePorId(id) {
    const v = await prisma.vendedor.findUnique({ where: { id: String(id) }, select: { id: true, nome: true, agente: true, ativo: true } });
    if (!v || v.agente !== true) { const e = new Error('Agente não encontrado.'); e.status = 404; throw e; }
    return v;
}

async function criarTokenParaAgente(agenteId, { nome, validadeDias, limitePorMinuto }, criadoPorId) {
    const agente = await agentePorId(agenteId);
    const dias = validadeDias === undefined || validadeDias === null ? VALIDADE_PADRAO_DIAS : Number(validadeDias);
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) { const e = new Error('validadeDias deve estar entre 1 e 365.'); e.status = 400; throw e; }
    const limite = limitePorMinuto === undefined || limitePorMinuto === null ? LIMITE_PADRAO_POR_MINUTO : Number(limitePorMinuto);
    if (!Number.isInteger(limite) || limite < 1 || limite > 10000) { const e = new Error('limitePorMinuto deve ser inteiro entre 1 e 10000.'); e.status = 400; throw e; }
    const { token, prefixo, hash } = gerarToken();
    const registro = await prisma.agenteToken.create({
        data: {
            vendedorId: agente.id,
            nome: String(nome || 'token').trim().slice(0, 80) || 'token',
            prefixo, hash, criadoPorId,
            expiraEm: new Date(Date.now() + dias * 24 * 60 * 60 * 1000),
            limitePorMinuto: limite,
        },
        select: SELECT_TOKEN_PUBLICO,
    });
    return { agente, registro, token };
}

async function revogarToken(agenteId, tokenId) {
    const agente = await agentePorId(agenteId);
    const atual = await prisma.agenteToken.findFirst({ where: { id: String(tokenId), vendedorId: agente.id }, select: { id: true, revogadoEm: true } });
    if (!atual) { const e = new Error('Token não encontrado.'); e.status = 404; throw e; }
    if (atual.revogadoEm) return { agente, registro: await prisma.agenteToken.findUnique({ where: { id: atual.id }, select: SELECT_TOKEN_PUBLICO }), jaRevogado: true };
    const registro = await prisma.agenteToken.update({ where: { id: atual.id }, data: { revogadoEm: new Date() }, select: SELECT_TOKEN_PUBLICO });
    ultimoToque.delete(atual.id);
    return { agente, registro, jaRevogado: false };
}

module.exports = {
    PREFIXO_TOKEN, hashToken, gerarToken, pareceTokenAgente, validarToken, conta, excedeu, varrer, foiValidoRecentemente, limparContadores, registrarUso,
    criarAgente, listarAgentes, criarTokenParaAgente, revogarToken,
};
