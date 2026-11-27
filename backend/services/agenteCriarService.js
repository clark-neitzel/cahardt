// Criação do usuário-agente (ex.: "Luke (agente)") + token de API por rota de manutenção
// (POST /api/admin-exec/agente-criar), sem precisar de sessão de admin no navegador.
// Mesmas regras do roteiro docs/criar-luke-console.js:
//  - permissões do agente = TODAS as chaves de um admin humano de referência, EXCETO `admin` e
//    `Usuario_Externo`, mais `Isento_Ponto: true`;
//  - idempotente: reexecutar não duplica agente nem token.
// O token em claro só existe no retorno de `executar` (e dali na resposta HTTP). NUNCA vai para log,
// AuditLog nem mensagem de erro.
const prisma = require('../config/database');
const agenteSvc = require('./agenteTokenService');

const CHAVES_NAO_COPIAR = ['admin', 'Usuario_Externo']; // agente nunca é admin nem usuário externo
// comparação sem diferenciar maiúscula/minúscula e com trim (`Admin`, ` usuario_externo ` também ficam de fora)
const CHAVES_NAO_COPIAR_NORM = new Set(CHAVES_NAO_COPIAR.map(k => k.trim().toLowerCase()));
const ehChaveProibida = (k) => CHAVES_NAO_COPIAR_NORM.has(String(k).trim().toLowerCase());

// Mensagem de erro do Prisma pode trazer `data` com o hash do token (64 hex) ou um cah_ag_: nunca sai daqui assim.
function semSegredo(msg) {
    return String(msg == null ? '' : msg).replace(/cah_ag_[A-Za-z0-9_-]+/g, 'cah_ag_***').replace(/[0-9a-fA-F]{64}/g, '***');
}
const AUTOR_ID = 'admin-exec';
const AUTOR_NOME = 'Criação de agente (admin-exec)';
const PADRAO_NOME = 'Luke (agente)';
const PADRAO_TOKEN_NOME = 'luke-bpo';
const PADRAO_VALIDADE_DIAS = 90;

function erro(status, mensagem) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}

// Permissões podem estar como objeto OU string JSON (até dupla). Devolve sempre objeto.
function normalizarPermissoes(p) {
    if (p === null || p === undefined || p === '') return {};
    if (typeof p === 'string') {
        try { p = JSON.parse(p); } catch { throw erro(422, 'As permissões vieram em formato ilegível (JSON inválido). Nada foi alterado.'); }
        if (typeof p === 'string') {
            try { p = JSON.parse(p); } catch { throw erro(422, 'As permissões vieram em formato ilegível (JSON inválido). Nada foi alterado.'); }
        }
    }
    if (typeof p !== 'object' || p === null || Array.isArray(p)) throw erro(422, 'As permissões vieram em formato inesperado. Nada foi alterado.');
    return p;
}

// só os NOMES do que está ligado (booleano true ou dentro de objeto aninhado)
function chavesLigadas(obj, prefixo = '') {
    const saida = [];
    for (const [k, v] of Object.entries(obj || {})) {
        const nome = prefixo + k;
        if (v === true) saida.push(nome);
        else if (v && typeof v === 'object' && !Array.isArray(v)) saida.push(...chavesLigadas(v, nome + '.'));
    }
    return saida;
}

function validarCorpo(body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const texto = (valor, padrao, campo, max) => {
        if (valor === undefined || valor === null) return padrao;
        if (typeof valor !== 'string') throw erro(400, `"${campo}" deve ser um texto.`);
        const limpo = valor.trim();
        if (!limpo) return padrao;
        if (limpo.length > max) throw erro(400, `"${campo}" deve ter no máximo ${max} caracteres.`);
        return limpo;
    };
    const booleano = (valor, campo) => {
        if (valor === undefined || valor === null) return false;
        if (typeof valor !== 'boolean') throw erro(400, `"${campo}" deve ser true ou false.`);
        return valor;
    };
    const nome = texto(b.nome, PADRAO_NOME, 'nome', 80);
    const tokenNome = texto(b.tokenNome, PADRAO_TOKEN_NOME, 'tokenNome', 80);
    let origem = b.copiarPermissoesDe;
    if (typeof origem === 'number') origem = String(origem);
    if (typeof origem !== 'string' || !origem.trim()) {
        throw erro(400, 'Informe "copiarPermissoesDe": o nome exato (ou o id) de um administrador humano ativo, de quem as permissões serão copiadas.');
    }
    let validadeDias = PADRAO_VALIDADE_DIAS;
    if (b.validadeDias !== undefined && b.validadeDias !== null) {
        validadeDias = Number(b.validadeDias);
        if (typeof b.validadeDias === 'boolean' || !Number.isInteger(validadeDias) || validadeDias < 1 || validadeDias > 365) {
            throw erro(400, '"validadeDias" deve ser um número inteiro entre 1 e 365.');
        }
    }
    return {
        nome, tokenNome, validadeDias,
        copiarPermissoesDe: origem.trim(),
        novoToken: booleano(b.novoToken, 'novoToken'),
        sobrescrever: booleano(b.sobrescrever, 'sobrescrever'),
    };
}

// Acha o administrador humano de referência (id exato OU nome exato, sem diferenciar maiúscula).
async function resolverOrigem(ref) {
    const SELECT = { id: true, nome: true, ativo: true, agente: true, permissoes: true };
    let achados = [];
    const porId = await prisma.vendedor.findUnique({ where: { id: ref }, select: SELECT });
    if (porId) achados = [porId];
    else achados = await prisma.vendedor.findMany({ where: { nome: { equals: ref, mode: 'insensitive' } }, select: SELECT });
    if (achados.length === 0) throw erro(404, `Não encontrei nenhum usuário com o nome ou id "${ref}".`);
    if (achados.length > 1) {
        throw erro(409, `Há ${achados.length} usuários com o nome "${ref}" (ids: ${achados.map(a => a.id).join(', ')}). Repita informando o id em "copiarPermissoesDe".`);
    }
    const o = achados[0];
    if (o.agente === true) throw erro(400, `"${o.nome}" é um agente — a referência precisa ser um administrador humano.`);
    if (o.ativo === false) throw erro(400, `"${o.nome}" está inativo — a referência precisa ser um administrador humano ativo.`);
    const perms = normalizarPermissoes(o.permissoes);
    if (perms.admin !== true) throw erro(400, `"${o.nome}" não é administrador (permissão "admin" desligada). Informe um administrador humano.`);
    return { id: o.id, nome: o.nome, permissoes: perms };
}

function montarPermissoesDoAgente(permsOrigem) {
    const novas = {};
    for (const [k, v] of Object.entries(permsOrigem)) {
        if (ehChaveProibida(k)) continue;
        novas[k] = JSON.parse(JSON.stringify(v)); // cópia profunda idêntica
    }
    novas.Isento_Ponto = true; // agente não bate ponto nem faz check-in diário
    return novas;
}

async function acharAgente(nome) {
    const alvo = nome.trim().toLowerCase();
    const todos = await prisma.vendedor.findMany({
        where: { agente: true },
        select: { id: true, nome: true, ativo: true, permissoes: true },
    });
    const iguais = todos.filter(a => String(a.nome || '').trim().toLowerCase() === alvo);
    if (iguais.length > 1) throw erro(409, `Há ${iguais.length} agentes chamados "${nome}" (ids: ${iguais.map(a => a.id).join(', ')}). Resolva a duplicidade antes.`);
    const agente = iguais[0] || null;
    if (agente && agente.ativo === false) throw erro(409, `O agente "${agente.nome}" (id ${agente.id}) está INATIVO. Reative-o em Usuários e rode de novo (nada foi alterado).`);
    return agente;
}

async function tokensAtivosComNome(agenteId, tokenNome) {
    const lista = await prisma.agenteToken.findMany({
        where: { vendedorId: agenteId, nome: tokenNome, revogadoEm: null },
        select: { id: true, prefixo: true, expiraEm: true, revogadoEm: true },
        orderBy: { criadoEm: 'desc' },
    });
    const agora = Date.now();
    return lista.filter(t => !t.revogadoEm && (!t.expiraEm || new Date(t.expiraEm).getTime() > agora));
}

// Auditoria fora do fluxo principal; falha no log nunca desfaz o que já foi gravado. Nunca recebe token/hash.
async function auditar(acao, entidade, entidadeId, detalhes) {
    try {
        await prisma.auditLog.create({
            data: { acao, entidade, entidadeId: String(entidadeId), detalhes: JSON.stringify(detalhes), usuarioId: AUTOR_ID, usuarioNome: AUTOR_NOME },
        });
    } catch (e) {
        console.error(`[agente-criar] falha ao gravar auditoria ${acao} (operação já efetivada):`, semSegredo(e.message));
    }
}

async function gravarHistoricoPermissoes(agenteId, antes, depois) {
    try {
        await prisma.vendedorPermissoesHistorico.create({
            data: { vendedorId: agenteId, alteradoPorId: AUTOR_ID, alteradoPorNome: AUTOR_NOME, permissoesAntes: antes, permissoesDepois: depois },
        });
        // Retenção: mantém as 50 versões mais recentes por usuário (igual ao vendedorController)
        const excedentes = await prisma.vendedorPermissoesHistorico.findMany({
            where: { vendedorId: agenteId }, orderBy: { criadoEm: 'desc' }, skip: 50, select: { id: true },
        });
        if (excedentes.length) {
            await prisma.vendedorPermissoesHistorico.deleteMany({ where: { id: { in: excedentes.map(e => e.id) } } });
        }
    } catch (e) {
        console.error('[agente-criar] falha ao gravar histórico de permissões (save já efetivado):', semSegredo(e.message));
    }
}

// Trava de processo: dois "confirmar" simultâneos poderiam criar 2 agentes (nome não é único no banco).
let emExecucao = false;

/**
 * @param {object} body  corpo JSON da requisição
 * @param {{confirmar:boolean}} opcoes
 * @returns {Promise<object>} resposta pronta para res.json (o token em claro só vem aqui, se gerado agora)
 */
async function executar(body, { confirmar }) {
    const p = validarCorpo(body);
    if (confirmar) {
        if (emExecucao) throw erro(409, 'Já há uma criação de agente em andamento. Aguarde e tente de novo.');
        emExecucao = true;
    }
    try {
        return await rodar(p, !!confirmar);
    } finally {
        if (confirmar) emExecucao = false;
    }
}

async function rodar(p, confirmar) {
    const origem = await resolverOrigem(p.copiarPermissoesDe);
    const permsNovas = montarPermissoesDoAgente(origem.permissoes);
    const ligadas = chavesLigadas(permsNovas);
    let agente = await acharAgente(p.nome);
    const avisos = [];

    const permsAtuais = agente ? normalizarPermissoes(agente.permissoes) : {};
    const temPermissoes = Object.keys(permsAtuais).length > 0;
    const identicas = temPermissoes && JSON.stringify(ordenar(permsAtuais)) === JSON.stringify(ordenar(permsNovas));
    const gravarPerms = !temPermissoes || p.sobrescrever;
    if (temPermissoes && !identicas && !p.sobrescrever) {
        avisos.push(`O agente já tem ${Object.keys(permsAtuais).length} chaves de permissão diferentes das da origem; elas serão MANTIDAS. Para sobrescrever, envie "sobrescrever": true.`);
    }
    if (identicas) avisos.push('As permissões do agente já são idênticas às da origem; nada a gravar.');

    const ativos = agente ? await tokensAtivosComNome(agente.id, p.tokenNome) : [];
    const existente = ativos[0] ? { prefixo: ativos[0].prefixo, expiraEm: ativos[0].expiraEm } : null;
    const vaiGerarToken = !existente || p.novoToken;
    if (existente && !p.novoToken) avisos.push(`Já existe token ativo "${p.tokenNome}" (cah_ag_${existente.prefixo}…); nenhum novo será gerado. Para gerar outro, envie "novoToken": true.`);
    if (existente && p.novoToken) avisos.push(`Já existe token ativo "${p.tokenNome}" (cah_ag_${existente.prefixo}…); será gerado OUTRO (o antigo continua valendo até ser revogado).`);

    if (!confirmar) {
        return {
            dryRun: true,
            mensagem: 'Nada foi gravado. Para executar, repita a chamada com ?confirmar=1.',
            origem: { id: origem.id, nome: origem.nome },
            agenteNome: p.nome,
            agenteJaExiste: !!agente,
            permissoesACopiar: Object.keys(permsNovas).length,
            chavesLigadas: ligadas,
            gravariaPermissoes: gravarPerms && !identicas,
            vaiGerarToken,
            tokenAtivoExistente: existente,
            avisos,
        };
    }

    // ---------- EXECUÇÃO ----------
    let criado = false;
    if (!agente) {
        const novo = await agenteSvc.criarAgente({ nome: p.nome });
        agente = { id: novo.id, nome: novo.nome, ativo: true, permissoes: {} };
        criado = true;
        await auditar('AGENTE_CRIADO', 'Agente', novo.id, { nome: novo.nome, via: 'admin-exec/agente-criar' });
    }

    let permsGravadas = false;
    if (gravarPerms && !identicas) {
        await prisma.vendedor.update({ where: { id: agente.id }, data: { permissoes: permsNovas } });
        permsGravadas = true;
        await gravarHistoricoPermissoes(agente.id, permsAtuais, permsNovas);
    }

    let tokenClaro = null;
    let tokenPrefixo = existente ? existente.prefixo : null;
    let expiraEm = existente ? existente.expiraEm : null;
    if (vaiGerarToken) {
        try {
            const r = await agenteSvc.criarTokenParaAgente(agente.id, { nome: p.tokenNome, validadeDias: p.validadeDias }, AUTOR_ID);
            tokenClaro = r.token;
            tokenPrefixo = r.registro.prefixo;
            expiraEm = r.registro.expiraEm;
            await auditar('AGENTE_TOKEN_CRIADO', 'AgenteToken', r.registro.id, {
                agenteId: agente.id, agenteNome: agente.nome, tokenNome: r.registro.nome, prefixo: r.registro.prefixo, expiraEm: r.registro.expiraEm, limitePorMinuto: r.registro.limitePorMinuto,
                via: 'admin-exec/agente-criar',
            });
        } catch (e) {
            // Agente e permissões JÁ estão gravados. Reexecutar é seguro (reaproveita o agente e as permissões).
            await auditar('AGENTE_CRIAR_ADMIN_EXEC', 'Agente', agente.id, { agenteId: agente.id, agenteCriado: criado, permissoesGravadas: permsGravadas, tokenGerado: false, falhaToken: true });
            console.error('[agente-criar] falha ao gravar o token (agente e permissões já gravados):', semSegredo(e && e.message).slice(0, 300));
            const err = erro(500, `O agente (id ${agente.id}) ${criado ? 'foi criado' : 'já existia'}${permsGravadas ? ' e as permissões foram gravadas' : ''}, mas o TOKEN NÃO foi gerado: falha ao gravar o token no banco; o agente e as permissões já foram gravados — repita a chamada (o agente e as permissões são reaproveitados); veja o log do servidor.`);
            err.agenteId = agente.id;
            throw err;
        }
    }

    await auditar('AGENTE_CRIAR_ADMIN_EXEC', 'Agente', agente.id, {
        agenteId: agente.id, agenteCriado: criado, origemId: origem.id,
        permissoesGravadas: permsGravadas, qtdPermissoes: Object.keys(permsNovas).length,
        tokenGerado: !!tokenClaro, prefixo: tokenPrefixo,
    });

    return {
        ok: true,
        agente: { id: agente.id, nome: agente.nome, criadoAgora: criado },
        permissoes: { copiadas: Object.keys(permsNovas).length, gravadasAgora: permsGravadas, ligadas },
        token: tokenClaro, // em claro SÓ aqui, e só se foi gerado agora
        tokenPrefixo,
        expiraEm,
        avisos,
    };
}

function ordenar(obj) {
    if (Array.isArray(obj)) return obj.map(ordenar);
    if (obj && typeof obj === 'object') return Object.keys(obj).sort().reduce((a, k) => { a[k] = ordenar(obj[k]); return a; }, {});
    return obj;
}

module.exports = { executar, validarCorpo, normalizarPermissoes, chavesLigadas, montarPermissoesDoAgente, CHAVES_NAO_COPIAR };
