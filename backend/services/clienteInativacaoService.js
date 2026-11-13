// Pedidos de inativação de cliente. O agente (Ana) só PEDE; quem inativa é uma pessoa autorizada,
// na fila do app. Aprovar usa o MESMO caminho do app para inativar (clienteController.atualizar =
// PATCH /clientes/:uuid com Ativo:false): mesmas validações, audit_logs CLIENTE_ALTERADO e o diff
// de `Ativo` em cliente_alteracoes, com o usuário que aprovou como autor.
const prisma = require('../config/database');
const { erro, pagina, lista, texto, idOpcional } = require('./analyticsComum');
const historico = require('./clienteHistoricoService');

const MOTIVOS = ['fechou', 'trocou_dono', 'parou_de_comprar', 'numero_errado', 'outro'];
const ROTULO_MOTIVO = {
    fechou: 'Fechou o negócio',
    trocou_dono: 'Trocou de dono',
    parou_de_comprar: 'Parou de comprar',
    numero_errado: 'Número errado',
    outro: 'Outro',
};
const STATUS = ['pendente', 'aprovada', 'recusada'];
const MAX_DETALHE = 500;
const MAX_OBS = 500;
const TELA = 'Fila de inativação';

function publica(s, cliente) {
    return {
        id: s.id,
        clienteId: s.clienteId,
        cliente: cliente ? (cliente.NomeFantasia || cliente.Nome || null) : undefined,
        motivo: s.motivo,
        motivoRotulo: ROTULO_MOTIVO[s.motivo] || s.motivo,
        detalhe: s.detalhe || null,
        solicitadoPor: s.solicitadoPor,
        origem: s.origem,
        status: s.status,
        decididoPor: s.decididoPorId || s.decididoPorNome ? { id: s.decididoPorId || null, nome: s.decididoPorNome || null } : null,
        decididoEm: s.decididoEm || null,
        observacaoDecisao: s.observacaoDecisao || null,
        criadoEm: s.createdAt,
    };
}

async function clientesPorId(ids) {
    if (!ids.length) return new Map();
    const rows = await prisma.cliente.findMany({ where: { UUID: { in: ids } }, select: { UUID: true, Nome: true, NomeFantasia: true, Ativo: true, End_Cidade: true } });
    return new Map(rows.map((c) => [c.UUID, c]));
}

/** Valida motivo + detalhe. Devolve { motivo, detalhe }. */
function validar(body) {
    const motivo = String(body?.motivo ?? '').trim();
    if (!MOTIVOS.includes(motivo)) {
        throw erro(400, `motivo inválido. Use: ${MOTIVOS.join(', ')}.`, 'MOTIVO_INVALIDO');
    }
    const detalhe = texto(body?.detalhe, MAX_DETALHE, { obrigatorio: motivo === 'outro', nome: 'o detalhe (obrigatório quando o motivo é "outro")' });
    return { motivo, detalhe };
}

/**
 * Cria o pedido. Só um `pendente` por cliente: repetir devolve o existente com duplicado:true.
 * `ator`: { agente } (API) ou { id, nome } (app).
 */
async function solicitar(clienteId, body, ator) {
    const id = idOpcional(clienteId, 'clienteId');
    if (!id) throw erro(400, 'Informe o cliente.', 'CAMPO_OBRIGATORIO');
    const { motivo, detalhe } = validar(body);
    const cliente = await prisma.cliente.findUnique({ where: { UUID: id }, select: { UUID: true, Nome: true, NomeFantasia: true, Ativo: true } });
    if (!cliente) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
    if (!cliente.Ativo) throw erro(409, 'O cliente já está inativo.', 'CLIENTE_JA_INATIVO');

    const existente = await prisma.clienteInativacaoSolicitacao.findFirst({ where: { clienteId: id, status: 'pendente' }, orderBy: { createdAt: 'asc' } });
    if (existente) return { status: 200, duplicado: true, solicitacao: publica(existente, cliente) };

    const porAgente = !!ator?.agente;
    const criada = await prisma.clienteInativacaoSolicitacao.create({
        data: {
            clienteId: id, motivo, detalhe,
            solicitadoPor: String(porAgente ? ator.agente : (ator?.nome || ator?.login || 'desconhecido')).slice(0, 180),
            origem: porAgente ? 'api_agente' : 'app',
        },
    });
    return { status: 201, duplicado: false, solicitacao: publica(criada, cliente) };
}

/** Lista (agentes e app). `status`: pendente (padrão) | aprovada | recusada | todas. */
async function listar(query = {}) {
    const pedido = String(query.status ?? 'pendente').trim().toLowerCase() || 'pendente';
    if (pedido !== 'todas' && !STATUS.includes(pedido)) {
        throw erro(400, `status inválido. Use: ${STATUS.join(', ')} ou todas.`, 'STATUS_INVALIDO');
    }
    const clienteId = idOpcional(query.clienteId, 'clienteId');
    const pg = pagina(query);
    const where = { ...(pedido === 'todas' ? {} : { status: pedido }), ...(clienteId ? { clienteId } : {}) };
    const [total, rows] = await Promise.all([
        prisma.clienteInativacaoSolicitacao.count({ where }),
        prisma.clienteInativacaoSolicitacao.findMany({ where, orderBy: { createdAt: pedido === 'pendente' ? 'asc' : 'desc' }, skip: pg.skip, take: pg.limit }),
    ]);
    const mapa = await clientesPorId([...new Set(rows.map((r) => r.clienteId))]);
    return lista({ page: pg.page, limit: pg.limit, total, data: rows.map((r) => publica(r, mapa.get(r.clienteId))), extra: { status: pedido } });
}

async function contarPendentes() {
    return { pendentes: await prisma.clienteInativacaoSolicitacao.count({ where: { status: 'pendente' } }) };
}

/** Resumo gravado no histórico: "motivo: … | detalhe: … | solicitado por: ana". */
function resumoPedido(s) {
    return [`motivo: ${ROTULO_MOTIVO[s.motivo] || s.motivo}`, s.detalhe ? `detalhe: ${s.detalhe}` : null, `solicitado por: ${s.solicitadoPor}`].filter(Boolean).join(' | ');
}

/** Caminho oficial do app para inativar (PATCH /clientes/:uuid). Troca-se nos testes. */
function aplicarInativacaoPeloApp(clienteId, user) {
    const ctl = require('../controllers/clienteController');
    return new Promise((resolve, reject) => {
        let status = 200;
        const res = {
            status(n) { status = n; return this; },
            json(obj) { return status >= 400 ? reject(erro(status, obj?.error || 'Erro ao inativar.', obj?.codigo)) : resolve(obj); },
        };
        Promise.resolve(ctl.atualizar({ params: { uuid: clienteId }, body: { Ativo: false, origem: TELA }, user, headers: {} }, res)).catch(reject);
    });
}

async function pegarPendente(id) {
    const s = await prisma.clienteInativacaoSolicitacao.findUnique({ where: { id: String(id) } });
    if (!s) throw erro(404, 'Pedido de inativação não encontrado.', 'NAO_ENCONTRADO');
    if (s.status !== 'pendente') throw erro(409, `Este pedido já foi ${s.status}.`, 'JA_DECIDIDO');
    return s;
}

// Reserva o pedido (pendente → novo status) numa operação só: clique duplo / dois usuários ao
// mesmo tempo não decidem duas vezes. Devolve false se outro chegou primeiro.
async function reservar(id, status, user, observacao) {
    const r = await prisma.clienteInativacaoSolicitacao.updateMany({
        where: { id, status: 'pendente' },
        data: { status, decididoPorId: user?.id ? String(user.id).slice(0, 80) : null, decididoPorNome: String(user?.nome || user?.login || 'desconhecido').slice(0, 180), decididoEm: new Date(), observacaoDecisao: observacao },
    });
    return r.count === 1;
}

async function desfazerReserva(id) {
    try {
        await prisma.clienteInativacaoSolicitacao.updateMany({
            where: { id },
            data: { status: 'pendente', decididoPorId: null, decididoPorNome: null, decididoEm: null, observacaoDecisao: null },
        });
    } catch (e) { console.error('[ClienteInativacao] falha ao reabrir pedido:', e?.message || e); }
}

/**
 * Aprova: inativa o cliente pelo caminho do app e anota no histórico. `deps.aplicar` é só para teste.
 */
async function aprovar(id, user, body = {}, deps = {}) {
    const aplicar = deps.aplicar || aplicarInativacaoPeloApp;
    const observacao = texto(body?.observacao, MAX_OBS, { nome: 'a observação' });
    const s = await pegarPendente(id);
    if (!(await reservar(s.id, 'aprovada', user, observacao))) throw erro(409, 'Este pedido já foi decidido por outra pessoa.', 'JA_DECIDIDO');

    let cliente;
    try {
        cliente = await prisma.cliente.findUnique({ where: { UUID: s.clienteId }, select: { UUID: true, Nome: true, NomeFantasia: true, Ativo: true } });
        if (!cliente) throw erro(404, 'Cliente não encontrado.', 'NAO_ENCONTRADO');
        if (cliente.Ativo) {
            await aplicar(s.clienteId, user);
            const depois = await prisma.cliente.findUnique({ where: { UUID: s.clienteId }, select: { Ativo: true } });
            if (depois?.Ativo) throw erro(403, 'Sem permissão para inativar este cliente.', 'SEM_PERMISSAO');
            cliente = { ...cliente, Ativo: false };
        }
    } catch (e) {
        await desfazerReserva(s.id); // o cliente continua como estava; o pedido volta para a fila
        throw e;
    }

    // Histórico (best-effort, fora de transação): o `Ativo` já foi gravado pelo caminho do app.
    await historico.registrar({
        clienteId: s.clienteId, ator: { id: user?.id || null, nome: user?.nome || user?.login || null }, tela: TELA,
        mudancas: [{ campo: 'inativacao', de: null, para: historico.normalizarValor(resumoPedido(s)) }],
    });
    const final = await prisma.clienteInativacaoSolicitacao.findUnique({ where: { id: s.id } });
    return publica(final || { ...s, status: 'aprovada', decididoEm: new Date(), observacaoDecisao: observacao, decididoPorId: user?.id || null, decididoPorNome: user?.nome || user?.login || null }, cliente);
}

/** Recusa: o cliente continua ativo; a decisão fica no pedido e no histórico do cadastro. */
async function recusar(id, user, body = {}) {
    const observacao = texto(body?.observacao, MAX_OBS, { nome: 'a observação' });
    const s = await pegarPendente(id);
    if (!(await reservar(s.id, 'recusada', user, observacao))) throw erro(409, 'Este pedido já foi decidido por outra pessoa.', 'JA_DECIDIDO');
    await historico.registrar({
        clienteId: s.clienteId, ator: { id: user?.id || null, nome: user?.nome || user?.login || null }, tela: TELA,
        mudancas: [{ campo: 'inativacao', de: historico.normalizarValor(resumoPedido(s)), para: historico.normalizarValor(`recusada${observacao ? ` | obs: ${observacao}` : ''}`) }],
    });
    const mapa = await clientesPorId([s.clienteId]);
    const final = await prisma.clienteInativacaoSolicitacao.findUnique({ where: { id: s.id } });
    return publica(final || { ...s, status: 'recusada', observacaoDecisao: observacao }, mapa.get(s.clienteId));
}

module.exports = { MOTIVOS, STATUS, ROTULO_MOTIVO, solicitar, listar, contarPendentes, aprovar, recusar, validar, resumoPedido };
