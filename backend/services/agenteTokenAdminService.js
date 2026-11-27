// Revogar / rotacionar o token do usuário-agente (ex.: "Luke (agente)") por rota de manutenção
//   POST /api/admin-exec/agente-token-revogar[?confirmar=1]
//   POST /api/admin-exec/agente-token-rotacionar[?confirmar=1]
// sem precisar de sessão de admin humano. Mesmo padrão do agente-criar: sem `?confirmar=1` = DRY-RUN
// (não grava nada, não devolve segredo). O token novo em claro só existe no retorno de `rotacionar`
// com confirmar (e dali na resposta HTTP). NUNCA vai para log, AuditLog nem mensagem de erro.
// Banco só guarda o SHA-256; este arquivo nunca lê nem devolve `hash`.
const prisma = require('../config/database');
const agenteSvc = require('./agenteTokenService');
const { semSegredo } = require('./agenteCriarService');

const AUTOR_ID = 'admin-exec';
const AUTOR_NOME = 'Token de agente (admin-exec)';
const PADRAO_TOKEN_NOME = 'luke-bpo';
const PADRAO_VALIDADE_DIAS = 90;
const REGEX_PREFIXO = /^[A-Za-z0-9_-]{8}$/; // 8 primeiros chars do segredo (base64url); diferencia maiúscula

function erro(status, mensagem, extra) {
    const e = new Error(mensagem);
    e.status = status;
    if (extra) e.extra = extra;
    return e;
}

// ---------------- validação ----------------
function textoOpcional(valor, campo, max) {
    if (valor === undefined || valor === null) return null;
    if (typeof valor !== 'string') throw erro(400, `"${campo}" deve ser um texto.`);
    const limpo = valor.trim();
    if (!limpo) return null;
    if (limpo.length > max) throw erro(400, `"${campo}" deve ter no máximo ${max} caracteres.`);
    return limpo;
}

function referenciaAgente(b) {
    let ref = b.agente;
    if (typeof ref === 'number') ref = String(ref);
    if (typeof ref !== 'string' || !ref.trim()) {
        throw erro(400, 'Informe "agente": o nome exato (ou o id) do usuário-agente.');
    }
    return ref.trim();
}

function validarCorpoRevogar(body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const agente = referenciaAgente(b);
    let tokens;
    const t = b.tokens;
    if (typeof t === 'string' && t.trim().toLowerCase() === 'todos') tokens = 'todos';
    else if (Array.isArray(t)) {
        if (t.length === 0 || t.length > 50) throw erro(400, '"tokens" deve ter de 1 a 50 prefixos (ou ser "todos").');
        const vistos = new Set();
        for (const p of t) {
            if (typeof p !== 'string' || !REGEX_PREFIXO.test(p.trim())) {
                throw erro(400, 'Cada item de "tokens" deve ser o prefixo de 8 caracteres do token (letras, números, "-" ou "_"). Veja os prefixos no dry-run.');
            }
            vistos.add(p.trim());
        }
        tokens = [...vistos];
    } else {
        throw erro(400, 'Informe "tokens": "todos" ou uma lista com os prefixos (8 caracteres) dos tokens a revogar.');
    }
    return { agente, tokens, motivo: textoOpcional(b.motivo, 'motivo', 200) };
}

function validarCorpoRotacionar(body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const agente = referenciaAgente(b);
    let revogarAnteriores = true;
    if (b.revogarAnteriores !== undefined && b.revogarAnteriores !== null) {
        if (typeof b.revogarAnteriores !== 'boolean') throw erro(400, '"revogarAnteriores" deve ser true ou false.');
        revogarAnteriores = b.revogarAnteriores;
    }
    const tokenNome = textoOpcional(b.tokenNome, 'tokenNome', 80) || PADRAO_TOKEN_NOME;
    let validadeDias = PADRAO_VALIDADE_DIAS;
    if (b.validadeDias !== undefined && b.validadeDias !== null) {
        validadeDias = Number(b.validadeDias);
        if (typeof b.validadeDias === 'boolean' || !Number.isInteger(validadeDias) || validadeDias < 1 || validadeDias > 365) {
            throw erro(400, '"validadeDias" deve ser um número inteiro entre 1 e 365.');
        }
    }
    let limitePorMinuto;
    if (b.limitePorMinuto !== undefined && b.limitePorMinuto !== null) {
        limitePorMinuto = Number(b.limitePorMinuto);
        if (typeof b.limitePorMinuto === 'boolean' || !Number.isInteger(limitePorMinuto) || limitePorMinuto < 1 || limitePorMinuto > 600) {
            throw erro(400, '"limitePorMinuto" deve ser um número inteiro entre 1 e 600.');
        }
    }
    return { agente, revogarAnteriores, tokenNome, validadeDias, limitePorMinuto };
}

// ---------------- acesso ao banco ----------------
// id exato OU nome exato (sem diferenciar maiúscula/espaços). Só agentes (Vendedor.agente = true).
async function resolverAgente(ref, { exigirAtivo }) {
    const SELECT = { id: true, nome: true, ativo: true, agente: true };
    let achados = [];
    const porId = await prisma.vendedor.findUnique({ where: { id: ref }, select: SELECT });
    if (porId) {
        achados = [porId];
    } else {
        const alvo = ref.toLowerCase();
        const todos = await prisma.vendedor.findMany({ where: { agente: true }, select: SELECT });
        achados = todos.filter(a => String(a.nome || '').trim().toLowerCase() === alvo);
    }
    if (achados.length === 0) throw erro(404, `Não encontrei nenhum agente com o nome ou id "${ref}".`);
    if (achados.length > 1) {
        throw erro(409, `Há ${achados.length} agentes chamados "${ref}" (ids: ${achados.map(a => a.id).join(', ')}). Repita informando o id em "agente".`);
    }
    const a = achados[0];
    if (a.agente !== true) throw erro(404, `"${a.nome}" não é um usuário-agente. Nada foi alterado.`);
    if (exigirAtivo && a.ativo === false) {
        throw erro(409, `O agente "${a.nome}" (id ${a.id}) está INATIVO. Reative-o em Usuários e rode de novo (nada foi alterado).`);
    }
    return a;
}

// Todos os tokens do agente (sem hash). Mais recentes primeiro.
async function tokensDoAgente(agenteId) {
    return prisma.agenteToken.findMany({
        where: { vendedorId: agenteId },
        orderBy: { criadoEm: 'desc' },
        select: { id: true, nome: true, prefixo: true, criadoEm: true, expiraEm: true, revogadoEm: true, ultimoUsoEm: true, ultimoUsoIp: true, totalUsos: true },
    });
}

// vista pública do token — nunca `hash`, nunca o segredo
function vista(t) {
    return {
        prefixo: t.prefixo, nome: t.nome, criadoEm: t.criadoEm, expiraEm: t.expiraEm,
        ultimoUsoEm: t.ultimoUsoEm, ultimoUsoIp: t.ultimoUsoIp, totalUsos: t.totalUsos,
    };
}

// Auditoria fora do fluxo principal; falha no log nunca desfaz o que já foi gravado. Nunca recebe token/hash.
async function auditar(acao, entidade, entidadeId, detalhes) {
    try {
        await prisma.auditLog.create({
            data: { acao, entidade, entidadeId: String(entidadeId), detalhes: JSON.stringify(detalhes), usuarioId: AUTOR_ID, usuarioNome: AUTOR_NOME },
        });
    } catch (e) {
        console.error(`[agente-token-admin] falha ao gravar auditoria ${acao} (operação já efetivada):`, semSegredo(e && e.message).slice(0, 300));
    }
}

// Revoga (idempotente) os tokens dados. Continua mesmo se um falhar e devolve o balanço.
async function revogarLista(agente, lista, motivo) {
    const revogados = [];
    const falhas = [];
    for (const t of lista) {
        try {
            const r = await agenteSvc.revogarToken(agente.id, t.id);
            if (r.jaRevogado) continue; // outro processo revogou no meio: nada a registrar
            revogados.push(t.prefixo);
            await auditar('AGENTE_TOKEN_REVOGADO', 'AgenteToken', t.id, {
                agenteId: agente.id, agenteNome: agente.nome, tokenNome: t.nome, prefixo: t.prefixo,
                ...(motivo ? { motivo } : {}), via: 'admin-exec',
            });
        } catch (e) {
            falhas.push(t.prefixo);
            console.error('[agente-token-admin] falha ao revogar token', t.prefixo, ':', semSegredo(e && e.message).slice(0, 300));
        }
    }
    // token(s) revogado(s): os pedidos PENDENTES do agente na fila de solicitações são recusados na hora (o EXECUTANDO segue)
    let recusadasAutomaticamente = 0;
    if (revogados.length) {
        recusadasAutomaticamente = await require('./agenteSolicitacaoService').recusarPendentesDoAgente(agente.id, 'token revogado/rotacionado (admin-exec)', { id: AUTOR_ID, nome: AUTOR_NOME });
    }
    return { revogados, falhas, recusadasAutomaticamente };
}

// ---------------- revogar ----------------
async function revogar(body, { confirmar }) {
    const p = validarCorpoRevogar(body);
    const agente = await resolverAgente(p.agente, { exigirAtivo: false }); // revogar vale mesmo com agente inativo
    const todos = await tokensDoAgente(agente.id);
    const ativos = todos.filter(t => !t.revogadoEm);
    const avisos = [];
    let alvo;
    const jaRevogados = [];
    if (p.tokens === 'todos') {
        alvo = ativos;
        if (!ativos.length) avisos.push('O agente não tem nenhum token ativo; nada a revogar.');
    } else {
        alvo = [];
        const inexistentes = [];
        for (const prefixo of p.tokens) {
            const casam = todos.filter(t => t.prefixo === prefixo);
            if (!casam.length) { inexistentes.push(prefixo); continue; }
            for (const t of casam) {
                if (t.revogadoEm) { if (!jaRevogados.includes(prefixo)) jaRevogados.push(prefixo); } else alvo.push(t);
            }
        }
        if (inexistentes.length) {
            throw erro(404, `Não existe token com o prefixo ${inexistentes.map(x => `"${x}"`).join(', ')} neste agente. Nada foi alterado. Prefixos de tokens ATIVOS: ${ativos.length ? ativos.map(t => t.prefixo).join(', ') : '(nenhum)'}.`,
                { prefixosAtivos: ativos.map(t => t.prefixo) });
        }
        for (const x of jaRevogados) avisos.push(`O token ${x} já estava revogado; ignorado.`);
    }
    const base = { agente: { id: agente.id, nome: agente.nome, ativo: agente.ativo !== false } };

    if (!confirmar) {
        return {
            dryRun: true,
            mensagem: 'Nada foi gravado. Para revogar, repita a chamada com ?confirmar=1.',
            ...base,
            tokensAtivos: ativos.map(vista),
            seriamRevogados: alvo.map(t => t.prefixo),
            jaRevogados,
            avisos,
        };
    }

    const { revogados, falhas, recusadasAutomaticamente } = await revogarLista(agente, alvo, p.motivo);
    if (falhas.length) {
        throw erro(500, `Falha ao revogar o(s) token(s) ${falhas.join(', ')}; veja o log do servidor. Já revogados nesta chamada: ${revogados.length ? revogados.join(', ') : '(nenhum)'}. Repita a chamada: é seguro (o que já foi revogado é ignorado).`,
            { revogados, falhas });
    }
    return { ok: true, ...base, revogados, jaRevogados, recusadasAutomaticamente, avisos };
}

// ---------------- rotacionar ----------------
// Trava de processo: dois "confirmar" simultâneos gerariam 2 tokens novos (e o 2º revogaria o 1º recém-criado).
let emRotacao = false;

async function rotacionar(body, { confirmar }) {
    const p = validarCorpoRotacionar(body);
    if (confirmar) {
        if (emRotacao) throw erro(409, 'Já há uma rotação de token em andamento. Aguarde e tente de novo.');
        emRotacao = true;
    }
    try {
        return await rodarRotacao(p, !!confirmar);
    } finally {
        if (confirmar) emRotacao = false;
    }
}

async function rodarRotacao(p, confirmar) {
    const agente = await resolverAgente(p.agente, { exigirAtivo: true });
    const todos = await tokensDoAgente(agente.id);
    const ativos = todos.filter(t => !t.revogadoEm);
    const aRevogar = p.revogarAnteriores ? ativos : [];
    const avisos = [];
    if (!p.revogarAnteriores && ativos.length) {
        avisos.push(`"revogarAnteriores" está falso: ${ativos.length} token(s) antigo(s) (${ativos.map(t => t.prefixo).join(', ')}) CONTINUAM valendo. Se o token antigo vazou, revogue-o.`);
    }
    const base = { agente: { id: agente.id, nome: agente.nome } };

    if (!confirmar) {
        return {
            dryRun: true,
            mensagem: 'Nada foi gravado. Para rotacionar, repita a chamada com ?confirmar=1.',
            ...base,
            tokensAtivos: ativos.map(vista),
            seriamRevogados: aRevogar.map(t => t.prefixo),
            geraria: { quantidade: 1, tokenNome: p.tokenNome, validadeDias: p.validadeDias, ...(p.limitePorMinuto ? { limitePorMinuto: p.limitePorMinuto } : {}) },
            avisos,
        };
    }

    // 1) revoga os anteriores PRIMEIRO: um token vazado tem que cair antes de o novo existir.
    const { revogados, falhas, recusadasAutomaticamente } = await revogarLista(agente, aRevogar, 'rotação de token (admin-exec)');
    if (falhas.length) {
        throw erro(500, `Falha ao revogar o(s) token(s) antigo(s) ${falhas.join(', ')}; NENHUM token novo foi gerado. Já revogados: ${revogados.length ? revogados.join(', ') : '(nenhum)'}. Veja o log do servidor e repita a chamada (é seguro).`,
            { agenteId: agente.id, revogados, falhas });
    }

    // 2) cria o novo
    let r;
    try {
        r = await agenteSvc.criarTokenParaAgente(agente.id,
            { nome: p.tokenNome, validadeDias: p.validadeDias, limitePorMinuto: p.limitePorMinuto }, AUTOR_ID);
    } catch (e) {
        console.error('[agente-token-admin] falha ao gravar o token novo (antigos já revogados):', semSegredo(e && e.message).slice(0, 300));
        throw erro(500, `Os token(s) antigo(s) JÁ FORAM REVOGADOS${revogados.length ? ` (${revogados.join(', ')})` : ''}, mas o token NOVO NÃO foi gerado: falha ao gravar no banco; veja o log do servidor. Repita a chamada: é seguro (não revoga de novo o que já foi revogado e gera 1 token novo).`,
            { agenteId: agente.id, revogados });
    }
    await auditar('AGENTE_TOKEN_CRIADO', 'AgenteToken', r.registro.id, {
        agenteId: agente.id, agenteNome: agente.nome, tokenNome: r.registro.nome, prefixo: r.registro.prefixo,
        expiraEm: r.registro.expiraEm, limitePorMinuto: r.registro.limitePorMinuto, via: 'admin-exec/agente-token-rotacionar',
    });

    return {
        ok: true,
        ...base,
        revogados,
        recusadasAutomaticamente,
        token: r.token, // em claro SÓ aqui, uma vez
        tokenPrefixo: r.registro.prefixo,
        expiraEm: r.registro.expiraEm,
        avisos,
    };
}

module.exports = { revogar, rotacionar, validarCorpoRevogar, validarCorpoRotacionar };
