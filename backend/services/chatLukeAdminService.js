// Ligar/desligar o chat do Luke e escolher o agente que atende SEM sessão de admin humano:
//   POST /api/admin-exec/chat-luke-config[?confirmar=1]
// Sem `?confirmar=1` (exatamente "1") é DRY-RUN: não grava nada. Com confirmar, delega a
// chatLukeService.salvarConfig (mesma validação e mesma auditoria do PUT /api/chat-luke/config).
// Nunca devolve segredo: a config do chat só tem agenteId/ativo/limites e o webhook sai por estadoPublico().
const prisma = require('../config/database');
const chat = require('./chatLukeService');
const luke = require('./lukeWebhookService');

const ATOR = { id: 'admin-exec', nome: 'admin-exec' };

function erro(status, mensagem, extra) {
    const e = new Error(mensagem);
    e.status = status;
    if (extra) e.extra = extra;
    return e;
}

function validarCorpo(body) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const out = {};
    if (b.agenteId !== undefined && b.agenteId !== null) {
        if (typeof b.agenteId !== 'string' || !b.agenteId.trim() || b.agenteId.length > 100) throw erro(400, '"agenteId" deve ser um texto.');
        out.agenteId = b.agenteId.trim();
    }
    if (b.agenteNome !== undefined && b.agenteNome !== null) {
        if (typeof b.agenteNome !== 'string' || !b.agenteNome.trim() || b.agenteNome.length > 200) throw erro(400, '"agenteNome" deve ser um texto.');
        out.agenteNome = b.agenteNome.trim();
    }
    if (b.ativo !== undefined) {
        if (typeof b.ativo !== 'boolean') throw erro(400, '"ativo" deve ser true ou false.');
        out.ativo = b.ativo;
    }
    if (out.agenteId === undefined && out.agenteNome === undefined && out.ativo === undefined) {
        throw erro(400, 'Informe ao menos um de: "agenteId", "agenteNome" ou "ativo".');
    }
    return out;
}

// agenteId explícito tem prioridade; senão resolve por nome exato entre agentes ativos.
async function resolverAgente({ agenteId, agenteNome }) {
    if (agenteId !== undefined) {
        const v = await prisma.vendedor.findUnique({ where: { id: agenteId }, select: { id: true, nome: true, agente: true, ativo: true } });
        if (!v || v.agente !== true || v.ativo === false) throw erro(404, `"${agenteId}" não é um agente ativo. Nada foi alterado.`);
        return { id: v.id, nome: v.nome };
    }
    if (agenteNome !== undefined) {
        const todos = await prisma.vendedor.findMany({ where: { agente: true, ativo: true }, select: { id: true, nome: true } });
        const achados = todos.filter((a) => String(a.nome || '').trim() === agenteNome);
        if (achados.length === 0) throw erro(404, `Não encontrei nenhum agente ativo chamado "${agenteNome}". Nada foi alterado.`);
        if (achados.length > 1) throw erro(409, `Há ${achados.length} agentes ativos chamados "${agenteNome}" (ids: ${achados.map((a) => a.id).join(', ')}). Repita informando "agenteId".`);
        return { id: achados[0].id, nome: achados[0].nome };
    }
    return null;
}

async function executar(body, { confirmar = false } = {}) {
    const entrada = validarCorpo(body);
    const agente = await resolverAgente(entrada);
    const atual = await chat.lerConfig({ fresco: true });
    const mudanca = {};
    if (agente) mudanca.agenteId = agente.id;
    if (entrada.ativo !== undefined) mudanca.ativo = entrada.ativo;
    const previsto = { ...atual, ...mudanca, limites: { ...atual.limites } };

    if (!confirmar) {
        return {
            dryRun: true, gravado: false, atual, novo: previsto, ...(agente ? { agente } : {}),
            webhook: luke.estadoPublico(),
            aviso: 'Nada foi gravado. Repita com ?confirmar=1 para aplicar.',
        };
    }
    const novo = await chat.salvarConfig(mudanca, ATOR);
    return { dryRun: false, gravado: true, atual, novo, ...(agente ? { agente } : {}), webhook: luke.estadoPublico() };
}

module.exports = { executar, validarCorpo };
