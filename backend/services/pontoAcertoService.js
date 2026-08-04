const prisma = require('../config/database');
const pontoService = require('./pontoService');

// Pedidos de acerto de ponto ("esqueci de bater"), feitos pelo próprio
// funcionário na tela do link e aprovados pelo RH dentro do app.
//
// Regra do dono (08/2026): o funcionário enxerga SÓ o dia de hoje. Por isso ele
// digita o horário esquecido sem ver o que já está lançado — e quem confere é o
// RH, na aprovação.

const MAX_ITENS = 20;

// Até quantos dias atrás o funcionário pode pedir acerto.
// Decisão do dono: só o dia de hoje (0). Configurável em AppConfig ponto_acerto
// para abrir depois sem mexer no código.
const getLimiteDias = async () => {
    try {
        const cfg = await prisma.appConfig.findUnique({ where: { key: 'ponto_acerto' } });
        const n = Number(cfg?.value?.diasParaTras);
        return isNaN(n) ? 0 : Math.max(0, Math.min(60, n));
    } catch {
        return 0;
    }
};

const ehHoraValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || ''));
const ehDataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

const diasEntre = (de, ate) =>
    Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 86400000);

const mapItem = (i) => ({
    id: i.id, data: i.data, hora: i.hora, tipo: i.tipo,
    status: i.status, motivoRecusa: i.motivoRecusa || null
});

const mapAcerto = (a) => ({
    id: a.id,
    status: a.status,
    motivo: a.motivo || '',
    criadoEm: a.createdAt,
    respondidoEm: a.respondidoEm,
    respondidoNome: a.respondidoNome || null,
    lido: !!a.lidoEm,
    itens: (a.itens || []).map(mapItem),
    aprovados: (a.itens || []).filter(i => i.status === 'APROVADO').length,
    recusados: (a.itens || []).filter(i => i.status === 'RECUSADO').length,
    total: (a.itens || []).length,
    funcionario: a.funcionario ? { id: a.funcionario.id, nome: a.funcionario.nome, cargo: a.funcionario.cargo } : undefined
});

// ─── Funcionário: criar o pedido ─────────────────────────────────────────────

const criarPedido = async (funcionarioId, { itens, motivo } = {}) => {
    if (!Array.isArray(itens) || !itens.length) {
        const err = new Error('Informe ao menos um horário.');
        err.status = 400;
        throw err;
    }
    if (itens.length > MAX_ITENS) {
        const err = new Error(`No máximo ${MAX_ITENS} horários por pedido.`);
        err.status = 400;
        throw err;
    }

    const hoje = pontoService.getDataReferencia();
    const limite = await getLimiteDias();

    const limpos = [];
    for (const it of itens) {
        const data = String(it?.data || hoje).slice(0, 10);
        const hora = String(it?.hora || '').slice(0, 5);
        const tipo = String(it?.tipo || '').toUpperCase();

        if (!ehDataValida(data)) { const e = new Error('Data inválida.'); e.status = 400; throw e; }
        if (!ehHoraValida(hora)) { const e = new Error(`Horário inválido: "${it?.hora}". Use HH:MM.`); e.status = 400; throw e; }
        if (tipo !== 'ENTRADA' && tipo !== 'SAIDA') { const e = new Error('Escolha entrada ou saída em cada horário.'); e.status = 400; throw e; }
        if (data > hoje) { const e = new Error('Não dá para pedir acerto de um dia que ainda não chegou.'); e.status = 400; throw e; }

        const atras = diasEntre(data, hoje);
        if (atras > limite) {
            const e = new Error(limite === 0
                ? 'Só dá para pedir acerto do dia de hoje. Para dias anteriores, fale com o RH.'
                : `Só dá para pedir acerto dos últimos ${limite} dias.`);
            e.status = 400;
            throw e;
        }

        // não repete o mesmo horário no mesmo pedido
        if (!limpos.some(x => x.data === data && x.hora === hora && x.tipo === tipo)) {
            limpos.push({ data, hora, tipo });
        }
    }

    limpos.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));

    // Já existe um pedido pendente? Evita fila de pedidos repetidos.
    const pendente = await prisma.pontoAcerto.findFirst({ where: { funcionarioId, status: 'PENDENTE' } });
    if (pendente) {
        const e = new Error('Você já tem um pedido aguardando o RH. Espere a resposta antes de mandar outro.');
        e.status = 409;
        throw e;
    }

    const acerto = await prisma.pontoAcerto.create({
        data: {
            funcionarioId,
            motivo: motivo ? String(motivo).slice(0, 300) : null,
            itens: { create: limpos }
        },
        include: { itens: true }
    });
    return mapAcerto(acerto);
};

// ─── Funcionário: o que mostrar na tela do dia ───────────────────────────────
// Devolve o pedido pendente (aguardando) e a última resposta ainda não lida —
// é isso que faz o aviso "seu pedido foi aprovado" esperar por ele, mesmo que a
// aprovação saia dias depois.

const paraTelaDoFuncionario = async (funcionarioId) => {
    const [pendente, resposta] = await Promise.all([
        prisma.pontoAcerto.findFirst({
            where: { funcionarioId, status: 'PENDENTE' },
            include: { itens: true },
            orderBy: { createdAt: 'desc' }
        }),
        prisma.pontoAcerto.findFirst({
            where: { funcionarioId, status: 'RESPONDIDO', lidoEm: null },
            include: { itens: true },
            orderBy: { respondidoEm: 'desc' }
        })
    ]);
    return {
        acertoPendente: pendente ? mapAcerto(pendente) : null,
        acertoResposta: resposta ? mapAcerto(resposta) : null
    };
};

const marcarLido = async (funcionarioId, acertoId) => {
    const acerto = await prisma.pontoAcerto.findUnique({ where: { id: acertoId } });
    if (!acerto || acerto.funcionarioId !== funcionarioId) {
        const e = new Error('Aviso não encontrado.');
        e.status = 404;
        throw e;
    }
    if (acerto.lidoEm) return { ok: true };
    await prisma.pontoAcerto.update({ where: { id: acertoId }, data: { lidoEm: new Date() } });
    return { ok: true };
};

// ─── RH: listar e responder ──────────────────────────────────────────────────

const listarPedidos = async ({ status = 'PENDENTE' } = {}) => {
    const where = status && status !== 'todos' ? { status } : {};
    const lista = await prisma.pontoAcerto.findMany({
        where,
        include: { itens: true, funcionario: { select: { id: true, nome: true, cargo: true } } },
        orderBy: { createdAt: 'asc' },
        take: 200
    });
    return lista.map(mapAcerto);
};

const contarPendentes = () => prisma.pontoAcerto.count({ where: { status: 'PENDENTE' } });

/**
 * Responde o pedido: aprova/recusa item a item e cria as batidas dos aprovados.
 * decisoes = [{ id, aprovado: bool, motivoRecusa? }] — item não citado é recusado.
 */
const responderPedido = async (acertoId, decisoes, usuario) => {
    const acerto = await prisma.pontoAcerto.findUnique({ where: { id: acertoId }, include: { itens: true } });
    if (!acerto) { const e = new Error('Pedido não encontrado.'); e.status = 404; throw e; }
    if (acerto.status !== 'PENDENTE') { const e = new Error('Este pedido já foi respondido.'); e.status = 409; throw e; }

    const porId = {};
    for (const d of (Array.isArray(decisoes) ? decisoes : [])) porId[d.id] = d;

    // Só o que é atômico entra na transação (batidas + status do pedido)
    await prisma.$transaction(async (tx) => {
        for (const item of acerto.itens) {
            const d = porId[item.id];
            const aprovado = !!d?.aprovado;

            if (!aprovado) {
                await tx.pontoAcertoItem.update({
                    where: { id: item.id },
                    data: { status: 'RECUSADO', motivoRecusa: d?.motivoRecusa || null }
                });
                continue;
            }

            // não duplica: mesma pessoa, mesmo dia e mesmo minuto já registrado
            const jaTem = await tx.pontoRegistro.findFirst({
                where: {
                    funcionarioId: acerto.funcionarioId,
                    dataReferencia: item.data,
                    hora: new Date(`${item.data}T${item.hora}:00`)
                }
            });
            const batida = jaTem || await tx.pontoRegistro.create({
                data: {
                    funcionarioId: acerto.funcionarioId,
                    dataReferencia: item.data,
                    tipo: item.tipo,
                    hora: new Date(`${item.data}T${item.hora}:00`),
                    origem: 'MANUAL',
                    ajustadoPor: usuario?.id || null,
                    obs: `acerto aprovado${acerto.motivo ? ` — ${acerto.motivo}` : ''}`
                }
            });
            await tx.pontoAcertoItem.update({
                where: { id: item.id },
                data: { status: 'APROVADO', batidaId: batida.id, motivoRecusa: null }
            });
        }

        await tx.pontoAcerto.update({
            where: { id: acertoId },
            data: {
                status: 'RESPONDIDO',
                respondidoPor: usuario?.id || null,
                respondidoNome: usuario?.nome || null,
                respondidoEm: new Date()
            }
        });
    }, { timeout: 20000, maxWait: 10000 });

    const atualizado = await prisma.pontoAcerto.findUnique({
        where: { id: acertoId },
        include: { itens: true, funcionario: { select: { id: true, nome: true, cargo: true } } }
    });
    return mapAcerto(atualizado);
};

module.exports = {
    MAX_ITENS,
    getLimiteDias,
    criarPedido,
    paraTelaDoFuncionario,
    marcarLido,
    listarPedidos,
    contarPendentes,
    responderPedido
};
